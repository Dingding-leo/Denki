# Runtime Media Registry

Denki database schema v6 introduces a content-addressed media registry. Schema v6 does **not** rewrite existing cards: legacy data URLs remain readable exactly as stored, while the shared renderer can also resolve explicit registry references.

## Purpose

Repeated base64 media can make card rows, imports, and backups unnecessarily large. The registry provides one durable binary object per unique passive media asset. A card or deck note can refer to that object by content identity rather than embedding its bytes repeatedly.

Storage, integrity verification, mixed rendering, and registry-native portable recovery are established. Automatic migration, importer integration, and garbage collection remain separately gated changes.

## Durable representation

The `media` IndexedDB table stores:

```ts
interface MediaAsset {
  hash: string;
  mimeType: string;
  byteLength: number;
  data: ArrayBuffer;
  createdAt: Date;
}
```

The primary key is the lowercase SHA-256 hash. `ArrayBuffer` is the durable representation because it is structured-clone friendly across browser, test, and WebView runtimes. A `Blob` is reconstructed only after resolution verifies the stored bytes.

Schema-v6 migration creates an empty table. It must not:

- scan or rewrite card fronts, backs, or deck notes;
- reinterpret existing data URLs;
- change review history or scheduler provenance;
- delete any existing study data.

## Content identity

The hash input is:

```text
normalized MIME type
+ one NUL byte
+ exact persisted media bytes
```

The MIME type is part of the identity. Equal bytes declared as `image/png` and `image/gif` are different registry objects.

SVG media is sanitized **before** hashing and persistence. Therefore the hash identifies the exact passive SVG Denki stores and serves, not the untrusted source document.

## Supported media

The registry accepts a narrow passive allow-list:

- PNG, JPEG, GIF, WebP, AVIF, BMP, and sanitized SVG images;
- MPEG, MP4/AAC, WAV, OGG/Opus, and FLAC audio;
- MP4 and WebM video.

HTML, scripts, documents, fonts, archives, and executable formats are rejected. Each object is limited to 16 MiB before persistence.

SVG sanitization removes active or externally referential content, including scripts, event handlers, inline styles, links, embedded documents, animation elements, and nested image/audio/video elements.

## References

A registry reference has one exact form:

```text
denki-media://sha256/<64 lowercase hexadecimal characters>
```

`parseMediaReference()` returns `null` for ordinary URLs and throws for malformed strings that claim the Denki scheme. Callers must not treat arbitrary URL substrings as valid registry references.

## Registration

`registerMediaBytes()`:

1. validates MIME and size;
2. copies ordinary bytes or sanitizes SVG bytes;
3. computes the content hash;
4. reuses and verifies an existing row when present;
5. otherwise performs one atomic unique-key insert;
6. resolves concurrent equal inserts by verifying the winning row.

No external cryptographic or Blob-reading promise is held open inside a Dexie transaction.

`registerMediaBlob()` checks MIME and declared Blob size before reading its bytes.

## Resolution and integrity

`resolveMediaAsset()` does not trust IndexedDB merely because the row is local. It verifies:

- key syntax;
- canonical MIME type;
- declared and actual byte length;
- creation timestamp;
- recomputed SHA-256 identity.

A missing valid reference returns `null`. A malformed or corrupted object fails closed. Successful resolution returns a current-realm Blob reconstructed from the verified ArrayBuffer.

## Mixed rendering

`renderContent()` remains the single Markdown, cloze, HTML, and sanitisation path for Review, Learn, Match, and deck-note previews.

Registry references follow a two-stage trust boundary:

1. Exact references are replaced with opaque, collision-resistant text tokens before Markdown parsing.
2. DOMPurify sanitizes the complete rendered HTML with user `data-*` attributes disabled.
3. Trusted post-sanitisation code converts a token only when it occupies an entire supported URI attribute on an allowed media element.
4. The active `src`, `poster`, or `href` attribute remains absent while the element is pending.
5. The document-scoped hydrator resolves and verifies the registry object, acquires an object-URL lease, and only then installs the blob URL.

Existing `data:` image, audio, and video values continue through the established sanitizer and are not rewritten by the mixed renderer.

The renderer deliberately rejects or removes:

- malformed Denki references;
- a valid token embedded inside a larger URI;
- raw user-supplied `data-denki-media-*` attributes;
- `srcset`, until each candidate and descriptor can be validated independently;
- more than 256 registry references in one rendered content block.

Missing or corrupt media is replaced with an accessible `role="status"` fallback. It is never sent to the network as a custom-protocol request.

## Object-URL leases

The app-wide hydrator uses `acquireMediaObjectUrl()` rather than creating unmanaged URLs.

- Concurrent requests for one hash share one load and one object URL.
- Each successful caller receives a lease with an idempotent `release()` method.
- The URL is revoked immediately after the final lease is released.
- At most 256 hashes may have active object URLs simultaneously.
- Nodes moved synchronously within the connected document keep their lease.
- Nodes removed from the document release their lease through the MutationObserver.
- Hydrator cleanup restores inert registry bindings before revocation, allowing StrictMode, HMR, or a replacement hydrator to reacquire connected media safely.
- `revokeAllMediaObjectUrls()` revokes every cached URL and invalidates in-flight loads during full teardown.

## Portable backup v5

Format v5 is the first registry-native portable backup. It reads classes, decks, cards, reviews, and media in one consistent read transaction and restores all five tables in one write transaction.

A portable media row contains:

```ts
interface RegistryNativeBackupMediaAsset {
  hash: string;
  mimeType: string;
  byteLength: number;
  base64: string;
  createdAt: string;
  usage: 'embedded' | 'registry' | 'both';
}
```

Usage semantics are explicit:

- `embedded`: bytes came from repeated data URLs and must be hydrated back into the exact card/deck text; the asset is not persisted in the runtime registry.
- `registry`: the asset is part of the runtime registry and may be registry-only local state.
- `both`: equal MIME-plus-bytes content is used by embedded text and the runtime registry; it is stored once, then both hydrated and persisted.

Format v5 guarantees:

- equal embedded and registry content is deduplicated by the same SHA-256 identity;
- every persisted `denki-media` reference has a registry row;
- registry-only assets are preserved as complete database state, even when currently unreferenced;
- embedded usage rows cannot be orphaned;
- MIME, canonical base64, byte length, canonical timestamps, usage, SHA-256, and object/byte limits are validated before replacement;
- failed validation leaves current data and object URLs unchanged;
- a failure writing any table rolls all five tables back;
- successful replacement clears stale object URLs only after the transaction commits.

Formats v1-v4 remain importable. They restore no runtime registry, clear any pre-existing registry as part of full replacement, and reject future `denki-media` references because those formats cannot carry the required registry state.

## Intentional non-goals after registry-native backup

The current registry still does not provide:

- automatic migration of existing card content;
- Anki import directly into the registry;
- reference-aware garbage collection.

These remain separate because each touches atomic data migration or storage reclamation guarantees.

## Required next phases

1. **Resumable migration** — process bounded card batches and commit registry writes plus card-text updates atomically, with a durable cursor and quota-safe rollback.
2. **Importer integration** — store referenced Anki media once and emit registry references directly.
3. **Reference scan and garbage collection** — delete an asset only after a complete scan proves no card or deck note refers to it.

Now that mixed rendering and registry-native recovery are both present, a migration may persist registry references only if each batch retains old text on failure and the complete library remains exportable at every cursor boundary.
