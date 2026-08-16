import { db } from '../db';

/**
 * Quote a CSV field when it contains a comma, quote, or newline (RFC 4180), and
 * neutralize spreadsheet formula injection: cells starting with `=`, `+`, `-`,
 * or `@` are prefixed with a single quote so Excel/Sheets treat them as text.
 */
function csvField(value: string): string {
  const safe = /^[=+\-@]/.test(value) ? `'${value}` : value;
  return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

interface ExportableCard {
  front: string;
  back: string;
  cardType: string;
}

export function buildDeckCsv(cards: ExportableCard[]): string {
  const header = 'Front,Back,Type';
  const rows = cards.map((card) => [
    csvField(card.front),
    csvField(card.back),
    card.cardType,
  ].join(','));
  return [header, ...rows].join('\n');
}

function sanitizeFilename(name: string): string {
  return (name || 'deck').replace(/[^a-z0-9\-_]+/gi, '_').slice(0, 60);
}

function downloadText(text: string, filename: string, mime: string): void {
  // The UTF-8 BOM improves non-English text detection in spreadsheet apps.
  const blob = new Blob([mime.includes('csv') ? '\uFEFF' : '', text], { type: mime });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.style.display = 'none';
  document.body.appendChild(anchor);

  try {
    anchor.click();
  } finally {
    anchor.remove();
    // Safari can still be consuming the object URL when click() returns.
    window.setTimeout(() => URL.revokeObjectURL(url), 0);
  }
}

/** Export one deck's cards as a downloadable CSV file. */
export async function exportDeckToCsv(deckId: number, deckName: string): Promise<void> {
  const deck = await db.decks.get(deckId);
  if (!deck) throw new Error('Deck not found.');
  const cards = await db.cards.where('deckId').equals(deckId).toArray();
  downloadText(
    buildDeckCsv(cards),
    `${sanitizeFilename(deckName || deck.name)}.csv`,
    'text/csv;charset=utf-8',
  );
}
