import { db } from '../db';
import { ALL_DRILL_BUCKETS, type DrillBucket } from './drill';
import type { StudySession } from '../store/types';

const STORAGE_KEY = 'denki.study-session.v1';
const SNAPSHOT_VERSION = 1;
const MAX_SESSION_AGE_MS = 24 * 60 * 60 * 1000;
const VALID_DRILL_BUCKETS = new Set<DrillBucket>(ALL_DRILL_BUCKETS);

interface PersistedStudySession {
  version: typeof SNAPSHOT_VERSION;
  savedAt: number;
  deckId?: number;
  classId?: number;
  isGlobal?: boolean;
  queueCardIds: number[];
  currentIndex: number;
  completedCount: number;
  initialQueueSize: number;
  totalCards: number;
  isCram?: boolean;
  isDrill?: boolean;
  drillBuckets?: DrillBucket[];
}

export interface StudySessionScope {
  deckId?: number;
  classId?: number;
  isGlobal?: boolean;
  isDrill?: boolean;
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

function isValidDrillBucket(value: unknown): value is DrillBucket {
  return VALID_DRILL_BUCKETS.has(value as DrillBucket);
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
    (snapshot.isGlobal === undefined || typeof snapshot.isGlobal === 'boolean') &&
    (snapshot.isCram === undefined || typeof snapshot.isCram === 'boolean') &&
    (snapshot.isDrill === undefined || typeof snapshot.isDrill === 'boolean') &&
    (snapshot.drillBuckets === undefined || (
      Array.isArray(snapshot.drillBuckets) &&
      snapshot.drillBuckets.every(isValidDrillBucket)
    )) &&
    (!snapshot.isDrill || snapshot.deckId !== undefined) &&
    (snapshot.deckId !== undefined || snapshot.classId !== undefined || snapshot.isGlobal === true)
  );
}

function scopeMatches(snapshot: PersistedStudySession, scope: StudySessionScope): boolean {
  if (scope.isDrill !== undefined && Boolean(snapshot.isDrill) !== scope.isDrill) return false;
  if (scope.isGlobal) return snapshot.isGlobal === true;
  if (scope.deckId !== undefined) return snapshot.deckId === scope.deckId;
  if (scope.classId !== undefined) return snapshot.classId === scope.classId;
  return false;
}

export function persistStudySession(session: StudySession): void {
  const storage = getStorage();
  if (!storage) return;

  const queueCardIds = session.queue.map((card) => card.id);
  if (queueCardIds.length === 0 || queueCardIds.some((id) => id === undefined)) {
    clearPersistedStudySession();
    return;
  }

  const snapshot: PersistedStudySession = {
    version: SNAPSHOT_VERSION,
    savedAt: Date.now(),
    deckId: session.deckId,
    classId: session.classId,
    isGlobal: session.isGlobal,
    queueCardIds: queueCardIds as number[],
    currentIndex: session.currentIndex,
    completedCount: session.completedCount,
    initialQueueSize: session.initialQueueSize,
    totalCards: session.totalCards,
    isCram: session.isCram,
    isDrill: session.isDrill,
    drillBuckets: session.drillBuckets,
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
    const queueMatchesScope = scope.isGlobal
      ? true
      : scope.deckId !== undefined
        ? queue.every((card) => card.deckId === scope.deckId)
        : queue.every((card) => card.classId === scope.classId);
    if (!queueMatchesScope) {
      clearPersistedStudySession();
      return null;
    }

    return {
      deckId: snapshot.deckId,
      classId: snapshot.classId,
      isGlobal: snapshot.isGlobal,
      queue,
      currentIndex: snapshot.currentIndex,
      completedCount: Math.min(snapshot.completedCount, queue.length),
      initialQueueSize: snapshot.initialQueueSize,
      totalCards: snapshot.totalCards,
      isCram: snapshot.isCram,
      isDrill: snapshot.isDrill,
      drillBuckets: snapshot.isDrill
        ? snapshot.drillBuckets ?? [...ALL_DRILL_BUCKETS]
        : undefined,
      history: [],
    };
  } catch (error) {
    console.warn('Unable to restore persisted study session:', error);
    return null;
  }
}
