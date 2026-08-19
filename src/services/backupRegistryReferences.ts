import { MEDIA_REFERENCE_PREFIX } from './mediaRegistry';

const REFERENCE_PATTERN = new RegExp(
  `${MEDIA_REFERENCE_PREFIX.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}([a-f0-9]{64})`,
  'g',
);

interface TextDeck {
  notes?: string;
}

interface TextCard {
  front: string;
  back: string;
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

export function collectRuntimeRegistryReferences<
  TDeck extends TextDeck,
  TCard extends TextCard,
>(
  decks: readonly TDeck[],
  cards: readonly TCard[],
): Set<string> {
  const references = new Set<string>();
  for (const text of textFields(decks, cards)) {
    if (!text.includes(MEDIA_REFERENCE_PREFIX)) continue;
    const matcher = new RegExp(REFERENCE_PATTERN.source, 'g');
    for (const match of text.matchAll(matcher)) references.add(match[1]);

    const remainder = text.replace(matcher, '');
    if (remainder.includes(MEDIA_REFERENCE_PREFIX)) {
      throw new Error('Backup contains a malformed runtime registry reference.');
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
