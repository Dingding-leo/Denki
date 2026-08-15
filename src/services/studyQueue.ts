import type { Card } from '../db/schema';
import type { Rating } from './reviewRatings';

type RandomSource = () => number;
function randomUnit(rng: RandomSource): number {
  const value = rng();
  if (!Number.isFinite(value)) return 0.5;
  return Math.min(0.999999999, Math.max(0, value));
}

function randomInteger(min: number, max: number, rng: RandomSource): number {
  if (max <= min) return min;
  return min + Math.floor(randomUnit(rng) * (max - min + 1));
}

/** Fisher–Yates shuffle that never mutates the caller's card array. */
export function shuffleCards(cards: readonly Card[], rng: RandomSource = Math.random): Card[] {
  const shuffled = [...cards];
  for (let index = shuffled.length - 1; index > 0; index--) {
    const swapIndex = Math.floor(randomUnit(rng) * (index + 1));
    [shuffled[index], shuffled[swapIndex]] = [shuffled[swapIndex], shuffled[index]];
  }
  return shuffled;
}

/**
 * Build a fresh session order. After shuffling, class-wide sessions are lightly
 * interleaved so one deck does not appear as a long mechanical block when a
 * different deck is still available later in the queue.
 */
export function buildStudyQueue(
  cards: readonly Card[],
  rng: RandomSource = Math.random,
): Card[] {
  const queue = shuffleCards(cards, rng);
  if (new Set(queue.map((card) => card.deckId)).size <= 1) return queue;

  for (let index = 1; index < queue.length; index++) {
    const previousDeckId = queue[index - 1].deckId;
    if (queue[index].deckId !== previousDeckId) continue;

    const candidates: number[] = [];
    for (let candidate = index + 1; candidate < queue.length; candidate++) {
      if (queue[candidate].deckId !== previousDeckId) candidates.push(candidate);
    }
    if (candidates.length === 0) continue;

    const candidateIndex = candidates[
      Math.floor(randomUnit(rng) * candidates.length)
    ];
    [queue[index], queue[candidateIndex]] = [queue[candidateIndex], queue[index]];
  }

  return queue;
}

/**
 * Choose where a failed card should reappear. Again returns soon, but within a
 * random 2–5-card window; Hard returns later in a random, queue-relative window.
 * This preserves learning intent without producing a memorisable fixed pattern.
 */
export function pickReinsertIndex(
  queueLength: number,
  nextIndex: number,
  rating: Rating,
  rng: RandomSource = Math.random,
): number {
  const remaining = Math.max(0, queueLength - nextIndex);
  if (remaining === 0 || rating > 2) return queueLength;

  let minimumDistance: number;
  let maximumDistance: number;

  if (rating === 1) {
    minimumDistance = Math.min(2, remaining);
    maximumDistance = Math.min(5, remaining);
  } else {
    const relativeMinimum = Math.max(4, Math.ceil(remaining * 0.12));
    const relativeMaximum = Math.max(relativeMinimum, Math.ceil(remaining * 0.32));
    minimumDistance = Math.min(relativeMinimum, remaining);
    maximumDistance = Math.min(relativeMaximum, remaining);
  }

  const distance = randomInteger(minimumDistance, maximumDistance, rng);
  return Math.min(queueLength, nextIndex + distance);
}
