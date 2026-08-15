import { db } from '../db';
import type { StudySession } from '../store/types';

const STORAGE_KEY = 'denki.study-session.v1';
const SNAPSHOT_VERSION = 1;
const MAX_SESSION_AGE_MS = 24 * 60 * 60 * 1000;

interface PersistedStudySession {
  version: typeof SNAPSHOT_VERSION;
  savedAt: number;
  deckId?: number;
  classId?: number;
  queueCardIds: number[];
  currentIndex: number;
  completedCount: number;
  initialQueueSize: number;
  totalCards: number;
  isCram?: boolean;
}

export interface StudySessionScope {
  deckId?: number;
  classId?: number;
}

function getStorage(): Storage | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function isFiniteNonNegativeInteger(value: unknown): value is number {
  return Number.isInteger(value) && Number(value) >= 0;
}

function isValidSnapshot(value: unknown): value is PersistedStudySession {
  if (!value || typeof value !== 'object') return false;
  const snapshot = value as Partial<PersistedStudySession>;

  return (
    snapshot.version === SNAPSHOT_VERSION &&
    typeof snapshot.savedAt === 'number' &&
    Number.isFinite(snapshot.savedAt) &&
    Array.isArray(snapshot.queueCardIds) &&
    snapshot.queueCardIds.every((id) => Number.isInteger(id) && id > 0) &&
    isFiniteNonNegativeInteger(snapshot.currentIndex) &&
    isFiniteNonNegativeInteger(snapshot.completedCount) &&
    isFiniteNonNegativeInteger(snapshot.initialQueueSize) &&
    isFiniteNonNegativeInteger(snapshot.totalCards) &&
    (snapshot.deckId === undefined || (Number.isInteger(snapshot.deckId) && snapshot.deckId > 0)) &&
    (snapshot.classId === undefined || (Number.isInteger(snapshot.classId) && snapshot.classId > 0)) &&
    (snapshot.isCram === undefined || typeof snapshot.isCram === 'boolean') &&
    (snapshot.deckId !== undefined || snapshot.classId !== undefined)
  );
}

function scopeMatches(snapshot: PersistedStudySession, scope: StudySessionScope): boolean {
  if (scope.deckId !== undefined) return snapshot.deckId === scope.deckId;
  if (scope.classId !== undefined) return snapshot.classId === scope.classId;
  return false;
}

export function persistStudySession(session: StudySession): void {
  const storage = getStorage();
  if (!storage) return;

  const queueCardIds = session.queue.map((card) => card.id);
  if (
    queueCardIds.length === 0 ||
    queueCardIds.some((id): id is undefined => id === undefined)
  ) {
    clearPersistedStudySession();
    return;
  }

  const snapshot: PersistedStudySession = {
    version: SNAPSHOT_VERSION,
    savedAt: Date.now(),
    deckId: session.deckId,
    classId: session.classId,
    queueCardIds: queueCardIds as number[],
    currentIndex: session.currentIndex,
    completedCount: session.completedCount,
    initialQueueSize: session.initialQueueSize,
    totalCards: session.totalCards,
    isCram: session.isCram,
  };

  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(snapshot));
  } catch (error) {
    console.warn('Unable to persist study session:', error);
  }
}

export function clearPersistedStudySession(): void {
  const storage = getStorage();
  if (!storage) return;

  try {
    storage.removeItem(STORAGE_KEY);
  } catch (error) {
    console.warn('Unable to clear persisted study session:', error);
  }
}

export async function restorePersistedStudySession(
  scope: StudySessionScope,
): Promise<StudySession | null> {
  const storage = getStorage();
  if (!storage) return null;

  let snapshot: PersistedStudySession;
  try {
    const raw = storage.getItem(STORAGE_KEY);
    if (!raw) return null;

    const parsed: unknown = JSON.parse(raw);
    if (!isValidSnapshot(parsed)) {
      clearPersistedStudySession();
      return null;
    }
    snapshot = parsed;
  } catch (error) {
    console.warn('Unable to read persisted study session:', error);
    clearPersistedStudySession();
    return null;
  }

  if (!scopeMatches(snapshot, scope)) return null;

  if (Date.now() - snapshot.savedAt > MAX_SESSION_AGE_MS) {
    clearPersistedStudySession();
    return null;
  }

  if (snapshot.currentIndex > snapshot.queueCardIds.length) {
    clearPersistedStudySession();
    return null;
  }

  try {
    const cards = await db.cards.bulkGet(snapshot.queueCardIds);
    if (cards.some((card) => card === undefined)) {
      clearPersistedStudySession();
      return null;
    }

    const queue = cards.map((card) => card!);
    const queueMatchesScope = scope.deckId !== undefined
      ? queue.every((card) => card.deckId === scope.deckId)
      : queue.every((card) => card.classId === scope.classId);

    if (!queueMatchesScope) {
      clearPersistedStudySession();
      return null;
    }

    return {
      deckId: snapshot.deckId,
      classId: snapshot.classId,
      queue,
      currentIndex: snapshot.currentIndex,
      completedCount: Math.min(snapshot.completedCount, queue.length),
      initialQueueSize: snapshot.initialQueueSize,
      totalCards: snapshot.totalCards,
      isCram: snapshot.isCram,
      // Undo history intentionally stays in-memory only. Persisting queue snapshots
      // for every historical rating would grow localStorage quadratically on large
      // decks; after a reload, the resumed session remains correct but undo starts fresh.
      history: [],
    };
  } catch (error) {
    console.warn('Unable to restore persisted study session:', error);
    return null;
  }
}
