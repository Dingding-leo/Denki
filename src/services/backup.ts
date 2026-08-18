import { db } from '../db';
import type { Card, Class, Deck, ReviewLog } from '../db/schema';
import { markBackupExported } from './dataSafety';
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

export const BACKUP_FORMAT_VERSION = 2;

let debounceTimer: ReturnType<typeof setTimeout> | null = null;

export interface BackupPreferences {
  requestRetention: number;
  speechSpeed: number;
}

export interface BackupSnapshot {
  /** Current portable-backup envelope version. */
  formatVersion?: number;
  /** IndexedDB schema version used when this snapshot was exported. */
  databaseVersion?: number;
  /** Scheduler metadata; stored card state remains authoritative. */
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
  };
}

interface NormalizedBackup {
  classes: Class[];
  decks: Deck[];
  cards: Card[];
  reviews: ReviewLog[];
  preferences?: BackupPreferences;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value);

const isPositiveInteger = (value: unknown): value is number =>
  Number.isInteger(value) && Number(value) > 0;

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

const isValidDate = (value: unknown): value is Date =>
  value instanceof Date && Number.isFinite(value.getTime());

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

function assertUniqueIds(rows: readonly { id?: number }[], label: string): void {
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
        Number(value.lastRating) <= 5))
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
    value.scheduledDays >= 0
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
    throw new Error('Backup speech-speed preference is invalid; refusing to import.');
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

function validateBackupMetadata(snapshot: Record<string, unknown>): void {
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
    throw new Error('Backup database version is invalid; refusing to import.');
  }
  if (snapshot.version !== undefined && !isPositiveInteger(snapshot.version)) {
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
  if (typeof databaseVersion === 'number' && databaseVersion > db.verno) {
    throw new Error(
      `Backup database version ${databaseVersion} is newer than this app's schema (${db.verno}); refusing to import.`,
    );
  }

  if (
    snapshot.schedulerVersion !== undefined &&
    (typeof snapshot.schedulerVersion !== 'string' ||
      !snapshot.schedulerVersion.trim())
  ) {
    throw new Error('Backup scheduler version is invalid; refusing to import.');
  }
}

function normalizeBackup(snapshot: unknown): NormalizedBackup {
  if (!isRecord(snapshot) || !isRecord(snapshot.data)) {
    throw new Error('Backup is missing its data section; refusing to import.');
  }

  validateBackupMetadata(snapshot);
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
  const cards = reviveDates(data.cards as unknown[], [
    'createdAt',
    'due',
    'lastReviewed',
  ]);
  const reviews = reviveDates(data.reviews as unknown[], ['reviewedAt']);

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
    if (!classIds.has(card.classId) || !deck || deck.classId !== card.classId) {
      throw new Error(
        `Card ${card.id} has an invalid class/deck relationship; refusing to import.`,
      );
    }
  }

  for (const review of reviews) {
    const card = cardById.get(review.cardId);
    if (!card || card.deckId !== review.deckId || card.classId !== review.classId) {
      throw new Error(
        `Review ${review.id ?? '(without id)'} has invalid card/deck/class references; refusing to import.`,
      );
    }
  }

  return { classes, decks, cards, reviews, preferences };
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
      console.warn('Unable to roll back partially restored preferences:', rollbackError);
    }
    throw new Error('Backup preferences could not be written; import was cancelled.', {
      cause: error,
    });
  }

  return rollback;
}

/** Export the complete local database and non-secret portable preferences. */
export async function exportDatabase(): Promise<BackupSnapshot> {
  const [classes, decks, cards, reviews] = await Promise.all([
    db.classes.toArray(),
    db.decks.toArray(),
    db.cards.toArray(),
    db.reviews.toArray(),
  ]);
  const schedulerParams = loadSchedulerParams();

  return {
    formatVersion: BACKUP_FORMAT_VERSION,
    databaseVersion: db.verno,
    schedulerVersion: FSRS_VERSION,
    exportedAt: new Date().toISOString(),
    preferences: {
      requestRetention: schedulerParams.requestRetention,
      speechSpeed: loadSpeechRate(),
    },
    data: { classes, decks, cards, reviews },
  };
}

/**
 * Replace the complete database from a validated backup. Metadata, preferences,
 * dates, duplicate IDs, and foreign-key relationships are validated before any
 * existing row is cleared. Preference writes are rolled back if the database
 * transaction fails.
 */
export async function importDatabase(snapshot: unknown): Promise<void> {
  const { classes, decks, cards, reviews, preferences } =
    normalizeBackup(snapshot);
  const rollbackPreferences = applyPreferences(preferences);

  try {
    await db.transaction(
      'rw',
      [db.classes, db.decks, db.cards, db.reviews],
      async () => {
        await Promise.all([
          db.classes.clear(),
          db.decks.clear(),
          db.cards.clear(),
          db.reviews.clear(),
        ]);

        if (classes.length > 0) await db.classes.bulkAdd(classes);
        if (decks.length > 0) await db.decks.bulkAdd(decks);
        if (cards.length > 0) await db.cards.bulkAdd(cards);
        if (reviews.length > 0) await db.reviews.bulkAdd(reviews);
      },
    );
  } catch (error) {
    if (rollbackPreferences) {
      try {
        rollbackPreferences();
      } catch (rollbackError) {
        console.warn('Unable to roll back restored preferences:', rollbackError);
      }
    }
    throw error;
  }

  clearPersistedStudySession();
  triggerAutoSave();
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
    const hasClasses = Array.isArray(data.classes) && data.classes.length > 0;
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
