import DOMPurify from 'dompurify';
import { db } from '../db';
import type { CardType } from '../db/schema';
import { STATES } from './scheduler';

const FALLBACK_DECK_KEY = '__denki_anki_fallback__';
const FALLBACK_DECK_NAME = 'Anki Import';
const MEBIBYTE = 1024 * 1024;
const ZIP_EOCD_SIGNATURE = 0x06054b50;
const ZIP_CENTRAL_FILE_SIGNATURE = 0x02014b50;
const ZIP_EOCD_MIN_BYTES = 22;
const ZIP_MAX_COMMENT_BYTES = 0xffff;

export const ANKI_IMPORT_LIMITS = {
  maxArchiveBytes: 100 * MEBIBYTE,
  maxArchiveEntries: 2_050,
  maxDeclaredUncompressedBytes: 256 * MEBIBYTE,
  maxDatabaseBytes: 64 * MEBIBYTE,
  maxMediaEntries: 2_000,
  maxMediaMapChars: 2 * MEBIBYTE,
  maxTotalMediaNameChars: 512_000,
  maxSingleMediaBytes: 16 * MEBIBYTE,
  maxReferencedMediaBytes: 64 * MEBIBYTE,
  maxCards: 50_000,
  maxFieldChars: 250_000,
  maxTotalFieldChars: 25_000_000,
  maxMediaFilenameChars: 512,
} as const;

type MediaLookup = Record<string, string>;
type MediaArchiveMap = Record<string, string>;
type ProgressReporter = (message: string) => void;

export interface ZipStreamHelper {
  on(event: 'data', callback: (data: Uint8Array) => void): ZipStreamHelper;
  on(event: 'error', callback: (error: Error) => void): ZipStreamHelper;
  on(event: 'end', callback: () => void): ZipStreamHelper;
  resume(): ZipStreamHelper;
  pause(): ZipStreamHelper;
}

export interface BoundedZipEntry {
  internalStream(type: 'uint8array'): ZipStreamHelper;
}

type ZipEntry = BoundedZipEntry;

interface ZipArchive {
  file(path: string): ZipEntry | null;
}

interface SqlQueryResult {
  values: unknown[][];
}

interface SqlDatabase {
  exec(sql: string): SqlQueryResult[];
  close(): void;
}

interface SqlRuntime {
  Database: new (data: Uint8Array) => SqlDatabase;
}

interface AnkiRuntime {
  loadZip(data: Blob | ArrayBuffer): Promise<ZipArchive>;
  initSql(): Promise<SqlRuntime>;
}

export interface AnkiImportCardDraft {
  ankiDeckId: string;
  front: string;
  back: string;
  cardType: CardType;
}

export interface AnkiImportPlan {
  deckNames: Record<string, string>;
  cards: AnkiImportCardDraft[];
}

export interface AnkiImportResult {
  decksCreated: number;
  cardsImported: number;
}

export interface AnkiZipEntrySummary {
  compressedBytes: number;
  uncompressedBytes: number;
  compressionMethod: number;
}

export interface AnkiZipSummary {
  entries: Record<string, AnkiZipEntrySummary>;
  entryCount: number;
  totalUncompressedBytes: number;
}

let runtimePromise: Promise<AnkiRuntime> | null = null;

interface MediaReferenceIndex {
  isEmpty: boolean;
  filenameAlternation: string;
}

const mediaReferenceIndexCache = new WeakMap<object, MediaReferenceIndex>();

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function getMediaReferenceIndex(record: Record<string, unknown>): MediaReferenceIndex {
  const cached = mediaReferenceIndexCache.get(record);
  if (cached) return cached;

  const filenames = Object.keys(record).sort((a, b) => b.length - a.length);
  const index = {
    isEmpty: filenames.length === 0,
    filenameAlternation: filenames.map(escapeRegex).join('|'),
  };
  mediaReferenceIndexCache.set(record, index);
  return index;
}

function getMimeType(filename: string): string | null {
  const ext = filename.split('.').pop()?.toLowerCase();
  switch (ext) {
    case 'png': return 'image/png';
    case 'jpg':
    case 'jpeg': return 'image/jpeg';
    case 'gif': return 'image/gif';
    case 'svg': return 'image/svg+xml';
    case 'webp': return 'image/webp';
    case 'avif': return 'image/avif';
    case 'bmp': return 'image/bmp';
    case 'mp3': return 'audio/mpeg';
    case 'm4a': return 'audio/mp4';
    case 'aac': return 'audio/aac';
    case 'wav': return 'audio/wav';
    case 'ogg': return 'audio/ogg';
    case 'opus': return 'audio/opus';
    case 'flac': return 'audio/flac';
    case 'mp4': return 'video/mp4';
    case 'webm': return 'video/webm';
    default: return null;
  }
}

function bytesToBase64(bytes: Uint8Array): string {
  const chunkSize = 0x8000;
  const chunks: string[] = [];

  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    const chunk = bytes.subarray(offset, Math.min(offset + chunkSize, bytes.length));
    chunks.push(String.fromCharCode(...chunk));
  }

  return window.btoa(chunks.join(''));
}

function sanitizeSvgBytes(bytes: Uint8Array, filename: string): Uint8Array {
  const source = new TextDecoder().decode(bytes);
  const sanitized = DOMPurify.sanitize(source, {
    USE_PROFILES: { svg: true, svgFilters: true },
    FORBID_TAGS: ['script', 'foreignObject', 'iframe', 'object', 'embed'],
    FORBID_ATTR: [
      'style',
      'href',
      'xlink:href',
      'onload',
      'onerror',
      'onclick',
      'onmouseover',
    ],
    ALLOW_DATA_ATTR: false,
  });

  if (!/<svg[\s>]/i.test(sanitized)) {
    throw new Error(`Anki media "${filename}" is not a valid safe SVG image.`);
  }

  return new TextEncoder().encode(sanitized);
}

function bytesToBase64DataUrl(
  input: Uint8Array,
  filename: string,
): string | null {
  const mimeType = getMimeType(filename);
  if (!mimeType) return null;

  const bytes = mimeType === 'image/svg+xml'
    ? sanitizeSvgBytes(input, filename)
    : input;

  return `data:${mimeType};base64,${bytesToBase64(bytes)}`;
}

/**
 * Consume a JSZip entry incrementally and pause the decompressor as soon as its
 * actual output exceeds the allowed size. Metadata preflight catches ordinary
 * bombs; this guard also contains archives whose central-directory sizes lie.
 */
export function readZipEntryBytes(
  entry: BoundedZipEntry,
  maxBytes: number,
  label: string,
): Promise<Uint8Array> {
  if (!Number.isSafeInteger(maxBytes) || maxBytes <= 0) {
    return Promise.reject(new Error(`Invalid byte limit for ${label}.`));
  }

  return new Promise((resolve, reject) => {
    const chunks: Uint8Array[] = [];
    let totalBytes = 0;
    let settled = false;
    let stream: ZipStreamHelper | null = null;

    const fail = (error: Error) => {
      if (settled) return;
      settled = true;
      try {
        stream?.pause();
      } catch {
        // The promise is already failing; a broken pause must not mask it.
      }
      reject(error);
    };

    try {
      stream = entry
        .internalStream('uint8array')
        .on('data', (chunk) => {
          if (settled) return;
          const nextTotal = totalBytes + chunk.byteLength;
          if (!Number.isSafeInteger(nextTotal) || nextTotal > maxBytes) {
            fail(
              new Error(
                `${label} exceeds the safe decompressed size limit ` +
                `(${Math.ceil(maxBytes / MEBIBYTE)} MiB).`,
              ),
            );
            return;
          }

          totalBytes = nextTotal;
          // Copy because stream implementations may reuse their backing buffer.
          chunks.push(chunk.slice());
        })
        .on('error', (error) => {
          fail(new Error(`${label} could not be decompressed.`, { cause: error }));
        })
        .on('end', () => {
          if (settled) return;
          settled = true;
          const output = new Uint8Array(totalBytes);
          let offset = 0;
          for (const chunk of chunks) {
            output.set(chunk, offset);
            offset += chunk.byteLength;
          }
          resolve(output);
        });
      stream.resume();
    } catch (error) {
      fail(new Error(`${label} could not be decompressed.`, { cause: error }));
    }
  });
}

function lookupMedia(
  mediaLookup: MediaLookup,
  rawReference: string,
): string | undefined {
  const trimmed = rawReference.trim();
  const exact = mediaLookup[trimmed];
  if (exact) return exact;

  try {
    return mediaLookup[decodeURIComponent(trimmed)];
  } catch {
    return undefined;
  }
}

/**
 * Replace only references that actually occur in the card content. This keeps
 * processing proportional to the content length instead of scanning every media
 * filename for every card.
 */
export function replaceAnkiMediaReferences(
  html: string,
  mediaLookup: MediaLookup,
): string {
  if (!html) return html;
  const mediaIndex = getMediaReferenceIndex(mediaLookup);
  if (mediaIndex.isEmpty) return html;

  const withHtmlSources = html.replace(
    /\bsrc\s*=\s*(?:(['"])(.*?)\1|([^\s>]+))/gi,
    (
      match,
      _quote: string | undefined,
      quoted: string | undefined,
      unquoted: string | undefined,
    ) => {
      const reference = quoted ?? unquoted ?? '';
      const dataUrl = lookupMedia(mediaLookup, reference);
      return dataUrl ? `src="${dataUrl}"` : match;
    },
  );

  const markdownPattern = new RegExp(
    `(!?\\[[^\\]]*\\]\\()(${mediaIndex.filenameAlternation})(\\))`,
    'g',
  );
  const withMarkdownLinks = withHtmlSources.replace(
    markdownPattern,
    (_match, prefix: string, reference: string, suffix: string) =>
      `${prefix}${lookupMedia(mediaLookup, reference) ?? reference}${suffix}`,
  );

  // Build the sound matcher from known filenames. A generic "until ]" matcher
  // breaks legitimate names such as voice[1].mp3.
  const soundPattern = new RegExp(
    `\\[sound:(${mediaIndex.filenameAlternation})\\]`,
    'g',
  );
  return withMarkdownLinks.replace(soundPattern, (match, reference: string) => {
    const dataUrl = lookupMedia(mediaLookup, reference);
    if (!dataUrl) return match;
    return `<audio controls preload="none" src="${dataUrl}"></audio>`;
  });
}

/**
 * Shared .apkg files are untrusted input. Sanitize before writing to IndexedDB,
 * in addition to Denki's normal render-time sanitization.
 */
export function sanitizeAnkiHtml(html: string): string {
  return DOMPurify.sanitize(html, {
    USE_PROFILES: { html: true },
    ADD_TAGS: ['audio', 'video', 'source'],
    ADD_ATTR: ['controls', 'preload', 'poster', 'playsinline'],
    ADD_DATA_URI_TAGS: ['img', 'audio', 'video', 'source'],
    ALLOW_DATA_ATTR: false,
    FORBID_TAGS: [
      'script',
      'style',
      'iframe',
      'object',
      'embed',
      'form',
      'input',
      'button',
      'textarea',
      'select',
      'option',
      'meta',
      'link',
      'base',
    ],
    FORBID_ATTR: ['style', 'srcdoc', 'formaction'],
  });
}

export function validateAnkiPackageFile(
  file: Pick<File, 'name' | 'size'>,
): void {
  if (!/\.apkg$/i.test(file.name)) {
    throw new Error(
      'Invalid file format. Please upload a valid Anki package (.apkg) file.',
    );
  }
  if (!Number.isFinite(file.size) || file.size <= 0) {
    throw new Error('The selected Anki package is empty or unreadable.');
  }
  if (file.size > ANKI_IMPORT_LIMITS.maxArchiveBytes) {
    throw new Error(
      `The Anki package is too large (${Math.ceil(file.size / MEBIBYTE)} MiB). ` +
      `The safe import limit is ${ANKI_IMPORT_LIMITS.maxArchiveBytes / MEBIBYTE} MiB.`,
    );
  }
}

function findEndOfCentralDirectory(view: DataView): number {
  const minimumOffset = Math.max(
    0,
    view.byteLength - ZIP_EOCD_MIN_BYTES - ZIP_MAX_COMMENT_BYTES,
  );

  for (
    let offset = view.byteLength - ZIP_EOCD_MIN_BYTES;
    offset >= minimumOffset;
    offset -= 1
  ) {
    if (view.getUint32(offset, true) !== ZIP_EOCD_SIGNATURE) continue;
    const commentBytes = view.getUint16(offset + 20, true);
    if (offset + ZIP_EOCD_MIN_BYTES + commentBytes === view.byteLength) {
      return offset;
    }
  }

  throw new Error('The Anki package is not a valid ZIP archive.');
}

/**
 * Read the ZIP central directory before JSZip expands any entry. This rejects
 * excessive declared output, entry count, encryption, ZIP64, multi-disk files,
 * unsupported compression, and ambiguous duplicate paths before decompression.
 * readZipEntryBytes() then independently caps actual streamed output.
 */
export function inspectAnkiZipArchive(buffer: ArrayBuffer): AnkiZipSummary {
  if (buffer.byteLength < ZIP_EOCD_MIN_BYTES) {
    throw new Error('The Anki package is not a valid ZIP archive.');
  }

  const view = new DataView(buffer);
  const bytes = new Uint8Array(buffer);
  const eocdOffset = findEndOfCentralDirectory(view);
  const diskNumber = view.getUint16(eocdOffset + 4, true);
  const centralDirectoryDisk = view.getUint16(eocdOffset + 6, true);
  const entriesOnDisk = view.getUint16(eocdOffset + 8, true);
  const totalEntries = view.getUint16(eocdOffset + 10, true);
  const centralDirectoryBytes = view.getUint32(eocdOffset + 12, true);
  const centralDirectoryOffset = view.getUint32(eocdOffset + 16, true);
  const commentBytes = view.getUint16(eocdOffset + 20, true);

  if (
    entriesOnDisk === 0xffff ||
    totalEntries === 0xffff ||
    centralDirectoryBytes === 0xffffffff ||
    centralDirectoryOffset === 0xffffffff
  ) {
    throw new Error('ZIP64 Anki packages are not supported by the safe importer.');
  }
  if (
    diskNumber !== 0 ||
    centralDirectoryDisk !== 0 ||
    entriesOnDisk !== totalEntries
  ) {
    throw new Error('Multi-disk Anki ZIP archives are not supported.');
  }
  if (totalEntries === 0) {
    throw new Error('The Anki ZIP archive contains no files.');
  }
  if (totalEntries > ANKI_IMPORT_LIMITS.maxArchiveEntries) {
    throw new Error(
      `The Anki archive contains ${totalEntries.toLocaleString()} files; ` +
      `the safe limit is ${ANKI_IMPORT_LIMITS.maxArchiveEntries.toLocaleString()}.`,
    );
  }
  if (eocdOffset + ZIP_EOCD_MIN_BYTES + commentBytes !== view.byteLength) {
    throw new Error('The Anki ZIP archive has invalid trailing data.');
  }

  const centralDirectoryEnd = centralDirectoryOffset + centralDirectoryBytes;
  if (
    centralDirectoryOffset > eocdOffset ||
    centralDirectoryEnd > eocdOffset ||
    centralDirectoryEnd < centralDirectoryOffset
  ) {
    throw new Error('The Anki ZIP central directory is invalid.');
  }

  const decoder = new TextDecoder();
  const entries: Record<string, AnkiZipEntrySummary> = {};
  let cursor = centralDirectoryOffset;
  let totalUncompressedBytes = 0;

  for (let index = 0; index < totalEntries; index += 1) {
    if (
      cursor + 46 > centralDirectoryEnd ||
      view.getUint32(cursor, true) !== ZIP_CENTRAL_FILE_SIGNATURE
    ) {
      throw new Error('The Anki ZIP central directory is truncated or corrupt.');
    }

    const flags = view.getUint16(cursor + 8, true);
    const compressionMethod = view.getUint16(cursor + 10, true);
    const compressedBytes = view.getUint32(cursor + 20, true);
    const uncompressedBytes = view.getUint32(cursor + 24, true);
    const filenameBytes = view.getUint16(cursor + 28, true);
    const extraBytes = view.getUint16(cursor + 30, true);
    const entryCommentBytes = view.getUint16(cursor + 32, true);
    const localHeaderOffset = view.getUint32(cursor + 42, true);
    const recordEnd =
      cursor + 46 + filenameBytes + extraBytes + entryCommentBytes;

    if (
      compressedBytes === 0xffffffff ||
      uncompressedBytes === 0xffffffff ||
      localHeaderOffset === 0xffffffff
    ) {
      throw new Error('ZIP64 entries are not supported by the safe importer.');
    }
    if ((flags & 0x0001) !== 0) {
      throw new Error('Encrypted Anki ZIP entries are not supported.');
    }
    if (compressionMethod !== 0 && compressionMethod !== 8) {
      throw new Error(
        `The Anki ZIP uses unsupported compression method ${compressionMethod}.`,
      );
    }
    if (recordEnd > centralDirectoryEnd || recordEnd < cursor) {
      throw new Error('The Anki ZIP central directory contains an invalid record.');
    }

    const filename = decoder.decode(
      bytes.subarray(cursor + 46, cursor + 46 + filenameBytes),
    );
    if (!filename || filename.includes('\0')) {
      throw new Error('The Anki ZIP contains an invalid filename.');
    }
    if (Object.prototype.hasOwnProperty.call(entries, filename)) {
      throw new Error(`The Anki ZIP contains a duplicate path: ${filename}`);
    }

    totalUncompressedBytes += uncompressedBytes;
    if (
      !Number.isSafeInteger(totalUncompressedBytes) ||
      totalUncompressedBytes > ANKI_IMPORT_LIMITS.maxDeclaredUncompressedBytes
    ) {
      throw new Error(
        'The Anki ZIP declares too much decompressed data for safe browser import.',
      );
    }

    entries[filename] = {
      compressedBytes,
      uncompressedBytes,
      compressionMethod,
    };
    cursor = recordEnd;
  }

  if (cursor !== centralDirectoryEnd) {
    throw new Error('The Anki ZIP central directory size does not match its entries.');
  }

  const databaseEntry = entries['collection.anki21'] ?? entries['collection.anki2'];
  if (!databaseEntry) {
    throw new Error(
      'Anki package does not contain collection.anki2 or collection.anki21.',
    );
  }
  if (databaseEntry.uncompressedBytes > ANKI_IMPORT_LIMITS.maxDatabaseBytes) {
    throw new Error(
      `The Anki collection database is too large ` +
      `(${Math.ceil(databaseEntry.uncompressedBytes / MEBIBYTE)} MiB).`,
    );
  }

  const mediaIndexEntry = entries.media;
  if (
    mediaIndexEntry &&
    mediaIndexEntry.uncompressedBytes > ANKI_IMPORT_LIMITS.maxMediaMapChars
  ) {
    throw new Error('The Anki media index is too large to process safely.');
  }

  for (const [filename, entry] of Object.entries(entries)) {
    if (
      /^\d+$/.test(filename) &&
      entry.uncompressedBytes > ANKI_IMPORT_LIMITS.maxSingleMediaBytes
    ) {
      throw new Error(
        `Anki media entry ${filename} is too large ` +
        `(${Math.ceil(entry.uncompressedBytes / MEBIBYTE)} MiB).`,
      );
    }
  }

  return { entries, entryCount: totalEntries, totalUncompressedBytes };
}

export function validateAnkiRows(
  rows: readonly (readonly unknown[])[],
): void {
  if (rows.length > ANKI_IMPORT_LIMITS.maxCards) {
    throw new Error(
      `This package contains ${rows.length.toLocaleString()} cards; ` +
      `the safe import limit is ${ANKI_IMPORT_LIMITS.maxCards.toLocaleString()}.`,
    );
  }

  let totalFieldChars = 0;
  for (let index = 0; index < rows.length; index += 1) {
    const fields = String(rows[index][1] ?? '');
    if (fields.length > ANKI_IMPORT_LIMITS.maxFieldChars) {
      throw new Error(
        `Anki card ${index + 1} contains an unusually large note ` +
        `(${fields.length.toLocaleString()} characters).`,
      );
    }

    totalFieldChars += fields.length;
    if (totalFieldChars > ANKI_IMPORT_LIMITS.maxTotalFieldChars) {
      throw new Error(
        'The package contains too much card text to import safely in one browser session.',
      );
    }
  }
}

function normalizeDeckName(rawName: string): string {
  const segments = rawName
    .split('::')
    .map((segment) => segment.trim())
    .filter(Boolean);
  return segments.length > 0 ? segments.join(' › ') : FALLBACK_DECK_NAME;
}

function uniqueDeckName(name: string, usedNames: Map<string, number>): string {
  const count = (usedNames.get(name) ?? 0) + 1;
  usedNames.set(name, count);
  return count === 1 ? name : `${name} (${count})`;
}

export function createAnkiImportPlan(
  deckNames: Record<string, string>,
  rows: readonly (readonly unknown[])[],
  mediaLookup: MediaLookup,
): AnkiImportPlan {
  validateAnkiRows(rows);
  const cards: AnkiImportCardDraft[] = [];

  for (const row of rows) {
    const did = row[0];
    const fieldsValue = row[1];
    const fields = String(fieldsValue ?? '').split('\x1f');
    const frontRaw = fields[0] ?? '';
    const backRaw = fields.slice(1).filter((field) => field.length > 0).join('<br>');

    if (!frontRaw.trim()) continue;

    const cardType: CardType = /\{\{c\d+::/i.test(frontRaw) ? 'cloze' : 'standard';
    if (cardType === 'standard' && !backRaw.trim()) continue;

    const front = sanitizeAnkiHtml(
      replaceAnkiMediaReferences(frontRaw, mediaLookup),
    );
    const back = sanitizeAnkiHtml(
      replaceAnkiMediaReferences(backRaw, mediaLookup),
    );

    cards.push({
      ankiDeckId: String(did ?? FALLBACK_DECK_KEY),
      front,
      back,
      cardType,
    });
  }

  return { deckNames, cards };
}

interface DeckSpec {
  key: string;
  name: string;
  description: string;
}

function createDeckSpecs(plan: AnkiImportPlan): DeckSpec[] {
  const seenKeys = new Set<string>();
  const usedNames = new Map<string, number>();
  const specs: DeckSpec[] = [];

  for (const card of plan.cards) {
    const hasNamedDeck = Object.prototype.hasOwnProperty.call(
      plan.deckNames,
      card.ankiDeckId,
    );
    const key = hasNamedDeck ? card.ankiDeckId : FALLBACK_DECK_KEY;
    if (seenKeys.has(key)) continue;
    seenKeys.add(key);

    const rawName = hasNamedDeck
      ? plan.deckNames[card.ankiDeckId]
      : FALLBACK_DECK_NAME;
    const normalizedName = uniqueDeckName(normalizeDeckName(rawName), usedNames);
    specs.push({
      key,
      name: normalizedName,
      description: hasNamedDeck
        ? `Imported from Anki deck "${rawName}"`
        : 'Cards whose original Anki deck could not be resolved',
    });
  }

  return specs;
}

/**
 * Commit decks and cards in one Dexie transaction. Any storage/quota/import
 * failure rolls the whole package back instead of leaving partial empty decks.
 */
export async function commitAnkiImportPlan(
  classId: number,
  plan: AnkiImportPlan,
): Promise<AnkiImportResult> {
  if (plan.cards.length === 0) {
    throw new Error('No importable flashcards were found in this Anki package.');
  }
  if (plan.cards.length > ANKI_IMPORT_LIMITS.maxCards) {
    throw new Error('The Anki import plan exceeds the safe card limit.');
  }

  const deckSpecs = createDeckSpecs(plan);
  if (deckSpecs.length === 0) {
    throw new Error('No usable deck mapping was found in this Anki package.');
  }

  return db.transaction('rw', [db.classes, db.decks, db.cards], async () => {
    if (!await db.classes.get(classId)) {
      throw new Error('The destination class no longer exists.');
    }

    const deckMapping = new Map<string, number>();
    for (const deck of deckSpecs) {
      const deckId = await db.decks.add({
        classId,
        name: deck.name,
        description: deck.description,
        createdAt: new Date(),
      });
      deckMapping.set(deck.key, deckId);
    }

    const now = new Date();
    const fallbackDeckId =
      deckMapping.get(FALLBACK_DECK_KEY) ?? deckMapping.values().next().value;
    if (fallbackDeckId === undefined) {
      throw new Error('Could not create a destination deck for the imported cards.');
    }

    const cardEntries = plan.cards.map((card) => {
      const front = card.front.trim();
      const back = card.back.trim();
      if (!front || (card.cardType === 'standard' && !back)) {
        throw new Error('The Anki import plan contains an empty card.');
      }

      const mappedDeckId = deckMapping.get(card.ankiDeckId) ?? fallbackDeckId;
      return {
        classId,
        deckId: mappedDeckId,
        front,
        back,
        cardType: card.cardType,
        createdAt: now,
        state: STATES.New,
        stability: 0,
        difficulty: 0,
        elapsedDays: 0,
        scheduledDays: 0,
        due: now,
      };
    });

    await db.cards.bulkAdd(cardEntries);

    return {
      decksCreated: deckSpecs.length,
      cardsImported: cardEntries.length,
    };
  });
}

async function loadAnkiRuntime(): Promise<AnkiRuntime> {
  if (runtimePromise) return runtimePromise;

  runtimePromise = Promise.all([
    import('jszip'),
    import('sql.js'),
    import('sql.js/dist/sql-wasm.wasm?url'),
  ])
    .then(([zipModule, sqlModule, wasmModule]) => {
      const zipModuleRecord = zipModule as unknown as { default?: unknown };
      const sqlModuleRecord = sqlModule as unknown as { default?: unknown };
      const JSZip = (zipModuleRecord.default ?? zipModule) as {
        loadAsync(data: Blob | ArrayBuffer): Promise<ZipArchive>;
      };
      const initSqlJs = (sqlModuleRecord.default ?? sqlModule) as (
        config: { locateFile: (filename: string) => string },
      ) => Promise<SqlRuntime>;

      return {
        loadZip: (data: Blob | ArrayBuffer) => JSZip.loadAsync(data),
        initSql: () => initSqlJs({ locateFile: () => wasmModule.default }),
      };
    })
    .catch((error: unknown) => {
      runtimePromise = null;
      throw error;
    });

  return runtimePromise;
}

function parseMediaArchiveMap(value: unknown): MediaArchiveMap {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};

  const entries = Object.entries(value).filter(
    (entry): entry is [string, string] => typeof entry[1] === 'string',
  );
  if (entries.length > ANKI_IMPORT_LIMITS.maxMediaEntries) {
    throw new Error(
      `This package declares ${entries.length.toLocaleString()} media files; ` +
      `the safe import limit is ${ANKI_IMPORT_LIMITS.maxMediaEntries.toLocaleString()}.`,
    );
  }

  const archiveMap: MediaArchiveMap = {};
  let totalNameChars = 0;

  for (const [zipKey, originalName] of entries) {
    // Standard Anki packages use numeric ZIP entry names for media files.
    if (!/^\d+$/.test(zipKey)) continue;
    if (
      !originalName ||
      originalName.includes('\0') ||
      originalName.length > ANKI_IMPORT_LIMITS.maxMediaFilenameChars
    ) {
      continue;
    }

    totalNameChars += originalName.length;
    if (totalNameChars > ANKI_IMPORT_LIMITS.maxTotalMediaNameChars) {
      throw new Error('The Anki media index is too large to process safely.');
    }

    if (!(originalName in archiveMap)) archiveMap[originalName] = zipKey;
  }

  return archiveMap;
}

async function readMediaArchiveMap(zip: ZipArchive): Promise<MediaArchiveMap> {
  const mediaFile = zip.file('media');
  if (!mediaFile) return {};

  const rawBytes = await readZipEntryBytes(
    mediaFile,
    ANKI_IMPORT_LIMITS.maxMediaMapChars,
    'The Anki media index',
  );
  const raw = new TextDecoder().decode(rawBytes);

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    throw new Error('The Anki media index is not valid JSON.', { cause: error });
  }

  return parseMediaArchiveMap(parsed);
}

function mediaAliases(mediaArchiveMap: MediaArchiveMap): Record<string, string> {
  const aliases: Record<string, string> = {};

  for (const originalName of Object.keys(mediaArchiveMap)) {
    aliases[originalName] = originalName;
    aliases[encodeURI(originalName)] = originalName;
    aliases[encodeURIComponent(originalName)] = originalName;
  }

  return aliases;
}

/**
 * Identify the media names that occur in the imported note fields before any
 * binary ZIP entry is expanded. Unreferenced package media is never decoded.
 */
export function collectReferencedAnkiMedia(
  rows: readonly (readonly unknown[])[],
  mediaArchiveMap: MediaArchiveMap,
): string[] {
  const aliases = mediaAliases(mediaArchiveMap);
  const mediaIndex = getMediaReferenceIndex(aliases);
  if (mediaIndex.isEmpty) return [];

  const pattern = new RegExp(mediaIndex.filenameAlternation, 'g');
  const referenced = new Set<string>();

  for (const row of rows) {
    const fields = String(row[1] ?? '');
    for (const match of fields.matchAll(pattern)) {
      const originalName = aliases[match[0]];
      if (originalName) referenced.add(originalName);
    }
  }

  return [...referenced];
}

async function readReferencedMediaLookup(
  zip: ZipArchive,
  mediaArchiveMap: MediaArchiveMap,
  referencedNames: readonly string[],
  report: ProgressReporter,
): Promise<MediaLookup> {
  const mediaLookup: MediaLookup = {};
  let totalBytes = 0;

  for (let index = 0; index < referencedNames.length; index += 1) {
    const originalName = referencedNames[index];
    const zipKey = mediaArchiveMap[originalName];
    const assetFile = zip.file(zipKey);
    if (!assetFile) continue;

    report(
      `Encoding referenced media ${index + 1}/${referencedNames.length}: ${originalName}`,
    );
    const bytes = await readZipEntryBytes(
      assetFile,
      ANKI_IMPORT_LIMITS.maxSingleMediaBytes,
      `Anki media "${originalName}"`,
    );

    totalBytes += bytes.byteLength;
    if (totalBytes > ANKI_IMPORT_LIMITS.maxReferencedMediaBytes) {
      throw new Error(
        'The referenced Anki media exceeds the safe in-browser import limit.',
      );
    }

    const dataUrl = bytesToBase64DataUrl(bytes, originalName);
    if (dataUrl) {
      mediaLookup[originalName] = dataUrl;
    } else {
      console.warn(`[Denki Anki] Unsupported referenced media type: ${originalName}`);
    }
  }

  return mediaLookup;
}

function readDeckNames(database: SqlDatabase): Record<string, string> {
  const deckNames: Record<string, string> = {};

  try {
    const hasDecksTable = database.exec(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='decks'",
    );
    if (hasDecksTable.length > 0) {
      const decksResult = database.exec('SELECT id, name FROM decks');
      for (const [id, name] of decksResult[0]?.values ?? []) {
        if (name !== null && name !== undefined) deckNames[String(id)] = String(name);
      }
    }
  } catch (error) {
    console.warn('Decks table not queryable, falling back to col.decks', error);
  }

  if (Object.keys(deckNames).length > 0) return deckNames;

  try {
    const colResult = database.exec('SELECT decks FROM col');
    const rawDecks = colResult[0]?.values[0]?.[0];
    const parsed = JSON.parse(String(rawDecks ?? '{}')) as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return deckNames;
    }

    for (const [id, value] of Object.entries(parsed)) {
      if (!value || typeof value !== 'object' || Array.isArray(value)) continue;
      const name = (value as Record<string, unknown>).name;
      if (typeof name === 'string') deckNames[id] = name;
    }
  } catch (error) {
    throw new Error('Could not find deck configuration in the collection database.', {
      cause: error,
    });
  }

  return deckNames;
}

export async function importAnkiPackage(
  classId: number,
  file: File,
  report: ProgressReporter = () => undefined,
): Promise<AnkiImportResult> {
  validateAnkiPackageFile(file);

  report('Inspecting Anki archive...');
  let archiveBuffer: ArrayBuffer;
  try {
    archiveBuffer = await file.arrayBuffer();
  } catch (error) {
    throw new Error('The Anki package could not be read.', { cause: error });
  }
  inspectAnkiZipArchive(archiveBuffer);

  report('Loading local import engine...');
  const runtime = await loadAnkiRuntime();

  report('Opening validated Anki archive...');
  let zip: ZipArchive;
  try {
    zip = await runtime.loadZip(archiveBuffer);
  } catch (error) {
    throw new Error('The Anki package could not be decompressed.', { cause: error });
  }

  const databaseFile = zip.file('collection.anki21') ?? zip.file('collection.anki2');
  if (!databaseFile) {
    // The central-directory preflight already requires this; retain a defensive
    // check in case the parser and ZIP library ever disagree on a malformed file.
    throw new Error(
      'Anki package does not contain collection.anki2 or collection.anki21.',
    );
  }

  report('Extracting card collection...');
  const databaseBytes = await readZipEntryBytes(
    databaseFile,
    ANKI_IMPORT_LIMITS.maxDatabaseBytes,
    'The Anki collection database',
  );

  report('Starting local SQLite engine...');
  const SQL = await runtime.initSql();
  const database = new SQL.Database(databaseBytes);

  try {
    report('Reading decks and flashcards...');
    const deckNames = readDeckNames(database);
    const cardsResult = database.exec(`
      SELECT cards.did, notes.flds
      FROM cards
      JOIN notes ON cards.nid = notes.id
    `);
    const rows = cardsResult[0]?.values ?? [];
    validateAnkiRows(rows);

    report('Indexing referenced media...');
    const mediaArchiveMap = await readMediaArchiveMap(zip);
    const referencedNames = collectReferencedAnkiMedia(rows, mediaArchiveMap);
    const mediaLookup = await readReferencedMediaLookup(
      zip,
      mediaArchiveMap,
      referencedNames,
      report,
    );

    const plan = createAnkiImportPlan(deckNames, rows, mediaLookup);
    report(`Saving ${plan.cards.length} cards atomically...`);
    return await commitAnkiImportPlan(classId, plan);
  } finally {
    database.close();
  }
}
