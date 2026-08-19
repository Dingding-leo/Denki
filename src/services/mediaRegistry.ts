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

export interface ResolvedMediaAsset extends Omit<MediaAsset, 'data'> {
  data: Blob;
}

export interface MediaObjectUrlLease {
  url: string;
  release(): void;
}

const objectUrlCache = new Map<string, CachedObjectUrl>();
const objectUrlLoads = new Map<
  string,
  Promise<CachedObjectUrl | null>
>();
let objectUrlGeneration = 0;

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
  if (
    typeof value !== 'string' ||
    !value.startsWith(MEDIA_REFERENCE_PREFIX)
  ) {
    return null;
  }
  const hash = value.slice(MEDIA_REFERENCE_PREFIX.length);
  if (!HASH_PATTERN.test(hash)) {
    throw new Error('Malformed Denki media reference.');
  }
  return hash;
}

function isArrayBufferValue(value: unknown): value is ArrayBuffer {
  return (
    !!value &&
    typeof value === 'object' &&
    Object.prototype.toString.call(value) === '[object ArrayBuffer]' &&
    typeof (value as ArrayBuffer).byteLength === 'number'
  );
}

function copyToArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const output = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(output).set(bytes);
  return output;
}

function isConstraintError(error: unknown): boolean {
  return (
    !!error &&
    typeof error === 'object' &&
    'name' in error &&
    error.name === 'ConstraintError'
  );
}

async function verifyStoredAsset(
  asset: MediaAsset,
): Promise<ResolvedMediaAsset> {
  if (!HASH_PATTERN.test(asset.hash)) {
    throw new Error('Stored media has an invalid SHA-256 key.');
  }

  const mimeType = normalizeMediaMimeType(asset.mimeType);
  if (mimeType !== asset.mimeType) {
    throw new Error(
      `Stored media ${asset.hash} has a non-canonical MIME type.`,
    );
  }
  assertMediaByteLength(asset.byteLength, `Stored media ${asset.hash}`);

  if (!isArrayBufferValue(asset.data)) {
    throw new Error(
      `Stored media ${asset.hash} does not contain ArrayBuffer data.`,
    );
  }
  if (asset.data.byteLength !== asset.byteLength) {
    throw new Error(
      `Stored media ${asset.hash} has inconsistent byte length.`,
    );
  }

  const createdAt = new Date(asset.createdAt);
  if (!Number.isFinite(createdAt.getTime())) {
    throw new Error(
      `Stored media ${asset.hash} has an invalid creation timestamp.`,
    );
  }

  const bytes = new Uint8Array(asset.data);
  const calculatedHash = await hashMediaBytes(mimeType, bytes);
  if (calculatedHash !== asset.hash) {
    throw new Error(
      `Stored media ${asset.hash} failed its integrity check.`,
    );
  }

  return {
    hash: asset.hash,
    mimeType,
    byteLength: asset.byteLength,
    data: new Blob([bytes], { type: mimeType }),
    createdAt,
  };
}

async function verifyExistingIdentity(
  asset: MediaAsset,
  expectedMimeType: string,
  expectedByteLength: number,
): Promise<void> {
  const verified = await verifyStoredAsset(asset);
  if (
    verified.mimeType !== expectedMimeType ||
    verified.byteLength !== expectedByteLength
  ) {
    throw new Error(
      `Media identity collision detected for ${asset.hash}.`,
    );
  }
}

/**
 * Store passive media under its verified content identity. SVG bytes are
 * sanitized before hashing, so the key always identifies the exact stored data.
 * A single IndexedDB add is atomic; concurrent equal inserts converge on the
 * unique hash and verify the winning row after a constraint conflict.
 */
export async function registerMediaBytes(
  mimeType: unknown,
  input: Uint8Array,
  createdAt: Date = new Date(),
): Promise<string> {
  const normalized = normalizeMediaBytes(mimeType, input);
  const hash = await hashMediaBytes(
    normalized.mimeType,
    normalized.bytes,
  );
  const reference = createMediaReference(hash);

  const existing = await db.media.get(hash);
  if (existing) {
    await verifyExistingIdentity(
      existing,
      normalized.mimeType,
      normalized.bytes.byteLength,
    );
    return reference;
  }

  const asset: MediaAsset = {
    hash,
    mimeType: normalized.mimeType,
    byteLength: normalized.bytes.byteLength,
    data: copyToArrayBuffer(normalized.bytes),
    createdAt: new Date(createdAt),
  };
  if (!Number.isFinite(asset.createdAt.getTime())) {
    throw new Error('Media creation timestamp is invalid.');
  }

  try {
    await db.media.add(asset);
  } catch (error) {
    if (!isConstraintError(error)) throw error;
    const winner = await db.media.get(hash);
    if (!winner) {
      throw new Error(
        `Media ${hash} could not be stored after a concurrent insert.`,
        { cause: error },
      );
    }
    await verifyExistingIdentity(
      winner,
      normalized.mimeType,
      normalized.bytes.byteLength,
    );
  }

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
): Promise<ResolvedMediaAsset | null> {
  const hash = parseMediaReference(reference);
  if (hash === null) return null;
  const asset = await db.media.get(hash);
  if (!asset) return null;
  return verifyStoredAsset(asset);
}

function requireObjectUrlApi(): Pick<
  typeof URL,
  'createObjectURL' | 'revokeObjectURL'
> {
  if (
    typeof URL.createObjectURL !== 'function' ||
    typeof URL.revokeObjectURL !== 'function'
  ) {
    throw new Error('Object URLs are unavailable in this runtime.');
  }
  return URL;
}

async function loadObjectUrl(
  hash: string,
  generation: number,
): Promise<CachedObjectUrl | null> {
  const asset = await resolveMediaAsset(createMediaReference(hash));
  if (!asset || generation !== objectUrlGeneration) return null;

  const existing = objectUrlCache.get(hash);
  if (existing) return existing;
  if (objectUrlCache.size >= MAX_ACTIVE_MEDIA_OBJECT_URLS) {
    throw new Error(
      `Denki already has ${MAX_ACTIVE_MEDIA_OBJECT_URLS} active media object URLs.`,
    );
  }

  const entry: CachedObjectUrl = {
    url: requireObjectUrlApi().createObjectURL(asset.data),
    references: 0,
  };
  objectUrlCache.set(hash, entry);
  return entry;
}

/**
 * Acquire a reference-counted object URL. Missing assets return null; corrupt
 * assets fail closed. Concurrent requests for the same hash share one load and
 * one object URL. Every successful lease must be released by its consumer.
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

  let loading = objectUrlLoads.get(hash);
  if (!loading) {
    loading = loadObjectUrl(hash, objectUrlGeneration);
    objectUrlLoads.set(hash, loading);
  }

  let entry: CachedObjectUrl | null;
  try {
    entry = await loading;
  } finally {
    if (objectUrlLoads.get(hash) === loading) {
      objectUrlLoads.delete(hash);
    }
  }
  if (!entry) return null;

  entry.references += 1;
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

/**
 * Revoke every active URL and invalidate in-flight loads before a full library
 * replacement or application teardown.
 */
export function revokeAllMediaObjectUrls(): void {
  objectUrlGeneration += 1;
  objectUrlLoads.clear();
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
