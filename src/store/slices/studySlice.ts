import type { StateCreator } from 'zustand';
import { db } from '../../db';
import type { Card } from '../../db/schema';
import { reviewCard } from '../../services/scheduler';
import { triggerAutoSave } from '../../services/backup';
import type { FlashcardState, StudySlice } from '../types';

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

    // Build weighted queue using FSRS parameters and lastRating directly from the card
    const weightedQueue: Card[] = [];
    for (const card of filteredCards) {
      const rating = card.lastRating ?? 0; // 0 = unseen / new
      let copies: number;
      if (rating <= 1) copies = 5;       // Unseen or Rating 1 (Again)
      else if (rating === 2) copies = 4; // Rating 2 (Hard)
      else if (rating === 3) copies = 3; // Rating 3 (Good)
      else if (rating === 4) copies = 2; // Rating 4 (Easy)
      else copies = 1;                   // Rating 5 (Perfect)
      
      for (let i = 0; i < copies; i++) {
        weightedQueue.push(card);
      }
    }
    
    // Shuffle using Fisher-Yates
    for (let i = weightedQueue.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [weightedQueue[i], weightedQueue[j]] = [weightedQueue[j], weightedQueue[i]];
    }

    set({
      session: {
        deckId,
        queue: weightedQueue,
        currentIndex: 0,
        completedCount: 0,
        initialQueueSize: weightedQueue.length,
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

    // Build weighted queue using card.lastRating directly
    const weightedQueue: Card[] = [];
    for (const card of filteredCards) {
      const rating = card.lastRating ?? 0;
      let copies: number;
      if (rating <= 1) copies = 5;
      else if (rating === 2) copies = 4;
      else if (rating === 3) copies = 3;
      else if (rating === 4) copies = 2;
      else copies = 1;
      
      for (let i = 0; i < copies; i++) {
        weightedQueue.push(card);
      }
    }
    
    // Fisher-Yates shuffle
    for (let i = weightedQueue.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [weightedQueue[i], weightedQueue[j]] = [weightedQueue[j], weightedQueue[i]];
    }

    set({
      session: {
        classId,
        queue: weightedQueue,
        currentIndex: 0,
        completedCount: 0,
        initialQueueSize: weightedQueue.length,
        isCram,
        history: [],
      },
    });
  },

  rateCard: async (rating) => {
    const state = get();
    if (!state.session) return;

    const { queue, currentIndex, completedCount, history } = state.session;
    const currentCard = queue[currentIndex];
    if (!currentCard) return;

    const now = new Date();

    // Fetch custom FSRS algorithm settings from localStorage
    const savedRetention = localStorage.getItem('denki-fsrs-retention');
    const savedEasyBonus = localStorage.getItem('denki-fsrs-easy-bonus');
    const savedHardMultiplier = localStorage.getItem('denki-fsrs-hard-multiplier');
    const params = {
      requestRetention: savedRetention ? parseFloat(savedRetention) : 0.9,
      easyBonus: savedEasyBonus ? parseFloat(savedEasyBonus) : 1.3,
      hardIntervalMultiplier: savedHardMultiplier ? parseFloat(savedHardMultiplier) : 1.2,
    };

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

    // Re-insert card back into the queue ONLY for low-confidence ratings.
    // Cards rated 3+ are handled by the FSRS scheduler for future sessions.
    const newQueue = [...queue];
    const nextIndex = currentIndex + 1;
    const nextCompleted = completedCount + 1;

    let insertedIdx: number | undefined;
    if (rating <= 2) {
      const remaining = newQueue.length - nextIndex;
      let insertDistance: number;
      if (rating === 1) insertDistance = 3;                                              // 3 cards later
      else insertDistance = Math.max(5, Math.floor(remaining * 0.15));                   // ~15% into remaining

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
        ...state.session,
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
      get().loadStats(get().activeClassId),
    ]).catch(console.warn);

    triggerAutoSave();
  },

  undoLastRate: async () => {
    const state = get();
    if (!state.session) return;
    
    const { history, queue, currentIndex, completedCount } = state.session;
    if (!history || history.length === 0) return;

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
        ...state.session,
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
      get().loadStats(get().activeClassId),
    ]).catch(console.warn);

    triggerAutoSave();
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
