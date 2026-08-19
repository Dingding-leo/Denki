# Runtime Media Registry

Denki database schema v6 introduces a content-addressed media registry. This is an engineering foundation: schema v6 does **not** rewrite existing cards, and the current renderer continues to read existing card and deck text exactly as stored.

## Purpose

Repeated base64 media can make card rows, imports, and backups unnecessarily large. The registry provides one durable binary object per unique passive media asset, with cards eventually referring to it by content identity rather than embedding the bytes repeatedly.

The current phase establishes safe storage and resolution only. Renderer integration and data migration require separate release-gated changes.

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

## Object-URL leases

Renderers must use `acquireMediaObjectUrl()` rather than creating unmanaged URLs.

- Concurrent requests for one hash share one load and one object URL.
- Each successful caller receives a lease with an idempotent `release()` method.
- The URL is revoked immediately after the final lease is released.
- At most 256 hashes may have active object URLs simultaneously.
- `revokeAllMediaObjectUrls()` revokes every cached URL and invalidates in-flight loads during teardown or full-library replacement.

A component that acquires a lease must release it on dependency change and unmount.

## Intentional non-goals in schema v6

This phase does not yet provide:

- mixed data-URL and registry-reference rendering;
- automatic migration of existing card content;
- Anki import directly into the registry;
- reference-aware garbage collection;
- registry-native portable backup and restore.

These are intentionally separate because each touches card rendering, atomic data migration, or recovery guarantees.

## Required next phases

1. **Mixed renderer** — resolve registry references while preserving current data URLs and showing safe missing-media fallbacks.
2. **Resumable migration** — process bounded card batches and commit registry writes plus card-text updates atomically, with a durable cursor and quota-safe rollback.
3. **Importer integration** — store referenced Anki media once and emit registry references directly.
4. **Reference scan and garbage collection** — delete an asset only after a complete scan proves no card or deck note refers to it.
5. **Registry-native backup** — include verified registry objects and references in portable backup without expanding them back into duplicate data URLs.

No phase may enable registry references in normal card content before the renderer and backup/recovery paths understand them.
