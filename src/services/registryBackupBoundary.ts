import type { MediaAsset } from '../db/schema';
import {
  assertRuntimeRegistryReferencesAvailable,
} from './backupRegistryReferences';
import {
  exportRegistryNativeBackupMedia as exportMediaEnvelope,
  importRegistryNativeBackupMedia as importMediaEnvelope,
  type RegistryNativeBackupExport,
  type RegistryNativeBackupImport,
} from './registryBackupMedia';

interface TextDeck {
  notes?: string;
}

interface TextCard {
  front: string;
  back: string;
}

/** Export media only when every persisted runtime reference has a registry row. */
export async function exportRegistryNativeBackupMedia<
  TDeck extends TextDeck,
  TCard extends TextCard,
>(
  decks: readonly TDeck[],
  cards: readonly TCard[],
  registryAssets: readonly MediaAsset[],
  exportedAt: string,
): Promise<RegistryNativeBackupExport<TDeck, TCard>> {
  const result = await exportMediaEnvelope(
    decks,
    cards,
    registryAssets,
    exportedAt,
  );
  assertRuntimeRegistryReferencesAvailable(
    result.decks,
    result.cards,
    new Set(
      result.media
        .filter((row) => row.usage === 'registry' || row.usage === 'both')
        .map((row) => row.hash),
    ),
  );
  return result;
}

/** Import media only when every persisted runtime reference will resolve. */
export async function importRegistryNativeBackupMedia<
  TDeck extends TextDeck,
  TCard extends TextCard,
>(
  decks: readonly TDeck[],
  cards: readonly TCard[],
  value: unknown,
): Promise<RegistryNativeBackupImport<TDeck, TCard>> {
  const result = await importMediaEnvelope(decks, cards, value);
  assertRuntimeRegistryReferencesAvailable(
    result.decks,
    result.cards,
    new Set(result.media.map((asset) => asset.hash)),
  );
  return result;
}
