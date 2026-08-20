import { MEDIA_REFERENCE_PREFIX } from './mediaRegistry';

const HASH_LENGTH = 64;
const HASH_PATTERN = /^[a-f0-9]{64}$/;
const LEADING_BOUNDARY_CHARACTERS = new Set([
  '"',
  "'",
  '`',
  '<',
  '>',
  '(',
  '[',
  '{',
  '=',
]);
const TRAILING_BOUNDARY_CHARACTERS = new Set([
  '"',
  "'",
  '`',
  '<',
  '>',
  ')',
  ']',
  '}',
]);

interface TextDeck {
  notes?: string;
}

interface TextCard {
  front: string;
  back: string;
}

export interface RuntimeRegistryReferenceMatch {
  reference: string;
  hash: string;
  start: number;
  end: number;
}

function isLeadingBoundary(value: string | undefined): boolean {
  return (
    value === undefined ||
    /\s/.test(value) ||
    LEADING_BOUNDARY_CHARACTERS.has(value)
  );
}

function isTrailingBoundary(text: string, end: number): boolean {
  const value = text[end];
  return (
    value === undefined ||
    /\s/.test(value) ||
    TRAILING_BOUNDARY_CHARACTERS.has(value) ||
    (value === '/' && text[end + 1] === '>')
  );
}

function textFields<TDeck extends TextDeck, TCard extends TextCard>(
  decks: readonly TDeck[],
  cards: readonly TCard[],
): string[] {
  return [
    ...decks.map((deck) => deck.notes ?? ''),
    ...cards.flatMap((card) => [card.front, card.back]),
  ];
}

/**
 * Find exact, standalone runtime registry references in source text.
 *
 * The boundary checks prevent a valid 64-character hash prefix from making a
 * longer custom-protocol URL look valid (for example `<hash>suffix`).
 */
export function findRuntimeRegistryReferences(
  text: string,
): RuntimeRegistryReferenceMatch[] {
  if (!text.includes(MEDIA_REFERENCE_PREFIX)) return [];

  const matches: RuntimeRegistryReferenceMatch[] = [];
  let cursor = 0;

  while (cursor < text.length) {
    const start = text.indexOf(MEDIA_REFERENCE_PREFIX, cursor);
    if (start < 0) break;

    const hashStart = start + MEDIA_REFERENCE_PREFIX.length;
    const end = hashStart + HASH_LENGTH;
    const hash = text.slice(hashStart, end);
    const leading = start === 0 ? undefined : text[start - 1];

    if (
      !HASH_PATTERN.test(hash) ||
      !isLeadingBoundary(leading) ||
      !isTrailingBoundary(text, end)
    ) {
      throw new Error(
        'Content contains a malformed runtime registry reference.',
      );
    }

    matches.push({
      reference: text.slice(start, end),
      hash,
      start,
      end,
    });
    cursor = end;
  }

  return matches;
}

export function replaceRuntimeRegistryReferences(
  text: string,
  replacements: ReadonlyMap<string, string>,
): string {
  const matches = findRuntimeRegistryReferences(text);
  if (matches.length === 0) return text;

  let output = '';
  let cursor = 0;
  for (const match of matches) {
    const replacement = replacements.get(match.reference);
    if (replacement === undefined) {
      throw new Error(
        `Media export is missing a replacement for registry media ${match.hash}.`,
      );
    }
    output += text.slice(cursor, match.start);
    output += replacement;
    cursor = match.end;
  }
  return output + text.slice(cursor);
}

export function collectRuntimeRegistryReferences<
  TDeck extends TextDeck,
  TCard extends TextCard,
>(
  decks: readonly TDeck[],
  cards: readonly TCard[],
): Set<string> {
  const references = new Set<string>();
  for (const text of textFields(decks, cards)) {
    for (const match of findRuntimeRegistryReferences(text)) {
      references.add(match.hash);
    }
  }
  return references;
}

export function assertNoRuntimeRegistryReferences<
  TDeck extends TextDeck,
  TCard extends TextCard,
>(
  decks: readonly TDeck[],
  cards: readonly TCard[],
): void {
  if (collectRuntimeRegistryReferences(decks, cards).size > 0) {
    throw new Error(
      'Legacy backup contains a runtime registry reference without a registry-native media table.',
    );
  }
}

export function assertRuntimeRegistryReferencesAvailable<
  TDeck extends TextDeck,
  TCard extends TextCard,
>(
  decks: readonly TDeck[],
  cards: readonly TCard[],
  availableHashes: ReadonlySet<string>,
): void {
  for (const hash of collectRuntimeRegistryReferences(decks, cards)) {
    if (!availableHashes.has(hash)) {
      throw new Error(`Backup references missing registry media ${hash}.`);
    }
  }
}
