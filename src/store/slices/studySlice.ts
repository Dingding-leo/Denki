import type { StateCreator } from 'zustand';
import { db } from '../../db';
import type { Card } from '../../db/schema';
import { reviewCard } from '../../services/scheduler';
import { loadSchedulerParams } from '../../services/schedulerParams';
import { triggerAutoSave } from '../../services/backup';
import { loadNewCardsPerDay, countNewIntroducedToday, newCardAllowance } from '../../services/studyLimits';
import { toast } from '../uiStore';
import type { FlashcardState, StudySlice } from '../types';

const isNewCard = (card: Card) => card.state === 0 || !card.lastReviewed;

/**
 * Enforce the daily new-card limit: keep every due review, but only as many
 * new cards per deck as today's remaining allowance permits. Returns the
 * capped list and how many new cards were held back for tomorrow.
 */
async function applyNewCardLimit(cards: Card[]): Promise<{ cards: Card[]; heldBack: number }> {
  const limit = loadNewCardsPerDay();
  if (limit <= 0) return { cards, heldBack: 0 };

  const introduced = await countNewIntroducedToday();
  const remainingByDeck = new Map<number, number>();
  const kept: Card[] = [];
  let heldBack = 0;

  // Cards arrive in creation order after the caller's sort; process in id
  // order here so the oldest new cards are introduced first.
  const sorted = [...cards].sort((a, b) => (a.id ?? 0) - (b.id ?? 0));
  for (const card of sorted) {
    if (!isNewCard(card)) {
      kept.push(card);
      continue;
    }
    const remaining =
      remainingByDeck.get(card.deckId) ?? newCardAllowance(card.deckId, introduced, limit);
    if (remaining > 0) {
      remainingByDeck.set(card.deckId, remaining - 1);
      kept.push(card);
    } else {
      remainingByDeck.set(card.deckId, 0);
      heldBack++;
    }
  }
  return { cards: kept, heldBack };
}

const notifyHeldBack = (heldBack: number) => {
  if (heldBack > 0) {
    toast(
      `Daily new-card limit reached — ${heldBack} new card${heldBack === 1 ? '' : 's'} saved for tomorrow`,
      'info',
    );
  }
};

// Guards rateCard/undoLastRate so two concurrent mutations can't read the same
// pre-await session snapshot and desync the in-memory queue/history from the DB.
let isMutatingSession = false;

// Cap in-session re-insertions of a low-rated card so a repeatedly-failed card
// can't grow the queue without bound (each re-insert also writes another review
// log to the DB). After the cap the card is left to FSRS's own due date.
const MAX_REINSERTIONS = 3;

// Coalesce per-rating stats refreshes. Running the full analytics recompute
// (loadClassStats + loadDeckStats + loadStats — ~13 IndexedDB queries plus a
// 12-month aggregation) on every single rating is the main mid-session jank
// source. Instead, refresh ~1s after the last rating in a burst so sidebar
// badges and the streak settle shortly after the session pauses or ends.
let statsRefreshTimer: ReturnType<typeof setTimeout> | null = null;
function scheduleStatsRefresh(run: () => Promise<void>) {
  if (statsRefreshTimer) clearTimeout(statsRefreshTimer);
  statsRefreshTimer = setTimeout(() => {
    statsRefreshTimer = null;
    run().catch(console.warn);
  }, 1000);
}

export const createStudySlice: StateCreator<
  FlashcardState,
  [],
  [],
  StudySlice
> = (set, get) => ({
  session: null,

  startStudySession: async (deckId, forceCram = false) => {
    const deckCards = await db.cards.where('deckId').equals(deckId).toArray();
    const now = new Date();

    // Spaced repetition due card filter (due <= now)
    let filteredCards = deckCards;
    const isCram = forceCram || deckCards.length > 0 && deckCards.every(c => c.due === undefined);
    
    let heldBack = 0;
    if (!forceCram) {
      filteredCards = deckCards.filter(card => {
        // If it's a new card (no lastReviewed or state is 0), it's due
        if (!card.lastReviewed || card.state === 0) return true;
        // Otherwise, check if due date is in the past
        return new Date(card.due).getTime() <= now.getTime();
      });
      ({ cards: filteredCards, heldBack } = await applyNewCardLimit(filteredCards));
    }

    // Build weighted queue containing exactly 1 copy of each card for FSRS session order
    const weightedQueue: Card[] = [...filteredCards];
    
    // Sort chronologically by card ID or creation date (first created to last)
    weightedQueue.sort((a, b) => {
      if (a.id && b.id) return a.id - b.id;
      return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
    });

    set({
      session: {
        deckId,
        queue: weightedQueue,
        currentIndex: 0,
        completedCount: 0,
        initialQueueSize: weightedQueue.length,
        totalCards: deckCards.length,
        isCram,
        history: [],
      },
    });
    notifyHeldBack(heldBack);
  },

  startClassStudySession: async (classId, forceCram = false) => {
    const classCards = await db.cards.where('classId').equals(classId).toArray();
    const now = new Date();

    let filteredCards = classCards;
    const isCram = forceCram;

    let heldBack = 0;
    if (!forceCram) {
      filteredCards = classCards.filter(card => {
        if (!card.lastReviewed || card.state === 0) return true;
        return new Date(card.due).getTime() <= now.getTime();
      });
      ({ cards: filteredCards, heldBack } = await applyNewCardLimit(filteredCards));
    }

    // Build weighted queue containing exactly 1 copy of each card for FSRS session order
    const weightedQueue: Card[] = [...filteredCards];
    
    // Sort chronologically by card ID or creation date (first created to last)
    weightedQueue.sort((a, b) => {
      if (a.id && b.id) return a.id - b.id;
      return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
    });

    set({
      session: {
        classId,
        queue: weightedQueue,
        currentIndex: 0,
        completedCount: 0,
        initialQueueSize: weightedQueue.length,
        totalCards: classCards.length,
        isCram,
        history: [],
      },
    });
    notifyHeldBack(heldBack);
  },

  rateCard: async (rating) => {
    // Serialize rating mutations: drop a concurrent second call so two rapid
    // ratings can't both read the same snapshot and desync the queue/history
    // from the DB (duplicate review logs, broken undo).
    if (isMutatingSession) return;

    const state = get();
    if (!state.session) return;

    const sessionRef = state.session;
    const { queue, currentIndex, completedCount, history } = sessionRef;
    const currentCard = queue[currentIndex];
    if (!currentCard) return;

    isMutatingSession = true;
    try {
      const now = new Date();

      // Custom FSRS algorithm settings from localStorage (shared with previews)
      const params = loadSchedulerParams();

      const { updatedCard, log } = reviewCard(currentCard, rating, now, params);

      // Save confidence rating directly on the card
      updatedCard.lastRating = rating;

      // Save to IndexedDB within transaction
      let logId: number | undefined;
      try {
        await db.transaction('rw', [db.cards, db.reviews], async () => {
          if (currentCard.id) {
            await db.cards.put(updatedCard);
            logId = await db.reviews.add({
              ...log,
              cardId: currentCard.id,
              classId: currentCard.classId,
            });
          }
        });
      } catch (err) {
        // The review was NOT persisted — do not advance the session or report
        // success. A quota/storage failure here silently drops the review if we
        // keep going (the card stays due, the log never exists, undo is broken).
        console.error('Failed to save card review:', err);
        toast('Failed to save this review — please try again', 'error');
        return;
      }

      // Refresh database buffers for 'cards' in memory (if managing card view is active)
      const activeDeckId = get().activeDeckId;
      if (activeDeckId) {
        await get().loadCards(activeDeckId);
      }

      // The session may have been ended or replaced during the awaits above
      // (e.g. the user exited). Bail rather than resurrecting a dead session.
      if (get().session !== sessionRef) return;

      // Re-insert card back into the queue ONLY for low-confidence ratings.
      // Cards rated 3+ are handled by the FSRS scheduler for future sessions.
      const newQueue = [...queue];
      newQueue[currentIndex] = updatedCard; // Update the reference so progress segments read the new rating

      const nextIndex = currentIndex + 1;
      const nextCompleted = completedCount + 1;

      // How many times this card has already been re-inserted this session
      // (counting this rating's entry below). History holds the pre-rating card,
      // so match by card id.
      if (rating <= 2) {
        const priorReinserts = history.filter((h) => h.card.id === currentCard.id).length;
        const canReinsert = priorReinserts < MAX_REINSERTIONS;

        if (canReinsert) {
          const remaining = newQueue.length - nextIndex;
          let insertDistance: number;
          if (rating === 1) insertDistance = 3;                                          // 3 cards later
          else insertDistance = Math.max(5, Math.floor(remaining * 0.15));               // ~15% into remaining

          const insertIdx = Math.min(newQueue.length, nextIndex + insertDistance);
          newQueue.splice(insertIdx, 0, updatedCard);
        }
      }

      // Record this rating action to history for undo capabilities. The queue,
      // index and completion count are snapshotted here so undo can restore the
      // exact prior session state (position-independent of later re-insertions).
      // The snapshot must be the PRE-mutation queue (`queue`, not `newQueue`),
      // so undo lands back on the state right before this rating.
      const historyEntry = {
        card: { ...currentCard }, // Shallow copy to preserve state
        rating,
        reviewLogId: logId,
        queueSnapshot: queue,
        index: currentIndex,
        completedCount: nextCompleted - 1,
      };

      set({
        session: {
          ...sessionRef,
          queue: newQueue,
          currentIndex: nextIndex,
          completedCount: nextCompleted,
          history: [...history, historyEntry],
        },
      });

      // Refresh statistics after a short coalescing delay so a rapid sequence of
      // ratings doesn't recompute the whole analytics layer per card.
      scheduleStatsRefresh(async () => {
        await get().loadClassStats(currentCard.classId);
        await get().loadDeckStats(currentCard.classId);
        // Scope the streak/global stats to the class being studied, not whatever
        // class is selected in the nav (which may differ for a deck session).
        await get().loadStats(currentCard.classId);
      });

      triggerAutoSave();
    } finally {
      isMutatingSession = false;
    }
  },

  undoLastRate: async () => {
    if (isMutatingSession) return;

    const state = get();
    if (!state.session) return;

    const sessionRef = state.session;
    const { history } = sessionRef;
    if (!history || history.length === 0) return;

    isMutatingSession = true;
    try {
      // Pop the last history entry
      const lastEntry = history[history.length - 1];
      const newHistory = history.slice(0, -1);

      // Rollback the card database record and delete the review log. Only
      // restore rows that actually have an id — rating a card without an id
      // never persisted it (rateCard guards on `currentCard.id`), so `put` here
      // would otherwise create a brand-new row that was never rated.
      try {
        await db.transaction('rw', [db.cards, db.reviews], async () => {
          if (lastEntry.card.id) {
            await db.cards.put(lastEntry.card);
          }
          // Delete review log
          if (lastEntry.reviewLogId) {
            await db.reviews.delete(lastEntry.reviewLogId);
          }
        });
      } catch (err) {
        console.error('Failed to undo last rating in DB:', err);
      }

      // Refresh database buffers for 'cards' in memory (if managing card view is active)
      const activeDeckId = get().activeDeckId;
      if (activeDeckId) {
        await get().loadCards(activeDeckId);
      }

      // Bail if the session ended or was replaced during the awaits.
      if (get().session !== sessionRef) return;

      // Restore the exact queue, index and completion state captured when this
      // card was rated. Using a full snapshot (instead of re-deriving insertion
      // index / currentIndex-1) keeps undo correct even when the card was
      // re-inserted for a low rating and later cards were rated around it.
      const queueSnapshot = lastEntry.queueSnapshot;
      const prevIndex = lastEntry.index;
      const prevCompleted = lastEntry.completedCount;

      set({
        session: {
          ...sessionRef,
          queue: queueSnapshot,
          currentIndex: prevIndex,
          completedCount: prevCompleted,
          history: newHistory,
        },
      });

      // Refresh stats after a short coalescing delay (see scheduleStatsRefresh).
      scheduleStatsRefresh(async () => {
        await get().loadClassStats(lastEntry.card.classId);
        await get().loadDeckStats(lastEntry.card.classId);
        await get().loadStats(lastEntry.card.classId);
      });

      triggerAutoSave();
    } finally {
      isMutatingSession = false;
    }
  },

  previousCard: () => {
    const session = get().session;
    if (!session) return;
    const { currentIndex } = session;
    if (currentIndex > 0) {
      set({
        session: {
          ...session,
          currentIndex: currentIndex - 1,
        },
      });
    }
  },

  nextCard: () => {
    const session = get().session;
    if (!session) return;
    const { currentIndex, queue } = session;
    if (currentIndex < queue.length - 1) {
      set({
        session: {
          ...session,
          currentIndex: currentIndex + 1,
        },
      });
    }
  },

  endStudySession: () => {
    // Drop any pending coalesced stats refresh so it can't fire a class-scoped
    // loadStats over the global dashboard after the user has left the session.
    if (statsRefreshTimer) {
      clearTimeout(statsRefreshTimer);
      statsRefreshTimer = null;
    }
    set({ session: null });
  },
});
