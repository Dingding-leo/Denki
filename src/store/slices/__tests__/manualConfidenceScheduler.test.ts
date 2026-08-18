import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '../../../db';
import { STATES } from '../../../services/scheduler';
import { useFlashcardStore } from '../../useFlashcardStore';

async function setup() {
  const classId = await db.classes.add({
    name: 'Class',
    description: '',
    createdAt: new Date(),
  });
  const deckId = await db.decks.add({
    classId,
    name: 'Deck',
    description: '',
    createdAt: new Date(),
  });
  const cardId = await useFlashcardStore.getState().createCard(
    classId,
    deckId,
    'Question',
    'Answer',
    'standard',
  );
  return { cardId };
}

describe('manual confidence scheduler integrity', () => {
  beforeEach(async () => {
    useFlashcardStore.setState({
      cards: [],
      session: null,
      activeClassId: null,
      activeDeckId: null,
    });
    window.localStorage.clear();
    await Promise.all([
      db.reviews.clear(),
      db.cards.clear(),
      db.decks.clear(),
      db.classes.clear(),
    ]);
  });

  it('uses the same canonical New-card transition as Review Mode', async () => {
    const { cardId } = await setup();

    await useFlashcardStore.getState().manuallySetCardConfidence(cardId, 3);

    const card = await db.cards.get(cardId);
    expect(card?.state).toBe(STATES.Learning);
    expect(card?.stability).toBe(3.7145);
    expect(card?.difficulty).toBe(5.1618);
    expect(card?.scheduledDays).toBeCloseTo(10 / 1440, 6);
    expect(card?.lastRating).toBe(3);

    const logs = await db.reviews.where('cardId').equals(cardId).toArray();
    expect(logs).toHaveLength(1);
    expect(logs[0]).toMatchObject({
      rating: 3,
      stability: 0,
      difficulty: 0,
    });
    expect(logs[0].scheduledDays).toBeCloseTo(10 / 1440, 6);
  });

  it('reset removes manual review history and restores a true New card', async () => {
    const { cardId } = await setup();
    await useFlashcardStore.getState().manuallySetCardConfidence(cardId, 4);

    await useFlashcardStore.getState().manuallySetCardConfidence(cardId, 0);

    const card = await db.cards.get(cardId);
    expect(card).toMatchObject({
      state: STATES.New,
      stability: 0,
      difficulty: 0,
      elapsedDays: 0,
      scheduledDays: 0,
    });
    expect(card?.lastReviewed).toBeUndefined();
    expect(card?.lastRating).toBeUndefined();
    expect(await db.reviews.where('cardId').equals(cardId).count()).toBe(0);
  });
});
