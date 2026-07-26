import { db } from '../db';

// localStorage key for the daily new-card introduction limit (0 = unlimited).
export const NEW_CARDS_PER_DAY_KEY = 'denki-new-cards-per-day';
export const DEFAULT_NEW_CARDS_PER_DAY = 20;

/**
 * Reads the user's "new cards per day" limit. Follows the same defensive
 * pattern as loadSchedulerParams — falls back to the default when
 * localStorage is unavailable or holds a non-numeric value.
 */
export function loadNewCardsPerDay(): number {
  try {
    if (typeof localStorage === 'undefined') return DEFAULT_NEW_CARDS_PER_DAY;
    const raw = localStorage.getItem(NEW_CARDS_PER_DAY_KEY);
    if (raw === null) return DEFAULT_NEW_CARDS_PER_DAY;
    const parsed = parseInt(raw, 10);
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : DEFAULT_NEW_CARDS_PER_DAY;
  } catch {
    return DEFAULT_NEW_CARDS_PER_DAY;
  }
}

/**
 * Counts how many NEW cards were introduced (first-ever review) today, per
 * deck. A review log with stability === 0 can only come from a card in the
 * New state — every scheduled card carries stability > 0 — so today's logs
 * alone identify introductions without walking each card's history.
 */
export async function countNewIntroducedToday(): Promise<Map<number, number>> {
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);

  const todayLogs = await db.reviews.where('reviewedAt').aboveOrEqual(startOfDay).toArray();

  const seenCards = new Set<number>();
  const byDeck = new Map<number, number>();
  for (const log of todayLogs) {
    if (log.stability !== 0 || seenCards.has(log.cardId)) continue;
    seenCards.add(log.cardId);
    byDeck.set(log.deckId, (byDeck.get(log.deckId) ?? 0) + 1);
  }
  return byDeck;
}

/** How many more new cards a deck may introduce today. Infinity = no limit. */
export function newCardAllowance(
  deckId: number,
  introducedByDeck: Map<number, number>,
  limit: number,
): number {
  if (limit <= 0) return Infinity;
  return Math.max(0, limit - (introducedByDeck.get(deckId) ?? 0));
}
