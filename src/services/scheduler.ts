import type { Card, ReviewLog } from '../db/schema';

export type Rating = 1 | 2 | 3 | 4 | 5; // 1 = Not at all, 2 = Slightly, 3 = Moderately, 4 = Very well, 5 = Perfectly

// FSRS state mapping
export const STATES = {
  New: 0,
  Learning: 1,
  Review: 2,
  Relearning: 3,
};

/**
 * FSRS-4.5 default weight vector (17 parameters).
 * w0..w3  – initial stability for grades Again/Hard/Good/Easy
 * w4,w5   – initial difficulty (base + slope)
 * w6,w7   – difficulty update + mean-reversion strength
 * w8..w10 – stability increase on successful recall
 * w11..w14– post-lapse (forgetting) stability
 * w15     – Hard penalty, w16 – Easy bonus
 */
const W = [
  0.4872, 1.4003, 3.7145, 13.8206, 5.1618, 1.2298, 0.8975, 0.031, 1.6474,
  0.1367, 1.0461, 2.1072, 0.0793, 0.3246, 1.587, 0.2272, 2.8755,
] as const;

// FSRS grades (distinct from Denki's 1–5 confidence scale).
const AGAIN = 1;
const HARD = 2;
const GOOD = 3;
const EASY = 4;

const MIN_STABILITY = 0.01;
const DEFAULT_MAX_INTERVAL = 36500; // ~100 years
const LEARN_STEP_DAYS = 1 / 144; // ≈ 10 minutes — Learning/Relearning cards resurface quickly
const PERFECT_BONUS = 1.15; // extra stability for a "Perfectly (5)" recall over "Very well (4)"
const FUZZ_RATIO = 0.05; // ±5% jitter on Review intervals to de-clump due dates
const FUZZ_MIN_DAYS = 2.5; // don't fuzz very short intervals

export interface SchedulerParams {
  requestRetention: number; // Target retrievability (probability of recall), drives interval length
  easyBonus: number; // User multiplier applied to Easy-grade stability growth
  hardIntervalMultiplier: number; // User multiplier applied to Hard-grade stability growth
  maxInterval?: number; // Optional cap on scheduled days (defaults to ~100 years)
}

export const DEFAULT_PARAMS: SchedulerParams = {
  requestRetention: 0.9,
  easyBonus: 1.3,
  hardIntervalMultiplier: 1.2,
  maxInterval: DEFAULT_MAX_INTERVAL,
};

/**
 * Maps Denki's 5-point confidence scale onto the 4 canonical FSRS grades.
 * 1 (Not at all) → Again, 2 (Slightly) → Hard, 3 (Moderately) → Good,
 * 4 (Very well) & 5 (Perfectly) → Easy (5 additionally gets a perfect bonus).
 */
function ratingToGrade(rating: Rating): number {
  if (rating === 1) return AGAIN;
  if (rating === 2) return HARD;
  if (rating === 3) return GOOD;
  return EASY; // 4 and 5
}

const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x));

/**
 * FSRS-4.5 power forgetting curve: R(t) = (1 + t / (9·S))^-1.
 * By definition R = 0.9 when the elapsed time equals the stability.
 */
export function calculateRetrievability(stability: number, elapsedDays: number): number {
  if (stability <= 0) return 0;
  return 1 / (1 + elapsedDays / (9 * stability));
}

/** Interval (days) that decays retrievability from 1 down to the requested retention. */
function intervalForRetention(stability: number, requestRetention: number): number {
  const r = clamp(requestRetention, 0.5, 0.99);
  return 9 * stability * (1 / r - 1);
}

/** Initial difficulty for a brand-new card, clamped to [1, 10]. */
function initialDifficulty(grade: number): number {
  return clamp(W[4] - W[5] * (grade - 3), 1, 10);
}

/** Difficulty update with mean reversion toward the Good baseline. */
function nextDifficulty(difficulty: number, grade: number): number {
  const delta = difficulty - W[6] * (grade - 3);
  const reverted = W[7] * initialDifficulty(GOOD) + (1 - W[7]) * delta;
  return clamp(reverted, 1, 10);
}

/** Stability after a successful recall (Hard/Good/Easy). */
function stabilityAfterRecall(
  stability: number,
  difficulty: number,
  retrievability: number,
  grade: number,
  params: SchedulerParams,
): number {
  let gradeScale = 1;
  if (grade === HARD) gradeScale = W[15] * params.hardIntervalMultiplier;
  else if (grade === EASY) gradeScale = W[16] * params.easyBonus;

  const increment =
    Math.exp(W[8]) *
    (11 - difficulty) *
    Math.pow(stability, -W[9]) *
    (Math.exp(W[10] * (1 - retrievability)) - 1) *
    gradeScale;

  return stability * (1 + increment);
}

/** Post-lapse stability after forgetting (Again). Never exceeds the prior stability. */
function stabilityAfterLapse(
  stability: number,
  difficulty: number,
  retrievability: number,
): number {
  const lapsed =
    W[11] *
    Math.pow(difficulty, -W[12]) *
    (Math.pow(stability + 1, W[13]) - 1) *
    Math.exp(W[14] * (1 - retrievability));
  return clamp(Math.min(lapsed, stability), MIN_STABILITY, stability);
}

/** Apply ±FUZZ_RATIO jitter (via injectable RNG) to a Review interval. */
function fuzzInterval(days: number, rng: () => number): number {
  if (days < FUZZ_MIN_DAYS) return days;
  const factor = 1 + (rng() * 2 - 1) * FUZZ_RATIO;
  return days * factor;
}

/**
 * Executes a review for a card, updating its FSRS variables and producing a
 * historical log entry.
 *
 * @param card   Current card object
 * @param rating User rating on the 1–5 confidence scale
 * @param now    Date/time of review
 * @param params Scheduler parameters (retention + user multipliers)
 * @param rng    Injectable RNG for interval fuzz (defaults to Math.random; tests pass a fixed value)
 */
export function reviewCard(
  card: Card,
  rating: Rating,
  now: Date = new Date(),
  params: SchedulerParams = DEFAULT_PARAMS,
  rng: () => number = Math.random,
): { updatedCard: Card; log: ReviewLog } {
  const oldStability = card.stability;
  const oldDifficulty = card.difficulty;
  const grade = ratingToGrade(rating);
  const isNew = card.state === STATES.New;
  const maxInterval = params.maxInterval ?? DEFAULT_MAX_INTERVAL;

  // Elapsed time since the last review (fractional days).
  let elapsedDays: number;
  if (card.lastReviewed) {
    const diffMs = now.getTime() - new Date(card.lastReviewed).getTime();
    elapsedDays = Math.max(0, diffMs / (24 * 60 * 60 * 1000));
  } else {
    elapsedDays = card.elapsedDays || 0;
  }

  const retrievability = isNew ? 1 : calculateRetrievability(oldStability, elapsedDays);

  let nextState: number;
  let nextDifficultyValue: number;
  let nextStability: number;

  if (grade === AGAIN) {
    // Lapse: New/Learning stay in Learning, Review/Relearning move to Relearning.
    nextState =
      card.state === STATES.New || card.state === STATES.Learning
        ? STATES.Learning
        : STATES.Relearning;
    nextDifficultyValue = isNew ? initialDifficulty(AGAIN) : nextDifficulty(oldDifficulty, AGAIN);
    nextStability = isNew
      ? W[0]
      : stabilityAfterLapse(oldStability, oldDifficulty, retrievability);
  } else {
    // Successful recall → Review state.
    nextState = STATES.Review;
    nextDifficultyValue = isNew ? initialDifficulty(grade) : nextDifficulty(oldDifficulty, grade);
    if (isNew) {
      nextStability = W[grade - 1];
    } else if (card.state === STATES.Learning || card.state === STATES.Relearning) {
      // Graduating from (re)learning: recover to at least the grade's base stability.
      nextStability = Math.max(oldStability, W[grade - 1]);
    } else {
      nextStability = stabilityAfterRecall(oldStability, nextDifficultyValue, retrievability, grade, params);
    }
    if (rating === 5) nextStability *= PERFECT_BONUS;
  }

  nextStability = Math.max(MIN_STABILITY, nextStability);

  // Scheduled interval.
  let scheduledDays: number;
  if (nextState === STATES.Learning || nextState === STATES.Relearning) {
    scheduledDays = LEARN_STEP_DAYS; // resurface soon; the session queue also re-shows failed cards
  } else {
    const raw = intervalForRetention(nextStability, params.requestRetention);
    const fuzzed = fuzzInterval(raw, rng);
    scheduledDays = clamp(Math.round(fuzzed), 1, maxInterval);
  }

  const due = new Date(now.getTime() + scheduledDays * 24 * 60 * 60 * 1000);

  const updatedCard: Card = {
    ...card,
    state: nextState,
    stability: Number(nextStability.toFixed(4)),
    difficulty: Number(nextDifficultyValue.toFixed(2)),
    elapsedDays: Number(elapsedDays.toFixed(4)),
    scheduledDays: Number(scheduledDays.toFixed(4)),
    due,
    lastReviewed: now,
  };

  const log: ReviewLog = {
    cardId: card.id || 0,
    deckId: card.deckId,
    classId: card.classId,
    reviewedAt: now,
    rating,
    stability: oldStability,
    difficulty: oldDifficulty,
    elapsedDays: Number(elapsedDays.toFixed(4)),
    scheduledDays: Number(scheduledDays.toFixed(4)),
  };

  return { updatedCard, log };
}

/**
 * Converts a fractional day interval into a human-readable string.
 * Examples: "< 5m", "15m", "1h", "1d", "3mo", "1.5y"
 */
export function formatInterval(days: number): string {
  if (days < 0.0035) return '< 5m';
  if (days < 0.041) {
    const mins = Math.round(days * 24 * 60);
    return `${mins}m`;
  }
  if (days < 1.0) {
    const hours = Math.round(days * 24);
    return `${hours}h`;
  }
  if (days < 30) {
    return `${Math.round(days)}d`;
  }
  if (days < 365) {
    const months = (days / 30).toFixed(1).replace('.0', '');
    return `${months}mo`;
  }
  const years = (days / 365).toFixed(1).replace('.0', '');
  return `${years}y`;
}
