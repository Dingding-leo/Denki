import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '../../db';
import type { Card } from '../../db/schema';
import {
  CURRENT_SCHEDULER_VERSION,
  LEGACY_SCHEDULER_VERSION,
} from '../../domain/schedulerProvenance';
import {
  BACKUP_FORMAT_VERSION,
  exportDatabase,
  importDatabase,
} from '../backup';
import { FSRS_VERSION, STATES } from '../scheduler';

async function clearDatabase(): Promise<void> {
  await Promise.all([
    db.reviews.clear(),
    db.cards.clear(),
    db.decks.clear(),
    db.classes.clear(),
  ]);
}

async function seedExistingCard(front = 'existing') {
  const classId = await db.classes.add({
    name: 'Existing class',
    description: '',
    createdAt: new Date('2026-01-01T00:00:00Z'),
  });
  const deckId = await db.decks.add({
    classId,
    name: 'Existing deck',
    description: '',
    createdAt: new Date('2026-01-01T00:00:00Z'),
  });
  const cardId = await db.cards.add({
    classId,
    deckId,
    front,
    back: 'Answer',
    cardType: 'standard',
    createdAt: new Date('2026-01-01T00:00:00Z'),
    state: STATES.New,
    stability: 0,
    difficulty: 0,
    elapsedDays: 0,
    scheduledDays: 0,
    due: new Date('2026-01-01T00:00:00Z'),
  });
  return { classId, deckId, cardId };
}

describe('portable backup scheduler provenance', () => {
  beforeEach(async () => {
    await clearDatabase();
    localStorage.clear();
  });

  it('exports format v3 with app metadata and per-row scheduler lineage', async () => {
    const { classId, deckId } = await seedExistingCard('new card');
    const reviewedAt = new Date('2026-02-01T00:00:00Z');
    const reviewedCardId = await db.cards.add({
      classId,
      deckId,
      front: 'legacy reviewed card',
      back: 'Answer',
      cardType: 'standard',
      createdAt: new Date('2026-01-01T00:00:00Z'),
      state: STATES.Review,
      stability: 10,
      difficulty: 5,
      elapsedDays: 10,
      scheduledDays: 10,
      due: new Date('2026-02-11T00:00:00Z'),
      lastReviewed: reviewedAt,
      lastRating: 3,
    });
    await db.reviews.add({
      cardId: reviewedCardId,
      classId,
      deckId,
      reviewedAt,
      rating: 3,
      stability: 5,
      difficulty: 5,
      elapsedDays: 10,
      scheduledDays: 10,
    });

    const snapshot = await exportDatabase();
    const cards = snapshot.data.cards as Card[];
    const reviews = snapshot.data.reviews as Array<{
      schedulerVersion?: string;
    }>;

    expect(snapshot).toMatchObject({
      formatVersion: BACKUP_FORMAT_VERSION,
      appVersion: __DENKI_VERSION__,
      databaseVersion: 5,
      schedulerVersion: FSRS_VERSION,
    });
    expect(cards.find((card) => card.front === 'new card')?.schedulerVersion).toBe(
      CURRENT_SCHEDULER_VERSION,
    );
    expect(
      cards.find((card) => card.front === 'legacy reviewed card')
        ?.schedulerVersion,
    ).toBe(LEGACY_SCHEDULER_VERSION);
    expect(reviews[0]?.schedulerVersion).toBe(LEGACY_SCHEDULER_VERSION);
  });

  it('normalizes missing v2 row provenance conservatively before import', async () => {
    const now = '2026-03-01T00:00:00.000Z';
    await importDatabase({
      formatVersion: 2,
      databaseVersion: 4,
      schedulerVersion: FSRS_VERSION,
      exportedAt: now,
      data: {
        classes: [
          { id: 101, name: 'Imported', description: '', createdAt: now },
        ],
        decks: [
          {
            id: 201,
            classId: 101,
            name: 'Deck',
            description: '',
            createdAt: now,
          },
        ],
        cards: [
          {
            id: 301,
            classId: 101,
            deckId: 201,
            front: 'pristine',
            back: 'a',
            cardType: 'standard',
            createdAt: now,
            state: STATES.New,
            stability: 0,
            difficulty: 0,
            elapsedDays: 0,
            scheduledDays: 0,
            due: now,
          },
          {
            id: 302,
            classId: 101,
            deckId: 201,
            front: 'reviewed',
            back: 'a',
            cardType: 'standard',
            createdAt: now,
            state: STATES.Review,
            stability: 8,
            difficulty: 5,
            elapsedDays: 8,
            scheduledDays: 8,
            due: now,
            lastReviewed: now,
            lastRating: 3,
          },
        ],
        reviews: [
          {
            id: 401,
            cardId: 302,
            classId: 101,
            deckId: 201,
            reviewedAt: now,
            rating: 3,
            stability: 4,
            difficulty: 5,
            elapsedDays: 8,
            scheduledDays: 8,
          },
        ],
      },
    });

    const cards = await db.cards.orderBy('id').toArray();
    const reviews = await db.reviews.toArray();
    expect(cards[0]?.schedulerVersion).toBe(CURRENT_SCHEDULER_VERSION);
    expect(cards[1]?.schedulerVersion).toBe(LEGACY_SCHEDULER_VERSION);
    expect(reviews[0]?.schedulerVersion).toBe(LEGACY_SCHEDULER_VERSION);
  });

  it('rejects a v3 row without provenance before replacing current data', async () => {
    await seedExistingCard();
    const now = '2026-03-01T00:00:00.000Z';

    await expect(importDatabase({
      formatVersion: 3,
      appVersion: __DENKI_VERSION__,
      databaseVersion: db.verno,
      schedulerVersion: FSRS_VERSION,
      exportedAt: now,
      data: {
        classes: [
          { id: 101, name: 'Imported', description: '', createdAt: now },
        ],
        decks: [
          {
            id: 201,
            classId: 101,
            name: 'Deck',
            description: '',
            createdAt: now,
          },
        ],
        cards: [
          {
            id: 301,
            classId: 101,
            deckId: 201,
            front: 'missing provenance',
            back: 'a',
            cardType: 'standard',
            createdAt: now,
            state: STATES.New,
            stability: 0,
            difficulty: 0,
            elapsedDays: 0,
            scheduledDays: 0,
            due: now,
          },
        ],
        reviews: [],
      },
    })).rejects.toThrow(/missing scheduler provenance/i);

    expect((await db.cards.toArray())[0]?.front).toBe('existing');
  });

  it('rejects malformed explicit scheduler provenance before data loss', async () => {
    await seedExistingCard();
    const snapshot = JSON.parse(JSON.stringify(await exportDatabase()));
    snapshot.data.cards[0].schedulerVersion = 'bad version with spaces';

    await expect(importDatabase(snapshot)).rejects.toThrow(
      /invalid card scheduler version/i,
    );
    expect((await db.cards.toArray())[0]?.front).toBe('existing');
  });
});
