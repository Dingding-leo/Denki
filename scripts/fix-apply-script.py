from pathlib import Path

patch_path = Path('scripts/apply-unlimited-drill.py')
text = patch_path.read_text()

# Repair the compatibility-shim source block and make every parameter explicitly
# used so the zero-warning lint gate remains meaningful.
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
  deckId: number,
  introducedByDeck: Map<number, number>,
  limit: number,
): number {
  void deckId;
  void introducedByDeck;
  void limit;
  return Infinity;
}
""",
)'''
text = text[:start] + replacement + text[end:]

# Review is already the initial study mode. Do not synchronize that derived
# route state through an effect; React 19 correctly flags it as a cascade.
effect_start = text.index(
    "page = page.replace(\n    \"  const [totalTimeSpent, setTotalTimeSpent] = useState(0);\\n\","
)
effect_end = text.index("\npage = page.replace(\n    \"    if (session.completedCount", effect_start)
text = text[:effect_start] + text[effect_end + 1:]
patch_path.write_text(text)

# The modal is mounted afresh for each selected deck, so its initial loading and
# error state do not need synchronous resets inside the data-loading effect.
modal_path = Path('src/components/modals/DrillSetupModal.tsx')
modal = modal_path.read_text()
modal = modal.replace("    setLoading(true);\n    setError('');\n", '', 1)
modal_path.write_text(modal)
