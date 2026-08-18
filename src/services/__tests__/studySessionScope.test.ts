import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '../../db';
import type { Card } from '../../db/schema';
import { useFlashcardStore } from '../../store/useFlashcardStore';
import {
  persistStudySession,
  restorePersistedStudySession,
} from '../studySessionPersistence';

const newCard = (classId: number, deckId: number): Card => ({
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
  const cardId = await db.cards.add(newCard(classId, deckId));
  return { classId, deckId, cardId };
}

describe('persisted study-session scope integrity', () => {
  beforeEach(async () => {
    useFlashcardStore.setState({
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

  it('never restores an all-card practice queue as scheduled study', async () => {
    const { deckId } = await setup();
    await useFlashcardStore.getState().startStudySession(deckId, true);

    expect(useFlashcardStore.getState().session?.isCram).toBe(true);
    expect(
      await restorePersistedStudySession({
        deckId,
        isCram: false,
        isDrill: false,
      }),
    ).toBeNull();
    expect(
      await restorePersistedStudySession({
        deckId,
        isCram: true,
        isDrill: false,
      }),
    ).not.toBeNull();
  });

  it('replaces an active practice queue when normal Study is requested', async () => {
    const { deckId } = await setup();
    await useFlashcardStore.getState().startStudySession(deckId, true);
    const practiceSession = useFlashcardStore.getState().session;

    await useFlashcardStore.getState().startStudySession(deckId, false);
    const scheduledSession = useFlashcardStore.getState().session;

    expect(scheduledSession).not.toBe(practiceSession);
    expect(scheduledSession?.isCram).toBe(false);
  });

  it('does not persist a session whose queue is already complete', async () => {
    const { deckId, cardId } = await setup();
    const card = await db.cards.get(cardId);
    expect(card).toBeDefined();

    persistStudySession({
      deckId,
      queue: [card!],
      currentIndex: 1,
      completedCount: 1,
      initialQueueSize: 1,
      totalCards: 1,
      isCram: false,
      history: [],
    });

    expect(
      await restorePersistedStudySession({
        deckId,
        isCram: false,
        isDrill: false,
      }),
    ).toBeNull();
  });
});
