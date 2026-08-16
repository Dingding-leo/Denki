import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '../../../db';
import type { Card } from '../../../db/schema';
import { useFlashcardStore } from '../../useFlashcardStore';

async function seedLibrary() {
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
  const cardId = await db.cards.add({
    classId,
    deckId,
    front: 'Question',
    back: 'Answer',
    cardType: 'standard',
    createdAt: new Date(),
    state: 0,
    stability: 0,
    difficulty: 0,
    elapsedDays: 0,
    scheduledDays: 0,
    due: new Date(),
  });
  const card = (await db.cards.get(cardId)) as Card;
  return { classId, deckId, cardId, card };
}

function setActiveSession(card: Card) {
  useFlashcardStore.setState({
    activeClassId: card.classId,
    activeDeckId: card.deckId,
    cards: [card],
    session: {
      deckId: card.deckId,
      queue: [card],
      currentIndex: 0,
      completedCount: 0,
      initialQueueSize: 1,
      totalCards: 1,
      history: [],
    },
  });
}

describe('destructive library mutations', () => {
  beforeEach(async () => {
    await Promise.all([
      db.reviews.clear(),
      db.cards.clear(),
      db.decks.clear(),
      db.classes.clear(),
    ]);
    localStorage.clear();
    useFlashcardStore.setState({
      classes: [],
      decks: [],
      cards: [],
      classStats: {},
      deckStats: {},
      activeClassId: null,
      activeDeckId: null,
      session: null,
    });
  });

  it('ends a queue before deleting one of its cards', async () => {
    const { cardId, card } = await seedLibrary();
    setActiveSession(card);

    await useFlashcardStore.getState().deleteCard(cardId);

    expect(useFlashcardStore.getState().session).toBeNull();
    expect(await db.cards.count()).toBe(0);
    expect(localStorage.getItem('denki.study-session.v1')).toBeNull();
  });

  it('clears active card buffers and stale deck stats when a deck is deleted', async () => {
    const { deckId, card } = await seedLibrary();
    setActiveSession(card);
    useFlashcardStore.setState({
      deckStats: { [deckId]: { total: 1, dueCount: 1, masteryPct: 0 } },
    });

    await useFlashcardStore.getState().deleteDeck(deckId);

    const state = useFlashcardStore.getState();
    expect(state.session).toBeNull();
    expect(state.activeDeckId).toBeNull();
    expect(state.cards).toEqual([]);
    expect(state.deckStats[deckId]).toBeUndefined();
    expect(await db.decks.count()).toBe(0);
  });

  it('removes every class-owned buffer and session reference on class deletion', async () => {
    const { classId, deckId, card } = await seedLibrary();
    setActiveSession(card);
    useFlashcardStore.setState({
      deckStats: { [deckId]: { total: 1, dueCount: 1, masteryPct: 0 } },
    });

    await useFlashcardStore.getState().deleteClass(classId);

    const state = useFlashcardStore.getState();
    expect(state.session).toBeNull();
    expect(state.activeClassId).toBeNull();
    expect(state.activeDeckId).toBeNull();
    expect(state.cards).toEqual([]);
    expect(state.deckStats[deckId]).toBeUndefined();
    expect(await db.classes.count()).toBe(0);
    expect(await db.decks.count()).toBe(0);
    expect(await db.cards.count()).toBe(0);
  });
});
