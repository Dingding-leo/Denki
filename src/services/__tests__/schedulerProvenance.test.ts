import { describe, expect, it } from 'vitest';
import type { Card } from '../../db/schema';
import { LEGACY_SCHEDULER_VERSION } from '../../domain/schedulerProvenance';
import {
  DEFAULT_PARAMS,
  FSRS_VERSION,
  STATES,
  createNewCardSchedulingState,
  reviewCard,
} from '../scheduler';

function legacyReviewCard(): Card {
  return {
    id: 10,
    classId: 1,
    deckId: 1,
    front: 'Question',
    back: 'Answer',
    cardType: 'standard',
    createdAt: new Date('2026-01-01T00:00:00Z'),
    state: STATES.Review,
    stability: 10,
    difficulty: 5,
    elapsedDays: 10,
    scheduledDays: 10,
    due: new Date('2026-01-11T00:00:00Z'),
    lastReviewed: new Date('2026-01-01T00:00:00Z'),
    lastRating: 3,
    schedulerVersion: LEGACY_SCHEDULER_VERSION,
  };
}

describe('scheduler provenance', () => {
  it('initializes new and reset cards in the current scheduler lineage', () => {
    const now = new Date('2026-03-01T00:00:00Z');

    expect(createNewCardSchedulingState(now)).toEqual({
      state: STATES.New,
      stability: 0,
      difficulty: 0,
      elapsedDays: 0,
      scheduledDays: 0,
      due: now,
      schedulerVersion: FSRS_VERSION,
    });
  });

  it('moves a legacy card into current provenance on its next rating', () => {
    const reviewedAt = new Date('2026-01-11T00:00:00Z');
    const { updatedCard, log } = reviewCard(
      legacyReviewCard(),
      3,
      reviewedAt,
      DEFAULT_PARAMS,
      () => 0.5,
    );

    expect(updatedCard.schedulerVersion).toBe(FSRS_VERSION);
    expect(log.schedulerVersion).toBe(FSRS_VERSION);
    expect(log.cardId).toBe(10);
    expect(log.reviewedAt).toEqual(reviewedAt);
  });
});
