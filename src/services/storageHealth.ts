import { db } from '../db';
import { getLastBackupExportedAt } from './dataSafety';

export interface StorageHealthSnapshot {
  capturedAt: string;
  library: {
    classes: number;
    decks: number;
    cards: number;
    reviews: number;
    mediaObjects: number;
    mediaBytes: number;
    mediaMetadataWarnings: number;
  };
  browser: {
    usageBytes: number | null;
    quotaBytes: number | null;
    usagePercent: number | null;
    persisted: boolean | null;
    canRequestPersistence: boolean;
  };
  lastBackupExportedAt: string | null;
}

function finiteNonNegative(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0
    ? value
    : null;
}

function safeStoredByteLength(value: unknown): number | null {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0
    ? value
    : null;
}

async function readBrowserStorage(): Promise<StorageHealthSnapshot['browser']> {
  const storage = globalThis.navigator?.storage;
  let usageBytes: number | null = null;
  let quotaBytes: number | null = null;
  let persisted: boolean | null = null;
  const canRequestPersistence = typeof storage?.persist === 'function';

  if (typeof storage?.estimate === 'function') {
    try {
      const estimate = await storage.estimate();
      usageBytes = finiteNonNegative(estimate.usage);
      quotaBytes = finiteNonNegative(estimate.quota);
    } catch {
      // A browser may expose the API while denying the estimate. The database
      // counts remain useful and this field is reported as unavailable.
    }
  }

  if (typeof storage?.persisted === 'function') {
    try {
      const result = await storage.persisted();
      persisted = typeof result === 'boolean' ? result : null;
    } catch {
      // Unsupported or denied persistence queries are represented as unknown.
    }
  }

  const usagePercent =
    usageBytes !== null && quotaBytes !== null && quotaBytes > 0
      ? Math.max(0, Math.min(100, (usageBytes / quotaBytes) * 100))
      : null;

  return {
    usageBytes,
    quotaBytes,
    usagePercent,
    persisted,
    canRequestPersistence,
  };
}

/**
 * Read one consistent library snapshot, then query browser-origin storage.
 * Browser usage is origin-wide and can include other apps hosted on the same
 * origin. Registry byte totals use the byteLength index, so opening Settings
 * does not deserialize every stored media ArrayBuffer merely to total metadata.
 */
export async function collectStorageHealth(): Promise<StorageHealthSnapshot> {
  const library = await db.transaction(
    'r',
    [db.classes, db.decks, db.cards, db.reviews, db.media],
    async () => {
      const [classes, decks, cards, reviews, mediaObjects] = await Promise.all([
        db.classes.count(),
        db.decks.count(),
        db.cards.count(),
        db.reviews.count(),
        db.media.count(),
      ]);

      let indexedMediaObjects = 0;
      let mediaBytes = 0;
      let mediaMetadataWarnings = 0;
      await db.media.orderBy('byteLength').eachKey((key) => {
        indexedMediaObjects += 1;
        const byteLength = safeStoredByteLength(key);
        if (byteLength === null) {
          mediaMetadataWarnings += 1;
        } else {
          mediaBytes += byteLength;
        }
      });

      // Records with a missing or non-indexable byteLength do not appear in the
      // byteLength index at all. Count them as metadata warnings without loading
      // their binary payloads.
      mediaMetadataWarnings += Math.max(
        0,
        mediaObjects - indexedMediaObjects,
      );

      return {
        classes,
        decks,
        cards,
        reviews,
        mediaObjects,
        mediaBytes,
        mediaMetadataWarnings,
      };
    },
  );

  const browser = await readBrowserStorage();
  const lastBackup = getLastBackupExportedAt();

  return {
    capturedAt: new Date().toISOString(),
    library,
    browser,
    lastBackupExportedAt: lastBackup?.toISOString() ?? null,
  };
}
