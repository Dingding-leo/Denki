import type { StateCreator } from 'zustand';
import { db } from '../../db';
import { triggerAutoSave } from '../../services/backup';
import type { ClassSlice, FlashcardState } from '../types';

/** Backfill lastRating for legacy cards without issuing one review query per card. */
async function syncLastRatings(): Promise<void> {
  const cards = await db.cards
    .filter((card) => card.lastReviewed !== undefined && card.lastRating === undefined)
    .toArray();
  const cardIds = cards
    .map((card) => card.id)
    .filter((id): id is number => id !== undefined);
  if (cardIds.length === 0) return;

  const reviews = await db.reviews.where('cardId').anyOf(cardIds).toArray();
  const latestByCard = new Map<number, { rating: number; reviewedAt: number }>();
  for (const review of reviews) {
    const reviewedAt = new Date(review.reviewedAt).getTime();
    const current = latestByCard.get(review.cardId);
    if (!current || reviewedAt > current.reviewedAt) {
      latestByCard.set(review.cardId, { rating: review.rating, reviewedAt });
    }
  }

  await db.transaction('rw', db.cards, async () => {
    for (const cardId of cardIds) {
      const latest = latestByCard.get(cardId);
      if (latest) await db.cards.update(cardId, { lastRating: latest.rating });
    }
  });
}

function cleanName(name: string, label: string): string {
  const cleaned = name.trim();
  if (!cleaned) throw new Error(`${label} name cannot be empty.`);
  return cleaned;
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
    await syncLastRatings();
    const classes = await db.classes.toArray();
    classes.sort((left, right) =>
      new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime());
    set({ classes });

    await Promise.all([
      get().loadAllClassStats(),
      get().loadStats(get().activeClassId),
    ]);
  },

  createClass: async (name, description) => {
    const id = await db.classes.add({
      name: cleanName(name, 'Class'),
      description: description.trim(),
      createdAt: new Date(),
    });
    await get().loadClasses();
    triggerAutoSave();
    return id;
  },

  updateClass: async (classId, name, description) => {
    const cleanedName = cleanName(name, 'Class');
    const cleanedDescription = description.trim();
    const updated = await db.classes.update(classId, {
      name: cleanedName,
      description: cleanedDescription,
    });
    if (updated === 0) throw new Error('Class not found');

    set((state) => ({
      classes: state.classes.map((studyClass) =>
        studyClass.id === classId
          ? { ...studyClass, name: cleanedName, description: cleanedDescription }
          : studyClass),
    }));
    triggerAutoSave();
  },

  deleteClass: async (classId) => {
    const studyClass = await db.classes.get(classId);
    if (!studyClass) return;
    const classDecks = await db.decks.where('classId').equals(classId).toArray();
    const deletedDeckIds = new Set(
      classDecks.map((deck) => deck.id).filter((id): id is number => id !== undefined),
    );

    await db.transaction('rw', [db.classes, db.decks, db.cards, db.reviews], async () => {
      await db.classes.delete(classId);
      await db.decks.where('classId').equals(classId).delete();
      await db.cards.where('classId').equals(classId).delete();
      await db.reviews.where('classId').equals(classId).delete();
    });

    const deletingActiveClass = get().activeClassId === classId;
    const deletingActiveDeck = get().activeDeckId !== null && deletedDeckIds.has(get().activeDeckId!);
    const sessionUsesClass = get().session?.queue.some((card) => card.classId === classId) ?? false;
    const remainingActiveClassId = deletingActiveClass ? null : get().activeClassId;
    const remainingActiveDeckId = deletingActiveDeck ? null : get().activeDeckId;

    set((state) => ({
      activeClassId: remainingActiveClassId,
      activeDeckId: remainingActiveDeckId,
      cards: deletingActiveDeck ? [] : state.cards,
      session: sessionUsesClass ? null : state.session,
      deckStats: Object.fromEntries(
        Object.entries(state.deckStats).filter(([deckId]) => !deletedDeckIds.has(Number(deckId))),
      ),
    }));

    await Promise.all([
      get().loadClasses(),
      get().loadDecks(remainingActiveClassId ?? undefined),
      remainingActiveDeckId
        ? get().loadCards(remainingActiveDeckId)
        : Promise.resolve(),
    ]);
    triggerAutoSave();
  },
});
