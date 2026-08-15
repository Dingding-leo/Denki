import { describe, it, expect } from 'vitest';
import {
  reviewCard,
  calculateRetrievability,
  formatInterval,
  STATES,
  DEFAULT_PARAMS,
  type SchedulerParams,
} from '../scheduler';
import type { Card } from '../../db/schema';

// Deterministic RNG: 0.5 → fuzz factor of exactly 1.0 (no schedule jitter),
// so interval assertions are stable.
const noFuzz = () => 0.5;

const mockCard = (o?: Partial<Card>): Card =>
  ({
    classId: 1,
    deckId: 1,
    front: 'Question',
    back: 'Answer',
    cardType: 'standard',
    createdAt: new Date('2026-01-01T00:00:00Z'),
    state: STATES.New,
    stability: 0,
    difficulty: 0,
    elapsedDays: 0,
    scheduledDays: 0,
    due: new Date('2026-01-01T00:00:00Z'),
    ...o,
  }) as Card;

const review = (
  card: Card,
  rating: 1 | 2 | 3 | 4,
  now?: Date,
  params: SchedulerParams = DEFAULT_PARAMS,
) => reviewCard(card, rating, now ?? new Date('2026-01-01T00:00:00Z'), params, noFuzz);

describe('Denki Scheduler (real FSRS-4.5)', () => {
  describe('New cards', () => {
    it('graduates a Good-rated new card to Review with a multi-day interval (not stuck at 1 day)', () => {
      const { updatedCard } = review(mockCard(), 3);
      expect(updatedCard.state).toBe(STATES.Review);
      // FSRS S0(Good) ≈ 3.7 days → interval must be well above the old 1-day floor.
      expect(updatedCard.scheduledDays).toBeGreaterThanOrEqual(3);
    });

    it('sends an Again-rated new card to Learning', () => {
      const { updatedCard, log } = review(mockCard(), 1);
      expect(updatedCard.state).toBe(STATES.Learning);
      expect(log.rating).toBe(1);
    });

    it('produces a monotonically increasing interval across Hard < Good < Easy', () => {
      const hard = review(mockCard(), 2).updatedCard.scheduledDays;
      const good = review(mockCard(), 3).updatedCard.scheduledDays;
      const easy = review(mockCard(), 4).updatedCard.scheduledDays;
      expect(hard).toBeLessThan(good);
      expect(good).toBeLessThan(easy);
    });

    it('assigns higher difficulty to worse ratings', () => {
      const again = review(mockCard(), 1).updatedCard.difficulty;
      const good = review(mockCard(), 3).updatedCard.difficulty;
      const easy = review(mockCard(), 4).updatedCard.difficulty;
      expect(again).toBeGreaterThan(good);
      expect(good).toBeGreaterThan(easy);
    });
  });

  describe('Review progression (the core SRS guarantee)', () => {
    it('strictly increases the interval across 5 consecutive Good reviews', () => {
      let card = mockCard();
      let now = new Date('2026-01-01T00:00:00Z');
      const intervals: number[] = [];
      for (let i = 0; i < 5; i++) {
        const { updatedCard } = review(card, 3, now);
        intervals.push(updatedCard.scheduledDays);
        card = updatedCard;
        now = new Date(updatedCard.due.getTime()); // review exactly on time
      }
      // Every interval must be strictly larger than the previous one.
      for (let i = 1; i < intervals.length; i++) {
        expect(intervals[i]).toBeGreaterThan(intervals[i - 1]);
      }
      // After 5 on-time Good reviews the interval should be clearly into weeks.
      expect(intervals[intervals.length - 1]).toBeGreaterThan(20);
    });

    it('expands stability and keeps Review state on a successful Good recall', () => {
      const card = mockCard({
        state: STATES.Review,
        stability: 10,
        difficulty: 5,
        lastReviewed: new Date('2026-01-01T00:00:00Z'),
      });
      const { updatedCard } = review(card, 3, new Date('2026-01-11T00:00:00Z'));
      expect(updatedCard.state).toBe(STATES.Review);
      expect(updatedCard.stability).toBeGreaterThan(10);
    });
  });

  describe('User settings are live', () => {
    const reviewCardFixture = () =>
      mockCard({
        state: STATES.Review,
        stability: 10,
        difficulty: 5,
        lastReviewed: new Date('2026-01-01T00:00:00Z'),
      });
    const tenDaysLater = new Date('2026-01-11T00:00:00Z');

    it('requestRetention drives interval: lower target retention → longer interval', () => {
      const lowRetention = review(reviewCardFixture(), 3, tenDaysLater, {
        ...DEFAULT_PARAMS,
        requestRetention: 0.8,
      }).updatedCard.scheduledDays;
      const highRetention = review(reviewCardFixture(), 3, tenDaysLater, {
        ...DEFAULT_PARAMS,
        requestRetention: 0.95,
      }).updatedCard.scheduledDays;
      expect(lowRetention).toBeGreaterThan(highRetention);
    });

    it('hardIntervalMultiplier lengthens the Hard (rating 2) interval', () => {
      const low = review(reviewCardFixture(), 2, tenDaysLater, {
        ...DEFAULT_PARAMS,
        hardIntervalMultiplier: 1.0,
      }).updatedCard.scheduledDays;
      const high = review(reviewCardFixture(), 2, tenDaysLater, {
        ...DEFAULT_PARAMS,
        hardIntervalMultiplier: 1.5,
      }).updatedCard.scheduledDays;
      expect(high).toBeGreaterThan(low);
    });

    it('easyBonus lengthens the Easy (rating 4) interval', () => {
      const low = review(reviewCardFixture(), 4, tenDaysLater, {
        ...DEFAULT_PARAMS,
        easyBonus: 1.0,
      }).updatedCard.scheduledDays;
      const high = review(reviewCardFixture(), 4, tenDaysLater, {
        ...DEFAULT_PARAMS,
        easyBonus: 2.0,
      }).updatedCard.scheduledDays;
      expect(high).toBeGreaterThan(low);
    });
  });

  describe('Lapses', () => {
    it('moves a Review card to Relearning and collapses stability on Again', () => {
      const card = mockCard({
        state: STATES.Review,
        stability: 40,
        difficulty: 5,
        lastReviewed: new Date('2026-01-01T00:00:00Z'),
      });
      const { updatedCard } = review(card, 1, new Date('2026-02-10T00:00:00Z'));
      expect(updatedCard.state).toBe(STATES.Relearning);
      expect(updatedCard.stability).toBeLessThan(40);
      expect(updatedCard.difficulty).toBeGreaterThan(5);
    });
  });

  describe('Interval bounds', () => {
    it('never schedules beyond the maximum interval cap', () => {
      const card = mockCard({
        state: STATES.Review,
        stability: 100000,
        difficulty: 1,
        lastReviewed: new Date('2026-01-01T00:00:00Z'),
      });
      const { updatedCard } = review(card, 4, new Date('2026-01-02T00:00:00Z'));
      expect(updatedCard.scheduledDays).toBeLessThanOrEqual(36500);
    });

    it('never schedules a Review card for less than 1 day', () => {
      const { updatedCard } = review(mockCard(), 2);
      expect(updatedCard.scheduledDays).toBeGreaterThanOrEqual(1);
    });
  });

  describe('calculateRetrievability', () => {
    it('is 1 at zero elapsed time and decreases over time', () => {
      expect(calculateRetrievability(10, 0)).toBeCloseTo(1, 5);
      expect(calculateRetrievability(10, 5)).toBeGreaterThan(calculateRetrievability(10, 20));
    });

    it('returns 0.9 when elapsed equals stability (FSRS definition of stability)', () => {
      expect(calculateRetrievability(10, 10)).toBeCloseTo(0.9, 2);
    });

    it('guards against non-positive stability', () => {
      expect(calculateRetrievability(0, 5)).toBe(0);
    });
  });

  describe('formatInterval', () => {
    it('formats across unit boundaries', () => {
      expect(formatInterval(0.002)).toBe('< 5m');
      expect(formatInterval(0.02)).toBe('29m');
      expect(formatInterval(0.5)).toBe('12h');
      expect(formatInterval(5)).toBe('5d');
      expect(formatInterval(60)).toBe('2mo');
      expect(formatInterval(730)).toBe('2y');
    });
  });
});
