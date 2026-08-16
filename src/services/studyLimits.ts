// Daily new-card limits were retired in favour of learner-controlled sessions.
// These exports remain as a compatibility shim for older code and data.
export const NEW_CARDS_PER_DAY_KEY = 'denki-new-cards-per-day';
export const DEFAULT_NEW_CARDS_PER_DAY = 0;

/** Always unlimited. Any legacy localStorage value is deliberately ignored. */
export function loadNewCardsPerDay(): number {
  return 0;
}

export function countNewIntroducedToday(): Promise<Map<number, number>> {
  return Promise.resolve(new Map<number, number>());
}

/** Infinity signals that every new card may enter the current session. */
export function newCardAllowance(
  deckId: number,
  introducedByDeck: Map<number, number>,
  limit: number,
): number {
  void deckId;
  void introducedByDeck;
  void limit;
  return Infinity;
}
