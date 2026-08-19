import { CURRENT_SCHEDULER_VERSION } from '../domain/schedulerProvenance';
import type { Card, ReviewLog } from '../db/schema';
import type { Rating } from './reviewRatings';

export type { Rating } from './reviewRatings';

/** Canonical long-term scheduler implemented by Denki. */
export const FSRS_VERSION = CURRENT_SCHEDULER_VERSION;

// FSRS state mapping.
export const STATES = {
  New: 0,
  Learning: 1,
  Review: 2,
  Relearning: 3,
} as const;

/**
 * Canonical FSRS-4.5 default weight vector (17 parameters).
 * Source: open-spaced-repetition/fsrs4anki, “The Algorithm”, FSRS-4.5.
 */
export const FSRS_45_DEFAULT_WEIGHTS = [
  0.4872, 1.4003, 3.7145, 13.8206, 5.1618, 1.2298, 0.8975, 0.031, 1.6474,
  0.1367, 1.0461, 2.1072, 0.0793, 0.3246, 1.587, 0.2272, 2.8755,
] as const;

/** FSRS-4.5 forgetting-curve constants. */
export const FSRS_45_DECAY = -0.5;
export const FSRS_45_FACTOR = 19 / 81;

const AGAIN = 1;
const HARD = 2;
const GOOD = 3;
const EASY = 4;

const MIN_STABILITY = 0.01;
const DEFAULT_MAX_INTERVAL = 36500;

// The short learning steps are the reference ts-fsrs 3.3.0 policy wrapped
// around the canonical FSRS-4.5 long-term memory model.
const MINUTE_DAYS = 1 / (24 * 60);
const NEW_AGAIN_STEP_DAYS = MINUTE_DAYS;
const NEW_HARD_STEP_DAYS = 5 * MINUTE_DAYS;
const NEW_GOOD_STEP_DAYS = 10 * MINUTE_DAYS;
const LEARNING_AGAIN_STEP_DAYS = 5 * MINUTE_DAYS;
const LEARNING_HARD_STEP_DAYS = 10 * MINUTE_DAYS;
const FUZZ_MIN_DAYS = 2.5;

export interface SchedulerParams {
  requestRetention: number;
  maxInterval?: number;
  /** Optional reference-style interval fuzz. Disabled by default. */
  enableFuzz?: boolean;
}

export const DEFAULT_PARAMS: SchedulerParams = {
  requestRetention: 0.9,
  maxInterval: DEFAULT_MAX_INTERVAL,
  enableFuzz: false,
};

export type NewCardSchedulingState = Pick<
  Card,
  | 'state'
  | 'stability'
  | 'difficulty'
  | 'elapsedDays'
  | 'scheduledDays'
  | 'due'
  | 'schedulerVersion'
>;

/** Build the only valid unscheduled state for a newly created or reset card. */
export function createNewCardSchedulingState(
  now: Date = new Date(),
): NewCardSchedulingState {
  return {
    state: STATES.New,
    stability: 0,
    difficulty: 0,
    elapsedDays: 0,
    scheduledDays: 0,
    due: now,
    schedulerVersion: FSRS_VERSION,
  };
}

const clamp = (value: number, minimum: number, maximum: number): number =>
  Math.min(maximum, Math.max(minimum, value));

const finiteOr = (value: number, fallback: number): number =>
  Number.isFinite(value) ? value : fallback;

function initialStability(grade: Rating): number {
  return Math.max(FSRS_45_DEFAULT_WEIGHTS[grade - 1], 0.1);
}

/** Initial difficulty for a brand-new card, clamped to [1, 10]. */
function initialDifficulty(grade: Rating): number {
  return clamp(
    FSRS_45_DEFAULT_WEIGHTS[4] - (grade - 3) * FSRS_45_DEFAULT_WEIGHTS[5],
    1,
    10,
  );
}

/** Difficulty update with mean reversion toward D0(Good). */
function nextDifficulty(difficulty: number, grade: Rating): number {
  const next = difficulty - FSRS_45_DEFAULT_WEIGHTS[6] * (grade - 3);
  const reverted =
    FSRS_45_DEFAULT_WEIGHTS[7] * initialDifficulty(GOOD) +
    (1 - FSRS_45_DEFAULT_WEIGHTS[7]) * next;
  return clamp(Number(reverted.toFixed(2)), 1, 10);
}

/**
 * Canonical FSRS-4.5 forgetting curve:
 * R(t,S) = (1 + (19/81) * t/S)^(-0.5).
 */
export function calculateRetrievability(
  stability: number,
  elapsedDays: number,
): number {
  if (!Number.isFinite(stability) || stability <= 0) return 0;
  const elapsed = Math.max(0, finiteOr(elapsedDays, 0));
  return Math.pow(
    1 + FSRS_45_FACTOR * elapsed / stability,
    FSRS_45_DECAY,
  );
}

/**
 * Solve the FSRS-4.5 forgetting curve for the interval at target retention.
 * This is intentionally exported so reference-vector tests can gate releases.
 */
export function calculateIntervalForRetention(
  stability: number,
  requestRetention: number,
): number {
  const safeStability = Math.max(MIN_STABILITY, finiteOr(stability, MIN_STABILITY));
  const retention = clamp(finiteOr(requestRetention, 0.9), 0.5, 0.99);
  return (
    safeStability / FSRS_45_FACTOR *
    (Math.pow(retention, 1 / FSRS_45_DECAY) - 1)
  );
}

/** Stability after a successful recall (Hard/Good/Easy). */
function stabilityAfterRecall(
  stability: number,
  difficulty: number,
  retrievability: number,
  grade: Rating,
): number {
  const hardPenalty = grade === HARD ? FSRS_45_DEFAULT_WEIGHTS[15] : 1;
  const easyBonus = grade === EASY ? FSRS_45_DEFAULT_WEIGHTS[16] : 1;

  return stability * (
    1 +
    Math.exp(FSRS_45_DEFAULT_WEIGHTS[8]) *
      (11 - difficulty) *
      Math.pow(stability, -FSRS_45_DEFAULT_WEIGHTS[9]) *
      (Math.exp(FSRS_45_DEFAULT_WEIGHTS[10] * (1 - retrievability)) - 1) *
      hardPenalty *
      easyBonus
  );
}

/** Canonical FSRS-4.5 post-lapse stability. */
function stabilityAfterLapse(
  stability: number,
  difficulty: number,
  retrievability: number,
): number {
  const value =
    FSRS_45_DEFAULT_WEIGHTS[11] *
    Math.pow(difficulty, -FSRS_45_DEFAULT_WEIGHTS[12]) *
    (Math.pow(stability + 1, FSRS_45_DEFAULT_WEIGHTS[13]) - 1) *
    Math.exp(FSRS_45_DEFAULT_WEIGHTS[14] * (1 - retrievability));
  return Math.max(MIN_STABILITY, Number(value.toFixed(2)));
}

function normalizedRandom(rng: () => number): number {
  const value = rng();
  if (!Number.isFinite(value)) return 0.5;
  return clamp(value, 0, 0.999999999);
}

/** Apply the reference FSRS interval-fuzz bounds when explicitly enabled. */
function fuzzInterval(days: number, rng: () => number): number {
  if (days < FUZZ_MIN_DAYS) return days;
  const rounded = Math.round(days);
  const minimum = Math.max(2, Math.round(rounded * 0.95 - 1));
  const maximum = Math.round(rounded * 1.05 + 1);
  return Math.floor(
    normalizedRandom(rng) * (maximum - minimum + 1) + minimum,
  );
}

function maximumReviewInterval(params: SchedulerParams): number {
  const configuredMaximum = finiteOr(
    params.maxInterval ?? DEFAULT_MAX_INTERVAL,
    DEFAULT_MAX_INTERVAL,
  );
  // Three distinct Review intervals are required to preserve Hard < Good < Easy.
  return Math.max(3, Math.floor(configuredMaximum));
}

function scheduledReviewDays(
  stability: number,
  params: SchedulerParams,
  rng: () => number,
): number {
  const raw = calculateIntervalForRetention(stability, params.requestRetention);
  const candidate = params.enableFuzz ? fuzzInterval(raw, rng) : raw;
  return clamp(
    Math.round(candidate),
    1,
    maximumReviewInterval(params),
  );
}

function learningGraduationIntervals(
  stability: number,
  params: SchedulerParams,
  rng: () => number,
): { goodDays: number; easyDays: number } {
  const candidate = scheduledReviewDays(stability, params, rng);
  const maximum = maximumReviewInterval(params);

  // Good and Easy share the existing Learning-state memory parameters. Keep
  // them distinct without allowing Easy to overflow the configured maximum.
  const easyDays = Math.min(maximum, Math.max(candidate + 1, 2));
  const goodDays = Math.min(easyDays - 1, Math.max(candidate, 1));
  return { goodDays, easyDays };
}

function elapsedSinceLastReview(card: Card, now: Date): number {
  if (!card.lastReviewed) return 0;
  const previous = new Date(card.lastReviewed).getTime();
  const current = now.getTime();
  if (!Number.isFinite(previous) || !Number.isFinite(current)) return 0;
  return Math.max(0, (current - previous) / (24 * 60 * 60 * 1000));
}

function reviewIntervals(
  stability: number,
  difficulty: number,
  retrievability: number,
  params: SchedulerParams,
  rng: () => number,
): Record<2 | 3 | 4, { stability: number; days: number }> {
  const hardStability = stabilityAfterRecall(
    stability,
    difficulty,
    retrievability,
    HARD,
  );
  const goodStability = stabilityAfterRecall(
    stability,
    difficulty,
    retrievability,
    GOOD,
  );
  const easyStability = stabilityAfterRecall(
    stability,
    difficulty,
    retrievability,
    EASY,
  );

  const hardRaw = scheduledReviewDays(hardStability, params, rng);
  const goodRaw = scheduledReviewDays(goodStability, params, rng);
  const easyRaw = scheduledReviewDays(easyStability, params, rng);
  const maximum = maximumReviewInterval(params);

  // Preserve both invariants at the upper boundary: no rating exceeds the
  // configured maximum, and Hard < Good < Easy remains strict. When candidates
  // bunch at the cap, pull the lower ratings inward instead of overflowing Easy.
  const easyDays = Math.min(maximum, Math.max(easyRaw, 3));
  const goodDays = Math.min(easyDays - 1, Math.max(goodRaw, 2));
  const hardDays = Math.min(goodDays - 1, Math.max(hardRaw, 1));

  return {
    2: { stability: hardStability, days: hardDays },
    3: { stability: goodStability, days: goodDays },
    4: { stability: easyStability, days: easyDays },
  };
}

/**
 * Apply one rating using canonical FSRS-4.5 memory-state equations plus the
 * reference short learning-step state machine.
 */
export function reviewCard(
  card: Card,
  rating: Rating,
  now: Date = new Date(),
  params: SchedulerParams = DEFAULT_PARAMS,
  rng: () => number = Math.random,
): { updatedCard: Card; log: ReviewLog } {
  if (rating < AGAIN || rating > EASY) {
    throw new Error('FSRS rating must be Again, Hard, Good, or Easy.');
  }

  const elapsedDays = elapsedSinceLastReview(card, now);
  const oldStability = Math.max(
    MIN_STABILITY,
    finiteOr(card.stability, MIN_STABILITY),
  );
  const oldDifficulty = clamp(
    finiteOr(card.difficulty, initialDifficulty(GOOD)),
    1,
    10,
  );

  let nextState: number;
  let nextStability: number;
  let nextDifficultyValue: number;
  let scheduledDays: number;

  if (card.state === STATES.New) {
    nextStability = initialStability(rating);
    nextDifficultyValue = initialDifficulty(rating);

    if (rating === AGAIN) {
      nextState = STATES.Learning;
      scheduledDays = NEW_AGAIN_STEP_DAYS;
    } else if (rating === HARD) {
      nextState = STATES.Learning;
      scheduledDays = NEW_HARD_STEP_DAYS;
    } else if (rating === GOOD) {
      nextState = STATES.Learning;
      scheduledDays = NEW_GOOD_STEP_DAYS;
    } else {
      nextState = STATES.Review;
      scheduledDays = scheduledReviewDays(nextStability, params, rng);
    }
  } else if (
    card.state === STATES.Learning ||
    card.state === STATES.Relearning
  ) {
    // FSRS-4.5 keeps the memory state fixed inside short learning steps. Good
    // graduates to Review; Easy graduates at least one day later than Good.
    nextStability = oldStability;
    nextDifficultyValue = oldDifficulty;

    if (rating === AGAIN) {
      nextState = card.state;
      scheduledDays = LEARNING_AGAIN_STEP_DAYS;
    } else if (rating === HARD) {
      nextState = card.state;
      scheduledDays = LEARNING_HARD_STEP_DAYS;
    } else {
      nextState = STATES.Review;
      const { goodDays, easyDays } = learningGraduationIntervals(
        nextStability,
        params,
        rng,
      );
      scheduledDays = rating === EASY ? easyDays : goodDays;
    }
  } else {
    const retrievability = calculateRetrievability(oldStability, elapsedDays);
    nextDifficultyValue = nextDifficulty(oldDifficulty, rating);

    if (rating === AGAIN) {
      nextState = STATES.Relearning;
      nextStability = stabilityAfterLapse(
        oldStability,
        oldDifficulty,
        retrievability,
      );
      scheduledDays = LEARNING_AGAIN_STEP_DAYS;
    } else {
      nextState = STATES.Review;
      const intervals = reviewIntervals(
        oldStability,
        oldDifficulty,
        retrievability,
        params,
        rng,
      );
      nextStability = intervals[rating].stability;
      scheduledDays = intervals[rating].days;
    }
  }

  const due = new Date(now.getTime() + scheduledDays * 24 * 60 * 60 * 1000);
  const updatedCard: Card = {
    ...card,
    state: nextState,
    stability: nextStability,
    difficulty: nextDifficultyValue,
    elapsedDays: Number(elapsedDays.toFixed(4)),
    scheduledDays: Number(scheduledDays.toFixed(6)),
    due,
    lastReviewed: now,
    lastRating: rating,
    schedulerVersion: FSRS_VERSION,
  };

  const log: ReviewLog = {
    cardId: card.id ?? 0,
    deckId: card.deckId,
    classId: card.classId,
    reviewedAt: now,
    rating,
    stability: card.stability,
    difficulty: card.difficulty,
    elapsedDays: Number(elapsedDays.toFixed(4)),
    scheduledDays: Number(scheduledDays.toFixed(6)),
    schedulerVersion: FSRS_VERSION,
  };

  return { updatedCard, log };
}

/** Convert a fractional-day interval into a concise human-readable string. */
export function formatInterval(days: number): string {
  const safeDays = Math.max(0, finiteOr(days, 0));
  const minutes = safeDays * 24 * 60;
  if (minutes < 1) return '< 1m';
  if (minutes < 60) return `${Math.round(minutes)}m`;
  if (safeDays < 1) return `${Math.round(safeDays * 24)}h`;
  if (safeDays < 30) return `${Math.round(safeDays)}d`;
  if (safeDays < 365) {
    const months = (safeDays / 30).toFixed(1).replace('.0', '');
    return `${months}mo`;
  }
  const years = (safeDays / 365).toFixed(1).replace('.0', '');
  return `${years}y`;
}
