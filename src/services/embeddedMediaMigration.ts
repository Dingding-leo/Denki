import { db } from '../db';
import type { Card, Deck, MediaAsset } from '../db/schema';
import {
  BACKUP_MEDIA_REFERENCE_PREFIX,
  createBackupMediaReference,
  externalizeBackupMedia,
} from './backupMedia';
import {
  hashMediaBytes,
  normalizeMediaBytes,
} from './mediaIntegrity';
import {
  createMediaReference,
} from './mediaRegistry';

export const EMBEDDED_MEDIA_MIGRATION_STORAGE_KEY =
  'denki-embedded-media-migration-v1';
export const DEFAULT_EMBEDDED_MEDIA_MIGRATION_BATCH_SIZE = 20;

const CURSOR_VERSION = 1;
const MAX_BATCH_SIZE = 100;

type MigrationPhase = 'cards' | 'decks' | 'complete';

export interface EmbeddedMediaMigrationCursor {
  version: 1;
  phase: MigrationPhase;
  lastId: number;
  scannedRows: number;
  migratedRows: number;
  mediaObjectsCreated: number;
  startedAt: string;
  updatedAt: string;
}

export interface EmbeddedMediaMigrationBatchResult {
  cursor: EmbeddedMediaMigrationCursor;
  scannedThisBatch: number;
  migratedThisBatch: number;
  mediaObjectsCreatedThisBatch: number;
  done: boolean;
}

export interface EmbeddedMediaMigrationRunResult {
  cursor: EmbeddedMediaMigrationCursor;
  stopped: boolean;
}

type PlannedMediaAsset = MediaAsset;

interface PlannedCardUpdate {
  id: number;
  originalFront: string;
  originalBack: string;
  front: string;
  back: string;
  changed: boolean;
}

interface PlannedDeckUpdate {
  id: number;
  originalNotes: string | undefined;
  notes: string | undefined;
  changed: boolean;
}

interface PlannedBatch<TUpdate> {
  updates: TUpdate[];
  media: PlannedMediaAsset[];
}

function nowIso(): string {
  return new Date().toISOString();
}

function createInitialCursor(): EmbeddedMediaMigrationCursor {
  const now = nowIso();
  return {
    version: CURSOR_VERSION,
    phase: 'cards',
    lastId: 0,
    scannedRows: 0,
    migratedRows: 0,
    mediaObjectsCreated: 0,
    startedAt: now,
    updatedAt: now,
  };
}

function isNonNegativeSafeInteger(value: unknown): value is number {
  return Number.isSafeInteger(value) && Number(value) >= 0;
}

function isCanonicalIsoDate(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  const parsed = new Date(value);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString() === value;
}

function isCursor(value: unknown): value is EmbeddedMediaMigrationCursor {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const candidate = value as Record<string, unknown>;
  return (
    candidate.version === CURSOR_VERSION &&
    (candidate.phase === 'cards' ||
      candidate.phase === 'decks' ||
      candidate.phase === 'complete') &&
    isNonNegativeSafeInteger(candidate.lastId) &&
    isNonNegativeSafeInteger(candidate.scannedRows) &&
    isNonNegativeSafeInteger(candidate.migratedRows) &&
    isNonNegativeSafeInteger(candidate.mediaObjectsCreated) &&
    candidate.migratedRows <= candidate.scannedRows &&
    isCanonicalIsoDate(candidate.startedAt) &&
    isCanonicalIsoDate(candidate.updatedAt)
  );
}

function requireStorage(): Storage {
  let storage: Storage;
  try {
    storage = globalThis.localStorage;
    if (!storage) throw new Error('localStorage is unavailable.');
  } catch (error) {
    throw new Error(
      'Browser storage is unavailable, so media-migration progress cannot be saved.',
      { cause: error },
    );
  }
  return storage;
}

export function getEmbeddedMediaMigrationStatus():
  | EmbeddedMediaMigrationCursor
  | null {
  const storage = requireStorage();
  const raw = storage.getItem(EMBEDDED_MEDIA_MIGRATION_STORAGE_KEY);
  if (!raw) return null;

  try {
    const parsed: unknown = JSON.parse(raw);
    if (!isCursor(parsed)) throw new Error('invalid cursor');
    return parsed;
  } catch {
    storage.removeItem(EMBEDDED_MEDIA_MIGRATION_STORAGE_KEY);
    return null;
  }
}

export function clearEmbeddedMediaMigrationCursor(): void {
  requireStorage().removeItem(EMBEDDED_MEDIA_MIGRATION_STORAGE_KEY);
}

function writeCursor(cursor: EmbeddedMediaMigrationCursor): void {
  requireStorage().setItem(
    EMBEDDED_MEDIA_MIGRATION_STORAGE_KEY,
    JSON.stringify(cursor),
  );
}

function validateBatchSize(value: number): number {
  if (!Number.isSafeInteger(value) || value < 1 || value > MAX_BATCH_SIZE) {
    throw new Error(
      `Media-migration batch size must be an integer from 1 to ${MAX_BATCH_SIZE}.`,
    );
  }
  return value;
}

function base64ToBytes(value: string): Uint8Array {
  let binary: string;
  try {
    binary = globalThis.atob(value);
  } catch (error) {
    throw new Error('Embedded media contains invalid base64.', { cause: error });
  }
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

function copyToArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const output = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(output).set(bytes);
  return output;
}

function isArrayBufferValue(value: unknown): value is ArrayBuffer {
  return (
    !!value &&
    typeof value === 'object' &&
    Object.prototype.toString.call(value) === '[object ArrayBuffer]' &&
    typeof (value as ArrayBuffer).byteLength === 'number'
  );
}

function arraysEqual(left: ArrayBuffer, right: ArrayBuffer): boolean {
  if (left.byteLength !== right.byteLength) return false;
  const leftBytes = new Uint8Array(left);
  const rightBytes = new Uint8Array(right);
  for (let index = 0; index < leftBytes.length; index += 1) {
    if (leftBytes[index] !== rightBytes[index]) return false;
  }
  return true;
}

function replacePortableReferences(
  text: string,
  replacements: ReadonlyMap<string, string>,
): string {
  let output = text;
  for (const [portable, runtime] of replacements) {
    output = output.replaceAll(portable, runtime);
  }
  if (output.includes(BACKUP_MEDIA_REFERENCE_PREFIX)) {
    throw new Error(
      'Embedded-media migration produced an unresolved portable media token.',
    );
  }
  return output;
}

async function prepareMedia(
  rows: readonly {
    hash: string;
    mimeType: string;
    byteLength: number;
    base64: string;
  }[],
  createdAt: Date,
): Promise<{
  assets: PlannedMediaAsset[];
  replacements: Map<string, string>;
}> {
  const assets = new Map<string, PlannedMediaAsset>();
  const replacements = new Map<string, string>();

  for (const row of rows) {
    const decoded = base64ToBytes(row.base64);
    if (decoded.byteLength !== row.byteLength) {
      throw new Error('Embedded media byte length changed during migration.');
    }
    const normalized = normalizeMediaBytes(row.mimeType, decoded);
    const hash = await hashMediaBytes(normalized.mimeType, normalized.bytes);
    const runtimeReference = createMediaReference(hash);
    replacements.set(
      createBackupMediaReference(row.hash),
      runtimeReference,
    );

    const existing = assets.get(hash);
    const data = copyToArrayBuffer(normalized.bytes);
    if (existing) {
      if (
        existing.mimeType !== normalized.mimeType ||
        existing.byteLength !== normalized.bytes.byteLength ||
        !arraysEqual(existing.data, data)
      ) {
        throw new Error(`Media identity collision detected for ${hash}.`);
      }
      continue;
    }

    assets.set(hash, {
      hash,
      mimeType: normalized.mimeType,
      byteLength: normalized.bytes.byteLength,
      data,
      createdAt,
    });
  }

  return { assets: [...assets.values()], replacements };
}

function assertNoPortableTokens(texts: readonly string[]): void {
  if (texts.some((text) => text.includes(BACKUP_MEDIA_REFERENCE_PREFIX))) {
    throw new Error(
      'Runtime content contains a reserved portable-backup media token.',
    );
  }
}

async function planCardBatch(
  cards: readonly Card[],
): Promise<PlannedBatch<PlannedCardUpdate>> {
  assertNoPortableTokens(cards.flatMap((card) => [card.front, card.back]));
  const externalized = await externalizeBackupMedia([], cards);
  const prepared = await prepareMedia(externalized.media, new Date());

  return {
    updates: externalized.cards.map((card, index) => {
      const original = cards[index];
      if (!original?.id) {
        throw new Error('Migration encountered a card without an ID.');
      }
      const front = replacePortableReferences(card.front, prepared.replacements);
      const back = replacePortableReferences(card.back, prepared.replacements);
      return {
        id: original.id,
        originalFront: original.front,
        originalBack: original.back,
        front,
        back,
        changed: front !== original.front || back !== original.back,
      };
    }),
    media: prepared.assets,
  };
}

async function planDeckBatch(
  decks: readonly Deck[],
): Promise<PlannedBatch<PlannedDeckUpdate>> {
  assertNoPortableTokens(decks.map((deck) => deck.notes ?? ''));
  const externalized = await externalizeBackupMedia(decks, []);
  const prepared = await prepareMedia(externalized.media, new Date());

  return {
    updates: externalized.decks.map((deck, index) => {
      const original = decks[index];
      if (!original?.id) {
        throw new Error('Migration encountered a deck without an ID.');
      }
      const notes = deck.notes === undefined
        ? undefined
        : replacePortableReferences(deck.notes, prepared.replacements);
      return {
        id: original.id,
        originalNotes: original.notes,
        notes,
        changed: notes !== original.notes,
      };
    }),
    media: prepared.assets,
  };
}

async function ensurePlannedMedia(
  assets: readonly PlannedMediaAsset[],
): Promise<number> {
  let created = 0;
  for (const asset of assets) {
    const existing = await db.media.get(asset.hash);
    if (!existing) {
      await db.media.add(asset);
      created += 1;
      continue;
    }

    if (
      existing.mimeType !== asset.mimeType ||
      existing.byteLength !== asset.byteLength ||
      !isArrayBufferValue(existing.data) ||
      !arraysEqual(existing.data, asset.data) ||
      !(existing.createdAt instanceof Date) ||
      !Number.isFinite(existing.createdAt.getTime())
    ) {
      throw new Error(
        `Stored media ${asset.hash} conflicts with the migration content.`,
      );
    }
  }
  return created;
}

async function commitCardBatch(
  plan: PlannedBatch<PlannedCardUpdate>,
): Promise<number> {
  return db.transaction('rw', [db.cards, db.media], async () => {
    const created = await ensurePlannedMedia(plan.media);
    for (const update of plan.updates) {
      const current = await db.cards.get(update.id);
      if (
        !current ||
        current.front !== update.originalFront ||
        current.back !== update.originalBack
      ) {
        throw new Error(
          `Card ${update.id} changed while media migration was preparing; retrying is safe.`,
        );
      }
      if (update.changed) {
        await db.cards.update(update.id, {
          front: update.front,
          back: update.back,
        });
      }
    }
    return created;
  });
}

async function commitDeckBatch(
  plan: PlannedBatch<PlannedDeckUpdate>,
): Promise<number> {
  return db.transaction('rw', [db.decks, db.media], async () => {
    const created = await ensurePlannedMedia(plan.media);
    for (const update of plan.updates) {
      const current = await db.decks.get(update.id);
      if (!current || current.notes !== update.originalNotes) {
        throw new Error(
          `Deck ${update.id} changed while media migration was preparing; retrying is safe.`,
        );
      }
      if (update.changed) {
        await db.decks.update(update.id, { notes: update.notes });
      }
    }
    return created;
  });
}

function advanceCursor(
  cursor: EmbeddedMediaMigrationCursor,
  phase: MigrationPhase,
  lastId: number,
  scanned: number,
  migrated: number,
  created: number,
): EmbeddedMediaMigrationCursor {
  return {
    ...cursor,
    phase,
    lastId,
    scannedRows: cursor.scannedRows + scanned,
    migratedRows: cursor.migratedRows + migrated,
    mediaObjectsCreated: cursor.mediaObjectsCreated + created,
    updatedAt: nowIso(),
  };
}

function persistAfterCommit(cursor: EmbeddedMediaMigrationCursor): void {
  try {
    writeCursor(cursor);
  } catch (error) {
    throw new Error(
      'The media batch was committed, but its progress checkpoint could not be saved. Re-running the migration is safe.',
      { cause: error },
    );
  }
}

export async function runEmbeddedMediaMigrationBatch(
  batchSize = DEFAULT_EMBEDDED_MEDIA_MIGRATION_BATCH_SIZE,
): Promise<EmbeddedMediaMigrationBatchResult> {
  const boundedBatchSize = validateBatchSize(batchSize);
  const cursor = getEmbeddedMediaMigrationStatus() ?? createInitialCursor();

  if (cursor.phase === 'complete') {
    return {
      cursor,
      scannedThisBatch: 0,
      migratedThisBatch: 0,
      mediaObjectsCreatedThisBatch: 0,
      done: true,
    };
  }

  if (cursor.phase === 'cards') {
    const cards = await db.cards
      .where('id')
      .above(cursor.lastId)
      .limit(boundedBatchSize)
      .toArray();
    if (cards.length === 0) {
      const next = advanceCursor(cursor, 'decks', 0, 0, 0, 0);
      writeCursor(next);
      return {
        cursor: next,
        scannedThisBatch: 0,
        migratedThisBatch: 0,
        mediaObjectsCreatedThisBatch: 0,
        done: false,
      };
    }

    const plan = await planCardBatch(cards);
    const created = await commitCardBatch(plan);
    const migrated = plan.updates.filter((update) => update.changed).length;
    const lastId = cards[cards.length - 1]?.id;
    if (!lastId) {
      throw new Error('Migration could not determine the card cursor.');
    }
    const next = advanceCursor(
      cursor,
      'cards',
      lastId,
      cards.length,
      migrated,
      created,
    );
    persistAfterCommit(next);
    return {
      cursor: next,
      scannedThisBatch: cards.length,
      migratedThisBatch: migrated,
      mediaObjectsCreatedThisBatch: created,
      done: false,
    };
  }

  const decks = await db.decks
    .where('id')
    .above(cursor.lastId)
    .limit(boundedBatchSize)
    .toArray();
  if (decks.length === 0) {
    const next = advanceCursor(cursor, 'complete', 0, 0, 0, 0);
    writeCursor(next);
    return {
      cursor: next,
      scannedThisBatch: 0,
      migratedThisBatch: 0,
      mediaObjectsCreatedThisBatch: 0,
      done: true,
    };
  }

  const plan = await planDeckBatch(decks);
  const created = await commitDeckBatch(plan);
  const migrated = plan.updates.filter((update) => update.changed).length;
  const lastId = decks[decks.length - 1]?.id;
  if (!lastId) {
    throw new Error('Migration could not determine the deck cursor.');
  }
  const next = advanceCursor(
    cursor,
    'decks',
    lastId,
    decks.length,
    migrated,
    created,
  );
  persistAfterCommit(next);
  return {
    cursor: next,
    scannedThisBatch: decks.length,
    migratedThisBatch: migrated,
    mediaObjectsCreatedThisBatch: created,
    done: false,
  };
}

function yieldToBrowser(): Promise<void> {
  return new Promise((resolve) => {
    globalThis.setTimeout(resolve, 0);
  });
}

export async function migrateEmbeddedMediaToCompletion(options: {
  batchSize?: number;
  restart?: boolean;
  signal?: AbortSignal;
  onProgress?: (result: EmbeddedMediaMigrationBatchResult) => void;
} = {}): Promise<EmbeddedMediaMigrationRunResult> {
  if (options.restart) clearEmbeddedMediaMigrationCursor();
  let cursor = getEmbeddedMediaMigrationStatus() ?? createInitialCursor();

  while (cursor.phase !== 'complete') {
    if (options.signal?.aborted) return { cursor, stopped: true };
    const result = await runEmbeddedMediaMigrationBatch(options.batchSize);
    cursor = result.cursor;
    options.onProgress?.(result);
    if (options.signal?.aborted && cursor.phase !== 'complete') {
      return { cursor, stopped: true };
    }
    await yieldToBrowser();
  }

  return { cursor, stopped: false };
}
