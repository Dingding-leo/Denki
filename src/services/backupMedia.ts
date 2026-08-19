const MEBIBYTE = 1024 * 1024;

export const BACKUP_MEDIA_REFERENCE_PREFIX =
  'denki-backup-media://sha256/';

export const BACKUP_MEDIA_LIMITS = {
  maxAssets: 5_000,
  maxSingleBytes: 16 * MEBIBYTE,
  maxTotalBytes: 160 * MEBIBYTE,
} as const;

const HASH_PATTERN = /^[a-f0-9]{64}$/;
const MEDIA_MIME_PATTERN =
  '(?:image\/(?:png|jpeg|gif|webp|avif|bmp|svg\+xml)|' +
  'audio\/(?:mpeg|mp4|aac|wav|ogg|opus|flac)|' +
  'video\/(?:mp4|webm))';
const DATA_URL_SOURCE =
  `data:(${MEDIA_MIME_PATTERN});base64,([A-Za-z0-9+/]+={0,2})`;
const TOKEN_SOURCE =
  `${BACKUP_MEDIA_REFERENCE_PREFIX.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}([a-f0-9]{64})`;

const SUPPORTED_MEDIA_TYPES = new Set([
  'image/png',
  'image/jpeg',
  'image/gif',
  'image/webp',
  'image/avif',
  'image/bmp',
  'image/svg+xml',
  'audio/mpeg',
  'audio/mp4',
  'audio/aac',
  'audio/wav',
  'audio/ogg',
  'audio/opus',
  'audio/flac',
  'video/mp4',
  'video/webm',
] as const);

export interface PortableBackupMediaAsset {
  hash: string;
  mimeType: string;
  byteLength: number;
  base64: string;
}

interface TextDeck {
  notes?: string;
}

interface TextCard {
  front: string;
  back: string;
}

export interface ExternalizedBackupMedia<
  TDeck extends TextDeck,
  TCard extends TextCard,
> {
  decks: TDeck[];
  cards: TCard[];
  media: PortableBackupMediaAsset[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
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

function decodeCanonicalBase64(
  value: string,
  label: string,
): Uint8Array {
  if (!value || value.length % 4 !== 0) {
    throw new Error(`${label} is not canonical base64.`);
  }

  const maximumEncodedChars =
    Math.ceil(BACKUP_MEDIA_LIMITS.maxSingleBytes / 3) * 4 + 4;
  if (value.length > maximumEncodedChars) {
    throw new Error(
      `${label} exceeds the ${BACKUP_MEDIA_LIMITS.maxSingleBytes / MEBIBYTE} MiB per-file limit.`,
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

function decodeSourceDataUrlBase64(
  value: string,
  label: string,
): { bytes: Uint8Array; canonicalBase64: string } {
  const maximumEncodedChars =
    Math.ceil(BACKUP_MEDIA_LIMITS.maxSingleBytes / 3) * 4 + 4;
  if (!value || value.length > maximumEncodedChars) {
    throw new Error(
      `${label} exceeds the ${BACKUP_MEDIA_LIMITS.maxSingleBytes / MEBIBYTE} MiB per-file limit.`,
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
  return { bytes, canonicalBase64: bytesToBase64(bytes) };
}

function requireSubtleCrypto(): SubtleCrypto {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) {
    throw new Error(
      'Secure SHA-256 support is unavailable, so portable media cannot be processed.',
    );
  }
  return subtle;
}

export function isSupportedBackupMediaType(
  value: unknown,
): value is string {
  return typeof value === 'string' && SUPPORTED_MEDIA_TYPES.has(
    value.toLowerCase() as never,
  );
}

export async function hashBackupMedia(
  mimeType: string,
  bytes: Uint8Array,
): Promise<string> {
  const normalizedMime = mimeType.toLowerCase();
  if (!isSupportedBackupMediaType(normalizedMime)) {
    throw new Error(`Unsupported portable media type: ${mimeType}`);
  }

  const mimeBytes = new TextEncoder().encode(normalizedMime);
  const input = new Uint8Array(mimeBytes.length + 1 + bytes.length);
  input.set(mimeBytes, 0);
  input[mimeBytes.length] = 0;
  input.set(bytes, mimeBytes.length + 1);

  const digest = await requireSubtleCrypto().digest('SHA-256', input);
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

export function createBackupMediaReference(hash: string): string {
  if (!HASH_PATTERN.test(hash)) {
    throw new Error('Portable media hash must be a lowercase SHA-256 value.');
  }
  return `${BACKUP_MEDIA_REFERENCE_PREFIX}${hash}`;
}

function collectDataUrls(text: string, output: Set<string>): void {
  const matcher = new RegExp(DATA_URL_SOURCE, 'gi');
  for (const match of text.matchAll(matcher)) {
    output.add(match[0]);
    if (output.size > BACKUP_MEDIA_LIMITS.maxAssets) {
      throw new Error(
        `Backup contains more than ${BACKUP_MEDIA_LIMITS.maxAssets.toLocaleString()} distinct embedded media values.`,
      );
    }
  }
}

function rewriteDataUrls(
  text: string,
  replacements: ReadonlyMap<string, string>,
): string {
  if (!text) return text;
  return text.replace(
    new RegExp(DATA_URL_SOURCE, 'gi'),
    (match) => replacements.get(match) ?? match,
  );
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

/**
 * Replace repeated base64 media in cards and deck notes with SHA-256 references.
 * Assets are deduplicated by normalized MIME type plus decoded bytes.
 */
export async function externalizeBackupMedia<
  TDeck extends TextDeck,
  TCard extends TextCard,
>(
  decks: readonly TDeck[],
  cards: readonly TCard[],
): Promise<ExternalizedBackupMedia<TDeck, TCard>> {
  const uniqueDataUrls = new Set<string>();
  for (const text of textFields(decks, cards)) {
    collectDataUrls(text, uniqueDataUrls);
  }

  const replacements = new Map<string, string>();
  const mediaByHash = new Map<string, PortableBackupMediaAsset>();
  let totalBytes = 0;

  for (const dataUrl of uniqueDataUrls) {
    const parsed = new RegExp(`^${DATA_URL_SOURCE}$`, 'i').exec(dataUrl);
    if (!parsed) continue;

    const mimeType = parsed[1].toLowerCase();
    if (!isSupportedBackupMediaType(mimeType)) continue;

    const { bytes, canonicalBase64 } = decodeSourceDataUrlBase64(
      parsed[2],
      `Embedded ${mimeType} media`,
    );
    if (bytes.byteLength === 0) {
      throw new Error('Backup contains an empty embedded media object.');
    }
    if (bytes.byteLength > BACKUP_MEDIA_LIMITS.maxSingleBytes) {
      throw new Error(
        `Embedded ${mimeType} media exceeds the ${BACKUP_MEDIA_LIMITS.maxSingleBytes / MEBIBYTE} MiB per-file limit.`,
      );
    }

    const hash = await hashBackupMedia(mimeType, bytes);
    const reference = createBackupMediaReference(hash);
    replacements.set(dataUrl, reference);

    if (!mediaByHash.has(hash)) {
      totalBytes += bytes.byteLength;
      if (totalBytes > BACKUP_MEDIA_LIMITS.maxTotalBytes) {
        throw new Error(
          `Embedded media exceeds the ${BACKUP_MEDIA_LIMITS.maxTotalBytes / MEBIBYTE} MiB portable-backup limit.`,
        );
      }
      if (mediaByHash.size >= BACKUP_MEDIA_LIMITS.maxAssets) {
        throw new Error(
          `Backup exceeds the ${BACKUP_MEDIA_LIMITS.maxAssets.toLocaleString()} media-object limit.`,
        );
      }

      mediaByHash.set(hash, {
        hash,
        mimeType,
        byteLength: bytes.byteLength,
        base64: canonicalBase64,
      });
    }
  }

  return {
    decks: decks.map((deck) => ({
      ...deck,
      ...(deck.notes === undefined
        ? {}
        : { notes: rewriteDataUrls(deck.notes, replacements) }),
    })) as TDeck[],
    cards: cards.map((card) => ({
      ...card,
      front: rewriteDataUrls(card.front, replacements),
      back: rewriteDataUrls(card.back, replacements),
    })) as TCard[],
    media: [...mediaByHash.values()].sort((left, right) =>
      left.hash.localeCompare(right.hash),
    ),
  };
}

async function validatePortableMedia(
  value: unknown,
): Promise<Map<string, string>> {
  if (!Array.isArray(value)) {
    throw new Error(
      'Backup is missing its portable media table; refusing to import.',
    );
  }
  if (value.length > BACKUP_MEDIA_LIMITS.maxAssets) {
    throw new Error(
      `Backup contains more than ${BACKUP_MEDIA_LIMITS.maxAssets.toLocaleString()} media objects.`,
    );
  }

  const dataUrls = new Map<string, string>();
  let totalBytes = 0;

  for (let index = 0; index < value.length; index += 1) {
    const row = value[index];
    if (!isRecord(row)) {
      throw new Error(
        `Backup contains an invalid media object at row ${index + 1}.`,
      );
    }

    const keys = Object.keys(row).sort().join(',');
    if (keys !== 'base64,byteLength,hash,mimeType') {
      throw new Error(
        `Backup media row ${index + 1} has an invalid shape.`,
      );
    }

    const { hash, mimeType, byteLength, base64 } = row;
    if (typeof hash !== 'string' || !HASH_PATTERN.test(hash)) {
      throw new Error(
        `Backup media row ${index + 1} has an invalid SHA-256 hash.`,
      );
    }
    if (
      typeof mimeType !== 'string' ||
      mimeType !== mimeType.toLowerCase() ||
      !isSupportedBackupMediaType(mimeType)
    ) {
      throw new Error(
        `Backup media row ${index + 1} has an unsupported MIME type.`,
      );
    }
    if (
      !Number.isSafeInteger(byteLength) ||
      Number(byteLength) <= 0 ||
      Number(byteLength) > BACKUP_MEDIA_LIMITS.maxSingleBytes
    ) {
      throw new Error(
        `Backup media row ${index + 1} has an invalid byte length.`,
      );
    }
    if (typeof base64 !== 'string') {
      throw new Error(
        `Backup media row ${index + 1} is missing base64 data.`,
      );
    }

    const bytes = decodeCanonicalBase64(
      base64,
      `Backup media row ${index + 1}`,
    );
    if (bytes.byteLength !== byteLength) {
      throw new Error(
        `Backup media row ${index + 1} byte length does not match its data.`,
      );
    }

    totalBytes += bytes.byteLength;
    if (totalBytes > BACKUP_MEDIA_LIMITS.maxTotalBytes) {
      throw new Error(
        `Backup media exceeds the ${BACKUP_MEDIA_LIMITS.maxTotalBytes / MEBIBYTE} MiB total limit.`,
      );
    }

    const calculatedHash = await hashBackupMedia(mimeType, bytes);
    if (calculatedHash !== hash) {
      throw new Error(
        `Backup media row ${index + 1} failed its SHA-256 integrity check.`,
      );
    }
    if (dataUrls.has(hash)) {
      throw new Error(`Backup contains duplicate media hash ${hash}.`);
    }

    dataUrls.set(hash, `data:${mimeType};base64,${base64}`);
  }

  return dataUrls;
}

function collectBackupReferences(text: string, output: Set<string>): void {
  if (!text.includes(BACKUP_MEDIA_REFERENCE_PREFIX)) return;
  const matcher = new RegExp(TOKEN_SOURCE, 'g');
  for (const match of text.matchAll(matcher)) output.add(match[1]);

  const withoutValidReferences = text.replace(matcher, '');
  if (withoutValidReferences.includes(BACKUP_MEDIA_REFERENCE_PREFIX)) {
    throw new Error('Backup contains a malformed portable media reference.');
  }
}

function hydrateText(
  text: string,
  dataUrls: ReadonlyMap<string, string>,
): string {
  if (!text.includes(BACKUP_MEDIA_REFERENCE_PREFIX)) return text;
  return text.replace(new RegExp(TOKEN_SOURCE, 'g'), (_match, hash: string) => {
    const dataUrl = dataUrls.get(hash);
    if (!dataUrl) {
      throw new Error(`Backup references missing media ${hash}.`);
    }
    return dataUrl;
  });
}

/**
 * Validate the complete media table before expanding any card or deck strings.
 * v1-v3 backups remain unchanged; v4 requires a canonical, fully referenced
 * content-addressed media table.
 */
export async function hydrateBackupMedia<
  TDeck extends TextDeck,
  TCard extends TextCard,
>(
  decks: readonly TDeck[],
  cards: readonly TCard[],
  media: unknown,
  formatVersion: number,
): Promise<{ decks: TDeck[]; cards: TCard[] }> {
  const references = new Set<string>();
  for (const text of textFields(decks, cards)) {
    collectBackupReferences(text, references);
  }

  if (formatVersion < 4) {
    if (references.size > 0) {
      throw new Error(
        'Legacy backup contains portable media references without a supported media table.',
      );
    }
    return { decks: [...decks], cards: [...cards] };
  }

  const dataUrls = await validatePortableMedia(media);
  for (const hash of references) {
    if (!dataUrls.has(hash)) {
      throw new Error(`Backup references missing media ${hash}.`);
    }
  }
  for (const hash of dataUrls.keys()) {
    if (!references.has(hash)) {
      throw new Error(`Backup contains unreferenced media ${hash}.`);
    }
  }

  return {
    decks: decks.map((deck) => ({
      ...deck,
      ...(deck.notes === undefined
        ? {}
        : { notes: hydrateText(deck.notes, dataUrls) }),
    })) as TDeck[],
    cards: cards.map((card) => ({
      ...card,
      front: hydrateText(card.front, dataUrls),
      back: hydrateText(card.back, dataUrls),
    })) as TCard[],
  };
}
