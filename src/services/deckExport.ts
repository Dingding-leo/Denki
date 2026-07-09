import { db } from '../db';

/** Quote a CSV field when it contains a comma, quote, or newline (RFC 4180). */
function csvField(value: string): string {
  return /[",\n\r]/.test(value) ? '"' + value.replace(/"/g, '""') + '"' : value;
}

interface ExportableCard {
  front: string;
  back: string;
  cardType: string;
}

/**
 * Serialize a deck's cards to CSV with a `Front,Back,Type` header. The output
 * round-trips through importFromCSV (which skips that header on import).
 */
export function buildDeckCsv(cards: ExportableCard[]): string {
  const header = 'Front,Back,Type';
  const rows = cards.map((c) => [csvField(c.front), csvField(c.back), c.cardType].join(','));
  return [header, ...rows].join('\n');
}

function sanitizeFilename(name: string): string {
  return (name || 'deck').replace(/[^a-z0-9\-_]+/gi, '_').slice(0, 60);
}

function downloadText(text: string, filename: string, mime: string): void {
  const blob = new Blob([text], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/** Export one deck's cards as a downloadable CSV file. */
export async function exportDeckToCsv(deckId: number, deckName: string): Promise<void> {
  const cards = await db.cards.where('deckId').equals(deckId).toArray();
  downloadText(buildDeckCsv(cards), `${sanitizeFilename(deckName)}.csv`, 'text/csv;charset=utf-8');
}
