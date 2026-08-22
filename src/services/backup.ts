import { db } from '../db';
import type {
  Card,
  Class,
  Deck,
  MediaAsset,
  ReviewLog,
} from '../db/schema';
import {
  inferLegacyCardSchedulerVersion,
  inferLegacyReviewSchedulerVersion,
  isValidSchedulerVersion,
} from '../domain/schedulerProvenance';
import { hydrateBackupMedia } from './backupMedia';
import {
  assertNoRuntimeRegistryReferences,
} from './backupRegistryReferences';
import { markBackupExported } from './dataSafety';
import { revokeAllMediaObjectUrls } from './mediaRegistry';
import {
  exportRegistryNativeBackupMedia,
  importRegistryNativeBackupMedia,
} from './registryBackupBoundary';
import { FSRS_VERSION } from './scheduler';
import {
  EASY_BONUS_KEY,
  HARD_MULTIPLIER_KEY,
  RETENTION_KEY,
  loadSchedulerParams,
  normalizeSchedulerParams,
} from './schedulerParams';
import {
  SPEECH_SPEED_KEY,
  loadSpeechRate,
  normalizeSpeechRate,
} from './speech';
import { clearPersistedStudySession } from './studySessionPersistence';

const BACKUP_ENDPOINT = '/api/backup';
const DEBOUNCE_MS = 2000;
const BACKUP_ENABLED = import.meta.env.DEV === true;
const RETIRED_NEW_CARD_LIMIT_KEY = 'denki-new-cards-per-day';
const SEMVER_PATTERN = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/;

export const BACKUP_FORMAT_VERSION = 5;

let debounceTimer: ReturnType<typeof setTimeout> | null = null;

export interface BackupPreferences {
  requestRetention: number;
  speechSpeed: number;
}

export interface BackupSnapshot {
  /** Current portable-backup envelope version. */
  formatVersion?: number;
  /** Denki application version that produced the backup. */
  appVersion?: string;
  /** IndexedDB schema version used when this snapshot was exported. */
  databaseVersion?: number;
  /** Current scheduler metadata; each row also carries its own lineage. */
  schedulerVersion?: string;
  /** Legacy field used by format-v1 backups for the database version. */
  version?: number;
  exportedAt?: string;
  preferences?: BackupPreferences;
  data: {
    classes: unknown[];
    decks: unknown[];
    cards: unknown[];
    reviews: unknown[];
    /** Required by formats v4-v5; absent from v1-v3 data-only backups. */
    media?: unknown[];
  };
}

interface NormalizedBackup {
  classes: Class[];
  decks: Deck[];
  cards: Card[];
  reviews: ReviewLog[];
  media: MediaAsset[];
  preferences?: BackupPreferences;
}

interface DatabaseSnapshotRows {
  classes: Class[];
  decks: Deck[];
  cards: Card[];
  reviews: ReviewLog[];
  media: MediaAsset[];
}

export interface BackupLibraryCounts {
  classes: number;
  decks: number;
  cards: number;
  reviews: number;
  media: number;
}

export interface BackupImportSummary extends BackupLibraryCounts {
  formatVersion: number;
  appVersion: string | null;
  databaseVersion: number | null;
  schedulerVersion: string | null;
  exportedAt: string | null;
  mediaBytes: number;
  preferences: Readonly<BackupPreferences> | null;
}

/**
 * Opaque, fully validated import plan. Its normalized rows stay private
 * inside this module so callers can inspect the summary without being
 * able to mutate the data that will later replace the library.
 */
export interface PreparedBackupImport {
  readonly summary: Readonly<BackupImportSummary>;
}

const preparedBackupRows = new WeakMap<
  PreparedBackupImport,
  NormalizedBackup
>();

const isRecord = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value);

const isPositiveInteger = (value: unknown): value is number =>
  Number.isInteger(value) && Number(value) > 0;

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

const isValidDate = (value: unknown): value is Date =>
  value instanceof Date && Number.isFinite(value.getTime());

function optionalCanonicalIsoDate(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime())) return null;
  return parsed.toISOString() === value ? value : null;
}

function reviveDateValue(value: unknown): unknown {
  if (value instanceof Date) return new Date(value.getTime());
  if (typeof value !== 'string' && typeof value !== 'number') return value;
  return new Date(value);
}

function reviveDates(rows: unknown[], fields: string[]): unknown[] {
  return rows.map((row) => {
    if (!isRecord(row)) return row;
    const revived = { ...row };
    for (const field of fields) {
      if (revived[field] !== undefined) {
        revived[field] = reviveDateValue(revived[field]);
      }
    }
    return revived;
  });
}

function normalizeCardProvenance(
  rows: unknown[],
  formatVersion: number,
): unknown[] {
  return rows.map((row, index) => {
    if (!isRecord(row)) return row;
    const explicitVersion = row.schedulerVersion;
    if (
      explicitVersion !== undefined &&
      !isValidSchedulerVersion(explicitVersion)
    ) {
      throw new Error(
        `Backup contains an invalid card scheduler version at row ${index + 1}; refusing to import.`,
      );
    }
    if (formatVersion >= 3 && explicitVersion === undefined) {
      throw new Error(
        `Backup card ${index + 1} is missing scheduler provenance; refusing to import.`,
      );
    }

    return {
      ...row,
      schedulerVersion:
        explicitVersion ?? inferLegacyCardSchedulerVersion(row),
    };
  });
}

function normalizeReviewProvenance(
  rows: unknown[],
  formatVersion: number,
): unknown[] {
  return rows.map((row, index) => {
    if (!isRecord(row)) return row;
    const explicitVersion = row.schedulerVersion;
    if (
      explicitVersion !== undefined &&
      !isValidSchedulerVersion(explicitVersion)
    ) {
      throw new Error(
        `Backup contains an invalid review scheduler version at row ${index + 1}; refusing to import.`,
      );
    }
    if (formatVersion >= 3 && explicitVersion === undefined) {
      throw new Error(
        `Backup review ${index + 1} is missing scheduler provenance; refusing to import.`,
      );
    }

    return {
      ...row,
      schedulerVersion:
        explicitVersion ?? inferLegacyReviewSchedulerVersion(undefined),
    };
  });
}

function assertUniqueIds(
  rows: readonly { id?: number }[],
  label: string,
): void {
  const seen = new Set<number>();
  for (const row of rows) {
    if (row.id === undefined) continue;
    if (seen.has(row.id)) {
      throw new Error(
        `Backup contains a duplicate ${label} id (${row.id}); refusing to import.`,
      );
    }
    seen.add(row.id);
  }
}

function isValidClass(value: unknown): value is Class {
  if (!isRecord(value)) return false;
  return (
    isPositiveInteger(value.id) &&
    typeof value.name === 'string' &&
    typeof value.description === 'string' &&
    isValidDate(value.createdAt)
  );
}

function isValidDeck(value: unknown): value is Deck {
  if (!isRecord(value)) return false;
  return (
    isPositiveInteger(value.id) &&
    isPositiveInteger(value.classId) &&
    typeof value.name === 'string' &&
    typeof value.description === 'string' &&
    (value.notes === undefined || typeof value.notes === 'string') &&
    isValidDate(value.createdAt)
  );
}

function isValidCard(value: unknown): value is Card {
  if (!isRecord(value)) return false;
  return (
    isPositiveInteger(value.id) &&
    isPositiveInteger(value.classId) &&
    isPositiveInteger(value.deckId) &&
    typeof value.front === 'string' &&
    typeof value.back === 'string' &&
    (value.cardType === 'standard' || value.cardType === 'cloze') &&
    isValidDate(value.createdAt) &&
    Number.isInteger(value.state) &&
    Number(value.state) >= 0 &&
    Number(value.state) <= 3 &&
    isFiniteNumber(value.stability) &&
    value.stability >= 0 &&
    isFiniteNumber(value.difficulty) &&
    value.difficulty >= 0 &&
    isFiniteNumber(value.elapsedDays) &&
    value.elapsedDays >= 0 &&
    isFiniteNumber(value.scheduledDays) &&
    value.scheduledDays >= 0 &&
    isValidDate(value.due) &&
    (value.lastReviewed === undefined || isValidDate(value.lastReviewed)) &&
    (value.lastRating === undefined ||
      (Number.isInteger(value.lastRating) &&
        Number(value.lastRating) >= 1 &&
        Number(value.lastRating) <= 5)) &&
    isValidSchedulerVersion(value.schedulerVersion)
  );
}

function isValidReview(value: unknown): value is ReviewLog {
  if (!isRecord(value)) return false;
  return (
    (value.id === undefined || isPositiveInteger(value.id)) &&
    isPositiveInteger(value.cardId) &&
    isPositiveInteger(value.deckId) &&
    isPositiveInteger(value.classId) &&
    isValidDate(value.reviewedAt) &&
    Number.isInteger(value.rating) &&
    Number(value.rating) >= 1 &&
    Number(value.rating) <= 5 &&
    isFiniteNumber(value.stability) &&
    value.stability >= 0 &&
    isFiniteNumber(value.difficulty) &&
    value.difficulty >= 0 &&
    isFiniteNumber(value.elapsedDays) &&
    value.elapsedDays >= 0 &&
    isFiniteNumber(value.scheduledDays) &&
    value.scheduledDays >= 0 &&
    isValidSchedulerVersion(value.schedulerVersion)
  );
}

function assertRows<T>(
  rows: unknown[],
  label: string,
  validator: (value: unknown) => value is T,
): asserts rows is T[] {
  const invalidIndex = rows.findIndex((row) => !validator(row));
  if (invalidIndex >= 0) {
    throw new Error(
      `Backup contains an invalid ${label} at row ${invalidIndex + 1}; refusing to import.`,
    );
  }
}

function normalizePreferences(value: unknown): BackupPreferences | undefined {
  if (value === undefined) return undefined;
  if (!isRecord(value)) {
    throw new Error('Backup preferences are invalid; refusing to import.');
  }

  if (!isFiniteNumber(value.requestRetention)) {
    throw new Error(
      'Backup target-retention preference is invalid; refusing to import.',
    );
  }
  const normalizedScheduler = normalizeSchedulerParams({
    requestRetention: value.requestRetention,
  });
  if (normalizedScheduler.requestRetention !== value.requestRetention) {
    throw new Error(
      'Backup target-retention preference is outside the supported range; refusing to import.',
    );
  }

  if (!isFiniteNumber(value.speechSpeed)) {
    throw new Error(
      'Backup speech-speed preference is invalid; refusing to import.',
    );
  }
  const normalizedSpeech = normalizeSpeechRate(value.speechSpeed);
  if (normalizedSpeech !== value.speechSpeed) {
    throw new Error(
      'Backup speech-speed preference is outside the supported range; refusing to import.',
    );
  }

  return {
    requestRetention: normalizedScheduler.requestRetention,
    speechSpeed: normalizedSpeech,
  };
}

function validateBackupMetadata(snapshot: Record<string, unknown>): number {
  const formatVersion = snapshot.formatVersion ?? 1;
  if (!isPositiveInteger(formatVersion)) {
    throw new Error('Backup format version is invalid; refusing to import.');
  }
  if (formatVersion > BACKUP_FORMAT_VERSION) {
    throw new Error(
      `Backup format ${formatVersion} is newer than this app supports (${BACKUP_FORMAT_VERSION}); refusing to import.`,
    );
  }

  if (
    snapshot.databaseVersion !== undefined &&
    !isPositiveInteger(snapshot.databaseVersion)
  ) {
    throw new Error(
      'Backup database version is invalid; refusing to import.',
    );
  }
  if (
    snapshot.version !== undefined &&
    !isPositiveInteger(snapshot.version)
  ) {
    throw new Error('Backup schema version is invalid; refusing to import.');
  }
  if (
    snapshot.databaseVersion !== undefined &&
    snapshot.version !== undefined &&
    snapshot.databaseVersion !== snapshot.version
  ) {
    throw new Error(
      'Backup database-version fields disagree; refusing to import.',
    );
  }

  const databaseVersion = snapshot.databaseVersion ?? snapshot.version;
  if (formatVersion >= 2 && databaseVersion === undefined) {
    throw new Error(
      'Backup is missing its database version; refusing to import.',
    );
  }
  if (
    typeof databaseVersion === 'number' &&
    databaseVersion > db.verno
  ) {
    throw new Error(
      `Backup database version ${databaseVersion} is newer than this app's schema (${db.verno}); refusing to import.`,
    );
  }

  if (
    snapshot.schedulerVersion !== undefined &&
    !isValidSchedulerVersion(snapshot.schedulerVersion)
  ) {
    throw new Error(
      'Backup scheduler version is invalid; refusing to import.',
    );
  }
  if (formatVersion >= 3 && snapshot.schedulerVersion === undefined) {
    throw new Error(
      'Backup is missing its scheduler version; refusing to import.',
    );
  }

  if (
    snapshot.appVersion !== undefined &&
    (typeof snapshot.appVersion !== 'string' ||
      !SEMVER_PATTERN.test(snapshot.appVersion))
  ) {
    throw new Error(
      'Backup application version is invalid; refusing to import.',
    );
  }
  if (formatVersion >= 3 && snapshot.appVersion === undefined) {
    throw new Error(
      'Backup is missing its application version; refusing to import.',
    );
  }

  return formatVersion;
}

async function normalizeBackup(snapshot: unknown): Promise<NormalizedBackup> {
  if (!isRecord(snapshot) || !isRecord(snapshot.data)) {
    throw new Error(
      'Backup is missing its data section; refusing to import.',
    );
  }

  const formatVersion = validateBackupMetadata(snapshot);
  const preferences = normalizePreferences(snapshot.preferences);

  const data = snapshot.data;
  const requiredTables = ['classes', 'decks', 'cards', 'reviews'] as const;
  for (const table of requiredTables) {
    if (!Array.isArray(data[table])) {
      throw new Error(
        `Backup is missing a valid ${table} table; refusing to import.`,
      );
    }
  }

  const classes = reviveDates(data.classes as unknown[], ['createdAt']);
  const decks = reviveDates(data.decks as unknown[], ['createdAt']);
  const cards = normalizeCardProvenance(
    reviveDates(data.cards as unknown[], [
      'createdAt',
      'due',
      'lastReviewed',
    ]),
    formatVersion,
  );
  const reviews = normalizeReviewProvenance(
    reviveDates(data.reviews as unknown[], ['reviewedAt']),
    formatVersion,
  );

  assertRows(classes, 'class', isValidClass);
  assertRows(decks, 'deck', isValidDeck);
  assertRows(cards, 'card', isValidCard);
  assertRows(reviews, 'review', isValidReview);

  assertUniqueIds(classes, 'class');
  assertUniqueIds(decks, 'deck');
  assertUniqueIds(cards, 'card');
  assertUniqueIds(reviews, 'review');

  const classIds = new Set(classes.map((studyClass) => studyClass.id!));
  const deckById = new Map(decks.map((deck) => [deck.id!, deck]));
  const cardById = new Map(cards.map((card) => [card.id!, card]));

  for (const deck of decks) {
    if (!classIds.has(deck.classId)) {
      throw new Error(
        `Deck ${deck.id} references a missing class; refusing to import.`,
      );
    }
  }

  for (const card of cards) {
    const deck = deckById.get(card.deckId);
    if (
      !classIds.has(card.classId) ||
      !deck ||
      deck.classId !== card.classId
    ) {
      throw new Error(
        `Card ${card.id} has an invalid class/deck relationship; refusing to import.`,
      );
    }
  }

  for (const review of reviews) {
    const card = cardById.get(review.cardId);
    if (
      !card ||
      card.deckId !== review.deckId ||
      card.classId !== review.classId
    ) {
      throw new Error(
        `Review ${review.id ?? '(without id)'} has invalid card/deck/class references; refusing to import.`,
      );
    }
  }

  let restoredMedia: {
    decks: Deck[];
    cards: Card[];
    media: MediaAsset[];
  };
  if (formatVersion >= 5) {
    restoredMedia = await importRegistryNativeBackupMedia(
      decks,
      cards,
      data.media,
    );
  } else {
    assertNoRuntimeRegistryReferences(decks, cards);
    restoredMedia = {
      ...(await hydrateBackupMedia(
        decks,
        cards,
        data.media,
        formatVersion,
      )),
      media: [],
    };
  }

  return {
    classes,
    decks: restoredMedia.decks,
    cards: restoredMedia.cards,
    reviews,
    media: restoredMedia.media,
    preferences,
  };
}

function createBackupImportSummary(
  snapshot: unknown,
  normalized: NormalizedBackup,
): BackupImportSummary {
  if (!isRecord(snapshot)) {
    throw new Error('Backup preview could not be created.');
  }

  const rawDatabaseVersion =
    snapshot.databaseVersion ?? snapshot.version;
  const preferences = normalized.preferences
    ? Object.freeze({ ...normalized.preferences })
    : null;

  return {
    formatVersion: Number(snapshot.formatVersion ?? 1),
    appVersion:
      typeof snapshot.appVersion === 'string'
        ? snapshot.appVersion
        : null,
    databaseVersion:
      typeof rawDatabaseVersion === 'number'
        ? rawDatabaseVersion
        : null,
    schedulerVersion:
      typeof snapshot.schedulerVersion === 'string'
        ? snapshot.schedulerVersion
        : null,
    exportedAt: optionalCanonicalIsoDate(snapshot.exportedAt),
    classes: normalized.classes.length,
    decks: normalized.decks.length,
    cards: normalized.cards.length,
    reviews: normalized.reviews.length,
    media: normalized.media.length,
    mediaBytes: normalized.media.reduce(
      (total, asset) => total + asset.byteLength,
      0,
    ),
    preferences,
  };
}

/**
 * Fully validate a portable backup before asking the user to replace
 * local data. Media hashes, scheduler provenance, dates, relationships,
 * and preferences are all checked exactly once.
 */
export async function prepareBackupImport(
  snapshot: unknown,
): Promise<PreparedBackupImport> {
  const normalized = await normalizeBackup(snapshot);
  const summary = Object.freeze(
    createBackupImportSummary(snapshot, normalized),
  );
  const prepared = Object.freeze({ summary });
  preparedBackupRows.set(prepared, normalized);
  return prepared;
}

function applyPreferences(
  preferences: BackupPreferences | undefined,
): (() => void) | null {
  if (!preferences) return null;

  let storage: Storage;
  try {
    storage = globalThis.localStorage;
    if (!storage) throw new Error('localStorage is unavailable.');
  } catch (error) {
    throw new Error(
      'Browser storage is unavailable, so backup preferences cannot be restored.',
      { cause: error },
    );
  }

  const keys = [
    RETENTION_KEY,
    SPEECH_SPEED_KEY,
    EASY_BONUS_KEY,
    HARD_MULTIPLIER_KEY,
    RETIRED_NEW_CARD_LIMIT_KEY,
  ] as const;
  const previousValues = keys.map(
    (key) => [key, storage.getItem(key)] as const,
  );

  const rollback = () => {
    for (const [key, previousValue] of previousValues) {
      if (previousValue === null) storage.removeItem(key);
      else storage.setItem(key, previousValue);
    }
  };

  try {
    storage.setItem(
      RETENTION_KEY,
      String(preferences.requestRetention),
    );
    storage.setItem(SPEECH_SPEED_KEY, String(preferences.speechSpeed));
    storage.removeItem(EASY_BONUS_KEY);
    storage.removeItem(HARD_MULTIPLIER_KEY);
    storage.removeItem(RETIRED_NEW_CARD_LIMIT_KEY);
  } catch (error) {
    try {
      rollback();
    } catch (rollbackError) {
      console.warn(
        'Unable to roll back partially restored preferences:',
        rollbackError,
      );
    }
    throw new Error(
      'Backup preferences could not be written; import was cancelled.',
      { cause: error },
    );
  }

  return rollback;
}

async function readDatabaseSnapshot(): Promise<DatabaseSnapshotRows> {
  return db.transaction(
    'r',
    [db.classes, db.decks, db.cards, db.reviews, db.media],
    async () => {
      const [classes, decks, cards, reviews, media] = await Promise.all([
        db.classes.toArray(),
        db.decks.toArray(),
        db.cards.toArray(),
        db.reviews.toArray(),
        db.media.toArray(),
      ]);
      return { classes, decks, cards, reviews, media };
    },
  );
}

/** Export a consistent five-table snapshot and non-secret portable preferences. */
export async function exportDatabase(): Promise<BackupSnapshot> {
  const {
    classes,
    decks: storedDecks,
    cards: storedCards,
    reviews: storedReviews,
    media: storedMedia,
  } = await readDatabaseSnapshot();
  const schedulerParams = loadSchedulerParams();
  const exportedAt = new Date().toISOString();
  const cards = storedCards.map((card) => ({
    ...card,
    schedulerVersion: inferLegacyCardSchedulerVersion(card),
  }));
  const reviews = storedReviews.map((review) => ({
    ...review,
    schedulerVersion: inferLegacyReviewSchedulerVersion(
      review.schedulerVersion,
    ),
  }));
  const externalized = await exportRegistryNativeBackupMedia(
    storedDecks,
    cards,
    storedMedia,
    exportedAt,
  );

  return {
    formatVersion: BACKUP_FORMAT_VERSION,
    appVersion: __DENKI_VERSION__,
    databaseVersion: db.verno,
    schedulerVersion: FSRS_VERSION,
    exportedAt,
    preferences: {
      requestRetention: schedulerParams.requestRetention,
      speechSpeed: loadSpeechRate(),
    },
    data: {
      classes,
      decks: externalized.decks,
      cards: externalized.cards,
      reviews,
      media: externalized.media,
    },
  };
}

/**
 * Replace all five persistent tables from rows that already passed the
 * complete backup validator. Preference writes are rolled back if the
 * durable replacement transaction fails.
 */
async function replaceDatabase(
  normalized: NormalizedBackup,
): Promise<void> {
  const { classes, decks, cards, reviews, media, preferences } =
    normalized;
  const rollbackPreferences = applyPreferences(preferences);

  try {
    await db.transaction(
      'rw',
      [db.classes, db.decks, db.cards, db.reviews, db.media],
      async () => {
        await Promise.all([
          db.classes.clear(),
          db.decks.clear(),
          db.cards.clear(),
          db.reviews.clear(),
          db.media.clear(),
        ]);

        if (classes.length > 0) await db.classes.bulkAdd(classes);
        if (decks.length > 0) await db.decks.bulkAdd(decks);
        if (cards.length > 0) await db.cards.bulkAdd(cards);
        if (reviews.length > 0) await db.reviews.bulkAdd(reviews);
        if (media.length > 0) await db.media.bulkAdd(media);
      },
    );
  } catch (error) {
    if (rollbackPreferences) {
      try {
        rollbackPreferences();
      } catch (rollbackError) {
        console.warn(
          'Unable to roll back restored preferences:',
          rollbackError,
        );
      }
    }
    throw error;
  }

  // Durable replacement succeeded. Existing object URLs point at the
  // old registry generation and must not survive into the restored library.
  try {
    revokeAllMediaObjectUrls();
  } catch (error) {
    console.warn('Unable to revoke stale media object URLs:', error);
  }
  clearPersistedStudySession();
  triggerAutoSave();
}

/** Apply one opaque, prevalidated import plan exactly once. */
export async function importPreparedDatabase(
  prepared: PreparedBackupImport,
): Promise<void> {
  const normalized = preparedBackupRows.get(prepared);
  if (!normalized) {
    throw new Error(
      'Backup import preview is invalid or has already been used.',
    );
  }

  try {
    await replaceDatabase(normalized);
  } finally {
    preparedBackupRows.delete(prepared);
  }
}

/** Validate and replace the library without an interactive preview. */
export async function importDatabase(snapshot: unknown): Promise<void> {
  const prepared = await prepareBackupImport(snapshot);
  await importPreparedDatabase(prepared);
}

async function saveToFilesystem(): Promise<void> {
  if (!BACKUP_ENABLED) return;
  try {
    const snapshot = await exportDatabase();
    const response = await fetch(BACKUP_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(snapshot),
    });
    if (response.ok) {
      console.log(
        '[Denki Backup] Auto-saved to filesystem at',
        snapshot.exportedAt,
      );
    } else {
      console.warn('[Denki Backup] Save failed:', await response.text());
    }
  } catch (error) {
    console.warn('[Denki Backup] Endpoint unavailable:', error);
  }
}

export function triggerAutoSave(): void {
  if (!BACKUP_ENABLED) return;
  if (debounceTimer) clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => {
    debounceTimer = null;
    void saveToFilesystem();
  }, DEBOUNCE_MS);
}

export function forceSave(): void {
  if (!BACKUP_ENABLED) return;
  if (debounceTimer) {
    clearTimeout(debounceTimer);
    debounceTimer = null;
  }
  void saveToFilesystem();
}

/** Restore the development filesystem snapshot only when IndexedDB is empty. */
export async function restoreFromBackupIfNeeded(): Promise<boolean> {
  if (!BACKUP_ENABLED) return false;

  const [classCount, cardCount] = await Promise.all([
    db.classes.count(),
    db.cards.count(),
  ]);
  if (classCount > 0 || cardCount > 0) return false;

  try {
    const response = await fetch(BACKUP_ENDPOINT);
    if (!response.ok) {
      console.log('[Denki Backup] No backup file found on server.');
      return false;
    }

    const snapshot: unknown = await response.json();
    if (!isRecord(snapshot) || !isRecord(snapshot.data)) return false;
    const data = snapshot.data;
    const hasClasses =
      Array.isArray(data.classes) && data.classes.length > 0;
    const hasCards = Array.isArray(data.cards) && data.cards.length > 0;
    if (!hasClasses && !hasCards) return false;

    await importDatabase(snapshot);
    console.log('[Denki Backup] Restored development filesystem backup.');
    return true;
  } catch (error) {
    console.warn('[Denki Backup] Failed to restore from backup:', error);
    return false;
  }
}

/** Download a user-initiated JSON backup. */
export async function downloadBackup(): Promise<void> {
  const snapshot = await exportDatabase();
  const blob = new Blob([JSON.stringify(snapshot, null, 2)], {
    type: 'application/json',
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `denki-backup-${new Date().toISOString().slice(0, 10)}.json`;
  anchor.style.display = 'none';
  document.body.appendChild(anchor);

  try {
    anchor.click();
    markBackupExported();
  } finally {
    anchor.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 0);
  }
}
