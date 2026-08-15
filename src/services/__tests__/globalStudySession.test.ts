import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '../../db';
import type { Card } from '../../db/schema';
import { useFlashcardStore } from '../../store/useFlashcardStore';
import { restorePersistedStudySession } from '../studySessionPersistence';
import { STATES } from '../scheduler';

function cardFixture(
  classId: number,
  deckId: number,
  front: string,
  overrides: Partial<Card> = {},
): Card {
  return {
    classId,
    deckId,
    front,
    back: `Answer: ${front}`,
    cardType: 'standard',
    createdAt: new Date(),
    state: STATES.New,
    stability: 0,
    difficulty: 0,
    elapsedDays: 0,
    scheduledDays: 0,
    due: new Date(),
    ...overrides,
  };
}

async function seedLibrary() {
  const classOne = await db.classes.add({ name: 'One', description: '', createdAt: new Date() });
  const classTwo = await db.classes.add({ name: 'Two', description: '', createdAt: new Date() });
  const deckOne = await db.decks.add({ classId: classOne, name: 'A', description: '', createdAt: new Date() });
  const deckTwo = await db.decks.add({ classId: classTwo, name: 'B', description: '', createdAt: new Date() });

  const dueOne = await db.cards.add(cardFixture(classOne, deckOne, 'Due one'));
  const dueTwo = await db.cards.add(cardFixture(classTwo, deckTwo, 'Due two'));
  const future = await db.cards.add(cardFixture(classTwo, deckTwo, 'Future', {
    state: STATES.Review,
    stability: 10,
    difficulty: 5,
    lastReviewed: new Date(),
    due: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
  }));

  return { classOne, classTwo, deckOne, deckTwo, dueOne, dueTwo, future };
}

describe("today's mixed review", () => {
  beforeEach(async () => {
    window.localStorage.clear();
    useFlashcardStore.setState({
      session: null,
      activeDeckId: null,
      activeClassId: null,
      decks: [],
      classes: [],
    });
    await Promise.all([
      db.reviews.clear(),
      db.cards.clear(),
      db.decks.clear(),
      db.classes.clear(),
    ]);
  });

  it('builds one due-only queue across classes and decks', async () => {
    const seeded = await seedLibrary();

    await useFlashcardStore.getState().startGlobalStudySession();
    const session = useFlashcardStore.getState().session!;

    expect(session.isGlobal).toBe(true);
    expect(session.totalCards).toBe(3);
    expect(new Set(session.queue.map((card) => card.id))).toEqual(
      new Set([seeded.dueOne, seeded.dueTwo]),
    );
    expect(new Set(session.queue.map((card) => card.classId))).toEqual(
      new Set([seeded.classOne, seeded.classTwo]),
    );
    expect(session.queue.some((card) => card.id === seeded.future)).toBe(false);
  });

  it('includes future cards only when mixed practice is explicitly started', async () => {
    const seeded = await seedLibrary();

    await useFlashcardStore.getState().startGlobalStudySession(true);
    const session = useFlashcardStore.getState().session!;

    expect(session.isGlobal).toBe(true);
    expect(session.isCram).toBe(true);
    expect(new Set(session.queue.map((card) => card.id))).toEqual(
      new Set([seeded.dueOne, seeded.dueTwo, seeded.future]),
    );
  });

  it('persists and restores only under the global scope', async () => {
    const seeded = await seedLibrary();

    await useFlashcardStore.getState().startGlobalStudySession();
    const restored = await restorePersistedStudySession({ isGlobal: true });

    expect(restored?.isGlobal).toBe(true);
    expect(restored?.queue).toHaveLength(2);
    expect(await restorePersistedStudySession({ deckId: seeded.deckOne })).toBeNull();
    expect(await restorePersistedStudySession({ classId: seeded.classOne })).toBeNull();
  });
});
