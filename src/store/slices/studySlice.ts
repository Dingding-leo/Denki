import type { StateCreator } from 'zustand';
import { db } from '../../db';
import type { Card } from '../../db/schema';
import { reviewCard } from '../../services/scheduler';
import { loadSchedulerParams } from '../../services/schedulerParams';
import { triggerAutoSave } from '../../services/backup';
import type { FlashcardState, StudySlice } from '../types';

// Guards rateCard/undoLastRate so two concurrent mutations can't read the same
// pre-await session snapshot and desync the in-memory queue/history from the DB.
let isMutatingSession = false;

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
    
    if (!forceCram) {
      filteredCards = deckCards.filter(card => {
        // If it's a new card (no lastReviewed or state is 0), it's due
        if (!card.lastReviewed || card.state === 0) return true;
        // Otherwise, check if due date is in the past
        return new Date(card.due).getTime() <= now.getTime();
      });
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
  },

  startClassStudySession: async (classId, forceCram = false) => {
    const classCards = await db.cards.where('classId').equals(classId).toArray();
    const now = new Date();

    let filteredCards = classCards;
    const isCram = forceCram;

    if (!forceCram) {
      filteredCards = classCards.filter(card => {
        if (!card.lastReviewed || card.state === 0) return true;
        return new Date(card.due).getTime() <= now.getTime();
      });
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
        console.error('Failed to save card review:', err);
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

      let insertedIdx: number | undefined;
      if (rating <= 2) {
        const remaining = newQueue.length - nextIndex;
        let insertDistance: number;
        if (rating === 1) insertDistance = 3;                                            // 3 cards later
        else insertDistance = Math.max(5, Math.floor(remaining * 0.15));                 // ~15% into remaining

        const insertIdx = Math.min(newQueue.length, nextIndex + insertDistance);
        newQueue.splice(insertIdx, 0, updatedCard);
        insertedIdx = insertIdx;
      }

      // Record this rating action to history for undo capabilities
      const historyEntry = {
        card: { ...currentCard }, // Shallow copy to preserve state
        rating,
        reviewLogId: logId,
        insertedIdx,
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

      // Update statistics asynchronously (fire-and-forget to avoid blocking the UI)
      Promise.all([
        get().loadClassStats(currentCard.classId),
        get().loadDeckStats(currentCard.classId),
        // Scope the streak/global stats to the class being studied, not whatever
        // class is selected in the nav (which may differ for a deck session).
        get().loadStats(currentCard.classId),
      ]).catch(console.warn);

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
    const { history, queue, currentIndex, completedCount } = sessionRef;
    if (!history || history.length === 0) return;

    isMutatingSession = true;
    try {
      // Pop the last history entry
      const lastEntry = history[history.length - 1];
      const newHistory = history.slice(0, -1);

      // Rollback the card database record and delete the review log
      try {
        await db.transaction('rw', [db.cards, db.reviews], async () => {
          // Restore card to its previous state
          await db.cards.put(lastEntry.card);
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

      // Remove the reinserted card from the queue if it was inserted
      const newQueue = [...queue];
      if (lastEntry.insertedIdx !== undefined) {
        newQueue.splice(lastEntry.insertedIdx, 1);
      }

      // Restore the card at the previous index to its original state
      const prevIndex = currentIndex - 1;
      newQueue[prevIndex] = lastEntry.card;

      set({
        session: {
          ...sessionRef,
          queue: newQueue,
          currentIndex: prevIndex,
          completedCount: Math.max(0, completedCount - 1),
          history: newHistory,
        },
      });

      // Update stats asynchronously (fire-and-forget)
      Promise.all([
        get().loadClassStats(lastEntry.card.classId),
        get().loadDeckStats(lastEntry.card.classId),
        get().loadStats(lastEntry.card.classId),
      ]).catch(console.warn);

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
    set({ session: null });
  },
});
