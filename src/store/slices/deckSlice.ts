import type { StateCreator } from 'zustand';
import { db } from '../../db';
import { STATES } from '../../services/scheduler';
import { triggerAutoSave } from '../../services/backup';
import type { FlashcardState, DeckSlice } from '../types';

export const createDeckSlice: StateCreator<
  FlashcardState,
  [],
  [],
  DeckSlice
> = (set, get) => ({
  decks: [],
  activeDeckId: null,

  loadDecks: async (classId) => {
    let allDecks;
    if (classId !== undefined) {
      allDecks = await db.decks.where('classId').equals(classId).toArray();
    } else {
      allDecks = await db.decks.toArray();
    }
    
    // Sort: newer first
    allDecks.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    set({ decks: allDecks });

    // Compute deck stats for this class
    if (classId !== undefined) {
      await get().loadDeckStats(classId);
    }
  },

  createDeck: async (classId, name, description) => {
    const id = await db.decks.add({
      classId,
      name,
      description,
      createdAt: new Date(),
    });
    
    await get().loadDecks(classId);
    
    // Refresh parent class stats
    await get().loadClassStats(classId);
    
    triggerAutoSave();
    return id;
  },

  deleteDeck: async (deckId) => {
    const deck = await db.decks.get(deckId);
    if (!deck) return;

    await db.transaction('rw', [db.decks, db.cards, db.reviews], async () => {
      await db.decks.delete(deckId);
      await db.cards.where('deckId').equals(deckId).delete();
      await db.reviews.where('deckId').equals(deckId).delete();
    });

    // Reset active deck if deleted
    let newActiveDeckId = get().activeDeckId;
    if (newActiveDeckId === deckId) {
      set({ activeDeckId: null });
      newActiveDeckId = null;
    }

    await get().loadDecks(deck.classId);
    await get().loadCards(newActiveDeckId || undefined);
    
    // Refresh stats
    await get().loadClassStats(deck.classId);
    await get().loadStats(get().activeClassId);

    triggerAutoSave();
  },

  saveDeckNotes: async (deckId, notes) => {
    await db.decks.update(deckId, { notes });
    const updatedDecks = get().decks.map(d => d.id === deckId ? { ...d, notes } : d);
    set({ decks: updatedDecks });
    triggerAutoSave();
  },

  resetDeckProgress: async (deckId) => {
    const deckCards = await db.cards.where('deckId').equals(deckId).toArray();
    if (deckCards.length === 0) return;

    const deck = await db.decks.get(deckId);
    const parentClassId = deck?.classId;

    await db.transaction('rw', [db.cards, db.reviews], async () => {
      const now = new Date();
      for (const card of deckCards) {
        if (card.id) {
          await db.cards.update(card.id, {
            state: STATES.New,
            stability: 0,
            difficulty: 0,
            elapsedDays: 0,
            scheduledDays: 0,
            due: now,
            lastReviewed: undefined,
            lastRating: undefined, // Reset confidence value too
          });
        }
      }

      await db.reviews.where('deckId').equals(deckId).delete();
    });

    // Reload active cards list
    const activeDeckId = get().activeDeckId;
    if (activeDeckId) {
      await get().loadCards(activeDeckId);
    } else {
      await get().loadCards();
    }

    // Refresh deck/class/global stats
    if (parentClassId) {
      await get().loadDeckStats(parentClassId);
      await get().loadClassStats(parentClassId);
    }
    await get().loadStats(get().activeClassId);

    triggerAutoSave();
  },
});
