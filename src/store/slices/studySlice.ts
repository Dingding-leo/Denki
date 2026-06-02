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

  startStudySession: async (deckId) => {
    const deckCards = await db.cards.where('deckId').equals(deckId).toArray();
    
    // Build weighted queue using FSRS parameters and lastRating directly from the card
    // Lower confidence = more copies in the learning session
    const weightedQueue: Card[] = [];
    for (const card of deckCards) {
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
      },
    });
  },

  startClassStudySession: async (classId) => {
    const classCards = await db.cards.where('classId').equals(classId).toArray();
    
    // Build weighted queue using card.lastRating directly
    const weightedQueue: Card[] = [];
    for (const card of classCards) {
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
      },
    });
  },

  rateCard: async (rating) => {
    const state = get();
    if (!state.session) return;

    const { queue, currentIndex, completedCount } = state.session;
    const currentCard = queue[currentIndex];
    if (!currentCard) return;

    const now = new Date();
    const { updatedCard, log } = reviewCard(currentCard, rating, now);

    // Save confidence rating directly on the card
    updatedCard.lastRating = rating;

    // Save to IndexedDB within transaction
    await db.transaction('rw', [db.cards, db.reviews], async () => {
      if (currentCard.id) {
        await db.cards.put(updatedCard);
        await db.reviews.add({
          ...log,
          cardId: currentCard.id,
          classId: currentCard.classId,
        });
      }
    });

    // Refresh database buffers for 'cards' in memory (if managing card view is active)
    const activeDeckId = get().activeDeckId;
    if (activeDeckId) {
      await get().loadCards(activeDeckId);
    }

    // Re-insert card back into the queue at a distance based on confidence rating
    const newQueue = [...queue];
    const nextIndex = currentIndex + 1;
    const nextCompleted = completedCount + 1;

    const remaining = newQueue.length - nextIndex;
    let insertDistance: number;
    if (rating === 1) insertDistance = 3;                                              // 3 cards later
    else if (rating === 2) insertDistance = Math.max(5, Math.floor(remaining * 0.15)); // ~15% into remaining
    else if (rating === 3) insertDistance = Math.max(8, Math.floor(remaining * 0.35)); // ~35% into remaining
    else if (rating === 4) insertDistance = Math.max(12, Math.floor(remaining * 0.6)); // ~60% into remaining
    else insertDistance = Math.max(15, Math.floor(remaining * 0.85));                  // ~85% into remaining

    const insertIdx = Math.min(newQueue.length, nextIndex + insertDistance);
    newQueue.splice(insertIdx, 0, updatedCard);

    set({
      session: {
        ...state.session,
        queue: newQueue,
        currentIndex: nextIndex,
        completedCount: nextCompleted,
      },
    });

    // Update statistics asynchronously (non-blocking)
    await get().loadClassStats(currentCard.classId);
    await get().loadDeckStats(currentCard.classId);
    await get().loadStats(get().activeClassId);

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
