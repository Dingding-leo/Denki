import type { StateCreator } from 'zustand';
import { db } from '../../db';
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

export const createCardSlice: StateCreator<
  FlashcardState,
  [],
  [],
  CardSlice
> = (set, get) => ({
  cards: [],

  loadCards: async (deckId) => {
    const allCards = deckId !== undefined
      ? await db.cards.where('deckId').equals(deckId).toArray()
      : await db.cards.toArray();
    set({ cards: allCards });
  },

  createCard: async (classId, deckId, front, back, cardType) => {
    await assertCardDestination(classId, deckId);
    const now = new Date();
    const id = await db.cards.add({
      classId,
      deckId,
      front,
      back,
      cardType,
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

    const updated = await db.cards.update(cardId, { front, back, cardType });
    if (updated === 0) throw new Error('Card not found');

    await Promise.all([
      get().loadCards(card.deckId),
      get().loadClassStats(card.classId),
      get().loadDeckStats(card.classId),
      get().loadStats(get().activeClassId),
    ]);

    triggerAutoSave();
  },

  deleteCard: async (cardId) => {
    const card = await db.cards.get(cardId);
    if (!card) return;

    await db.transaction('rw', [db.cards, db.reviews], async () => {
      await db.cards.delete(cardId);
      await db.reviews.where('cardId').equals(cardId).delete();
    });

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
    for (const card of cardsToCreate) {
      destinationPairs.set(`${card.classId}:${card.deckId}`, {
        classId: card.classId,
        deckId: card.deckId,
      });
    }
    await Promise.all(
      [...destinationPairs.values()].map(({ classId, deckId }) =>
        assertCardDestination(classId, deckId)),
    );

    const now = new Date();
    await db.cards.bulkAdd(cardsToCreate.map((card) => ({
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

    const classIds = [...new Set(cardsToCreate.map((card) => card.classId))];
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

      // Store non-zero post-set stability so this manual adjustment is not
      // mistaken for a newly introduced card by the daily-limit calculation.
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

    // Parse and validate the complete file before this single write. A malformed
    // CSV or storage failure therefore leaves the destination deck unchanged.
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
