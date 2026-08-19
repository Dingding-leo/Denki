import { describe, expect, it } from 'vitest';
import {
  CURRENT_SCHEDULER_VERSION,
  LEGACY_SCHEDULER_VERSION,
  inferLegacyCardSchedulerVersion,
  inferLegacyReviewSchedulerVersion,
} from '../../domain/schedulerProvenance';
import { db, deriveLatestRatings } from '../index';
import type { ReviewLog } from '../schema';

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
  it('uses schema version 5 for scheduler provenance', () => {
    expect(db.verno).toBe(5);
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
});
