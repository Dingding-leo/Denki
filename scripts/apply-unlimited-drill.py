from pathlib import Path
import re


def read(path: str) -> str:
    return Path(path).read_text()


def write(path: str, content: str) -> None:
    Path(path).write_text(content)


def replace_once(path: str, old: str, new: str) -> None:
    text = read(path)
    if old not in text:
        raise AssertionError(f"Expected text not found in {path}: {old[:120]!r}")
    write(path, text.replace(old, new, 1))


def sub_once(path: str, pattern: str, replacement: str, flags: int = 0) -> None:
    text = read(path)
    updated, count = re.subn(pattern, replacement, text, count=1, flags=flags)
    if count != 1:
        raise AssertionError(f"Expected one regex match in {path}, got {count}: {pattern[:120]!r}")
    write(path, updated)


# Daily limits are retired. Keep a compatibility shim so old imports and stored
# preferences cannot constrain a queue while the remaining call sites are
# progressively simplified by maintenance work.
write(
    'src/services/studyLimits.ts',
    """// Daily new-card limits were retired in favour of learner-controlled sessions.\n"
    "// These exports remain as a compatibility shim for older code and data.\n"
    "export const NEW_CARDS_PER_DAY_KEY = 'denki-new-cards-per-day';\n"
    "export const DEFAULT_NEW_CARDS_PER_DAY = 0;\n\n"
    "/** Always unlimited. Any legacy localStorage value is deliberately ignored. */\n"
    "export function loadNewCardsPerDay(): number {\n"
    "  return 0;\n"
    "}\n\n"
    "export function countNewIntroducedToday(): Promise<Map<number, number>> {\n"
    "  return Promise.resolve(new Map<number, number>());\n"
    "}\n\n"
    "/** Infinity signals that every new card may enter the current session. */\n"
    "export function newCardAllowance(\n"
    "  _deckId: number,\n"
    "  _introducedByDeck: Map<number, number>,\n"
    "  _limit: number,\n"
    "): number {\n"
    "  return Infinity;\n"
    "}\n"
)

# Store/session types.
replace_once(
    'src/store/types.ts',
    "import type { Rating } from '../services/scheduler';\n",
    "import type { DrillBucket } from '../services/drill';\nimport type { Rating } from '../services/scheduler';\n",
)
replace_once(
    'src/store/types.ts',
    "  isCram?: boolean;       // If studying all cards instead of strictly due ones\n",
    "  isCram?: boolean;       // If studying all cards instead of strictly due ones\n"
    "  isDrill?: boolean;      // Random one-pass deck session; low ratings never reinsert\n"
    "  drillBuckets?: DrillBucket[]; // Previous-level buckets included in this drill\n",
)
replace_once(
    'src/store/types.ts',
    "  startGlobalStudySession: (forceCram?: boolean) => Promise<void>;\n",
    "  startGlobalStudySession: (forceCram?: boolean) => Promise<void>;\n"
    "  startDrillSession: (deckId: number, buckets?: readonly DrillBucket[]) => Promise<void>;\n",
)

# Add drill queue creation and prevent low-confidence reinsertion in drill mode.
replace_once(
    'src/store/slices/studySlice.ts',
    "import { triggerAutoSave } from '../../services/backup';\n",
    "import { triggerAutoSave } from '../../services/backup';\n"
    "import { ALL_DRILL_BUCKETS, filterDrillCards } from '../../services/drill';\n",
)
replace_once(
    'src/store/slices/studySlice.ts',
    "  rateCard: async (rating) => {\n",
    """  startDrillSession: async (deckId, buckets = ALL_DRILL_BUCKETS) => {
    const deckCards = await db.cards.where('deckId').equals(deckId).toArray();
    const selectedCards = filterDrillCards(deckCards, buckets);
    const queue = buildStudyQueue(selectedCards);

    set({
      session: {
        deckId,
        isDrill: true,
        drillBuckets: [...buckets],
        queue,
        currentIndex: 0,
        completedCount: 0,
        initialQueueSize: queue.length,
        totalCards: deckCards.length,
        isCram: false,
        history: [],
      },
    });
  },

  rateCard: async (rating) => {
""",
)
replace_once(
    'src/store/slices/studySlice.ts',
    "      if (rating <= 2) {\n",
    "      if (!sessionRef.isDrill && rating <= 2) {\n",
)

# Persist Drill as a separate session type so it never revives as normal Study.
write(
    'src/services/studySessionPersistence.ts',
    """import { db } from '../db';
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
""",
)

write(
    'src/store/useFlashcardStore.ts',
    """import { create } from 'zustand';
import {
  clearPersistedStudySession,
  persistStudySession,
  restorePersistedStudySession,
} from '../services/studySessionPersistence';
import { createClassSlice } from './slices/classSlice';
import { createDeckSlice } from './slices/deckSlice';
import { createCardSlice } from './slices/cardSlice';
import { createStudySlice } from './slices/studySlice';
import { createStatsSlice } from './slices/statsSlice';
import type { FlashcardState } from './types';
import { toast } from './uiStore';

export const useFlashcardStore = create<FlashcardState>((...args) => ({
  ...createClassSlice(...args),
  ...createDeckSlice(...args),
  ...createCardSlice(...args),
  ...createStudySlice(...args),
  ...createStatsSlice(...args),
}));

let lastSession = useFlashcardStore.getState().session;
useFlashcardStore.subscribe((state) => {
  if (state.session === lastSession) return;
  lastSession = state.session;
  if (state.session) persistStudySession(state.session);
  else clearPersistedStudySession();
});

const startDeckSession = useFlashcardStore.getState().startStudySession;
const startClassSession = useFlashcardStore.getState().startClassStudySession;
const startGlobalSession = useFlashcardStore.getState().startGlobalStudySession;
const startDeckDrill = useFlashcardStore.getState().startDrillSession;

useFlashcardStore.setState({
  startStudySession: async (deckId, forceCram = false) => {
    if (!forceCram) {
      const current = useFlashcardStore.getState().session;
      if (current?.deckId === deckId && !current.isDrill) return;
      const restored = await restorePersistedStudySession({ deckId, isDrill: false });
      if (restored) {
        useFlashcardStore.setState({ session: restored });
        toast('Resumed your previous study session', 'info');
        return;
      }
    }
    await startDeckSession(deckId, forceCram);
  },
  startClassStudySession: async (classId, forceCram = false) => {
    if (!forceCram) {
      const current = useFlashcardStore.getState().session;
      if (current?.classId === classId && !current.isDrill) return;
      const restored = await restorePersistedStudySession({ classId, isDrill: false });
      if (restored) {
        useFlashcardStore.setState({ session: restored });
        toast('Resumed your previous study session', 'info');
        return;
      }
    }
    await startClassSession(classId, forceCram);
  },
  startGlobalStudySession: async (forceCram = false) => {
    if (!forceCram) {
      const current = useFlashcardStore.getState().session;
      if (current?.isGlobal && !current.isDrill) return;
      const restored = await restorePersistedStudySession({ isGlobal: true, isDrill: false });
      if (restored) {
        await useFlashcardStore.getState().loadDecks();
        useFlashcardStore.setState({ session: restored });
        toast('Resumed your previous mixed review', 'info');
        return;
      }
    }
    await startGlobalSession(forceCram);
  },
  startDrillSession: async (deckId, buckets) => {
    const current = useFlashcardStore.getState().session;
    if (current?.deckId === deckId && current.isDrill) return;
    const restored = await restorePersistedStudySession({ deckId, isDrill: true });
    if (restored) {
      useFlashcardStore.setState({ session: restored });
      toast('Resumed your previous drill', 'info');
      return;
    }
    await startDeckDrill(deckId, buckets);
  },
});
""",
)

# Remove the daily-limit setting from the preferences surface and clear stale data.
settings_path = 'src/components/modals/SettingsModal.tsx'
settings = read(settings_path)
settings = re.sub(
    r"import \{\n  DEFAULT_NEW_CARDS_PER_DAY,\n  NEW_CARDS_PER_DAY_KEY,\n  loadNewCardsPerDay,\n\} from '../../services/studyLimits';\n",
    '',
    settings,
    count=1,
)
settings = settings.replace('const MAX_NEW_CARDS_PER_DAY = 999;\n', '')
settings = re.sub(
    r"  const \[newCardsPerDay, setNewCardsPerDay\] = useState\(\(\) =>\n    clamp\(loadNewCardsPerDay\(\), 0, MAX_NEW_CARDS_PER_DAY\)\);\n",
    '',
    settings,
    count=1,
)
settings = settings.replace(
    "    nextSpeechSpeed: number,\n    nextNewCards: number,\n",
    "    nextSpeechSpeed: number,\n",
    1,
)
settings = settings.replace(
    "    localStorage.setItem(SPEECH_SPEED_KEY, String(nextSpeechSpeed));\n    localStorage.setItem(NEW_CARDS_PER_DAY_KEY, String(nextNewCards));\n",
    "    localStorage.setItem(SPEECH_SPEED_KEY, String(nextSpeechSpeed));\n"
    "    localStorage.removeItem('denki-new-cards-per-day');\n",
    1,
)
settings = settings.replace(
    "    const normalizedSpeech = clamp(speechSpeed, SPEECH_SPEED_MIN, SPEECH_SPEED_MAX);\n"
    "    const normalizedNewCards = Math.round(clamp(newCardsPerDay, 0, MAX_NEW_CARDS_PER_DAY));\n",
    "    const normalizedSpeech = clamp(speechSpeed, SPEECH_SPEED_MIN, SPEECH_SPEED_MAX);\n",
    1,
)
settings = settings.replace(
    "      normalizedScheduler.hardIntervalMultiplier,\n      normalizedSpeech,\n      normalizedNewCards,\n",
    "      normalizedScheduler.hardIntervalMultiplier,\n      normalizedSpeech,\n",
    1,
)
settings = settings.replace('    setNewCardsPerDay(DEFAULT_NEW_CARDS_PER_DAY);\n', '')
settings = settings.replace(
    '    persistPreferences(0.9, 1.3, 1.2, 1, DEFAULT_NEW_CARDS_PER_DAY);\n',
    '    persistPreferences(0.9, 1.3, 1.2, 1);\n',
    1,
)
settings, count = re.subn(
    r"\n            <label>\n              <span style=\{fieldLabelStyle\}>New cards per day, per deck</span>.*?\n            </label>",
    '',
    settings,
    count=1,
    flags=re.S,
)
if count != 1:
    raise AssertionError(f'Expected daily-limit field once, found {count}')
write(settings_path, settings)

# Deck page entry point.
replace_once(
    'src/pages/ClassViewPage.tsx',
    "import { ChevronRight, Download, Edit2, Play, RotateCcw, Trash2, Upload } from 'lucide-react';",
    "import { ChevronRight, Download, Edit2, Play, RotateCcw, Shuffle, Trash2, Upload } from 'lucide-react';",
)
replace_once(
    'src/pages/ClassViewPage.tsx',
    "import { ManageCardsModal } from '../components/modals/ManageCardsModal';\n",
    "import { DrillSetupModal } from '../components/modals/DrillSetupModal';\n"
    "import { ManageCardsModal } from '../components/modals/ManageCardsModal';\n",
)
replace_once(
    'src/pages/ClassViewPage.tsx',
    "import { exportDeckToCsv } from '../services/deckExport';\n",
    "import { exportDeckToCsv } from '../services/deckExport';\n"
    "import type { DrillBucket } from '../services/drill';\n",
)
replace_once(
    'src/pages/ClassViewPage.tsx',
    "    startStudySession: state.startStudySession,\n",
    "    startStudySession: state.startStudySession,\n"
    "    startDrillSession: state.startDrillSession,\n",
)
replace_once(
    'src/pages/ClassViewPage.tsx',
    "  const [managingDeckId, setManagingDeckId] = useState<number | null>(null);\n",
    "  const [managingDeckId, setManagingDeckId] = useState<number | null>(null);\n"
    "  const [drillingDeck, setDrillingDeck] = useState<{ id: number; name: string } | null>(null);\n",
)
replace_once(
    'src/pages/ClassViewPage.tsx',
    """  const handleStartDeckStudy = async (deckId: number) => {
    await runAction(`study-deck-${deckId}`, async () => {
      await store.startStudySession(deckId);
      navigate(`/study/deck/${deckId}`);
    }, 'Deck review could not start');
  };
""",
    """  const handleStartDeckStudy = async (deckId: number) => {
    await runAction(`study-deck-${deckId}`, async () => {
      await store.startStudySession(deckId);
      navigate(`/study/deck/${deckId}`);
    }, 'Deck review could not start');
  };

  const handleStartDeckDrill = async (
    deckId: number,
    buckets: readonly DrillBucket[],
  ) => {
    if (pendingAction !== null) return;
    setPendingAction(`drill-deck-${deckId}`);
    try {
      await store.startDrillSession(deckId, buckets);
      setDrillingDeck(null);
      navigate(`/study/deck/${deckId}/drill`);
    } catch (error) {
      toast(
        `Deck drill could not start: ${error instanceof Error ? error.message : 'unknown error'}`,
        'error',
      );
      throw error;
    } finally {
      setPendingAction(null);
    }
  };
""",
)
replace_once(
    'src/pages/ClassViewPage.tsx',
    """                            <button
                              type="button"
                              onClick={() => void handleStartDeckStudy(deck.id!)}
                              disabled={deck.total === 0 || pendingAction !== null}
                              style={{ height: '32px', padding: '0 14px', fontSize: '11px' }}
                              className="btn-premium-primary hover-lift"
                              title={deck.total === 0 ? 'Add cards before studying' : undefined}
                            >
                              Study <ChevronRight size={11} />
                            </button>""",
    """                            <button
                              type="button"
                              onClick={() => setDrillingDeck({ id: deck.id!, name: deck.name })}
                              disabled={deck.total === 0 || pendingAction !== null}
                              style={{ height: '32px', padding: '0 12px', fontSize: '11px' }}
                              className="btn-premium-secondary hover-lift"
                              title={deck.total === 0 ? 'Add cards before drilling' : 'Random one-pass drill'}
                            >
                              <Shuffle size={11} /> Drill
                            </button>
                            <button
                              type="button"
                              onClick={() => void handleStartDeckStudy(deck.id!)}
                              disabled={deck.total === 0 || pendingAction !== null}
                              style={{ height: '32px', padding: '0 14px', fontSize: '11px' }}
                              className="btn-premium-primary hover-lift"
                              title={deck.total === 0 ? 'Add cards before studying' : undefined}
                            >
                              Study <ChevronRight size={11} />
                            </button>""",
)
replace_once(
    'src/pages/ClassViewPage.tsx',
    "      {managingDeckId !== null && (\n",
    """      {drillingDeck !== null && (
        <DrillSetupModal
          deckId={drillingDeck.id}
          deckName={drillingDeck.name}
          onClose={() => setDrillingDeck(null)}
          onStart={(buckets) => handleStartDeckDrill(drillingDeck.id, buckets)}
        />
      )}

      {managingDeckId !== null && (
""",
)

# Route.
replace_once(
    'src/App.tsx',
    '            <Route path="/study/deck/:deckId" element={<ErrorBoundary><StudySessionPage /></ErrorBoundary>} />\n',
    '            <Route path="/study/deck/:deckId" element={<ErrorBoundary><StudySessionPage /></ErrorBoundary>} />\n'
    '            <Route path="/study/deck/:deckId/drill" element={<ErrorBoundary><StudySessionPage /></ErrorBoundary>} />\n',
)

# Study screen.
page_path = 'src/pages/StudySessionPage.tsx'
page = read(page_path)
page = page.replace(
    "import { useParams, useNavigate } from 'react-router-dom';",
    "import { useLocation, useNavigate, useParams } from 'react-router-dom';",
    1,
)
page = page.replace(
    "  const navigate = useNavigate();\n",
    "  const navigate = useNavigate();\n"
    "  const location = useLocation();\n"
    "  const isDrillRoute = location.pathname.endsWith('/drill');\n",
    1,
)
page = page.replace(
    "    startStudySession: s.startStudySession,\n",
    "    startStudySession: s.startStudySession,\n"
    "    startDrillSession: s.startDrillSession,\n",
    1,
)
page = page.replace(
    """    if (classId) {
      void actions.startClassStudySession(Number.parseInt(classId, 10), false);
    } else if (deckId) {
      void actions.startStudySession(Number.parseInt(deckId, 10), false);
    } else {
      void actions.startGlobalStudySession(false);
    }
  }, [classId, deckId]);""",
    """    if (classId) {
      void actions.startClassStudySession(Number.parseInt(classId, 10), false);
    } else if (deckId) {
      const parsedDeckId = Number.parseInt(deckId, 10);
      if (isDrillRoute) void actions.startDrillSession(parsedDeckId);
      else void actions.startStudySession(parsedDeckId, false);
    } else {
      void actions.startGlobalStudySession(false);
    }
  }, [classId, deckId, isDrillRoute]);""",
    1,
)
page = page.replace(
    "  const [totalTimeSpent, setTotalTimeSpent] = useState(0);\n",
    "  const [totalTimeSpent, setTotalTimeSpent] = useState(0);\n\n"
    "  useEffect(() => {\n"
    "    if (isDrillRoute) setStudyMode('review');\n"
    "  }, [isDrillRoute]);\n",
    1,
)
page = page.replace(
    "    if (session.completedCount > 0 && session.completedCount % 10 === 0 && session.currentIndex < session.queue.length) {",
    "    if (!session.isDrill && session.completedCount > 0 && session.completedCount % 10 === 0 && session.currentIndex < session.queue.length) {",
    1,
)
page = page.replace(
    """  const handleContinue = () => {
    setCheckpointOpen(false);
    cardStartTimeRef.current = Date.now();
  };
""",
    """  const handleContinue = () => {
    setCheckpointOpen(false);
    cardStartTimeRef.current = Date.now();
  };

  const handleRepeatDrill = async () => {
    const actions = useFlashcardStore.getState();
    const currentSession = actions.session;
    if (!currentSession?.isDrill || currentSession.deckId === undefined) return;

    const drillDeckId = currentSession.deckId;
    const buckets = currentSession.drillBuckets;
    actions.endStudySession();
    await actions.startDrillSession(drillDeckId, buckets);

    const now = Date.now();
    sessionStartTimeRef.current = now;
    cardStartTimeRef.current = now;
    roundTimesRef.current = [];
    setIsFlipped(false);
    setCheckpointOpen(false);
    setRoundAverages([]);
    setTotalTimeSpent(0);
  };
""",
    1,
)
page = page.replace(
    "  const { queue, currentIndex, completedCount, history, isCram } = store.session;",
    "  const { queue, currentIndex, completedCount, history, isCram, isDrill } = store.session;",
    1,
)
page = page.replace(
    """  const sessionTitle = store.session.isGlobal
    ? "Today's Mixed Review"
    : store.session.deckId
      ? store.decks.find((deck) => deck.id === store.session?.deckId)?.name ?? 'Deck'
      : store.classes.find((studyClass) => studyClass.id === store.session?.classId)?.name ?? 'Study Session';
  const sessionSubtitle = isCram
    ? 'Cram session · all active cards'
    : store.session.isGlobal
      ? currentSource || 'Randomized across your library'
      : 'Spaced Repetition';""",
    """  const baseSessionTitle = store.session.deckId
    ? store.decks.find((deck) => deck.id === store.session?.deckId)?.name ?? 'Deck'
    : store.classes.find((studyClass) => studyClass.id === store.session?.classId)?.name ?? 'Study Session';
  const sessionTitle = isDrill
    ? `${baseSessionTitle} · Drill`
    : store.session.isGlobal
      ? "Today's Mixed Review"
      : baseSessionTitle;
  const sessionSubtitle = isDrill
    ? 'Random one-pass · each selected card appears once'
    : isCram
      ? 'Practice session · all active cards'
      : store.session.isGlobal
        ? currentSource || 'Randomized across your library'
        : 'Spaced Repetition';""",
    1,
)
page = page.replace('            Review Mode\n', "            {isDrill ? 'Drill Mode' : 'Review Mode'}\n", 1)
page = page.replace('{store.session.deckId && (', '{!isDrill && store.session.deckId && (', 1)
learn_pattern = re.compile(
    r"\n          <button\n            onClick=\{\(\) => setStudyMode\('learn'\)\}.*?\n          </button>",
    re.S,
)
learn_match = learn_pattern.search(page)
if learn_match is None:
    raise AssertionError('Learn tab not found')
learn_block = learn_match.group(0)
page = page[:learn_match.start()] + "\n          {!isDrill && (" + learn_block + "\n          )}" + page[learn_match.end():]

page = page.replace(
    """            {store.session.totalCards === 0 ? (
              <>
                <h2 className="gradient-text" style={{ fontSize: '22px', fontWeight: 800 }}>{store.session.isGlobal ? 'Your Library Is Empty' : 'This Deck Is Empty'}</h2>
                <p style={{ color: '#9ca3af', fontSize: '14px', lineHeight: 1.5, maxWidth: '400px' }}>
                  {store.session.isGlobal
                    ? 'There are no cards in your library yet. Create or import a deck to begin.'
                    : 'There are no cards here yet. Head back and add some cards to start studying.'}
                </p>
              </>
            ) : (
              <>
                <h2 className="gradient-text" style={{ fontSize: '22px', fontWeight: 800 }}>No Cards Due Today! 🎉</h2>
                <p style={{ color: '#9ca3af', fontSize: '14px', lineHeight: 1.5, maxWidth: '400px' }}>
                  You have completed all scheduled spaced reviews {store.session.isGlobal ? 'across your library' : 'for this deck'}. Would you like to Cram study all cards anyway?
                </p>
              </>
            )}""",
    """            {isDrill ? (
              <>
                <h2 className="gradient-text" style={{ fontSize: '22px', fontWeight: 800 }}>No cards match this drill</h2>
                <p style={{ color: '#9ca3af', fontSize: '14px', lineHeight: 1.5, maxWidth: '400px' }}>
                  Return to the deck and choose at least one previous-level bucket that contains cards.
                </p>
              </>
            ) : store.session.totalCards === 0 ? (
              <>
                <h2 className="gradient-text" style={{ fontSize: '22px', fontWeight: 800 }}>{store.session.isGlobal ? 'Your Library Is Empty' : 'This Deck Is Empty'}</h2>
                <p style={{ color: '#9ca3af', fontSize: '14px', lineHeight: 1.5, maxWidth: '400px' }}>
                  {store.session.isGlobal
                    ? 'There are no cards in your library yet. Create or import a deck to begin.'
                    : 'There are no cards here yet. Head back and add some cards to start studying.'}
                </p>
              </>
            ) : (
              <>
                <h2 className="gradient-text" style={{ fontSize: '22px', fontWeight: 800 }}>No Cards Due Today! 🎉</h2>
                <p style={{ color: '#9ca3af', fontSize: '14px', lineHeight: 1.5, maxWidth: '400px' }}>
                  Scheduled review is complete. You can leave the cards to rest or run an optional all-card practice.
                </p>
              </>
            )}""",
    1,
)
page = page.replace('{store.session.totalCards > 0 && (', '{store.session.totalCards > 0 && !isDrill && (', 1)
page = page.replace('                  Cram Study (All Cards)\n', '                  Practice All Cards\n', 1)
page = page.replace(
    """          <StudySessionSummary
            history={history}
            totalTimeSpent={totalTimeSpent}
            onExit={handleExitStudy}
          />""",
    """          <StudySessionSummary
            history={history}
            totalTimeSpent={totalTimeSpent}
            mode={isDrill ? 'drill' : isCram ? 'practice' : 'review'}
            onRepeat={isDrill ? () => void handleRepeatDrill() : undefined}
            onExit={handleExitStudy}
          />""",
    1,
)
write(page_path, page)

# Drill-aware completion summary.
summary_path = 'src/components/StudySessionSummary.tsx'
summary = read(summary_path)
summary = summary.replace(
    "import { Award, Timer, CheckCircle, BarChart2 } from 'lucide-react';",
    "import { Award, BarChart2, CheckCircle, Repeat2, Timer } from 'lucide-react';",
    1,
)
summary = summary.replace(
    "  onExit: () => void;\n",
    "  mode?: 'review' | 'practice' | 'drill';\n  onRepeat?: () => void;\n  onExit: () => void;\n",
    1,
)
summary = summary.replace(
    "  totalTimeSpent,\n  onExit,\n",
    "  totalTimeSpent,\n  mode = 'review',\n  onRepeat,\n  onExit,\n",
    1,
)
summary = summary.replace(
    '  return (\n',
    """  const isDrill = mode === 'drill';
  const heading = isDrill ? 'Drill complete' : 'Session complete';
  const description = isDrill
    ? 'Every selected card appeared exactly once. Your ratings were saved and will guide future Study sessions.'
    : mode === 'practice'
      ? 'You completed an optional all-card practice. Scheduling and review history have been updated.'
      : 'You completed every card in this scheduled review. FSRS has updated the next review intervals.';

  return (
""",
    1,
)
summary = summary.replace('          Session Completed! 🎉\n', '          {heading}\n', 1)
summary, count = re.subn(
    r"        <p style=\{\{ color: '#9ca3af'.*?\n        </p>",
    """        <p style={{ color: '#9ca3af', fontSize: '14px', maxWidth: '440px', margin: '0 auto', lineHeight: 1.5 }}>
          {description}
        </p>""",
    summary,
    count=1,
    flags=re.S,
)
if count != 1:
    raise AssertionError('Summary description not found')
summary = summary.replace('>Reviewed</span>', ">{isDrill ? 'Drilled' : 'Reviewed'}</span>", 1)
summary, count = re.subn(
    r"      <button\n        onClick=\{onExit\}.*?\n      </button>",
    """      <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', justifyContent: 'center', marginTop: '8px' }}>
        {isDrill && onRepeat && (
          <button onClick={onRepeat} className="btn-premium-secondary hover-lift">
            <Repeat2 size={14} /> Drill again
          </button>
        )}
        <button onClick={onExit} className="btn-premium-primary hover-lift">
          Return to Workspace
        </button>
      </div>""",
    summary,
    count=1,
    flags=re.S,
)
if count != 1:
    raise AssertionError('Summary return button not found')
write(summary_path, summary)

replace_once(
    'src/components/TodayQueueCard.tsx',
    "          {forceCram ? 'Cram mode · schedules still update' : 'Due cards only · new-card limits apply'}",
    "          {forceCram ? 'Optional practice · schedules still update' : 'Due + new cards · no daily cap'}",
)
replace_once(
    'README.md',
    '- **One daily mixed queue** that randomises all due cards across the library, plus focused deck and class sessions.\n',
    '- **Unlimited new-card study** with no daily introduction cap.\n'
    '- **Deck Drill Mode** for a fully random, one-pass sweep filtered by previous confidence level; ratings still update future scheduling.\n'
    '- **One mixed review queue** that randomises all due cards across the library, plus focused deck and class sessions.\n',
)

# Regression tests.
write(
    'src/services/__tests__/drill.test.ts',
    """import { describe, expect, it } from 'vitest';
import type { Card } from '../../db/schema';
import {
  ALL_DRILL_BUCKETS,
  countDrillBuckets,
  filterDrillCards,
  getDrillBucket,
} from '../drill';

function card(id: number, lastRating?: number): Card {
  return {
    id,
    classId: 1,
    deckId: 1,
    front: `Q${id}`,
    back: `A${id}`,
    cardType: 'standard',
    createdAt: new Date(),
    state: 0,
    stability: 0,
    difficulty: 0,
    elapsedDays: 0,
    scheduledDays: 0,
    due: new Date(),
    lastRating,
  };
}

describe('drill filters', () => {
  const cards = [card(1), card(2, 1), card(3, 2), card(4, 3), card(5, 4), card(6, 5)];

  it('maps unrated cards to New and legacy score 5 to Easy', () => {
    expect(getDrillBucket(cards[0])).toBe('new');
    expect(getDrillBucket(cards[5])).toBe(4);
  });

  it('filters by any combination of previous confidence buckets', () => {
    expect(filterDrillCards(cards, [1, 2]).map((item) => item.id)).toEqual([2, 3]);
    expect(filterDrillCards(cards, ['new', 4]).map((item) => item.id)).toEqual([1, 5, 6]);
    expect(filterDrillCards(cards, ALL_DRILL_BUCKETS)).toHaveLength(cards.length);
  });

  it('counts every bucket using the canonical four-level scale', () => {
    expect(countDrillBuckets(cards)).toEqual({ new: 1, 1: 1, 2: 1, 3: 1, 4: 2 });
  });
});
""",
)

write(
    'src/services/__tests__/studyLimits.test.ts',
    """import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '../../db';
import type { Card } from '../../db/schema';
import { useFlashcardStore } from '../../store/useFlashcardStore';
import { loadNewCardsPerDay, NEW_CARDS_PER_DAY_KEY } from '../studyLimits';

function seedCard(deckId: number, classId: number, front: string): Card {
  return {
    classId,
    deckId,
    front,
    back: `A:${front}`,
    cardType: 'standard',
    createdAt: new Date(),
    state: 0,
    stability: 0,
    difficulty: 0,
    elapsedDays: 0,
    scheduledDays: 0,
    due: new Date(),
  };
}

describe('unlimited new-card study', () => {
  beforeEach(async () => {
    window.localStorage.clear();
    useFlashcardStore.setState({ session: null, activeDeckId: null, activeClassId: null });
    await Promise.all([db.cards.clear(), db.reviews.clear(), db.decks.clear(), db.classes.clear()]);
  });

  it('ignores a legacy daily-limit preference', () => {
    window.localStorage.setItem(NEW_CARDS_PER_DAY_KEY, '1');
    expect(loadNewCardsPerDay()).toBe(0);
  });

  it('queues every new card and reports every one as due', async () => {
    window.localStorage.setItem(NEW_CARDS_PER_DAY_KEY, '1');
    const classId = await db.classes.add({ name: 'C', description: '', createdAt: new Date() });
    const deckId = await db.decks.add({ classId, name: 'D', description: '', createdAt: new Date() });
    for (let index = 0; index < 30; index += 1) {
      await db.cards.add(seedCard(deckId, classId, `Q${index}`));
    }

    await useFlashcardStore.getState().startStudySession(deckId);
    expect(useFlashcardStore.getState().session?.queue).toHaveLength(30);

    await useFlashcardStore.getState().loadDeckStats(classId);
    expect(useFlashcardStore.getState().deckStats[deckId].dueCount).toBe(30);
  });
});
""",
)

slice_path = 'src/store/slices/__tests__/studySlice.test.ts'
slice_test = read(slice_path)
slice_test = slice_test.replace(
    "  beforeEach(async () => {\n    await Promise.all",
    "  beforeEach(async () => {\n    window.localStorage.clear();\n    await Promise.all",
    1,
)
extra = """

  it('drills selected previous levels once without reinserting low ratings', async () => {
    const { deckId } = await startWithCards(5);
    const cards = await db.cards.where('deckId').equals(deckId).sortBy('id');
    await Promise.all([
      db.cards.update(cards[1].id!, { lastRating: 1 }),
      db.cards.update(cards[2].id!, { lastRating: 2 }),
      db.cards.update(cards[3].id!, { lastRating: 3 }),
      db.cards.update(cards[4].id!, { lastRating: 4 }),
    ]);

    useFlashcardStore.getState().endStudySession();
    await useFlashcardStore.getState().startDrillSession(deckId, ['new', 1, 2]);

    const startingSession = useFlashcardStore.getState().session!;
    expect(startingSession.isDrill).toBe(true);
    expect(startingSession.queue).toHaveLength(3);
    expect(new Set(startingSession.queue.map((card) => card.id))).toEqual(
      new Set([cards[0].id, cards[1].id, cards[2].id]),
    );

    while (true) {
      const session = useFlashcardStore.getState().session!;
      if (session.currentIndex >= session.queue.length) break;
      await useFlashcardStore.getState().rateCard(1);
    }

    const completed = useFlashcardStore.getState().session!;
    expect(completed.queue).toHaveLength(3);
    expect(completed.completedCount).toBe(3);
    expect(completed.history).toHaveLength(3);
    expect(await db.reviews.count()).toBe(3);
  });
"""
head, separator, tail = slice_test.rpartition('\n});')
if not separator:
    raise AssertionError('studySlice suite close not found')
write(slice_path, head + extra + '\n});' + tail)

persistence_path = 'src/services/__tests__/studySessionPersistence.test.ts'
persistence_test = read(persistence_path)
extra = """

  it('keeps drill snapshots separate from normal deck study and restores the filter', async () => {
    const { deckId } = await startWithCards();
    useFlashcardStore.getState().endStudySession();
    await useFlashcardStore.getState().startDrillSession(deckId, ['new', 1, 2]);

    expect(await restorePersistedStudySession({ deckId, isDrill: false })).toBeNull();
    const restored = await restorePersistedStudySession({ deckId, isDrill: true });
    expect(restored?.isDrill).toBe(true);
    expect(restored?.drillBuckets).toEqual(['new', 1, 2]);
  });
"""
head, separator, tail = persistence_test.rpartition('\n});')
if not separator:
    raise AssertionError('persistence suite close not found')
write(persistence_path, head + extra + '\n});' + tail)
