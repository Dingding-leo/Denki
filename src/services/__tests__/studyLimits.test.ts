import { describe, it, expect, beforeEach } from 'vitest';
import { db } from '../../db';
import { useFlashcardStore } from '../../store/useFlashcardStore';
import {
  NEW_CARDS_PER_DAY_KEY,
  DEFAULT_NEW_CARDS_PER_DAY,
  loadNewCardsPerDay,
  countNewIntroducedToday,
} from '../studyLimits';
import type { Card } from '../../db/schema';

const seedCard = (deckId: number, classId: number, front: string, overrides: Partial<Card> = {}): Card => ({
  classId,
  deckId,
  front,
  back: `A:${front}`,
  cardType: 'standard',
  createdAt: new Date(),
  state: 0,
  stability: 0,
  difficulty: 0,
  elapsedDays: 0,
  scheduledDays: 0,
  due: new Date(),
  ...overrides,
});

async function seedDeck(newCards: number, dueReviews = 0) {
  const classId = (await db.classes.add({ name: 'C', description: '', createdAt: new Date() })) as number;
  const deckId = (await db.decks.add({ classId, name: 'D', description: '', createdAt: new Date() })) as number;
  for (let i = 0; i < newCards; i++) {
    await db.cards.add(seedCard(deckId, classId, `new${i}`));
  }
  const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);
  for (let i = 0; i < dueReviews; i++) {
    await db.cards.add(
      seedCard(deckId, classId, `rev${i}`, {
        state: 2,
        stability: 5,
        lastReviewed: yesterday,
        due: yesterday,
      }),
    );
  }
  return { classId, deckId };
}

describe('studyLimits', () => {
  beforeEach(async () => {
    await Promise.all([db.cards.clear(), db.reviews.clear(), db.decks.clear(), db.classes.clear()]);
    useFlashcardStore.setState({ session: null, activeDeckId: null, activeClassId: null });
    localStorage.removeItem(NEW_CARDS_PER_DAY_KEY);
  });

  it('loadNewCardsPerDay falls back to the default on missing or garbage values', () => {
    expect(loadNewCardsPerDay()).toBe(DEFAULT_NEW_CARDS_PER_DAY);
    localStorage.setItem(NEW_CARDS_PER_DAY_KEY, 'abc');
    expect(loadNewCardsPerDay()).toBe(DEFAULT_NEW_CARDS_PER_DAY);
    localStorage.setItem(NEW_CARDS_PER_DAY_KEY, '-5');
    expect(loadNewCardsPerDay()).toBe(DEFAULT_NEW_CARDS_PER_DAY);
    localStorage.setItem(NEW_CARDS_PER_DAY_KEY, '0');
    expect(loadNewCardsPerDay()).toBe(0);
    localStorage.setItem(NEW_CARDS_PER_DAY_KEY, '35');
    expect(loadNewCardsPerDay()).toBe(35);
  });

  it('caps new cards in a deck session at the daily limit but keeps all due reviews', async () => {
    localStorage.setItem(NEW_CARDS_PER_DAY_KEY, '5');
    const { deckId } = await seedDeck(10, 4);

    await useFlashcardStore.getState().startStudySession(deckId);
    const session = useFlashcardStore.getState().session!;

    expect(session.queue.length).toBe(9); // 5 new + 4 reviews
    const newInQueue = session.queue.filter(c => c.state === 0).length;
    expect(newInQueue).toBe(5);
  });

  it('does not cap when the limit is 0 (unlimited)', async () => {
    localStorage.setItem(NEW_CARDS_PER_DAY_KEY, '0');
    const { deckId } = await seedDeck(10);

    await useFlashcardStore.getState().startStudySession(deckId);
    expect(useFlashcardStore.getState().session!.queue.length).toBe(10);
  });

  it('does not cap cram sessions', async () => {
    localStorage.setItem(NEW_CARDS_PER_DAY_KEY, '2');
    const { deckId } = await seedDeck(10);

    await useFlashcardStore.getState().startStudySession(deckId, true);
    expect(useFlashcardStore.getState().session!.queue.length).toBe(10);
  });

  it('counts cards already introduced today against the allowance', async () => {
    localStorage.setItem(NEW_CARDS_PER_DAY_KEY, '5');
    const { deckId } = await seedDeck(10);

    // Introduce 3 new cards by rating them (their logs carry stability 0)
    await useFlashcardStore.getState().startStudySession(deckId);
    await useFlashcardStore.getState().rateCard(3);
    await useFlashcardStore.getState().rateCard(3);
    await useFlashcardStore.getState().rateCard(3);
    useFlashcardStore.getState().endStudySession();

    const introduced = await countNewIntroducedToday();
    expect(introduced.get(deckId)).toBe(3);

    // A fresh session may only introduce the remaining 2
    await useFlashcardStore.getState().startStudySession(deckId);
    const session = useFlashcardStore.getState().session!;
    const newInQueue = session.queue.filter(c => c.state === 0).length;
    expect(newInQueue).toBe(2);
  });

  it('applies the allowance per deck in a class session', async () => {
    localStorage.setItem(NEW_CARDS_PER_DAY_KEY, '3');
    const classId = (await db.classes.add({ name: 'C', description: '', createdAt: new Date() })) as number;
    const deckA = (await db.decks.add({ classId, name: 'A', description: '', createdAt: new Date() })) as number;
    const deckB = (await db.decks.add({ classId, name: 'B', description: '', createdAt: new Date() })) as number;
    for (let i = 0; i < 5; i++) await db.cards.add(seedCard(deckA, classId, `a${i}`));
    for (let i = 0; i < 5; i++) await db.cards.add(seedCard(deckB, classId, `b${i}`));

    await useFlashcardStore.getState().startClassStudySession(classId);
    const session = useFlashcardStore.getState().session!;
    expect(session.queue.length).toBe(6); // 3 per deck
    expect(session.queue.filter(c => c.deckId === deckA).length).toBe(3);
    expect(session.queue.filter(c => c.deckId === deckB).length).toBe(3);
  });

  it('caps the deck due badge to match the session queue', async () => {
    localStorage.setItem(NEW_CARDS_PER_DAY_KEY, '5');
    const { classId, deckId } = await seedDeck(10, 4);

    await useFlashcardStore.getState().loadDeckStats(classId);
    expect(useFlashcardStore.getState().deckStats[deckId].dueCount).toBe(9);

    await useFlashcardStore.getState().loadClassStats(classId);
    expect(useFlashcardStore.getState().classStats[classId].dueCount).toBe(9);
  });
});
