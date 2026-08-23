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
    mediaIntegrityWarnings: number;
  };
  browser: {
    usageBytes: number | null;
    quotaBytes: number | null;
    usagePercent: number | null;
    persisted: boolean | null;
  };
  lastBackupExportedAt: string | null;
}

function finiteNonNegative(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0
    ? value
    : null;
}

function arrayBufferByteLength(value: unknown): number | null {
  return Object.prototype.toString.call(value) === '[object ArrayBuffer]'
    ? (value as ArrayBuffer).byteLength
    : null;
}

async function readBrowserStorage(): Promise<StorageHealthSnapshot['browser']> {
  const storage = globalThis.navigator?.storage;
  let usageBytes: number | null = null;
  let quotaBytes: number | null = null;
  let persisted: boolean | null = null;

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
      persisted = await storage.persisted();
    } catch {
      // Unsupported or denied persistence queries are represented as unknown.
    }
  }

  const usagePercent =
    usageBytes !== null && quotaBytes !== null && quotaBytes > 0
      ? Math.max(0, Math.min(100, (usageBytes / quotaBytes) * 100))
      : null;

  return { usageBytes, quotaBytes, usagePercent, persisted };
}

/**
 * Read one consistent library snapshot, then query browser-origin storage.
 * Browser usage includes IndexedDB, Cache Storage, and other same-origin data;
 * verified media bytes are reported separately from Denki's media registry.
 */
export async function collectStorageHealth(): Promise<StorageHealthSnapshot> {
  const library = await db.transaction(
    'r',
    [db.classes, db.decks, db.cards, db.reviews, db.media],
    async () => {
      const [classes, decks, cards, reviews, media] = await Promise.all([
        db.classes.count(),
        db.decks.count(),
        db.cards.count(),
        db.reviews.count(),
        db.media.toArray(),
      ]);

      let mediaBytes = 0;
      let mediaIntegrityWarnings = 0;
      for (const asset of media) {
        const actualBytes = arrayBufferByteLength(asset.data);
        if (
          actualBytes === null ||
          !Number.isSafeInteger(asset.byteLength) ||
          asset.byteLength < 0 ||
          asset.byteLength !== actualBytes
        ) {
          mediaIntegrityWarnings += 1;
        }
        if (actualBytes !== null) mediaBytes += actualBytes;
      }

      return {
        classes,
        decks,
        cards,
        reviews,
        mediaObjects: media.length,
        mediaBytes,
        mediaIntegrityWarnings,
      };
    },
  );

  const [browser, lastBackup] = await Promise.all([
    readBrowserStorage(),
    Promise.resolve(getLastBackupExportedAt()),
  ]);

  return {
    capturedAt: new Date().toISOString(),
    library,
    browser,
    lastBackupExportedAt: lastBackup?.toISOString() ?? null,
  };
}
