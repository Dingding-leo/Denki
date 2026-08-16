import type { StateCreator } from 'zustand';
import { db } from '../../db';
import type { CardType } from '../../db/schema';
import { triggerAutoSave } from '../../services/backup';
import { createCSVImportPlan } from '../../services/csvImport';
import { STATES } from '../../services/scheduler';
import type { CardSlice, FlashcardState } from '../types';

async function assertCardDestination(classId: number, deckId: number): Promise<void> {
  const [studyClass, deck] = await Promise.all([
    db.classes.get(classId),
    db.decks.get(deckId),
  ]);

  if (!studyClass) throw new Error('Destination class was not found.');
  if (!deck || deck.classId !== classId) {
    throw new Error('Destination deck does not belong to the selected class.');
  }
}

function normalizeCardContent(
  front: string,
  back: string,
  cardType: CardType,
): { front: string; back: string; cardType: CardType } {
  const cleanedFront = front.trim();
  const cleanedBack = back.trim();
  if (!cleanedFront) throw new Error('Card front cannot be empty.');
  if (cardType === 'standard' && !cleanedBack) {
    throw new Error('A standard card needs an answer.');
  }
  return { front: cleanedFront, back: cleanedBack, cardType };
}

function sessionContainsCard(state: FlashcardState, cardId: number): boolean {
  return state.session?.queue.some((card) => card.id === cardId) ?? false;
}

export const createCardSlice: StateCreator<
  FlashcardState,
  [],
  [],
  CardSlice
> = (set, get) => ({
  cards: [],

  loadCards: async (deckId) => {
    const cards = deckId !== undefined
      ? await db.cards.where('deckId').equals(deckId).toArray()
      : await db.cards.toArray();
    set({ cards });
  },

  createCard: async (classId, deckId, front, back, cardType) => {
    await assertCardDestination(classId, deckId);
    const content = normalizeCardContent(front, back, cardType);
    const now = new Date();
    const id = await db.cards.add({
      classId,
      deckId,
      ...content,
      createdAt: now,
      state: STATES.New,
      stability: 0,
      difficulty: 0,
      elapsedDays: 0,
      scheduledDays: 0,
      due: now,
    });

    await Promise.all([
      get().loadCards(deckId),
      get().loadClassStats(classId),
      get().loadDeckStats(classId),
      get().loadStats(get().activeClassId),
    ]);

    triggerAutoSave();
    return id;
  },

  updateCard: async (cardId, front, back, cardType) => {
    const card = await db.cards.get(cardId);
    if (!card) throw new Error('Card not found');
    const content = normalizeCardContent(front, back, cardType);

    const updated = await db.cards.update(cardId, content);
    if (updated === 0) throw new Error('Card not found');

    if (sessionContainsCard(get(), cardId)) set({ session: null });
    await get().loadCards(card.deckId);
    triggerAutoSave();
  },

  deleteCard: async (cardId) => {
    const card = await db.cards.get(cardId);
    if (!card) return;

    await db.transaction('rw', [db.cards, db.reviews], async () => {
      await db.cards.delete(cardId);
      await db.reviews.where('cardId').equals(cardId).delete();
    });

    if (sessionContainsCard(get(), cardId)) set({ session: null });
    await Promise.all([
      get().loadCards(card.deckId),
      get().loadClassStats(card.classId),
      get().loadDeckStats(card.classId),
      get().loadStats(get().activeClassId),
    ]);

    triggerAutoSave();
  },

  bulkCreateCards: async (cardsToCreate) => {
    if (cardsToCreate.length === 0) return;

    const destinationPairs = new Map<string, { classId: number; deckId: number }>();
    const normalizedCards = cardsToCreate.map((card) => {
      destinationPairs.set(`${card.classId}:${card.deckId}`, {
        classId: card.classId,
        deckId: card.deckId,
      });
      return { ...card, ...normalizeCardContent(card.front, card.back, card.cardType) };
    });

    await Promise.all(
      [...destinationPairs.values()].map(({ classId, deckId }) =>
        assertCardDestination(classId, deckId)),
    );

    const now = new Date();
    await db.cards.bulkAdd(normalizedCards.map((card) => ({
      classId: card.classId,
      deckId: card.deckId,
      front: card.front,
      back: card.back,
      cardType: card.cardType,
      createdAt: now,
      state: STATES.New,
      stability: 0,
      difficulty: 0,
      elapsedDays: 0,
      scheduledDays: 0,
      due: now,
    })));

    const classIds = [...new Set(normalizedCards.map((card) => card.classId))];
    const activeDeckId = get().activeDeckId;
    await Promise.all([
      activeDeckId ? get().loadCards(activeDeckId) : Promise.resolve(),
      ...classIds.map((classId) => get().loadClassStats(classId)),
      ...classIds.map((classId) => get().loadDeckStats(classId)),
      get().loadStats(get().activeClassId),
    ]);

    triggerAutoSave();
  },

  manuallySetCardConfidence: async (cardId, rating) => {
    if (!Number.isInteger(rating) || rating < 0 || rating > 4) {
      throw new Error('Manual confidence must be Reset (0), Again, Hard, Good, or Easy.');
    }

    const card = await db.cards.get(cardId);
    if (!card) throw new Error('Card not found');

    await db.transaction('rw', [db.cards, db.reviews], async () => {
      if (rating === 0) {
        await db.reviews.where('cardId').equals(cardId).delete();
        await db.cards.update(cardId, {
          state: STATES.New,
          stability: 0,
          difficulty: 0,
          elapsedDays: 0,
          scheduledDays: 0,
          due: new Date(),
          lastReviewed: undefined,
          lastRating: undefined,
        });
        return;
      }

      let difficulty = 4.5;
      let stability = 0.15;
      let state = STATES.Review;
      if (rating === 1) {
        difficulty = 8.5;
        stability = 0.003;
        state = STATES.Learning;
      } else if (rating === 2) {
        difficulty = 6.5;
        stability = 0.04;
      } else if (rating === 4) {
        difficulty = 1.5;
        stability = 1;
      }

      const scheduledDays = Number(stability.toFixed(4));
      const reviewedAt = new Date();
      const due = new Date(reviewedAt.getTime() + scheduledDays * 24 * 60 * 60 * 1000);

      await db.cards.update(cardId, {
        state,
        stability,
        difficulty,
        elapsedDays: 0.0001,
        scheduledDays,
        due,
        lastReviewed: reviewedAt,
        lastRating: rating,
      });

      await db.reviews.add({
        cardId,
        deckId: card.deckId,
        classId: card.classId,
        reviewedAt,
        rating,
        stability,
        difficulty,
        elapsedDays: 0.0001,
        scheduledDays,
      });
    });

    if (sessionContainsCard(get(), cardId)) set({ session: null });
    const activeDeckId = get().activeDeckId;
    await Promise.all([
      activeDeckId ? get().loadCards(activeDeckId) : Promise.resolve(),
      get().loadClassStats(card.classId),
      get().loadDeckStats(card.classId),
      get().loadStats(get().activeClassId),
    ]);

    triggerAutoSave();
  },

  importFromCSV: async (classId, deckId, csvText) => {
    await assertCardDestination(classId, deckId);
    const plan = createCSVImportPlan(csvText);
    if (plan.cards.length === 0) {
      return { success: 0, failed: plan.failed };
    }

    const now = new Date();
    const entries = plan.cards.map((card) => ({
      classId,
      deckId,
      front: card.front,
      back: card.back,
      cardType: card.cardType,
      createdAt: now,
      state: STATES.New,
      stability: 0,
      difficulty: 0,
      elapsedDays: 0,
      scheduledDays: 0,
      due: now,
    }));

    await db.cards.bulkAdd(entries);
    await Promise.all([
      get().loadCards(deckId),
      get().loadClassStats(classId),
      get().loadDeckStats(classId),
      get().loadStats(get().activeClassId),
    ]);

    triggerAutoSave();
    return { success: entries.length, failed: plan.failed };
  },
});
