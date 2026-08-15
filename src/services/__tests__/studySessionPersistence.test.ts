import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '../../db';
import type { Card } from '../../db/schema';
import { useFlashcardStore } from '../../store/useFlashcardStore';
import { restorePersistedStudySession } from '../studySessionPersistence';

const seedCard = (deckId: number, classId: number, front: string): Card => ({
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
});

async function startWithCards(n = 3) {
  const classId = (await db.classes.add({
    name: 'C',
    description: '',
    createdAt: new Date(),
  })) as number;
  const deckId = (await db.decks.add({
    classId,
    name: 'D',
    description: '',
    createdAt: new Date(),
  })) as number;

  const cardIds: number[] = [];
  for (let i = 0; i < n; i++) {
    cardIds.push((await db.cards.add(seedCard(deckId, classId, `q${i}`))) as number);
  }

  await useFlashcardStore.getState().startStudySession(deckId);
  return { classId, deckId, cardIds };
}

describe('study session persistence', () => {
  beforeEach(async () => {
    useFlashcardStore.setState({ session: null, activeDeckId: null, activeClassId: null });
    window.localStorage.clear();
    await Promise.all([
      db.cards.clear(),
      db.reviews.clear(),
      db.decks.clear(),
      db.classes.clear(),
    ]);
  });

  it('restores progress after a reload-style store reset and rehydrates cards from IndexedDB', async () => {
    const { deckId } = await startWithCards();
    await useFlashcardStore.getState().rateCard(3);

    const active = useFlashcardStore.getState().session!;
    expect(active.currentIndex).toBe(1);
    expect(active.completedCount).toBe(1);

    const restored = await restorePersistedStudySession({ deckId });
    expect(restored).not.toBeNull();
    expect(restored!.currentIndex).toBe(1);
    expect(restored!.completedCount).toBe(1);
    expect(restored!.queue).toHaveLength(active.queue.length);
    expect(restored!.queue[0].createdAt).toBeInstanceOf(Date);
    expect(restored!.queue[0].due).toBeInstanceOf(Date);
    expect(restored!.history).toEqual([]);
  });

  it('does not restart the same deck when the study page mounts after navigation', async () => {
    const { deckId } = await startWithCards();
    await useFlashcardStore.getState().rateCard(3);

    const before = useFlashcardStore.getState().session!;
    expect(before.currentIndex).toBe(1);

    // ClassViewPage starts before navigating; StudySessionPage starts again on
    // mount. The second call must preserve the already-active session.
    await useFlashcardStore.getState().startStudySession(deckId);

    const after = useFlashcardStore.getState().session!;
    expect(after).toBe(before);
    expect(after.currentIndex).toBe(1);
    expect(after.completedCount).toBe(1);
    expect(await db.reviews.count()).toBe(1);
  });

  it('clears the saved snapshot when the user explicitly ends the session', async () => {
    const { deckId } = await startWithCards();
    useFlashcardStore.getState().endStudySession();

    expect(await restorePersistedStudySession({ deckId })).toBeNull();
  });

  it('rejects a snapshot when one of its queued cards no longer exists', async () => {
    const { deckId, cardIds } = await startWithCards();
    await db.cards.delete(cardIds[0]);

    expect(await restorePersistedStudySession({ deckId })).toBeNull();
  });

  it('restores a class-wide session only for the matching class', async () => {
    const { classId, deckId } = await startWithCards();

    // Replace the deck-scoped snapshot with a class-scoped session.
    useFlashcardStore.getState().endStudySession();
    await useFlashcardStore.getState().startClassStudySession(classId);

    expect(await restorePersistedStudySession({ deckId })).toBeNull();
    const restored = await restorePersistedStudySession({ classId });
    expect(restored?.classId).toBe(classId);
    expect(restored?.deckId).toBeUndefined();
  });
});
