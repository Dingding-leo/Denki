import Dexie from 'dexie';
import { describe, expect, it } from 'vitest';
import {
  CURRENT_SCHEDULER_VERSION,
  LEGACY_SCHEDULER_VERSION,
  inferLegacyCardSchedulerVersion,
  inferLegacyReviewSchedulerVersion,
} from '../../domain/schedulerProvenance';
import {
  DENKI_STORES,
  DENKI_STORES_V6,
  db,
  deriveLatestRatings,
  migrateSchedulerProvenance,
} from '../index';
import type { Card, MediaAsset, ReviewLog } from '../schema';

function review(
  cardId: number,
  rating: number,
  reviewedAt: string,
): ReviewLog {
  return {
    cardId,
    deckId: 1,
    classId: 1,
    reviewedAt: new Date(reviewedAt),
    rating,
    stability: 1,
    difficulty: 5,
    elapsedDays: 1,
    scheduledDays: 1,
    schedulerVersion: CURRENT_SCHEDULER_VERSION,
  };
}

describe('database migrations', () => {
  it('uses schema version 6 for the content-addressed media registry', () => {
    expect(db.verno).toBe(6);
  });

  it('derives the latest rating per card independent of review row order', () => {
    const ratings = deriveLatestRatings([
      review(1, 4, '2026-01-04T00:00:00Z'),
      review(2, 2, '2026-01-03T00:00:00Z'),
      review(1, 1, '2026-01-01T00:00:00Z'),
      review(2, 3, '2026-01-05T00:00:00Z'),
    ]);

    expect(ratings).toEqual(new Map([
      [1, 4],
      [2, 3],
    ]));
  });

  it('ignores review rows with invalid timestamps', () => {
    const invalid = review(1, 1, '2026-01-01T00:00:00Z');
    invalid.reviewedAt = new Date(Number.NaN);

    expect(deriveLatestRatings([
      invalid,
      review(1, 3, '2026-01-02T00:00:00Z'),
    ])).toEqual(new Map([[1, 3]]));
  });

  it('marks pristine New cards current without rewriting reviewed legacy states', () => {
    expect(inferLegacyCardSchedulerVersion({
      state: 0,
      stability: 0,
      difficulty: 0,
      scheduledDays: 0,
    })).toBe(CURRENT_SCHEDULER_VERSION);

    expect(inferLegacyCardSchedulerVersion({
      state: 2,
      stability: 12,
      difficulty: 5,
      scheduledDays: 12,
      lastReviewed: new Date('2026-01-01T00:00:00Z'),
    })).toBe(LEGACY_SCHEDULER_VERSION);

    expect(inferLegacyCardSchedulerVersion({
      state: 0,
      stability: 2,
      difficulty: 5,
      scheduledDays: 3,
    })).toBe(LEGACY_SCHEDULER_VERSION);
  });

  it('preserves explicit provenance and marks unversioned reviews legacy', () => {
    expect(inferLegacyCardSchedulerVersion({
      schedulerVersion: 'future-model-6.0',
      state: 2,
    })).toBe('future-model-6.0');
    expect(inferLegacyReviewSchedulerVersion('future-model-6.0')).toBe(
      'future-model-6.0',
    );
    expect(inferLegacyReviewSchedulerVersion(undefined)).toBe(
      LEGACY_SCHEDULER_VERSION,
    );
  });

  it('executes the production v4-to-v5 migration without changing memory state', async () => {
    const databaseName = `DenkiSchedulerMigration-${Date.now()}-${Math.random()}`;
    const legacy = new Dexie(databaseName);
    legacy.version(4).stores(DENKI_STORES);

    let upgraded: Dexie | null = null;
    try {
      await legacy.open();
      const classId = await legacy.table('classes').add({
        name: 'Legacy class',
        description: '',
        createdAt: new Date('2026-01-01T00:00:00Z'),
      });
      const deckId = await legacy.table('decks').add({
        classId,
        name: 'Legacy deck',
        description: '',
        createdAt: new Date('2026-01-01T00:00:00Z'),
      });
      const pristineId = await legacy.table('cards').add({
        classId,
        deckId,
        front: 'Pristine',
        back: 'A',
        cardType: 'standard',
        createdAt: new Date('2026-01-01T00:00:00Z'),
        state: 0,
        stability: 0,
        difficulty: 0,
        elapsedDays: 0,
        scheduledDays: 0,
        due: new Date('2026-01-01T00:00:00Z'),
      });
      const reviewedId = await legacy.table('cards').add({
        classId,
        deckId,
        front: 'Reviewed',
        back: 'B',
        cardType: 'standard',
        createdAt: new Date('2026-01-01T00:00:00Z'),
        state: 2,
        stability: 12,
        difficulty: 5.5,
        elapsedDays: 9,
        scheduledDays: 12,
        due: new Date('2026-02-01T00:00:00Z'),
        lastReviewed: new Date('2026-01-20T00:00:00Z'),
        lastRating: 3,
      });
      const explicitId = await legacy.table('cards').add({
        classId,
        deckId,
        front: 'Explicit',
        back: 'C',
        cardType: 'standard',
        createdAt: new Date('2026-01-01T00:00:00Z'),
        state: 2,
        stability: 20,
        difficulty: 4,
        elapsedDays: 20,
        scheduledDays: 20,
        due: new Date('2026-03-01T00:00:00Z'),
        lastReviewed: new Date('2026-02-09T00:00:00Z'),
        lastRating: 4,
        schedulerVersion: 'future-model-6.0',
      });
      await legacy.table('reviews').add({
        cardId: reviewedId,
        deckId,
        classId,
        reviewedAt: new Date('2026-01-20T00:00:00Z'),
        rating: 3,
        stability: 7,
        difficulty: 5.5,
        elapsedDays: 9,
        scheduledDays: 12,
      });
      legacy.close();

      upgraded = new Dexie(databaseName);
      upgraded.version(4).stores(DENKI_STORES);
      upgraded
        .version(5)
        .stores(DENKI_STORES)
        .upgrade(migrateSchedulerProvenance);
      await upgraded.open();

      const pristine = await upgraded.table<Card>('cards').get(pristineId);
      const reviewed = await upgraded.table<Card>('cards').get(reviewedId);
      const explicit = await upgraded.table<Card>('cards').get(explicitId);
      const migratedReview = await upgraded.table<ReviewLog>('reviews').toCollection().first();

      expect(pristine?.schedulerVersion).toBe(CURRENT_SCHEDULER_VERSION);
      expect(reviewed).toMatchObject({
        state: 2,
        stability: 12,
        difficulty: 5.5,
        elapsedDays: 9,
        scheduledDays: 12,
        lastRating: 3,
        schedulerVersion: LEGACY_SCHEDULER_VERSION,
      });
      expect(explicit?.schedulerVersion).toBe('future-model-6.0');
      expect(migratedReview).toMatchObject({
        rating: 3,
        stability: 7,
        difficulty: 5.5,
        elapsedDays: 9,
        scheduledDays: 12,
        schedulerVersion: LEGACY_SCHEDULER_VERSION,
      });
    } finally {
      legacy.close();
      if (upgraded) {
        upgraded.close();
        await upgraded.delete();
      } else {
        await Dexie.delete(databaseName);
      }
    }
  });

  it('adds an empty media table without rewriting v5 study data', async () => {
    const databaseName = `DenkiMediaMigration-${Date.now()}-${Math.random()}`;
    const legacy = new Dexie(databaseName);
    legacy.version(5).stores(DENKI_STORES);

    let upgraded: Dexie | null = null;
    try {
      await legacy.open();
      const classId = await legacy.table('classes').add({
        name: 'Existing class',
        description: '',
        createdAt: new Date('2026-01-01T00:00:00Z'),
      });
      const deckId = await legacy.table('decks').add({
        classId,
        name: 'Existing deck',
        description: '',
        createdAt: new Date('2026-01-01T00:00:00Z'),
      });
      const cardId = await legacy.table('cards').add({
        classId,
        deckId,
        front: 'data:image/png;base64,AQID',
        back: 'Unchanged',
        cardType: 'standard',
        createdAt: new Date('2026-01-01T00:00:00Z'),
        state: 0,
        stability: 0,
        difficulty: 0,
        elapsedDays: 0,
        scheduledDays: 0,
        due: new Date('2026-01-01T00:00:00Z'),
        schedulerVersion: CURRENT_SCHEDULER_VERSION,
      });
      legacy.close();

      upgraded = new Dexie(databaseName);
      upgraded.version(5).stores(DENKI_STORES);
      upgraded.version(6).stores(DENKI_STORES_V6);
      await upgraded.open();

      const card = await upgraded.table<Card>('cards').get(cardId);
      expect(card).toMatchObject({
        front: 'data:image/png;base64,AQID',
        back: 'Unchanged',
        schedulerVersion: CURRENT_SCHEDULER_VERSION,
      });
      expect(await upgraded.table<MediaAsset>('media').count()).toBe(0);
      expect(upgraded.tables.map((table) => table.name)).toContain('media');
    } finally {
      legacy.close();
      if (upgraded) {
        upgraded.close();
        await upgraded.delete();
      } else {
        await Dexie.delete(databaseName);
      }
    }
  });
});
