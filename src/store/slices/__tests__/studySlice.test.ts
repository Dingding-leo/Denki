import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
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
  afterEach(() => {
    vi.restoreAllMocks();
  });

  beforeEach(async () => {
    window.localStorage.clear();
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

  it('undo after a re-inserted (rating 1) card restores the exact prior queue — no overwrite', async () => {
    await startWithCards(5);
    const store = useFlashcardStore.getState();

    // Rate card 0 with 1 (re-inserted ~3 slots later), card 1 with 1 (re-inserted),
    // then card 2 with 3. This is the sequence that corrupted the queue before the
    // snapshot-based undo: re-insertion makes the old index math wrong.
    await store.rateCard(1); // card 0 reinserted
    await store.rateCard(1); // card 1 reinserted
    await store.rateCard(3); // card 2, no reinsertion
    const beforeUndo = useFlashcardStore.getState().session!;
    expect(beforeUndo.completedCount).toBe(3);

    // Capture the exact queue state the LAST rating started from.
    const lastEntry = beforeUndo.history[beforeUndo.history.length - 1];

    await store.undoLastRate();
    const afterUndo = useFlashcardStore.getState().session!;

    // The queue must be restored to the pre-rating snapshot verbatim.
    expect(afterUndo.queue.map((c) => c.id)).toEqual(lastEntry.queueSnapshot.map((c) => c.id));
    expect(afterUndo.currentIndex).toBe(lastEntry.index);
    expect(afterUndo.completedCount).toBe(lastEntry.completedCount);
    expect(afterUndo.completedCount).toBe(2);
    // Every card present before the undo is still present (nothing was clobbered).
    const beforeIds = new Set(lastEntry.queueSnapshot.map((c) => c.id));
    const afterIds = afterUndo.queue.map((c) => c.id);
    beforeIds.forEach((id) => expect(afterIds).toContain(id));
    // (Duplicates are expected here: a re-inserted card legitimately appears twice.)
  });

  it('double-undo after two re-inserted ratings returns to the exact starting queue', async () => {
    await startWithCards(5);
    const store = useFlashcardStore.getState();
    const startIds = useFlashcardStore.getState().session!.queue.map((c) => c.id);

    await store.rateCard(1); // reinserted
    await store.rateCard(1); // reinserted
    expect(useFlashcardStore.getState().session!.completedCount).toBe(2);

    await store.undoLastRate();
    await store.undoLastRate();

    const afterUndo = useFlashcardStore.getState().session!;
    expect(afterUndo.completedCount).toBe(0);
    expect(afterUndo.currentIndex).toBe(0);
    expect(afterUndo.queue.map((c) => c.id)).toEqual(startIds);
  });

  it('a card is never re-inserted more than the cap (queue stays bounded)', async () => {
    // Few cards so the same card id keeps coming back around the re-inserted queue.
    await startWithCards(3);
    const store = useFlashcardStore.getState();
    const startQueueLen = useFlashcardStore.getState().session!.queue.length;

    // Fail cards repeatedly; re-inserted copies of each card will recur. The
    // session ends when currentIndex reaches the end of the queue, so this loop
    // just keeps going until every copy has been rated.
    let ratings = 0;
    for (let i = 0; i < 60 && useFlashcardStore.getState().session; i++) {
      const s = useFlashcardStore.getState().session!;
      if (s.currentIndex >= s.queue.length) break;
      await store.rateCard(1);
      ratings++;
    }

    const finalQueue = useFlashcardStore.getState().session!.queue;
    // No card id may appear more than 1 (original) + MAX_REINSERTIONS (3) = 4 times.
    const counts = new Map<number, number>();
    for (const c of finalQueue) {
      const id = c.id!;
      counts.set(id, (counts.get(id) ?? 0) + 1);
      expect(counts.get(id)).toBeLessThanOrEqual(4);
    }
    // We managed to rate more cards than the starting queue size (re-insertions
    // kept feeding the queue), and every rating persisted a review log.
    expect(ratings).toBeGreaterThan(startQueueLen);
    expect(await db.reviews.count()).toBe(ratings);
  });

  it('drills selected previous levels once without reinserting low ratings', async () => {
    const { deckId } = await startWithCards(5);
    const cards = await db.cards.where('deckId').equals(deckId).sortBy('id');
    await Promise.all([
      db.cards.update(cards[1].id!, { lastRating: 1 }),
      db.cards.update(cards[2].id!, { lastRating: 2 }),
      db.cards.update(cards[3].id!, { lastRating: 3 }),
      db.cards.update(cards[4].id!, { lastRating: 4 }),
    ]);

    useFlashcardStore.getState().endStudySession();
    await useFlashcardStore.getState().startDrillSession(deckId, ['new', 1, 2]);

    const startingSession = useFlashcardStore.getState().session!;
    expect(startingSession.isDrill).toBe(true);
    expect(startingSession.queue).toHaveLength(3);
    expect(new Set(startingSession.queue.map((card) => card.id))).toEqual(
      new Set([cards[0].id, cards[1].id, cards[2].id]),
    );

    while (true) {
      const session = useFlashcardStore.getState().session!;
      if (session.currentIndex >= session.queue.length) break;
      await useFlashcardStore.getState().rateCard(1);
    }

    const completed = useFlashcardStore.getState().session!;
    expect(completed.queue).toHaveLength(3);
    expect(completed.completedCount).toBe(3);
    expect(completed.history).toHaveLength(3);
    expect(await db.reviews.count()).toBe(3);
  });


it('advances after a durable review even when the optional active-deck cache refresh fails', async () => {
  const { deckId } = await startWithCards(2);
  const originalLoadCards = useFlashcardStore.getState().loadCards;
  useFlashcardStore.setState({
    activeDeckId: deckId,
    loadCards: vi.fn(async () => {
      throw new Error('cache refresh failed');
    }) as typeof originalLoadCards,
  });

  try {
    await expect(useFlashcardStore.getState().rateCard(3)).resolves.toBeUndefined();
    const session = useFlashcardStore.getState().session!;
    expect(session.currentIndex).toBe(1);
    expect(session.completedCount).toBe(1);
    expect(session.history).toHaveLength(1);
    expect(await db.reviews.count()).toBe(1);
  } finally {
    useFlashcardStore.setState({ loadCards: originalLoadCards, activeDeckId: null });
  }
});

it('keeps the in-memory session unchanged when the database rollback for Undo fails', async () => {
  await startWithCards(2);
  await useFlashcardStore.getState().rateCard(3);
  const beforeUndo = useFlashcardStore.getState().session!;
  vi.spyOn(db.cards, 'put').mockRejectedValueOnce(new Error('storage unavailable'));

  await useFlashcardStore.getState().undoLastRate();

  const afterUndo = useFlashcardStore.getState().session!;
  expect(afterUndo).toBe(beforeUndo);
  expect(afterUndo.currentIndex).toBe(1);
  expect(afterUndo.completedCount).toBe(1);
  expect(afterUndo.history).toHaveLength(1);
  expect(await db.reviews.count()).toBe(1);
});

it('starts a fresh filtered drill when the learner changes the level selection', async () => {
  const { deckId } = await startWithCards(3);
  const cards = await db.cards.where('deckId').equals(deckId).sortBy('id');
  await Promise.all([
    db.cards.update(cards[0].id!, { lastRating: 1 }),
    db.cards.update(cards[1].id!, { lastRating: 4 }),
    db.cards.update(cards[2].id!, { lastRating: 4 }),
  ]);
  useFlashcardStore.getState().endStudySession();

  await useFlashcardStore.getState().startDrillSession(deckId, [1]);
  expect(useFlashcardStore.getState().session?.queue.map((card) => card.id)).toEqual([
    cards[0].id,
  ]);

  await useFlashcardStore.getState().startDrillSession(deckId, [4]);
  const replacement = useFlashcardStore.getState().session!;
  expect(replacement.drillBuckets).toEqual([4]);
  expect(new Set(replacement.queue.map((card) => card.id))).toEqual(
    new Set([cards[1].id, cards[2].id]),
  );
});
});
