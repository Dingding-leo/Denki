import { db } from '../db';

export const NEW_CARDS_PER_DAY_KEY = 'denki-new-cards-per-day';
export const DEFAULT_NEW_CARDS_PER_DAY = 20;
export const MAX_NEW_CARDS_PER_DAY = 999;

/** Read the per-deck daily introduction limit from untrusted localStorage. */
export function loadNewCardsPerDay(): number {
  try {
    if (typeof localStorage === 'undefined') return DEFAULT_NEW_CARDS_PER_DAY;
    const raw = localStorage.getItem(NEW_CARDS_PER_DAY_KEY);
    if (raw === null) return DEFAULT_NEW_CARDS_PER_DAY;
    const parsed = Number.parseInt(raw, 10);
    if (!Number.isFinite(parsed) || parsed < 0) return DEFAULT_NEW_CARDS_PER_DAY;
    return Math.min(parsed, MAX_NEW_CARDS_PER_DAY);
  } catch {
    return DEFAULT_NEW_CARDS_PER_DAY;
  }
}

/**
 * Count cards first introduced today, grouped by deck. A first review carries
 * pre-review stability 0; later scheduled reviews always carry stability > 0.
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

/** How many additional new cards a deck may introduce today. */
export function newCardAllowance(
  deckId: number,
  introducedByDeck: Map<number, number>,
  limit: number,
): number {
  if (limit <= 0) return Infinity;
  return Math.max(0, limit - (introducedByDeck.get(deckId) ?? 0));
}
