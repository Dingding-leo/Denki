import { db } from '../db';
import { BACKUP_MEDIA_LIMITS } from './backupMedia';
import {
  collectRuntimeRegistryReferences,
  replaceRuntimeRegistryReferences,
} from './backupRegistryReferences';
import {
  createMediaReference,
  resolveMediaAsset,
} from './mediaRegistry';

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

function bytesToBase64(bytes: Uint8Array): string {
  const chunks: string[] = [];
  const chunkSize = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    const chunk = bytes.subarray(
      offset,
      Math.min(offset + chunkSize, bytes.length),
    );
    chunks.push(String.fromCharCode(...chunk));
  }
  return globalThis.btoa(chunks.join(''));
}

export function buildDeckCsv(cards: readonly ExportableCard[]): string {
  const header = 'Front,Back,Type';
  const rows = cards.map((card) => [
    csvField(card.front),
    csvField(card.back),
    card.cardType,
  ].join(','));
  return [header, ...rows].join('\n');
}

/**
 * Build a self-contained CSV. Runtime registry references are verified and
 * re-embedded as data URLs before CSV serialization because a standalone CSV
 * cannot carry Denki's IndexedDB media table.
 */
export async function buildPortableDeckCsv(
  cards: readonly ExportableCard[],
): Promise<string> {
  const hashes = collectRuntimeRegistryReferences([], cards);
  if (hashes.size === 0) return buildDeckCsv(cards);
  if (hashes.size > BACKUP_MEDIA_LIMITS.maxAssets) {
    throw new Error(
      `Deck references more than ${BACKUP_MEDIA_LIMITS.maxAssets.toLocaleString()} media objects.`,
    );
  }

  const replacements = new Map<string, string>();
  let totalBytes = 0;

  for (const hash of [...hashes].sort()) {
    const reference = createMediaReference(hash);
    const asset = await resolveMediaAsset(reference);
    if (!asset) {
      throw new Error(`Deck export references missing registry media ${hash}.`);
    }

    totalBytes += asset.byteLength;
    if (totalBytes > BACKUP_MEDIA_LIMITS.maxTotalBytes) {
      throw new Error(
        `Deck media exceeds the ${BACKUP_MEDIA_LIMITS.maxTotalBytes / (1024 * 1024)} MiB CSV export limit.`,
      );
    }

    const bytes = new Uint8Array(await asset.data.arrayBuffer());
    if (bytes.byteLength !== asset.byteLength) {
      throw new Error(`Registry media ${hash} changed during CSV export.`);
    }
    replacements.set(
      reference,
      `data:${asset.mimeType};base64,${bytesToBase64(bytes)}`,
    );
  }

  const portableCards = cards.map((card) => ({
    ...card,
    front: replaceRuntimeRegistryReferences(card.front, replacements),
    back: replaceRuntimeRegistryReferences(card.back, replacements),
  }));
  return buildDeckCsv(portableCards);
}

function sanitizeFilename(name: string): string {
  return (name || 'deck').replace(/[^a-z0-9\-_]+/gi, '_').slice(0, 60);
}

function downloadText(text: string, filename: string, mime: string): void {
  // The UTF-8 BOM improves non-English text detection in spreadsheet apps.
  const blob = new Blob(
    [mime.includes('csv') ? '\uFEFF' : '', text],
    { type: mime },
  );
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

/** Export one deck's cards as a downloadable, self-contained CSV file. */
export async function exportDeckToCsv(
  deckId: number,
  deckName: string,
): Promise<void> {
  const deck = await db.decks.get(deckId);
  if (!deck) throw new Error('Deck not found.');
  const cards = await db.cards.where('deckId').equals(deckId).toArray();
  downloadText(
    await buildPortableDeckCsv(cards),
    `${sanitizeFilename(deckName || deck.name)}.csv`,
    'text/csv;charset=utf-8',
  );
}
