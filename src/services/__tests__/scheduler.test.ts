import { describe, expect, it } from 'vitest';
import type { Card } from '../../db/schema';
import {
  calculateIntervalForRetention,
  calculateRetrievability,
  DEFAULT_PARAMS,
  formatInterval,
  FSRS_45_DECAY,
  FSRS_45_DEFAULT_WEIGHTS,
  FSRS_45_FACTOR,
  FSRS_VERSION,
  reviewCard,
  STATES,
  type SchedulerParams,
} from '../scheduler';

const noFuzz = () => 0.5;

const mockCard = (overrides?: Partial<Card>): Card => ({
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
  ...overrides,
});

const review = (
  card: Card,
  rating: 1 | 2 | 3 | 4,
  now = new Date('2026-01-01T00:00:00Z'),
  params: SchedulerParams = DEFAULT_PARAMS,
) => reviewCard(card, rating, now, params, noFuzz);

describe('canonical FSRS-4.5 release gate', () => {
  it('pins the published FSRS-4.5 constants and default weights', () => {
    expect(FSRS_VERSION).toBe('4.5');
    expect(FSRS_45_DECAY).toBe(-0.5);
    expect(FSRS_45_FACTOR).toBeCloseTo(19 / 81, 15);
    expect(FSRS_45_DEFAULT_WEIGHTS).toEqual([
      0.4872, 1.4003, 3.7145, 13.8206, 5.1618, 1.2298, 0.8975, 0.031,
      1.6474, 0.1367, 1.0461, 2.1072, 0.0793, 0.3246, 1.587, 0.2272,
      2.8755,
    ]);
  });

  it('matches reference forgetting-curve vectors, not the retired FSRS-v4 curve', () => {
    expect(calculateRetrievability(10, 0)).toBe(1);
    expect(calculateRetrievability(10, 10)).toBeCloseTo(0.9, 12);
    expect(calculateRetrievability(10, 100)).toBeCloseTo(
      0.5467110653077083,
      12,
    );

    // FSRS v4 would return 1 / (1 + 100 / 90) ≈ 0.4737 here.
    expect(calculateRetrievability(10, 100)).toBeGreaterThan(0.54);
  });

  it('matches reference interval vectors across retention settings', () => {
    expect(calculateIntervalForRetention(10, 0.9)).toBeCloseTo(10, 12);
    expect(calculateIntervalForRetention(10, 0.8)).toBeCloseTo(
      23.98026315789473,
      12,
    );
    expect(calculateIntervalForRetention(10, 0.7)).toBeCloseTo(
      44.37164339419979,
      12,
    );
  });

  it('uses the reference New-card learning transitions', () => {
    const again = review(mockCard(), 1).updatedCard;
    const hard = review(mockCard(), 2).updatedCard;
    const good = review(mockCard(), 3).updatedCard;
    const easy = review(mockCard(), 4).updatedCard;

    expect(again.state).toBe(STATES.Learning);
    expect(again.stability).toBe(0.4872);
    expect(again.scheduledDays).toBeCloseTo(1 / 1440, 6);
    expect(hard.state).toBe(STATES.Learning);
    expect(hard.stability).toBe(1.4003);
    expect(hard.scheduledDays).toBeCloseTo(5 / 1440, 6);
    expect(good.state).toBe(STATES.Learning);
    expect(good.stability).toBe(3.7145);
    expect(good.scheduledDays).toBeCloseTo(10 / 1440, 6);
    expect(easy.state).toBe(STATES.Review);
    expect(easy.stability).toBe(13.8206);
    expect(easy.scheduledDays).toBe(14);
  });

  it('graduates Learning with its existing memory state instead of reinitialising it', () => {
    const first = review(mockCard(), 1).updatedCard;
    const tenMinutesLater = new Date(
      first.lastReviewed!.getTime() + 10 * 60 * 1000,
    );
    const graduated = review(first, 3, tenMinutesLater).updatedCard;

    expect(graduated.state).toBe(STATES.Review);
    expect(graduated.stability).toBe(0.4872);
    expect(graduated.difficulty).toBeCloseTo(7.6214, 4);
    expect(graduated.scheduledDays).toBe(1);
  });

  it('matches canonical review-state golden vectors using pre-review difficulty', () => {
    const card = mockCard({
      state: STATES.Review,
      stability: 10,
      difficulty: 5,
      lastReviewed: new Date('2026-01-01T00:00:00Z'),
    });
    const now = new Date('2026-01-11T00:00:00Z');

    const again = review(card, 1, now).updatedCard;
    const hard = review(card, 2, now).updatedCard;
    const good = review(card, 3, now).updatedCard;
    const easy = review(card, 4, now).updatedCard;

    expect(again.state).toBe(STATES.Relearning);
    expect(again.difficulty).toBe(6.74);
    expect(again.stability).toBe(2.56);
    expect(again.scheduledDays).toBeCloseTo(5 / 1440, 6);
    expect(hard.difficulty).toBe(5.87);
    expect(hard.stability).toBeCloseTo(15.69906077821316, 12);
    expect(hard.scheduledDays).toBe(16);
    expect(good.difficulty).toBe(5.01);
    expect(good.stability).toBeCloseTo(35.08389427030441, 12);
    expect(good.scheduledDays).toBe(35);
    expect(easy.difficulty).toBe(4.14);
    expect(easy.stability).toBeCloseTo(82.12873797426035, 12);
    expect(easy.scheduledDays).toBe(82);
  });

  it('keeps Hard < Good < Easy even at interval-rounding boundaries', () => {
    const card = mockCard({
      state: STATES.Review,
      stability: 0.6,
      difficulty: 5,
      lastReviewed: new Date('2026-01-01T00:00:00Z'),
    });
    const now = new Date('2026-01-02T00:00:00Z');
    const hard = review(card, 2, now).updatedCard.scheduledDays;
    const good = review(card, 3, now).updatedCard.scheduledDays;
    const easy = review(card, 4, now).updatedCard.scheduledDays;

    expect(hard).toBeLessThan(good);
    expect(good).toBeLessThan(easy);
  });

  it('honours retention and maximum interval without non-canonical grade multipliers', () => {
    const card = mockCard({
      state: STATES.Review,
      stability: 10,
      difficulty: 5,
      lastReviewed: new Date('2026-01-01T00:00:00Z'),
    });
    const now = new Date('2026-01-11T00:00:00Z');

    const lowRetention = review(card, 3, now, {
      requestRetention: 0.8,
      maxInterval: 36500,
    }).updatedCard.scheduledDays;
    const highRetention = review(card, 3, now, {
      requestRetention: 0.95,
      maxInterval: 36500,
    }).updatedCard.scheduledDays;
    const capped = review(card, 4, now, {
      requestRetention: 0.7,
      maxInterval: 30,
    }).updatedCard.scheduledDays;

    expect(lowRetention).toBeGreaterThan(highRetention);
    expect(capped).toBe(30);
  });

  it('disables interval fuzz by default and applies bounded fuzz only when requested', () => {
    const card = mockCard({
      state: STATES.Review,
      stability: 10,
      difficulty: 5,
      lastReviewed: new Date('2026-01-01T00:00:00Z'),
    });
    const now = new Date('2026-01-11T00:00:00Z');

    const deterministic = reviewCard(card, 3, now, DEFAULT_PARAMS, () => 0)
      .updatedCard.scheduledDays;
    const defaultOtherRng = reviewCard(card, 3, now, DEFAULT_PARAMS, () => 0.99)
      .updatedCard.scheduledDays;
    const fuzzedLow = reviewCard(
      card,
      3,
      now,
      { ...DEFAULT_PARAMS, enableFuzz: true },
      () => 0,
    ).updatedCard.scheduledDays;
    const fuzzedHigh = reviewCard(
      card,
      3,
      now,
      { ...DEFAULT_PARAMS, enableFuzz: true },
      () => 0.99,
    ).updatedCard.scheduledDays;

    expect(defaultOtherRng).toBe(deterministic);
    expect(fuzzedLow).not.toBe(fuzzedHigh);
  });

  it('formats reference learning steps and long intervals clearly', () => {
    expect(formatInterval(1 / 1440)).toBe('1m');
    expect(formatInterval(5 / 1440)).toBe('5m');
    expect(formatInterval(10 / 1440)).toBe('10m');
    expect(formatInterval(0.5)).toBe('12h');
    expect(formatInterval(5)).toBe('5d');
    expect(formatInterval(60)).toBe('2mo');
    expect(formatInterval(730)).toBe('2y');
  });
});
