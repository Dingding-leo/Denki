import DOMPurify from 'dompurify';
import { db } from '../db';
import type { CardType } from '../db/schema';
import { STATES } from './scheduler';

const FALLBACK_DECK_KEY = '__denki_anki_fallback__';
const FALLBACK_DECK_NAME = 'Anki Import';

type MediaLookup = Record<string, string>;
type ProgressReporter = (message: string) => void;

interface ZipEntry {
  async(type: 'text'): Promise<string>;
  async(type: 'arraybuffer'): Promise<ArrayBuffer>;
  async(type: 'uint8array'): Promise<Uint8Array>;
}

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

let runtimePromise: Promise<AnkiRuntime> | null = null;

interface MediaReferenceIndex {
  isEmpty: boolean;
  filenameAlternation: string;
}

const mediaReferenceIndexCache = new WeakMap<object, MediaReferenceIndex>();

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function getMediaReferenceIndex(mediaLookup: MediaLookup): MediaReferenceIndex {
  const cached = mediaReferenceIndexCache.get(mediaLookup);
  if (cached) return cached;

  const filenames = Object.keys(mediaLookup).sort((a, b) => b.length - a.length);
  const index = {
    isEmpty: filenames.length === 0,
    filenameAlternation: filenames.map(escapeRegex).join('|'),
  };
  mediaReferenceIndexCache.set(mediaLookup, index);
  return index;
}

function getMimeType(filename: string): string {
  const ext = filename.split('.').pop()?.toLowerCase();
  switch (ext) {
    case 'png': return 'image/png';
    case 'jpg':
    case 'jpeg': return 'image/jpeg';
    case 'gif': return 'image/gif';
    case 'svg': return 'image/svg+xml';
    case 'webp': return 'image/webp';
    case 'avif': return 'image/avif';
    case 'mp3': return 'audio/mpeg';
    case 'm4a': return 'audio/mp4';
    case 'aac': return 'audio/aac';
    case 'wav': return 'audio/wav';
    case 'ogg': return 'audio/ogg';
    case 'opus': return 'audio/opus';
    case 'mp4': return 'video/mp4';
    case 'webm': return 'video/webm';
    default: return 'application/octet-stream';
  }
}

function arrayBufferToBase64DataUrl(buffer: ArrayBuffer, filename: string): string {
  const bytes = new Uint8Array(buffer);
  const chunkSize = 0x8000;
  let binary = '';

  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    const chunk = bytes.subarray(offset, Math.min(offset + chunkSize, bytes.length));
    binary += String.fromCharCode(...chunk);
  }

  return `data:${getMimeType(filename)};base64,${window.btoa(binary)}`;
}

function lookupMedia(mediaLookup: MediaLookup, rawReference: string): string | undefined {
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
 * filename for every card (the previous O(cards × media) implementation).
 */
export function replaceAnkiMediaReferences(html: string, mediaLookup: MediaLookup): string {
  if (!html) return html;
  const mediaIndex = getMediaReferenceIndex(mediaLookup);
  if (mediaIndex.isEmpty) return html;

  const withHtmlSources = html.replace(
    /\bsrc\s*=\s*(?:(['"])(.*?)\1|([^\s>]+))/gi,
    (match, _quote: string | undefined, quoted: string | undefined, unquoted: string | undefined) => {
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

  // Build the sound matcher from the known media filenames. A generic
  // "anything until ]" expression breaks valid filenames such as voice[1].mp3.
  const soundPattern = new RegExp(
    `\\[sound:(${mediaIndex.filenameAlternation})\\]`,
    'g',
  );
  return withMarkdownLinks.replace(soundPattern, (match, reference: string) => {
    const dataUrl = lookupMedia(mediaLookup, reference);
    if (!dataUrl) return match;
    return `<audio controls preload="none" src="${dataUrl}" style="margin: 8px 0; max-width: 100%; display: block;"></audio>`;
  });
}

/**
 * Shared .apkg files are untrusted input. Sanitize before writing to IndexedDB,
 * in addition to Denki's normal render-time sanitization.
 */
export function sanitizeAnkiHtml(html: string): string {
  return DOMPurify.sanitize(html, {
    USE_PROFILES: { html: true },
    FORBID_TAGS: ['script', 'style', 'iframe', 'object', 'embed', 'form'],
    FORBID_ATTR: ['onerror', 'onload', 'onclick', 'onmouseover'],
    ALLOW_DATA_ATTR: false,
  });
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
  const cards: AnkiImportCardDraft[] = [];

  for (const row of rows) {
    const did = row[0];
    const fieldsValue = row[1];
    const fields = String(fieldsValue ?? '').split('\x1f');
    const frontRaw = fields[0] ?? '';
    const backRaw = fields.slice(1).filter((field) => field.length > 0).join('<br>');

    if (!frontRaw.trim()) continue;

    const front = sanitizeAnkiHtml(replaceAnkiMediaReferences(frontRaw, mediaLookup));
    const back = sanitizeAnkiHtml(replaceAnkiMediaReferences(backRaw, mediaLookup));
    const cardType: CardType = /\{\{c\d+::/i.test(frontRaw) ? 'cloze' : 'standard';

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
    const hasNamedDeck = Object.prototype.hasOwnProperty.call(plan.deckNames, card.ankiDeckId);
    const key = hasNamedDeck ? card.ankiDeckId : FALLBACK_DECK_KEY;
    if (seenKeys.has(key)) continue;
    seenKeys.add(key);

    const rawName = hasNamedDeck ? plan.deckNames[card.ankiDeckId] : FALLBACK_DECK_NAME;
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

  const deckSpecs = createDeckSpecs(plan);
  if (deckSpecs.length === 0) {
    throw new Error('No usable deck mapping was found in this Anki package.');
  }

  return db.transaction('rw', [db.decks, db.cards], async () => {
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
    const fallbackDeckId = deckMapping.get(FALLBACK_DECK_KEY) ?? deckMapping.values().next().value;
    if (fallbackDeckId === undefined) {
      throw new Error('Could not create a destination deck for the imported cards.');
    }

    const cardEntries = plan.cards.map((card) => {
      const mappedDeckId = deckMapping.get(card.ankiDeckId) ?? fallbackDeckId;
      return {
        classId,
        deckId: mappedDeckId,
        front: card.front,
        back: card.back,
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

async function readMediaLookup(zip: ZipArchive, report: ProgressReporter): Promise<MediaLookup> {
  const mediaFile = zip.file('media');
  if (!mediaFile) return {};

  let parsed: unknown;
  try {
    parsed = JSON.parse(await mediaFile.async('text'));
  } catch (error) {
    console.warn('Failed to parse media mapping from apkg', error);
    return {};
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};

  const entries = Object.entries(parsed).filter(
    (entry): entry is [string, string] => typeof entry[1] === 'string',
  );
  const mediaLookup: MediaLookup = {};

  for (let index = 0; index < entries.length; index++) {
    const [zipKey, originalName] = entries[index];
    report(`Encoding media asset ${index + 1}/${entries.length}: ${originalName}`);
    const assetFile = zip.file(zipKey);
    if (!assetFile) continue;
    const buffer = await assetFile.async('arraybuffer');
    mediaLookup[originalName] = arrayBufferToBase64DataUrl(buffer, originalName);
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
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return deckNames;

    for (const [id, value] of Object.entries(parsed)) {
      if (!value || typeof value !== 'object' || Array.isArray(value)) continue;
      const name = (value as Record<string, unknown>).name;
      if (typeof name === 'string') deckNames[id] = name;
    }
  } catch (error) {
    throw new Error('Could not find deck configuration in the collection database.', { cause: error });
  }

  return deckNames;
}

export async function importAnkiPackage(
  classId: number,
  file: File,
  report: ProgressReporter = () => undefined,
): Promise<AnkiImportResult> {
  if (!/\.apkg$/i.test(file.name)) {
    throw new Error('Invalid file format. Please upload a valid Anki package (.apkg) file.');
  }

  report('Loading local import engine...');
  const runtime = await loadAnkiRuntime();

  report('Decompressing Anki archive...');
  const zip = await runtime.loadZip(file);

  report('Parsing media asset files...');
  const mediaLookup = await readMediaLookup(zip, report);

  report('Extracting card collection...');
  const databaseFile = zip.file('collection.anki21') ?? zip.file('collection.anki2');
  if (!databaseFile) {
    throw new Error('Anki package does not contain collection.anki2 or collection.anki21.');
  }
  const databaseBytes = await databaseFile.async('uint8array');

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
    const plan = createAnkiImportPlan(deckNames, rows, mediaLookup);

    report(`Saving ${plan.cards.length} cards atomically...`);
    return await commitAnkiImportPlan(classId, plan);
  } finally {
    database.close();
  }
}
