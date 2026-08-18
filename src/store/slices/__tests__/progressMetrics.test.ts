import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '../../../db';
import type { Card } from '../../../db/schema';
import { STATES } from '../../../services/scheduler';
import { useFlashcardStore } from '../../useFlashcardStore';

async function seedScope() {
  const classId = await db.classes.add({
    name: 'Progress semantics',
    description: '',
    createdAt: new Date(),
  });
  const deckId = await db.decks.add({
    classId,
    name: 'Mixed states',
    description: '',
    createdAt: new Date(),
  });
  return { classId, deckId };
}

function cardForState(classId: number, deckId: number, state: number): Card {
  const now = new Date();
  return {
    classId,
    deckId,
    front: `State ${state}`,
    back: 'Answer',
    cardType: 'standard',
    createdAt: now,
    state,
    stability: state === STATES.New ? 0 : 1,
    difficulty: state === STATES.New ? 0 : 5,
    elapsedDays: 0,
    scheduledDays: state === STATES.New ? 0 : 1,
    due: new Date(now.getTime() + 24 * 60 * 60 * 1000),
    lastReviewed: state === STATES.New ? undefined : now,
  };
}

describe('truthful progress metrics', () => {
  beforeEach(async () => {
    await Promise.all([
      db.reviews.clear(),
      db.cards.clear(),
      db.decks.clear(),
      db.classes.clear(),
    ]);
    useFlashcardStore.setState({
      classes: [],
      decks: [],
      classStats: {},
      deckStats: {},
    });
  });

  it('reports the percentage in FSRS Review state without calling it mastery', async () => {
    const { classId, deckId } = await seedScope();
    await db.cards.bulkAdd([
      cardForState(classId, deckId, STATES.New),
      cardForState(classId, deckId, STATES.Learning),
      cardForState(classId, deckId, STATES.Review),
      cardForState(classId, deckId, STATES.Relearning),
    ]);

    await Promise.all([
      useFlashcardStore.getState().loadClassStats(classId),
      useFlashcardStore.getState().loadDeckStats(classId),
    ]);

    expect(useFlashcardStore.getState().classStats[classId]).toMatchObject({
      total: 4,
      reviewStatePct: 25,
    });
    expect(useFlashcardStore.getState().deckStats[deckId]).toMatchObject({
      total: 4,
      reviewStatePct: 25,
    });
  });

  it('reports zero Review-state percentage for an empty class and deck', async () => {
    const { classId, deckId } = await seedScope();

    await Promise.all([
      useFlashcardStore.getState().loadClassStats(classId),
      useFlashcardStore.getState().loadDeckStats(classId),
    ]);

    expect(useFlashcardStore.getState().classStats[classId]?.reviewStatePct).toBe(0);
    expect(useFlashcardStore.getState().deckStats[deckId]?.reviewStatePct).toBe(0);
  });
});
