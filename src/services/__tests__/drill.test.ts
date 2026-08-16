import { describe, expect, it } from 'vitest';
import type { Card } from '../../db/schema';
import {
  ALL_DRILL_BUCKETS,
  countDrillBuckets,
  filterDrillCards,
  getDrillBucket,
} from '../drill';

function card(id: number, lastRating?: number): Card {
  return {
    id,
    classId: 1,
    deckId: 1,
    front: `Q${id}`,
    back: `A${id}`,
    cardType: 'standard',
    createdAt: new Date(),
    state: 0,
    stability: 0,
    difficulty: 0,
    elapsedDays: 0,
    scheduledDays: 0,
    due: new Date(),
    lastRating,
  };
}

describe('drill filters', () => {
  const cards = [card(1), card(2, 1), card(3, 2), card(4, 3), card(5, 4), card(6, 5)];

  it('maps unrated cards to New and legacy score 5 to Easy', () => {
    expect(getDrillBucket(cards[0])).toBe('new');
    expect(getDrillBucket(cards[5])).toBe(4);
  });

  it('filters by any combination of previous confidence buckets', () => {
    expect(filterDrillCards(cards, [1, 2]).map((item) => item.id)).toEqual([2, 3]);
    expect(filterDrillCards(cards, ['new', 4]).map((item) => item.id)).toEqual([1, 5, 6]);
    expect(filterDrillCards(cards, ALL_DRILL_BUCKETS)).toHaveLength(cards.length);
  });

  it('counts every bucket using the canonical four-level scale', () => {
    expect(countDrillBuckets(cards)).toEqual({ new: 1, 1: 1, 2: 1, 3: 1, 4: 2 });
  });
});
