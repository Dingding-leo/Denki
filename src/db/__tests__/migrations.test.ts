import { describe, expect, it } from 'vitest';
import type { ReviewLog } from '../schema';
import { deriveLatestRatings } from '../index';

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
  };
}

describe('database migrations', () => {
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
});
