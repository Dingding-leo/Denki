import { describe, expect, it } from 'vitest';
import { getReviewRatingDefinition, normalizeStoredRating, REVIEW_RATINGS } from '../reviewRatings';

describe('review ratings', () => {
  it('exposes exactly the four canonical FSRS levels', () => {
    expect(REVIEW_RATINGS.map((item) => item.label)).toEqual(['Again', 'Hard', 'Good', 'Easy']);
  });

  it('maps legacy score 5 records to Easy without changing stored history', () => {
    expect(normalizeStoredRating(5)).toBe(4);
    expect(getReviewRatingDefinition(5)?.label).toBe('Easy');
  });

  it('rejects invalid stored values', () => {
    expect(normalizeStoredRating(0)).toBeUndefined();
    expect(normalizeStoredRating(9)).toBeUndefined();
  });
});
