import { db } from '../db';
import type { MediaAsset } from '../db/schema';
import {
  MEDIA_MAX_SINGLE_BYTES,
  assertMediaByteLength,
  hashMediaBytes,
  normalizeMediaBytes,
  normalizeMediaMimeType,
} from './mediaIntegrity';

export const MEDIA_REFERENCE_PREFIX = 'denki-media://sha256/';
export const MAX_ACTIVE_MEDIA_OBJECT_URLS = 256;

const HASH_PATTERN = /^[a-f0-9]{64}$/;

interface CachedObjectUrl {
  url: string;
  references: number;
}

export interface MediaObjectUrlLease {
  url: string;
  release(): void;
}

const objectUrlCache = new Map<string, CachedObjectUrl>();

export function containsMediaReference(value: string): boolean {
  return value.includes(MEDIA_REFERENCE_PREFIX);
}

export function createMediaReference(hash: string): string {
  if (!HASH_PATTERN.test(hash)) {
    throw new Error('Media hash must be a lowercase SHA-256 value.');
  }
  return `${MEDIA_REFERENCE_PREFIX}${hash}`;
}

export function parseMediaReference(value: unknown): string | null {
  if (typeof value !== 'string' || !value.startsWith(MEDIA_REFERENCE_PREFIX)) {
    return null;
  }
  const hash = value.slice(MEDIA_REFERENCE_PREFIX.length);
  if (!HASH_PATTERN.test(hash)) {
    throw new Error('Malformed Denki media reference.');
  }
  return hash;
}

function isBlobLike(value: unknown): value is Blob {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<Blob>;
  return (
    typeof candidate.size === 'number' &&
    typeof candidate.type === 'string' &&
    typeof candidate.arrayBuffer === 'function'
  );
}

async function verifyStoredAsset(asset: MediaAsset): Promise<MediaAsset> {
  if (!HASH_PATTERN.test(asset.hash)) {
    throw new Error('Stored media has an invalid SHA-256 key.');
  }

  const mimeType = normalizeMediaMimeType(asset.mimeType);
  if (mimeType !== asset.mimeType) {
    throw new Error(`Stored media ${asset.hash} has a non-canonical MIME type.`);
  }
  assertMediaByteLength(asset.byteLength, `Stored media ${asset.hash}`);

  // IndexedDB may deserialize Blob objects from a different JavaScript realm.
  // `instanceof Blob` is therefore not a portable integrity boundary.
  if (!isBlobLike(asset.data)) {
    throw new Error(`Stored media ${asset.hash} does not contain Blob data.`);
  }
  if (asset.data.size !== asset.byteLength) {
    throw new Error(`Stored media ${asset.hash} has inconsistent byte length.`);
  }
  if (asset.data.type !== mimeType) {
    throw new Error(`Stored media ${asset.hash} has inconsistent Blob metadata.`);
  }

  const bytes = new Uint8Array(await asset.data.arrayBuffer());
  const calculatedHash = await hashMediaBytes(mimeType, bytes);
  if (calculatedHash !== asset.hash) {
    throw new Error(`Stored media ${asset.hash} failed its integrity check.`);
  }

  return asset;
}

/**
 * Store passive media under its verified content identity. SVG bytes are
 * sanitized before hashing, so the key always identifies the exact stored data.
 */
export async function registerMediaBytes(
  mimeType: unknown,
  input: Uint8Array,
  createdAt: Date = new Date(),
): Promise<string> {
  const normalized = normalizeMediaBytes(mimeType, input);
  const hash = await hashMediaBytes(normalized.mimeType, normalized.bytes);
  const reference = createMediaReference(hash);

  await db.transaction('rw', db.media, async () => {
    const existing = await db.media.get(hash);
    if (existing) {
      await verifyStoredAsset(existing);
      if (
        existing.mimeType !== normalized.mimeType ||
        existing.byteLength !== normalized.bytes.byteLength
      ) {
        throw new Error(`Media identity collision detected for ${hash}.`);
      }
      return;
    }

    await db.media.add({
      hash,
      mimeType: normalized.mimeType,
      byteLength: normalized.bytes.byteLength,
      data: new Blob([normalized.bytes], { type: normalized.mimeType }),
      createdAt,
    });
  });

  return reference;
}

export async function registerMediaBlob(
  blob: Blob,
  mimeType: unknown = blob.type,
  createdAt: Date = new Date(),
): Promise<string> {
  normalizeMediaMimeType(mimeType);
  assertMediaByteLength(blob.size);
  const bytes = new Uint8Array(await blob.arrayBuffer());
  return registerMediaBytes(mimeType, bytes, createdAt);
}

/** Resolve and cryptographically verify one registry object. */
export async function resolveMediaAsset(
  reference: unknown,
): Promise<MediaAsset | null> {
  const hash = parseMediaReference(reference);
  if (hash === null) return null;
  const asset = await db.media.get(hash);
  if (!asset) return null;
  return verifyStoredAsset(asset);
}

function requireObjectUrlApi(): Pick<typeof URL, 'createObjectURL' | 'revokeObjectURL'> {
  if (
    typeof URL.createObjectURL !== 'function' ||
    typeof URL.revokeObjectURL !== 'function'
  ) {
    throw new Error('Object URLs are unavailable in this runtime.');
  }
  return URL;
}

/**
 * Acquire a reference-counted object URL. Missing assets return null; corrupt
 * assets fail closed. Every successful lease must be released by its consumer.
 */
export async function acquireMediaObjectUrl(
  reference: unknown,
): Promise<MediaObjectUrlLease | null> {
  const hash = parseMediaReference(reference);
  if (hash === null) return null;

  const cached = objectUrlCache.get(hash);
  if (cached) {
    cached.references += 1;
    return createLease(hash, cached);
  }

  if (objectUrlCache.size >= MAX_ACTIVE_MEDIA_OBJECT_URLS) {
    throw new Error(
      `Denki already has ${MAX_ACTIVE_MEDIA_OBJECT_URLS} active media object URLs.`,
    );
  }

  const asset = await resolveMediaAsset(reference);
  if (!asset) return null;

  const objectUrlApi = requireObjectUrlApi();
  const entry: CachedObjectUrl = {
    url: objectUrlApi.createObjectURL(asset.data),
    references: 1,
  };
  objectUrlCache.set(hash, entry);
  return createLease(hash, entry);
}

function createLease(
  hash: string,
  entry: CachedObjectUrl,
): MediaObjectUrlLease {
  let released = false;
  return {
    url: entry.url,
    release() {
      if (released) return;
      released = true;

      const current = objectUrlCache.get(hash);
      if (!current || current.url !== entry.url) return;
      current.references -= 1;
      if (current.references > 0) return;

      requireObjectUrlApi().revokeObjectURL(current.url);
      objectUrlCache.delete(hash);
    },
  };
}

/** Revoke all leases before a full library replacement or application teardown. */
export function revokeAllMediaObjectUrls(): void {
  if (objectUrlCache.size === 0) return;
  const objectUrlApi = requireObjectUrlApi();
  for (const entry of objectUrlCache.values()) {
    objectUrlApi.revokeObjectURL(entry.url);
  }
  objectUrlCache.clear();
}

/** Test and diagnostics helper; not a persistence metric. */
export function activeMediaObjectUrlCount(): number {
  return objectUrlCache.size;
}

export { MEDIA_MAX_SINGLE_BYTES };
