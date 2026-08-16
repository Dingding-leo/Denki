import type { StateCreator } from 'zustand';
import { db } from '../../db';
import { reviewCard } from '../../services/scheduler';
import { loadSchedulerParams } from '../../services/schedulerParams';
import { triggerAutoSave } from '../../services/backup';
import { ALL_DRILL_BUCKETS, filterDrillCards } from '../../services/drill';
import { buildStudyQueue, pickReinsertIndex } from '../../services/studyQueue';
import { toast } from '../uiStore';
import type { FlashcardState, StudySlice } from '../types';

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


async function refreshActiveDeckCards(get: () => FlashcardState): Promise<void> {
  const activeDeckId = get().activeDeckId;
  if (!activeDeckId) return;

  try {
    await get().loadCards(activeDeckId);
  } catch (error) {
    // The review transaction is already durable. A non-essential cache refresh
    // must never leave the learner staring at the same card and rating it twice.
    console.warn('Review saved, but the active deck cache could not refresh:', error);
  }
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


// Normal Study has no usage cap: every new card plus each review due
// now is eligible. Optional all-card practice bypasses the due filter.
let filteredCards = deckCards;
const isCram = forceCram || (deckCards.length > 0 && deckCards.every((card) => card.due === undefined));

if (!forceCram) {
  filteredCards = deckCards.filter((card) => {
    if (!card.lastReviewed || card.state === 0) return true;
    return new Date(card.due).getTime() <= now.getTime();
  });
}

// Every session receives a fresh shuffled order. Class-wide queues also
    // interleave decks when possible, preventing long blocks from one deck.
    const weightedQueue = buildStudyQueue(filteredCards);

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
  },

  startClassStudySession: async (classId, forceCram = false) => {
    const classCards = await db.cards.where('classId').equals(classId).toArray();
    const now = new Date();


let filteredCards = classCards;
const isCram = forceCram;

if (!forceCram) {
  filteredCards = classCards.filter((card) => {
    if (!card.lastReviewed || card.state === 0) return true;
    return new Date(card.due).getTime() <= now.getTime();
  });
}

// Every session receives a fresh shuffled order. Class-wide queues also
    // interleave decks when possible, preventing long blocks from one deck.
    const weightedQueue = buildStudyQueue(filteredCards);

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
  },

  startGlobalStudySession: async (forceCram = false) => {
    const allCards = await db.cards.toArray();
    const now = new Date();


let filteredCards = allCards;
if (!forceCram) {
  filteredCards = allCards.filter((card) => {
    if (!card.lastReviewed || card.state === 0) return true;
    return new Date(card.due).getTime() <= now.getTime();
  });
}

// A fresh mixed queue is mixed across the whole library. buildStudyQueue
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
  },

  startDrillSession: async (deckId, buckets = ALL_DRILL_BUCKETS) => {
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

      await refreshActiveDeckCards(get);

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
      if (!sessionRef.isDrill && rating <= 2) {
        const priorReinserts = history.filter(
          (entry) => entry.card.id === currentCard.id && entry.rating <= 2,
        ).length;
        const canReinsert = priorReinserts < MAX_REINSERTIONS;

        if (canReinsert) {
          const insertIndex = pickReinsertIndex(newQueue.length, nextIndex, rating);
          newQueue.splice(insertIndex, 0, updatedCard);
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
        await get().loadStats(sessionRef.isGlobal ? null : currentCard.classId);
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
        toast('Undo failed — the saved review was left unchanged', 'error');
        return;
      }

      await refreshActiveDeckCards(get);

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
        await get().loadStats(sessionRef.isGlobal ? null : lastEntry.card.classId);
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
