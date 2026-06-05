import type { Card, ReviewLog } from '../db/schema';

export type Rating = 1 | 2 | 3 | 4 | 5; // 1 = Not at all, 2 = Slightly, 3 = Moderately, 4 = Very well, 5 = Perfectly

// FSRS state mapping
export const STATES = {
  New: 0,
  Learning: 1,
  Review: 2,
  Relearning: 3,
};

// Scheduler config parameters based on standard FSRS 4.5
export interface SchedulerParams {
  requestRetention: number; // Target retrievability (e.g., 90% chance of recall)
  easyBonus: number;        // Extra interval boost for Easy rating
  hardIntervalMultiplier: number; // Multiplier for Hard rating
}

export const DEFAULT_PARAMS: SchedulerParams = {
  requestRetention: 0.9,
  easyBonus: 1.3,
  hardIntervalMultiplier: 1.2,
};

/**
 * Calculates retrievability (probability of recall) based on stability and elapsed days.
 * Formula: R = (0.9) ^ (elapsedDays / stability)
 */
export function calculateRetrievability(stability: number, elapsedDays: number): number {
  if (stability <= 0) return 0;
  return Math.pow(0.9, elapsedDays / stability);
}

/**
 * Executes a review for a card, updating its spaced repetition variables
 * and generating a historical log entry.
 * 
 * @param card Current card object
 * @param rating User rating (1 to 5)
 * @param now Date/time of review
 * @param params Scheduler parameters
 */
export function reviewCard(
  card: Card,
  rating: Rating,
  now: Date = new Date(),
  params: SchedulerParams = DEFAULT_PARAMS
): { updatedCard: Card; log: ReviewLog } {
  // Keep original state for logs
  const oldStability = card.stability;
  const oldDifficulty = card.difficulty;

  // 1. Calculate elapsed time
  let elapsedDays: number;
  if (card.lastReviewed) {
    const diffMs = now.getTime() - new Date(card.lastReviewed).getTime();
    // Convert ms to fractional days
    elapsedDays = Math.max(0.0001, diffMs / (24 * 60 * 60 * 1000));
  } else {
    // If it's a brand new card or has never been reviewed, elapsed is 0
    elapsedDays = card.elapsedDays || 0;
  }

  // Calculate current retrievability if the card was in active review
  const retrievability = card.state === STATES.Review 
    ? calculateRetrievability(oldStability, elapsedDays) 
    : 1.0;

  let nextState: number;
  let nextDifficulty: number;
  let nextStability: number;

  // 2. State & Algorithm Logic
  if (card.state === STATES.New) {
    // Brand new card
    nextState = rating === 1 ? STATES.Learning : STATES.Review;
    
    // Initial difficulty setting
    // 1 (Not at all): 8.5, 2 (Slightly): 6.5, 3 (Moderately): 4.5, 4 (Very well): 3.0, 5 (Perfectly): 1.5
    if (rating === 1) nextDifficulty = 8.5;
    else if (rating === 2) nextDifficulty = 6.5;
    else if (rating === 3) nextDifficulty = 4.5;
    else if (rating === 4) nextDifficulty = 3.0;
    else nextDifficulty = 1.5;

    // Initial stability (in days)
    // 1: 5 mins (0.003 days), 2: 1 hr (0.04 days), 3: 3.6 hrs (0.15 days), 4: 12 hrs (0.5 days), 5: 1 day (1.0 day)
    if (rating === 1) nextStability = 0.003;
    else if (rating === 2) nextStability = 0.04;
    else if (rating === 3) nextStability = 0.15;
    else if (rating === 4) nextStability = 0.5;
    else nextStability = 1.0;

  } else {
    // Card is in Learning, Review, or Relearning state
    if (rating === 1) {
      // Again (Memory lapse)
      nextState = card.state === STATES.Review ? STATES.Relearning : card.state;
      nextDifficulty = Math.min(10.0, card.difficulty + 1.5);
      
      // Collapse stability (re-learn quickly: 5 mins or small fraction of old stability)
      nextStability = Math.max(0.003, card.stability * 0.15);
    } else {
      // Successful recall (2, 3, 4, 5)
      nextState = STATES.Review;

      // Adjust difficulty (bounded between 1.0 and 10.0)
      // 2 (Slightly): +0.6, 3 (Moderately): -0.1, 4 (Very well): -0.6, 5 (Perfectly): -1.2
      let diffChange = 0;
      if (rating === 2) diffChange = 0.6;
      else if (rating === 3) diffChange = -0.1;
      else if (rating === 4) diffChange = -0.6;
      else if (rating === 5) diffChange = -1.2;

      nextDifficulty = Math.max(1.0, Math.min(10.0, card.difficulty + diffChange));

      // Calculate next stability
      const intervalFactor = 1.0 + 0.5 * (1.0 - retrievability);
      const difficultyFactor = (11.0 - nextDifficulty) / 10.0; // range [0.1, 1.0]

      if (rating === 2) {
        // Slightly / Hard: ultra conservative step
        nextStability = card.stability * 1.02;
      } else if (rating === 3) {
        // Moderately / Good: standard expansion
        nextStability = card.stability * 1.2 * intervalFactor * difficultyFactor;
      } else if (rating === 4) {
        // Very well: stronger expansion
        nextStability = card.stability * 1.6 * intervalFactor * difficultyFactor * params.easyBonus;
      } else {
        // Perfectly / Easy: high expansion
        nextStability = card.stability * 2.2 * intervalFactor * difficultyFactor * params.easyBonus;
      }

      // Bound minimum stability progression for sanity (except for ultra-conservative Rating 2)
      if (rating !== 2) {
        nextStability = Math.max(nextStability, card.stability * 1.05);
      }
    }
  }

  // 3. Compute next scheduled interval
  let scheduledDays: number;
  if (nextState === STATES.Learning || nextState === STATES.Relearning) {
    // Minutes-level due dates for quick active recall in same session
    scheduledDays = nextStability;
  } else {
    // Review state intervals are rounded to full days (minimum 1 day)
    scheduledDays = Math.max(1, Math.round(nextStability));
  }

  // 4. Calculate exact due date
  const due = new Date(now.getTime() + scheduledDays * 24 * 60 * 60 * 1000);

  // Compile updated card fields
  const updatedCard: Card = {
    ...card,
    state: nextState,
    stability: Number(nextStability.toFixed(4)),
    difficulty: Number(nextDifficulty.toFixed(2)),
    elapsedDays: Number(elapsedDays.toFixed(4)),
    scheduledDays: Number(scheduledDays.toFixed(4)),
    due,
    lastReviewed: now,
  };

  // Compile historical review log
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
