import { describe, it, expect, beforeEach } from 'vitest';
import { db } from '../../../db';
import { useFlashcardStore } from '../../useFlashcardStore';
import type { Card } from '../../../db/schema';

const seedCard = (deckId: number, classId: number, front: string): Card => ({
  classId,
  deckId,
  front,
  back: `A:${front}`,
  cardType: 'standard',
  createdAt: new Date(),
  state: 0, // New → always due
  stability: 0,
  difficulty: 0,
  elapsedDays: 0,
  scheduledDays: 0,
  due: new Date(),
});

async function startWithCards(n: number) {
  const classId = (await db.classes.add({ name: 'C', description: '', createdAt: new Date() })) as number;
  const deckId = (await db.decks.add({ classId, name: 'D', description: '', createdAt: new Date() })) as number;
  for (let i = 0; i < n; i++) await db.cards.add(seedCard(deckId, classId, `q${i}`));
  await useFlashcardStore.getState().startStudySession(deckId);
  return { classId, deckId };
}

describe('studySlice rateCard / undoLastRate', () => {
  beforeEach(async () => {
    await Promise.all([db.cards.clear(), db.reviews.clear(), db.decks.clear(), db.classes.clear()]);
    useFlashcardStore.setState({ session: null, activeDeckId: null, activeClassId: null });
  });

  it('rate then undo restores queue index, completedCount, and the DB review log', async () => {
    await startWithCards(3);
    await useFlashcardStore.getState().rateCard(3);

    let s = useFlashcardStore.getState().session!;
    expect(s.currentIndex).toBe(1);
    expect(s.completedCount).toBe(1);
    expect(await db.reviews.count()).toBe(1);

    await useFlashcardStore.getState().undoLastRate();
    s = useFlashcardStore.getState().session!;
    expect(s.currentIndex).toBe(0);
    expect(s.completedCount).toBe(0);
    expect(await db.reviews.count()).toBe(0);
  });

  it('drops a concurrent second rateCard instead of desyncing the queue/history from the DB', async () => {
    await startWithCards(3);
    const store = useFlashcardStore.getState();

    // Fire two ratings without awaiting the first — the second must be a no-op.
    const p1 = store.rateCard(3);
    const p2 = store.rateCard(3);
    await Promise.all([p1, p2]);

    const s = useFlashcardStore.getState().session!;
    expect(s.completedCount).toBe(1);
    expect(s.history.length).toBe(1);
    expect(await db.reviews.count()).toBe(1); // exactly one review persisted, not two
  });

  it('does not resurrect a session that was ended mid-flight', async () => {
    await startWithCards(3);
    const store = useFlashcardStore.getState();

    const p = store.rateCard(3); // starts, yields at the first await
    store.endStudySession(); // session -> null before the await resolves
    await p;

    expect(useFlashcardStore.getState().session).toBeNull();
  });
});
