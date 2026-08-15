from pathlib import Path


def replace_once(path_str: str, old: str, new: str) -> None:
    path = Path(path_str)
    text = path.read_text()
    if old not in text:
        raise RuntimeError(f"Expected text not found in {path_str}: {old[:120]!r}")
    path.write_text(text.replace(old, new, 1))


def write(path_str: str, content: str) -> None:
    Path(path_str).write_text(content)


# 1) Session types: add an explicit global scope and action.
replace_once(
    "src/store/types.ts",
    "  classId?: number;       // Selected class ID (if studying entire class)\n  queue: Card[];",
    "  classId?: number;       // Selected class ID (if studying entire class)\n  isGlobal?: boolean;       // Mixed queue across the entire library\n  queue: Card[];",
)
replace_once(
    "src/store/types.ts",
    '  totalCards: number;     // Total cards in the deck/class (pre due-filter) — distinguishes "empty deck" from "nothing due"',
    '  totalCards: number;     // Total cards in the active scope (pre due-filter) — distinguishes "empty" from "nothing due"',
)
replace_once(
    "src/store/types.ts",
    "  startClassStudySession: (classId: number, forceCram?: boolean) => Promise<void>;\n  rateCard: (rating: Rating) => Promise<void>;",
    "  startClassStudySession: (classId: number, forceCram?: boolean) => Promise<void>;\n  startGlobalStudySession: (forceCram?: boolean) => Promise<void>;\n  rateCard: (rating: Rating) => Promise<void>;",
)

# 2) Global queue creation and global-aware stats refresh.
replace_once(
    "src/store/slices/studySlice.ts",
    """    notifyHeldBack(heldBack);
  },

  rateCard: async (rating) => {""",
    """    notifyHeldBack(heldBack);
  },

  startGlobalStudySession: async (forceCram = false) => {
    const allCards = await db.cards.toArray();
    const now = new Date();

    let filteredCards = allCards;
    let heldBack = 0;
    if (!forceCram) {
      filteredCards = allCards.filter((card) => {
        if (!card.lastReviewed || card.state === 0) return true;
        return new Date(card.due).getTime() <= now.getTime();
      });
      ({ cards: filteredCards, heldBack } = await applyNewCardLimit(filteredCards));
    }

    // A fresh daily queue is mixed across the whole library. buildStudyQueue
    // shuffles cards and breaks avoidable same-deck runs.
    const weightedQueue = buildStudyQueue(filteredCards);

    // Class pages may leave the store's deck list scoped to one class. Restore
    // the complete deck index so a mixed session can label every card source.
    await get().loadDecks();

    set({
      session: {
        isGlobal: true,
        queue: weightedQueue,
        currentIndex: 0,
        completedCount: 0,
        initialQueueSize: weightedQueue.length,
        totalCards: allCards.length,
        isCram: forceCram,
        history: [],
      },
    });
    notifyHeldBack(heldBack);
  },

  rateCard: async (rating) => {""",
)
replace_once(
    "src/store/slices/studySlice.ts",
    "        await get().loadStats(currentCard.classId);\n",
    "        await get().loadStats(sessionRef.isGlobal ? null : currentCard.classId);\n",
)
replace_once(
    "src/store/slices/studySlice.ts",
    "        await get().loadStats(lastEntry.card.classId);\n",
    "        await get().loadStats(sessionRef.isGlobal ? null : lastEntry.card.classId);\n",
)

# 3) Persist and restore a global mixed queue exactly like deck/class sessions.
replace_once(
    "src/services/studySessionPersistence.ts",
    "  classId?: number;\n  queueCardIds: number[];",
    "  classId?: number;\n  isGlobal?: boolean;\n  queueCardIds: number[];",
)
replace_once(
    "src/services/studySessionPersistence.ts",
    "export interface StudySessionScope {\n  deckId?: number;\n  classId?: number;\n}",
    "export interface StudySessionScope {\n  deckId?: number;\n  classId?: number;\n  isGlobal?: boolean;\n}",
)
replace_once(
    "src/services/studySessionPersistence.ts",
    """    (snapshot.classId === undefined || (Number.isInteger(snapshot.classId) && snapshot.classId > 0)) &&
    (snapshot.isCram === undefined || typeof snapshot.isCram === 'boolean') &&
    (snapshot.deckId !== undefined || snapshot.classId !== undefined)""",
    """    (snapshot.classId === undefined || (Number.isInteger(snapshot.classId) && snapshot.classId > 0)) &&
    (snapshot.isGlobal === undefined || typeof snapshot.isGlobal === 'boolean') &&
    (snapshot.isCram === undefined || typeof snapshot.isCram === 'boolean') &&
    (snapshot.deckId !== undefined || snapshot.classId !== undefined || snapshot.isGlobal === true)""",
)
replace_once(
    "src/services/studySessionPersistence.ts",
    """function scopeMatches(snapshot: PersistedStudySession, scope: StudySessionScope): boolean {
  if (scope.deckId !== undefined) return snapshot.deckId === scope.deckId;
  if (scope.classId !== undefined) return snapshot.classId === scope.classId;
  return false;
}""",
    """function scopeMatches(snapshot: PersistedStudySession, scope: StudySessionScope): boolean {
  if (scope.isGlobal) return snapshot.isGlobal === true;
  if (scope.deckId !== undefined) return snapshot.deckId === scope.deckId;
  if (scope.classId !== undefined) return snapshot.classId === scope.classId;
  return false;
}""",
)
replace_once(
    "src/services/studySessionPersistence.ts",
    "    classId: session.classId,\n    queueCardIds: queueCardIds as number[],",
    "    classId: session.classId,\n    isGlobal: session.isGlobal,\n    queueCardIds: queueCardIds as number[],",
)
replace_once(
    "src/services/studySessionPersistence.ts",
    """    const queueMatchesScope = scope.deckId !== undefined
      ? queue.every((card) => card.deckId === scope.deckId)
      : queue.every((card) => card.classId === scope.classId);""",
    """    const queueMatchesScope = scope.isGlobal
      ? true
      : scope.deckId !== undefined
        ? queue.every((card) => card.deckId === scope.deckId)
        : queue.every((card) => card.classId === scope.classId);""",
)
replace_once(
    "src/services/studySessionPersistence.ts",
    "      classId: snapshot.classId,\n      queue,",
    "      classId: snapshot.classId,\n      isGlobal: snapshot.isGlobal,\n      queue,",
)

# 4) Wrap the global start action with duplicate-start and resume protection.
replace_once(
    "src/store/useFlashcardStore.ts",
    "const startClassSession = useFlashcardStore.getState().startClassStudySession;\n",
    "const startClassSession = useFlashcardStore.getState().startClassStudySession;\nconst startGlobalSession = useFlashcardStore.getState().startGlobalStudySession;\n",
)
replace_once(
    "src/store/useFlashcardStore.ts",
    """    await startClassSession(classId, forceCram);
  },
});""",
    """    await startClassSession(classId, forceCram);
  },
  startGlobalStudySession: async (forceCram = false) => {
    if (!forceCram) {
      const current = useFlashcardStore.getState().session;
      if (current?.isGlobal) return;

      const restored = await restorePersistedStudySession({ isGlobal: true });
      if (restored) {
        await useFlashcardStore.getState().loadDecks();
        useFlashcardStore.setState({ session: restored });
        toast('Resumed your previous mixed review', 'info');
        return;
      }
    }

    await startGlobalSession(forceCram);
  },
});""",
)

# 5) Route for the full-library session.
replace_once(
    "src/App.tsx",
    """            {/* Immersion Study Session routes (No sidebar) */}
            <Route path="/study/class/:classId" element={<StudySessionPage />} />""",
    """            {/* Immersion Study Session routes (No sidebar) */}
            <Route path="/study/all" element={<StudySessionPage />} />
            <Route path="/study/class/:classId" element={<StudySessionPage />} />""",
)

# 6) Start and label a global session inside the existing study page.
replace_once(
    "src/pages/StudySessionPage.tsx",
    "    startClassStudySession: s.startClassStudySession,\n    startStudySession: s.startStudySession,",
    "    startClassStudySession: s.startClassStudySession,\n    startGlobalStudySession: s.startGlobalStudySession,\n    startStudySession: s.startStudySession,",
)
replace_once(
    "src/pages/StudySessionPage.tsx",
    """    if (classId) {
      void actions.startClassStudySession(Number.parseInt(classId, 10), false);
    } else if (deckId) {
      void actions.startStudySession(Number.parseInt(deckId, 10), false);
    }""",
    """    if (classId) {
      void actions.startClassStudySession(Number.parseInt(classId, 10), false);
    } else if (deckId) {
      void actions.startStudySession(Number.parseInt(deckId, 10), false);
    } else {
      void actions.startGlobalStudySession(false);
    }""",
)
replace_once(
    "src/pages/StudySessionPage.tsx",
    """  const { queue, currentIndex, completedCount, history, isCram } = store.session;
  const currentStreak = store.currentStreak;
""",
    """  const { queue, currentIndex, completedCount, history, isCram } = store.session;
  const currentStreak = store.currentStreak;
  const currentSessionCard = queue[currentIndex];
  const currentDeck = currentSessionCard
    ? store.decks.find((deck) => deck.id === currentSessionCard.deckId)
    : undefined;
  const currentClass = currentSessionCard
    ? store.classes.find((studyClass) => studyClass.id === currentSessionCard.classId)
    : undefined;
  const currentSource = [currentClass?.name, currentDeck?.name].filter(Boolean).join(' › ');
  const sessionTitle = store.session.isGlobal
    ? "Today's Mixed Review"
    : store.session.deckId
      ? store.decks.find((deck) => deck.id === store.session?.deckId)?.name ?? 'Deck'
      : store.classes.find((studyClass) => studyClass.id === store.session?.classId)?.name ?? 'Study Session';
  const sessionSubtitle = isCram
    ? 'Cram session · all active cards'
    : store.session.isGlobal
      ? currentSource || 'Randomized across your library'
      : 'Spaced Repetition';
""",
)
replace_once(
    "src/pages/StudySessionPage.tsx",
    """            <h3 style={{ fontSize: '15px', fontWeight: 800, color: '#ffffff', lineHeight: 1.2 }}>
              {store.session.deckId 
                ? store.decks.find(d => d.id === store.session?.deckId)?.name 
                : store.classes.find(c => c.id === store.session?.classId)?.name || 'Study Session'}
            </h3>
            <span style={{ fontSize: '9px', color: '#8e8e93', textTransform: 'uppercase', fontWeight: 700, letterSpacing: '0.8px' }}>
              {isCram ? 'Cram Session' : 'Spaced Repetition'}
            </span>""",
    """            <h3 style={{ fontSize: '15px', fontWeight: 800, color: '#ffffff', lineHeight: 1.2 }}>
              {sessionTitle}
            </h3>
            <span style={{ fontSize: '9px', color: '#8e8e93', textTransform: 'uppercase', fontWeight: 700, letterSpacing: '0.8px' }}>
              {sessionSubtitle}
            </span>""",
)
replace_once(
    "src/pages/StudySessionPage.tsx",
    """                  onClick={() => {
                    if (classId) {
                      store.startClassStudySession(parseInt(classId, 10), true);
                    } else if (deckId) {
                      store.startStudySession(parseInt(deckId, 10), true);
                    }
                  }}""",
    """                  onClick={() => {
                    if (store.session?.isGlobal) {
                      store.startGlobalStudySession(true);
                    } else if (classId) {
                      store.startClassStudySession(parseInt(classId, 10), true);
                    } else if (deckId) {
                      store.startStudySession(parseInt(deckId, 10), true);
                    }
                  }}""",
)
replace_once(
    "src/pages/StudySessionPage.tsx",
    "<h2 className=\"gradient-text\" style={{ fontSize: '22px', fontWeight: 800 }}>This Deck Is Empty</h2>",
    "<h2 className=\"gradient-text\" style={{ fontSize: '22px', fontWeight: 800 }}>{store.session.isGlobal ? 'Your Library Is Empty' : 'This Deck Is Empty'}</h2>",
)
replace_once(
    "src/pages/StudySessionPage.tsx",
    "                  There are no cards here yet. Head back and add some cards to start studying.",
    """                  {store.session.isGlobal
                    ? 'There are no cards in your library yet. Create or import a deck to begin.'
                    : 'There are no cards here yet. Head back and add some cards to start studying.'}""",
)
replace_once(
    "src/pages/StudySessionPage.tsx",
    "                  You have completed all scheduled spaced reviews for this deck. Would you like to Cram study all cards anyway?",
    "                  You have completed all scheduled spaced reviews {store.session.isGlobal ? 'across your library' : 'for this deck'}. Would you like to Cram study all cards anyway?",
)

# 7) Dashboard's primary action: today's mixed queue.
replace_once(
    "src/pages/DashboardPage.tsx",
    "import { AnalyticsDashboard } from '../components/AnalyticsDashboard';\n",
    "import { AnalyticsDashboard } from '../components/AnalyticsDashboard';\nimport { TodayQueueCard } from '../components/TodayQueueCard';\n",
)
replace_once(
    "src/pages/DashboardPage.tsx",
    """      ) : (
        <AnalyticsDashboard />
      )}""",
    """      ) : (
        <>
          <TodayQueueCard />
          <AnalyticsDashboard />
        </>
      )}""",
)

# 8) Command palette entry.
replace_once(
    "src/components/CommandPalette.tsx",
    "import { Search, GraduationCap, Layers, FileText, LayoutDashboard, Sparkles, Keyboard, CornerDownLeft } from 'lucide-react';",
    "import { Search, GraduationCap, Layers, FileText, LayoutDashboard, Sparkles, Keyboard, CornerDownLeft, Play } from 'lucide-react';",
)
replace_once(
    "src/components/CommandPalette.tsx",
    """      {
        key: 'action-ai',
        icon: <Sparkles size={15} />,""",
    """      {
        key: 'action-today',
        icon: <Play size={15} />,
        title: "Review Today's Queue",
        subtitle: 'Mix every due card across your library',
        section: 'Actions',
        action: () => { close(); navigate('/study/all'); },
      },
      {
        key: 'action-ai',
        icon: <Sparkles size={15} />,""",
)

# 9) Load the new component stylesheet last.
replace_once(
    "src/main.tsx",
    "import './review-session.css'\n",
    "import './review-session.css'\nimport './today-queue.css'\n",
)

# 10) README feature line.
replace_once(
    "README.md",
    "- **Focused study sessions** with progress checkpoints and review summaries.\n",
    "- **One daily mixed queue** that randomises all due cards across the library, plus focused deck and class sessions.\n- **Focused study sessions** with progress checkpoints and review summaries.\n",
)

# 11) New dashboard component.
write(
    "src/components/TodayQueueCard.tsx",
    r"""import React, { useMemo, useState } from 'react';
import { ArrowRight, CheckCircle2, Clock3, Layers3, Shuffle } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useFlashcardStore } from '../store/useFlashcardStore';

export const TodayQueueCard: React.FC = () => {
  const navigate = useNavigate();
  const globalStats = useFlashcardStore((state) => state.globalStats);
  const classes = useFlashcardStore((state) => state.classes);
  const startGlobalStudySession = useFlashcardStore((state) => state.startGlobalStudySession);
  const [starting, setStarting] = useState(false);

  const totals = useMemo(() => {
    const states = globalStats?.cardStates;
    return {
      dueToday: globalStats?.workloadForecast[0]?.count ?? 0,
      dueTomorrow: globalStats?.workloadForecast[1]?.count ?? 0,
      totalCards: states
        ? states.newCount + states.learningCount + states.reviewCount
        : 0,
    };
  }, [globalStats]);

  const hasCards = totals.totalCards > 0;
  const isCaughtUp = totals.dueToday === 0;
  const forceCram = isCaughtUp && hasCards;

  const handleStart = async () => {
    if (!hasCards || starting) return;
    setStarting(true);
    try {
      await startGlobalStudySession(forceCram);
      navigate('/study/all');
    } finally {
      setStarting(false);
    }
  };

  return (
    <section className={`today-queue-card ${isCaughtUp ? 'is-clear' : ''}`} aria-labelledby="today-queue-title">
      <div className="today-queue-body">
        <div className="today-queue-kicker">
          <span>00 / Today's queue</span>
          <span className="today-queue-status">
            {isCaughtUp ? <CheckCircle2 size={12} /> : <span className="today-queue-pulse" />}
            {isCaughtUp ? 'Schedule clear' : 'Ready now'}
          </span>
        </div>

        <div className="today-queue-headline">
          <strong className="today-queue-count">{String(totals.dueToday).padStart(2, '0')}</strong>
          <div>
            <h2 id="today-queue-title">
              {isCaughtUp ? 'Nothing due. Keep the rhythm.' : 'Review everything due.'}
            </h2>
            <p>
              {isCaughtUp
                ? 'Your scheduled work is complete. Start an optional mixed practice round, or leave the cards to rest.'
                : 'One randomized session across every class and deck, while Denki preserves each card’s FSRS schedule.'}
            </p>
          </div>
        </div>

        <div className="today-queue-facts">
          <span><Shuffle size={13} /> Fresh random order</span>
          <span><Layers3 size={13} /> {classes.length} {classes.length === 1 ? 'class' : 'classes'} mixed</span>
          <span><Clock3 size={13} /> {totals.dueTomorrow} due tomorrow</span>
        </div>
      </div>

      <aside className="today-queue-ticket">
        <span className="today-queue-ticket-label">Daily review slip</span>
        <div className="today-queue-ticket-number">
          {hasCards ? totals.totalCards : '—'}
          <small>cards on file</small>
        </div>
        <button
          type="button"
          onClick={() => { void handleStart(); }}
          disabled={!hasCards || starting}
          className="today-queue-start"
        >
          {starting
            ? 'Building queue…'
            : !hasCards
              ? 'Add cards first'
              : forceCram
                ? 'Optional mixed practice'
                : `Start ${totals.dueToday}-card review`}
          {!starting && hasCards && <ArrowRight size={15} />}
        </button>
        <span className="today-queue-ticket-note">
          {forceCram ? 'Cram mode · schedules still update' : 'Due cards only · new-card limits apply'}
        </span>
      </aside>
    </section>
  );
};
""",
)

# 12) Eye-comfort/zine styling for the queue card.
write(
    "src/today-queue.css",
    r"""/* Today's mixed review: the dashboard's primary action, kept within the eye-comfort zine system. */

.today-queue-card {
  width: 100%;
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(220px, 0.32fr);
  gap: 0;
  margin-bottom: 30px;
  overflow: hidden;
  color: var(--eye-paper-soft, var(--text-secondary));
  background:
    linear-gradient(115deg, rgba(140, 155, 114, 0.08), transparent 45%),
    var(--eye-panel-raised, var(--zine-panel-raised));
  border: 1px solid var(--eye-line, var(--border-glass));
  border-radius: 12px;
  box-shadow: 0 16px 38px rgba(0, 0, 0, 0.2);
}

.today-queue-card.is-clear {
  background:
    linear-gradient(115deg, rgba(164, 170, 140, 0.045), transparent 45%),
    var(--eye-panel-raised, var(--zine-panel-raised));
}

.today-queue-body {
  min-width: 0;
  padding: clamp(20px, 3vw, 34px);
}

.today-queue-kicker {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 14px;
  padding-bottom: 12px;
  border-bottom: 1px solid var(--eye-line-soft, var(--border-glass));
  font-family: var(--font-mono);
  font-size: 9px;
  font-weight: 800;
  letter-spacing: 0.11em;
  text-transform: uppercase;
}

.today-queue-kicker > span:first-child {
  color: var(--eye-sage, var(--accent-color));
}

.today-queue-status {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  color: var(--text-muted);
}

.today-queue-pulse {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: var(--eye-sage, var(--accent-color));
  box-shadow: 0 0 0 4px rgba(140, 155, 114, 0.1);
}

.today-queue-headline {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  gap: clamp(18px, 3vw, 34px);
  align-items: center;
  padding: 25px 0 22px;
}

.today-queue-count {
  color: var(--eye-paper, var(--text-primary));
  font-family: var(--font-display);
  font-size: clamp(68px, 9vw, 116px);
  line-height: 0.75;
  letter-spacing: -0.085em;
}

.today-queue-headline h2 {
  color: var(--eye-paper, var(--text-primary)) !important;
  font-family: var(--font-display);
  font-size: clamp(22px, 3vw, 36px);
  line-height: 0.95;
  letter-spacing: -0.055em;
  text-transform: uppercase;
}

.today-queue-headline p {
  max-width: 680px;
  margin-top: 11px;
  color: var(--text-secondary);
  font-size: 13px;
  line-height: 1.6;
}

.today-queue-facts {
  display: flex;
  gap: 9px 18px;
  flex-wrap: wrap;
  color: var(--text-muted);
  font-family: var(--font-mono);
  font-size: 9px;
  font-weight: 700;
  letter-spacing: 0.04em;
  text-transform: uppercase;
}

.today-queue-facts span {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.today-queue-ticket {
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  gap: 18px;
  padding: 23px 20px;
  color: var(--eye-ink, #202720);
  background: var(--eye-paper-dim, #918d80);
  border-left: 1px dashed rgba(13, 21, 17, 0.45);
}

.today-queue-card.is-clear .today-queue-ticket {
  background: #858778;
}

.today-queue-ticket-label,
.today-queue-ticket-note {
  font-family: var(--font-mono);
  font-size: 8px;
  font-weight: 900;
  letter-spacing: 0.1em;
  line-height: 1.45;
  text-transform: uppercase;
}

.today-queue-ticket-number {
  display: flex;
  flex-direction: column;
  font-family: var(--font-display);
  font-size: 42px;
  line-height: 0.9;
  letter-spacing: -0.06em;
}

.today-queue-ticket-number small {
  margin-top: 8px;
  font-family: var(--font-mono);
  font-size: 8px;
  letter-spacing: 0.09em;
  text-transform: uppercase;
}

.today-queue-start {
  min-height: 42px;
  display: inline-flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  width: 100%;
  padding: 10px 12px;
  color: var(--eye-paper, #b6b09f);
  background: var(--eye-canvas, #0d1511);
  border: 1px solid rgba(13, 21, 17, 0.72);
  border-radius: 6px;
  cursor: pointer;
  font-family: var(--font-mono);
  font-size: 9px;
  font-weight: 900;
  letter-spacing: 0.045em;
  text-align: left;
  text-transform: uppercase;
  transition: transform 120ms ease, background 120ms ease;
}

.today-queue-start:hover:not(:disabled) {
  color: var(--eye-canvas, #0d1511);
  background: var(--eye-sage-soft, #a4aa8c);
  transform: translateY(-1px);
}

.today-queue-start:disabled {
  cursor: not-allowed;
  opacity: 0.5;
}

.today-queue-ticket-note {
  opacity: 0.72;
}

@media (max-width: 860px) {
  .today-queue-card {
    grid-template-columns: 1fr;
  }

  .today-queue-ticket {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    align-items: center;
    border-top: 1px dashed rgba(13, 21, 17, 0.45);
    border-left: 0;
  }

  .today-queue-ticket-number {
    grid-row: 1 / 3;
    grid-column: 2;
    align-items: flex-end;
  }

  .today-queue-start {
    max-width: 320px;
  }
}

@media (max-width: 560px) {
  .today-queue-headline {
    grid-template-columns: 1fr;
  }

  .today-queue-count {
    font-size: 74px;
  }

  .today-queue-ticket {
    display: flex;
    align-items: stretch;
  }

  .today-queue-ticket-number {
    align-items: flex-start;
  }

  .today-queue-start {
    max-width: none;
  }
}
""",
)

# 13) Focused tests for full-library scope and persistence.
write(
    "src/services/__tests__/globalStudySession.test.ts",
    r"""import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '../../db';
import type { Card } from '../../db/schema';
import { useFlashcardStore } from '../../store/useFlashcardStore';
import { restorePersistedStudySession } from '../studySessionPersistence';
import { STATES } from '../scheduler';

function cardFixture(
  classId: number,
  deckId: number,
  front: string,
  overrides: Partial<Card> = {},
): Card {
  return {
    classId,
    deckId,
    front,
    back: `Answer: ${front}`,
    cardType: 'standard',
    createdAt: new Date(),
    state: STATES.New,
    stability: 0,
    difficulty: 0,
    elapsedDays: 0,
    scheduledDays: 0,
    due: new Date(),
    ...overrides,
  };
}

async function seedLibrary() {
  const classOne = await db.classes.add({ name: 'One', description: '', createdAt: new Date() });
  const classTwo = await db.classes.add({ name: 'Two', description: '', createdAt: new Date() });
  const deckOne = await db.decks.add({ classId: classOne, name: 'A', description: '', createdAt: new Date() });
  const deckTwo = await db.decks.add({ classId: classTwo, name: 'B', description: '', createdAt: new Date() });

  const dueOne = await db.cards.add(cardFixture(classOne, deckOne, 'Due one'));
  const dueTwo = await db.cards.add(cardFixture(classTwo, deckTwo, 'Due two'));
  const future = await db.cards.add(cardFixture(classTwo, deckTwo, 'Future', {
    state: STATES.Review,
    stability: 10,
    difficulty: 5,
    lastReviewed: new Date(),
    due: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
  }));

  return { classOne, classTwo, deckOne, deckTwo, dueOne, dueTwo, future };
}

describe("today's mixed review", () => {
  beforeEach(async () => {
    window.localStorage.clear();
    useFlashcardStore.setState({
      session: null,
      activeDeckId: null,
      activeClassId: null,
      decks: [],
      classes: [],
    });
    await Promise.all([
      db.reviews.clear(),
      db.cards.clear(),
      db.decks.clear(),
      db.classes.clear(),
    ]);
  });

  it('builds one due-only queue across classes and decks', async () => {
    const seeded = await seedLibrary();

    await useFlashcardStore.getState().startGlobalStudySession();
    const session = useFlashcardStore.getState().session!;

    expect(session.isGlobal).toBe(true);
    expect(session.totalCards).toBe(3);
    expect(new Set(session.queue.map((card) => card.id))).toEqual(
      new Set([seeded.dueOne, seeded.dueTwo]),
    );
    expect(new Set(session.queue.map((card) => card.classId))).toEqual(
      new Set([seeded.classOne, seeded.classTwo]),
    );
    expect(session.queue.some((card) => card.id === seeded.future)).toBe(false);
  });

  it('includes future cards only when mixed practice is explicitly started', async () => {
    const seeded = await seedLibrary();

    await useFlashcardStore.getState().startGlobalStudySession(true);
    const session = useFlashcardStore.getState().session!;

    expect(session.isGlobal).toBe(true);
    expect(session.isCram).toBe(true);
    expect(new Set(session.queue.map((card) => card.id))).toEqual(
      new Set([seeded.dueOne, seeded.dueTwo, seeded.future]),
    );
  });

  it('persists and restores only under the global scope', async () => {
    const seeded = await seedLibrary();

    await useFlashcardStore.getState().startGlobalStudySession();
    const restored = await restorePersistedStudySession({ isGlobal: true });

    expect(restored?.isGlobal).toBe(true);
    expect(restored?.queue).toHaveLength(2);
    expect(await restorePersistedStudySession({ deckId: seeded.deckOne })).toBeNull();
    expect(await restorePersistedStudySession({ classId: seeded.classOne })).toBeNull();
  });
});
""",
)
