import type { Card } from '../db/schema';
import { normalizeStoredRating, type Rating } from './reviewRatings';

export type DrillBucket = 'new' | Rating;

export const ALL_DRILL_BUCKETS: readonly DrillBucket[] = ['new', 1, 2, 3, 4];

export type DrillBucketCounts = Record<DrillBucket, number>;

export function getDrillBucket(
  card: Pick<Card, 'lastRating'>,
): DrillBucket {
  return normalizeStoredRating(card.lastRating) ?? 'new';
}

export function filterDrillCards(
  cards: readonly Card[],
  buckets: readonly DrillBucket[],
): Card[] {
  const selected = new Set<DrillBucket>(buckets);
  return cards.filter((card) => selected.has(getDrillBucket(card)));
}

export function countDrillBuckets(cards: readonly Card[]): DrillBucketCounts {
  const counts: DrillBucketCounts = { new: 0, 1: 0, 2: 0, 3: 0, 4: 0 };
  for (const card of cards) counts[getDrillBucket(card)] += 1;
  return counts;
}
