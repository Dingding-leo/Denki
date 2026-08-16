import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '../../db';
import type { Card } from '../../db/schema';
import { useFlashcardStore } from '../../store/useFlashcardStore';
import { loadNewCardsPerDay, NEW_CARDS_PER_DAY_KEY } from '../studyLimits';

function seedCard(deckId: number, classId: number, front: string): Card {
  return {
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
  };
}

describe('unlimited new-card study', () => {
  beforeEach(async () => {
    window.localStorage.clear();
    useFlashcardStore.setState({ session: null, activeDeckId: null, activeClassId: null });
    await Promise.all([db.cards.clear(), db.reviews.clear(), db.decks.clear(), db.classes.clear()]);
  });

  it('ignores a legacy daily-limit preference', () => {
    window.localStorage.setItem(NEW_CARDS_PER_DAY_KEY, '1');
    expect(loadNewCardsPerDay()).toBe(0);
  });

  it('queues every new card and reports every one as due', async () => {
    window.localStorage.setItem(NEW_CARDS_PER_DAY_KEY, '1');
    const classId = await db.classes.add({ name: 'C', description: '', createdAt: new Date() });
    const deckId = await db.decks.add({ classId, name: 'D', description: '', createdAt: new Date() });
    for (let index = 0; index < 30; index += 1) {
      await db.cards.add(seedCard(deckId, classId, `Q${index}`));
    }

    await useFlashcardStore.getState().startStudySession(deckId);
    expect(useFlashcardStore.getState().session?.queue).toHaveLength(30);

    await useFlashcardStore.getState().loadDeckStats(classId);
    expect(useFlashcardStore.getState().deckStats[deckId].dueCount).toBe(30);
  });
});
