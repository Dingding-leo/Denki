export type Rating = 1 | 2 | 3 | 4;

export interface ReviewRatingDefinition {
  rating: Rating;
  label: 'Again' | 'Hard' | 'Good' | 'Easy';
  description: string;
  color: string;
  softColor: string;
}

/** Canonical FSRS ratings used everywhere in Denki. */
export const REVIEW_RATINGS: readonly ReviewRatingDefinition[] = [
  {
    rating: 1,
    label: 'Again',
    description: 'Forgot',
    color: '#a87869',
    softColor: 'rgba(168, 120, 105, 0.2)',
  },
  {
    rating: 2,
    label: 'Hard',
    description: 'Recalled with effort',
    color: '#a08b69',
    softColor: 'rgba(160, 139, 105, 0.2)',
  },
  {
    rating: 3,
    label: 'Good',
    description: 'Recalled',
    color: '#8c9b72',
    softColor: 'rgba(140, 155, 114, 0.2)',
  },
  {
    rating: 4,
    label: 'Easy',
    description: 'Immediate recall',
    color: '#a4aa8c',
    softColor: 'rgba(164, 170, 140, 0.22)',
  },
] as const;

/**
 * Old Denki data may contain the retired score 5. Treat it as canonical Easy
 * without rewriting review history or requiring an IndexedDB migration.
 */
export function normalizeStoredRating(value: number | null | undefined): Rating | undefined {
  if (value === 5) return 4;
  if (value === 1 || value === 2 || value === 3 || value === 4) return value;
  return undefined;
}

export function getReviewRatingDefinition(
  value: number | null | undefined,
): ReviewRatingDefinition | undefined {
  const normalized = normalizeStoredRating(value);
  return normalized === undefined
    ? undefined
    : REVIEW_RATINGS.find((definition) => definition.rating === normalized);
}
