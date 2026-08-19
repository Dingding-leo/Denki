import type { MediaAsset } from '../db/schema';
import {
  BACKUP_MEDIA_LIMITS,
  BACKUP_MEDIA_REFERENCE_PREFIX,
  externalizeBackupMedia,
} from './backupMedia';
import {
  assertMediaByteLength,
  hashMediaBytes,
  normalizeMediaMimeType,
} from './mediaIntegrity';

export type PortableMediaUsage = 'embedded' | 'registry' | 'both';

export interface RegistryNativeBackupMediaAsset {
  hash: string;
  mimeType: string;
  byteLength: number;
  base64: string;
  createdAt: string;
  usage: PortableMediaUsage;
}

interface TextDeck {
  notes?: string;
}

interface TextCard {
  front: string;
  back: string;
}

export interface RegistryNativeBackupExport<
  TDeck extends TextDeck,
  TCard extends TextCard,
> {
  decks: TDeck[];
  cards: TCard[];
  media: RegistryNativeBackupMediaAsset[];
}

export interface RegistryNativeBackupImport<
  TDeck extends TextDeck,
  TCard extends TextCard,
> {
  decks: TDeck[];
  cards: TCard[];
  media: MediaAsset[];
}

interface ValidatedMediaRow extends RegistryNativeBackupMediaAsset {
  bytes: Uint8Array;
}

const HASH_PATTERN = /^[a-f0-9]{64}$/;
const PORTABLE_TOKEN_SOURCE =
  `${BACKUP_MEDIA_REFERENCE_PREFIX.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}([a-f0-9]{64})`;

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function isArrayBufferValue(value: unknown): value is ArrayBuffer {
  return (
    !!value &&
    typeof value === 'object' &&
    Object.prototype.toString.call(value) === '[object ArrayBuffer]' &&
    typeof (value as ArrayBuffer).byteLength === 'number'
  );
}

function bytesToBase64(bytes: Uint8Array): string {
  const chunks: string[] = [];
  const chunkSize = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    const chunk = bytes.subarray(
      offset,
      Math.min(offset + chunkSize, bytes.length),
    );
    chunks.push(String.fromCharCode(...chunk));
  }
  return globalThis.btoa(chunks.join(''));
}

function decodeCanonicalBase64(value: string, label: string): Uint8Array {
  if (!value || value.length % 4 !== 0) {
    throw new Error(`${label} is not canonical base64.`);
  }

  const maximumEncodedChars =
    Math.ceil(BACKUP_MEDIA_LIMITS.maxSingleBytes / 3) * 4 + 4;
  if (value.length > maximumEncodedChars) {
    throw new Error(
      `${label} exceeds the ${BACKUP_MEDIA_LIMITS.maxSingleBytes / (1024 * 1024)} MiB per-file limit.`,
    );
  }

  let binary: string;
  try {
    binary = globalThis.atob(value);
  } catch (error) {
    throw new Error(`${label} is not valid base64.`, { cause: error });
  }

  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  if (bytesToBase64(bytes) !== value) {
    throw new Error(`${label} is not canonical base64.`);
  }
  return bytes;
}

function copyToArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const output = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(output).set(bytes);
  return output;
}

function canonicalIsoDate(value: unknown, label: string): string {
  if (typeof value !== 'string') {
    throw new Error(`${label} is missing or invalid.`);
  }
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString() !== value) {
    throw new Error(`${label} must be a canonical ISO timestamp.`);
  }
  return value;
}

function dateToCanonicalIso(value: unknown, label: string): string {
  const parsed = value instanceof Date ? new Date(value) : new Date(String(value));
  if (!Number.isFinite(parsed.getTime())) {
    throw new Error(`${label} is invalid.`);
  }
  return parsed.toISOString();
}

function mergeUsage(
  left: PortableMediaUsage,
  right: PortableMediaUsage,
): PortableMediaUsage {
  if (left === right) return left;
  return 'both';
}

function earlierIso(left: string, right: string): string {
  return left <= right ? left : right;
}

function textFields<TDeck extends TextDeck, TCard extends TextCard>(
  decks: readonly TDeck[],
  cards: readonly TCard[],
): string[] {
  return [
    ...decks.map((deck) => deck.notes ?? ''),
    ...cards.flatMap((card) => [card.front, card.back]),
  ];
}

function collectPortableReferences(text: string, output: Set<string>): void {
  if (!text.includes(BACKUP_MEDIA_REFERENCE_PREFIX)) return;
  const matcher = new RegExp(PORTABLE_TOKEN_SOURCE, 'g');
  for (const match of text.matchAll(matcher)) output.add(match[1]);

  const remainder = text.replace(matcher, '');
  if (remainder.includes(BACKUP_MEDIA_REFERENCE_PREFIX)) {
    throw new Error('Backup contains a malformed portable media reference.');
  }
}

function hydratePortableText(
  text: string,
  rows: ReadonlyMap<string, ValidatedMediaRow>,
): string {
  if (!text.includes(BACKUP_MEDIA_REFERENCE_PREFIX)) return text;
  return text.replace(
    new RegExp(PORTABLE_TOKEN_SOURCE, 'g'),
    (_match, hash: string) => {
      const row = rows.get(hash);
      if (!row || (row.usage !== 'embedded' && row.usage !== 'both')) {
        throw new Error(`Backup references missing embedded media ${hash}.`);
      }
      return `data:${row.mimeType};base64,${row.base64}`;
    },
  );
}

/**
 * Externalize repeated data URLs while preserving the complete runtime registry.
 * The usage field distinguishes assets that must be hydrated back to data URLs
 * from assets that must be restored to IndexedDB; equal content is stored once.
 */
export async function exportRegistryNativeBackupMedia<
  TDeck extends TextDeck,
  TCard extends TextCard,
>(
  decks: readonly TDeck[],
  cards: readonly TCard[],
  registryAssets: readonly MediaAsset[],
  exportedAt: string,
): Promise<RegistryNativeBackupExport<TDeck, TCard>> {
  const canonicalExportedAt = canonicalIsoDate(
    exportedAt,
    'Backup export timestamp',
  );
  if (registryAssets.length > BACKUP_MEDIA_LIMITS.maxAssets) {
    throw new Error(
      `Media registry contains more than ${BACKUP_MEDIA_LIMITS.maxAssets.toLocaleString()} objects.`,
    );
  }

  const externalized = await externalizeBackupMedia(decks, cards);
  const rows = new Map<string, RegistryNativeBackupMediaAsset>();
  let totalBytes = 0;

  const addRow = (row: RegistryNativeBackupMediaAsset) => {
    const existing = rows.get(row.hash);
    if (existing) {
      if (
        existing.mimeType !== row.mimeType ||
        existing.byteLength !== row.byteLength ||
        existing.base64 !== row.base64
      ) {
        throw new Error(
          `Media hash ${row.hash} identifies conflicting backup content.`,
        );
      }
      existing.usage = mergeUsage(existing.usage, row.usage);
      existing.createdAt = earlierIso(existing.createdAt, row.createdAt);
      return;
    }

    if (rows.size >= BACKUP_MEDIA_LIMITS.maxAssets) {
      throw new Error(
        `Backup exceeds the ${BACKUP_MEDIA_LIMITS.maxAssets.toLocaleString()} media-object limit.`,
      );
    }
    totalBytes += row.byteLength;
    if (totalBytes > BACKUP_MEDIA_LIMITS.maxTotalBytes) {
      throw new Error(
        `Backup media exceeds the ${BACKUP_MEDIA_LIMITS.maxTotalBytes / (1024 * 1024)} MiB total limit.`,
      );
    }
    rows.set(row.hash, { ...row });
  };

  for (const asset of externalized.media) {
    addRow({
      ...asset,
      createdAt: canonicalExportedAt,
      usage: 'embedded',
    });
  }

  const seenRegistryHashes = new Set<string>();
  for (let index = 0; index < registryAssets.length; index += 1) {
    const asset = registryAssets[index];
    const label = `Media registry row ${index + 1}`;
    if (!HASH_PATTERN.test(asset.hash)) {
      throw new Error(`${label} has an invalid SHA-256 key.`);
    }
    if (seenRegistryHashes.has(asset.hash)) {
      throw new Error(`Media registry contains duplicate hash ${asset.hash}.`);
    }
    seenRegistryHashes.add(asset.hash);

    const mimeType = normalizeMediaMimeType(asset.mimeType);
    if (mimeType !== asset.mimeType) {
      throw new Error(`${label} has a non-canonical MIME type.`);
    }
    assertMediaByteLength(asset.byteLength, label);
    if (!isArrayBufferValue(asset.data)) {
      throw new Error(`${label} does not contain ArrayBuffer data.`);
    }
    if (asset.data.byteLength !== asset.byteLength) {
      throw new Error(`${label} has inconsistent byte length.`);
    }

    const bytes = new Uint8Array(asset.data);
    const calculatedHash = await hashMediaBytes(mimeType, bytes);
    if (calculatedHash !== asset.hash) {
      throw new Error(`${label} failed its SHA-256 integrity check.`);
    }

    addRow({
      hash: asset.hash,
      mimeType,
      byteLength: bytes.byteLength,
      base64: bytesToBase64(bytes),
      createdAt: dateToCanonicalIso(asset.createdAt, `${label} timestamp`),
      usage: 'registry',
    });
  }

  return {
    decks: externalized.decks,
    cards: externalized.cards,
    media: [...rows.values()].sort((left, right) =>
      left.hash.localeCompare(right.hash),
    ),
  };
}

/**
 * Validate format-v5 media completely before returning hydrated text or durable
 * registry rows. Registry-only assets may be unreferenced because the media
 * table is part of the full local database state; embedded assets may not be.
 */
export async function importRegistryNativeBackupMedia<
  TDeck extends TextDeck,
  TCard extends TextCard,
>(
  decks: readonly TDeck[],
  cards: readonly TCard[],
  value: unknown,
): Promise<RegistryNativeBackupImport<TDeck, TCard>> {
  if (!Array.isArray(value)) {
    throw new Error(
      'Backup is missing its registry-native media table; refusing to import.',
    );
  }
  if (value.length > BACKUP_MEDIA_LIMITS.maxAssets) {
    throw new Error(
      `Backup contains more than ${BACKUP_MEDIA_LIMITS.maxAssets.toLocaleString()} media objects.`,
    );
  }

  const rows = new Map<string, ValidatedMediaRow>();
  let totalBytes = 0;

  for (let index = 0; index < value.length; index += 1) {
    const raw = value[index];
    const label = `Backup media row ${index + 1}`;
    if (!isRecord(raw)) throw new Error(`${label} is invalid.`);

    const keys = Object.keys(raw).sort().join(',');
    if (
      keys !== 'base64,byteLength,createdAt,hash,mimeType,usage'
    ) {
      throw new Error(`${label} has an invalid shape.`);
    }

    const { hash, mimeType, byteLength, base64, createdAt, usage } = raw;
    if (typeof hash !== 'string' || !HASH_PATTERN.test(hash)) {
      throw new Error(`${label} has an invalid SHA-256 hash.`);
    }
    if (rows.has(hash)) {
      throw new Error(`Backup contains duplicate media hash ${hash}.`);
    }
    if (typeof mimeType !== 'string') {
      throw new Error(`${label} has an invalid MIME type.`);
    }
    const normalizedMime = normalizeMediaMimeType(mimeType);
    if (normalizedMime !== mimeType) {
      throw new Error(`${label} has a non-canonical MIME type.`);
    }
    if (!Number.isSafeInteger(byteLength)) {
      throw new Error(`${label} has an invalid byte length.`);
    }
    assertMediaByteLength(Number(byteLength), label);
    if (typeof base64 !== 'string') {
      throw new Error(`${label} is missing base64 data.`);
    }
    const bytes = decodeCanonicalBase64(base64, label);
    if (bytes.byteLength !== byteLength) {
      throw new Error(`${label} byte length does not match its data.`);
    }
    const calculatedHash = await hashMediaBytes(normalizedMime, bytes);
    if (calculatedHash !== hash) {
      throw new Error(`${label} failed its SHA-256 integrity check.`);
    }
    if (usage !== 'embedded' && usage !== 'registry' && usage !== 'both') {
      throw new Error(`${label} has an invalid usage value.`);
    }

    totalBytes += bytes.byteLength;
    if (totalBytes > BACKUP_MEDIA_LIMITS.maxTotalBytes) {
      throw new Error(
        `Backup media exceeds the ${BACKUP_MEDIA_LIMITS.maxTotalBytes / (1024 * 1024)} MiB total limit.`,
      );
    }

    rows.set(hash, {
      hash,
      mimeType: normalizedMime,
      byteLength: bytes.byteLength,
      base64,
      createdAt: canonicalIsoDate(createdAt, `${label} timestamp`),
      usage,
      bytes,
    });
  }

  const embeddedReferences = new Set<string>();
  for (const text of textFields(decks, cards)) {
    collectPortableReferences(text, embeddedReferences);
  }

  for (const hash of embeddedReferences) {
    const row = rows.get(hash);
    if (!row || (row.usage !== 'embedded' && row.usage !== 'both')) {
      throw new Error(`Backup references missing embedded media ${hash}.`);
    }
  }
  for (const row of rows.values()) {
    if (
      (row.usage === 'embedded' || row.usage === 'both') &&
      !embeddedReferences.has(row.hash)
    ) {
      throw new Error(`Backup contains unreferenced embedded media ${row.hash}.`);
    }
  }

  return {
    decks: decks.map((deck) => ({
      ...deck,
      ...(deck.notes === undefined
        ? {}
        : { notes: hydratePortableText(deck.notes, rows) }),
    })) as TDeck[],
    cards: cards.map((card) => ({
      ...card,
      front: hydratePortableText(card.front, rows),
      back: hydratePortableText(card.back, rows),
    })) as TCard[],
    media: [...rows.values()]
      .filter((row) => row.usage === 'registry' || row.usage === 'both')
      .map((row) => ({
        hash: row.hash,
        mimeType: row.mimeType,
        byteLength: row.byteLength,
        data: copyToArrayBuffer(row.bytes),
        createdAt: new Date(row.createdAt),
      })),
  };
}
