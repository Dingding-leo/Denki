from pathlib import Path

path = Path('scripts/apply-unlimited-drill.py')
text = path.read_text()
start = text.index("write(\n    'src/services/studyLimits.ts',")
end = text.index("\n\n# Store/session types.", start)
replacement = '''write(
    'src/services/studyLimits.ts',
    """// Daily new-card limits were retired in favour of learner-controlled sessions.
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
  _deckId: number,
  _introducedByDeck: Map<number, number>,
  _limit: number,
): number {
  return Infinity;
}
""",
)'''
path.write_text(text[:start] + replacement + text[end:])
