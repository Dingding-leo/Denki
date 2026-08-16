import type { StateCreator } from 'zustand';
import { db } from '../../db';
import { triggerAutoSave } from '../../services/backup';
import { STATES } from '../../services/scheduler';
import type { DeckSlice, FlashcardState } from '../types';

let latestDecksRequest = 0;

function cleanDeckName(name: string): string {
  const cleaned = name.trim();
  if (!cleaned) throw new Error('Deck name cannot be empty.');
  return cleaned;
}

export const createDeckSlice: StateCreator<
  FlashcardState,
  [],
  [],
  DeckSlice
> = (set, get) => ({
  decks: [],
  activeDeckId: null,

  loadDecks: async (classId) => {
    const requestId = ++latestDecksRequest;
    const decks = classId !== undefined
      ? await db.decks.where('classId').equals(classId).toArray()
      : await db.decks.toArray();
    decks.sort((left, right) =>
      new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime());

    // Rapid route changes can resolve out of order. Only the most recent scope
    // may replace the visible deck list or trigger its follow-up statistics load.
    if (requestId !== latestDecksRequest) return;
    set({ decks });

    if (classId !== undefined) await get().loadDeckStats(classId);
  },

  createDeck: async (classId, name, description) => {
    if (!await db.classes.get(classId)) throw new Error('Parent class not found.');
    const id = await db.decks.add({
      classId,
      name: cleanDeckName(name),
      description: description.trim(),
      createdAt: new Date(),
    });

    await Promise.all([
      get().loadDecks(classId),
      get().loadClassStats(classId),
    ]);
    triggerAutoSave();
    return id;
  },

  updateDeck: async (deckId, name, description) => {
    const cleanedName = cleanDeckName(name);
    const cleanedDescription = description.trim();
    const updated = await db.decks.update(deckId, {
      name: cleanedName,
      description: cleanedDescription,
    });
    if (updated === 0) throw new Error('Deck not found');

    set((state) => ({
      decks: state.decks.map((deck) =>
        deck.id === deckId
          ? { ...deck, name: cleanedName, description: cleanedDescription }
          : deck),
    }));
    triggerAutoSave();
  },

  deleteDeck: async (deckId) => {
    const deck = await db.decks.get(deckId);
    if (!deck) return;

    await db.transaction('rw', [db.decks, db.cards, db.reviews], async () => {
      await db.decks.delete(deckId);
      await db.cards.where('deckId').equals(deckId).delete();
      await db.reviews.where('deckId').equals(deckId).delete();
    });

    const deletedActiveDeck = get().activeDeckId === deckId;
    const remainingActiveDeckId = deletedActiveDeck ? null : get().activeDeckId;
    const sessionUsesDeck = get().session?.queue.some((card) => card.deckId === deckId) ?? false;
    set((state) => {
      const remainingDeckStats = { ...state.deckStats };
      delete remainingDeckStats[deckId];
      return {
        activeDeckId: remainingActiveDeckId,
        cards: deletedActiveDeck ? [] : state.cards,
        session: sessionUsesDeck ? null : state.session,
        deckStats: remainingDeckStats,
      };
    });

    await Promise.all([
      get().loadDecks(deck.classId),
      remainingActiveDeckId
        ? get().loadCards(remainingActiveDeckId)
        : Promise.resolve(),
      get().loadClassStats(deck.classId),
      get().loadStats(get().activeClassId),
    ]);
    triggerAutoSave();
  },

  saveDeckNotes: async (deckId, notes) => {
    const updated = await db.decks.update(deckId, { notes });
    if (updated === 0) throw new Error('Deck not found');
    set((state) => ({
      decks: state.decks.map((deck) => deck.id === deckId ? { ...deck, notes } : deck),
    }));
    triggerAutoSave();
  },

  resetDeckProgress: async (deckId) => {
    const [deck, deckCards] = await Promise.all([
      db.decks.get(deckId),
      db.cards.where('deckId').equals(deckId).toArray(),
    ]);
    if (!deck) throw new Error('Deck not found');
    if (deckCards.length === 0) return;

    await db.transaction('rw', [db.cards, db.reviews], async () => {
      const now = new Date();
      for (const card of deckCards) {
        if (!card.id) continue;
        await db.cards.update(card.id, {
          state: STATES.New,
          stability: 0,
          difficulty: 0,
          elapsedDays: 0,
          scheduledDays: 0,
          due: now,
          lastReviewed: undefined,
          lastRating: undefined,
        });
      }
      await db.reviews.where('deckId').equals(deckId).delete();
    });

    const sessionUsesDeck = get().session?.queue.some((card) => card.deckId === deckId) ?? false;
    if (sessionUsesDeck) set({ session: null });

    const activeDeckId = get().activeDeckId;
    await Promise.all([
      activeDeckId ? get().loadCards(activeDeckId) : Promise.resolve(),
      get().loadDeckStats(deck.classId),
      get().loadClassStats(deck.classId),
      get().loadStats(get().activeClassId),
    ]);
    triggerAutoSave();
  },
});
