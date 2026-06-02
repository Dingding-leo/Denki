import type { StateCreator } from 'zustand';
import { db } from '../../db';
import { triggerAutoSave } from '../../services/backup';
import type { FlashcardState, ClassSlice } from '../types';

async function syncLastRatings() {
  const unmigratedCards = await db.cards
    .filter((c) => c.lastReviewed !== undefined && c.lastRating === undefined)
    .toArray();

  if (unmigratedCards.length === 0) return;

  await db.transaction('rw', [db.cards, db.reviews], async () => {
    for (const card of unmigratedCards) {
      if (!card.id) continue;
      const cardReviews = await db.reviews
        .where('cardId')
        .equals(card.id)
        .toArray();
      
      if (cardReviews.length > 0) {
        cardReviews.sort((a, b) => new Date(a.reviewedAt).getTime() - new Date(b.reviewedAt).getTime());
        const lastReview = cardReviews[cardReviews.length - 1];
        await db.cards.update(card.id, { lastRating: lastReview.rating });
      }
    }
  });
}

export const createClassSlice: StateCreator<
  FlashcardState,
  [],
  [],
  ClassSlice
> = (set, get) => ({
  classes: [],
  activeClassId: null,

  loadClasses: async () => {
    // Run database migration check to sync lastRating
    await syncLastRatings();

    const allClasses = await db.classes.toArray();
    // Sort classes: newer first
    allClasses.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    
    set({ classes: allClasses });
    
    // Asynchronously calculate class stats & global stats (doesn't block UI)
    await get().loadAllClassStats();
    await get().loadStats(get().activeClassId);
  },

  createClass: async (name, description) => {
    const id = await db.classes.add({
      name,
      description,
      createdAt: new Date(),
    });
    
    await get().loadClasses();
    triggerAutoSave();
    return id;
  },

  deleteClass: async (classId) => {
    await db.transaction('rw', [db.classes, db.decks, db.cards, db.reviews], async () => {
      await db.classes.delete(classId);
      await db.decks.where('classId').equals(classId).delete();
      await db.cards.where('classId').equals(classId).delete();
      await db.reviews.where('classId').equals(classId).delete();
    });

    // Reset active class/deck selection if deleted
    let newActiveClassId = get().activeClassId;
    let newActiveDeckId = get().activeDeckId;
    if (newActiveClassId === classId) {
      newActiveClassId = null;
      newActiveDeckId = null;
    }

    set({ 
      activeClassId: newActiveClassId, 
      activeDeckId: newActiveDeckId 
    });

    await get().loadClasses();
    await get().loadDecks(newActiveClassId || undefined);
    await get().loadCards(newActiveDeckId || undefined);
    
    triggerAutoSave();
  },
});
