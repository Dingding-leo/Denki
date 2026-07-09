import { db } from '../db';

const BACKUP_ENDPOINT = '/api/backup';
const DEBOUNCE_MS = 2000; // Save 2 seconds after last change

let debounceTimer: ReturnType<typeof setTimeout> | null = null;

interface BackupSnapshot {
  version?: number;
  exportedAt?: string;
  data: {
    classes: unknown[];
    decks: unknown[];
    cards: unknown[];
    reviews: unknown[];
  };
}

/**
 * Export the entire Dexie database to a plain JSON snapshot. The version is
 * taken from the live schema so it never drifts from the actual DB version.
 */
export async function exportDatabase(): Promise<BackupSnapshot> {
  const [classes, decks, cards, reviews] = await Promise.all([
    db.classes.toArray(),
    db.decks.toArray(),
    db.cards.toArray(),
    db.reviews.toArray(),
  ]);

  return {
    version: db.verno,
    exportedAt: new Date().toISOString(),
    data: { classes, decks, cards, reviews },
  };
}

/** Revive ISO date strings (from a JSON round-trip) back into Date objects. */
function reviveDates(rows: unknown[] = [], fields: string[]): unknown[] {
  return rows.map((row) => {
    const r = { ...(row as Record<string, unknown>) };
    for (const f of fields) {
      if (typeof r[f] === 'string') r[f] = new Date(r[f] as string);
    }
    return r;
  });
}

/**
 * Import a JSON snapshot into the Dexie database (full restore).
 *
 * Dates arrive as ISO strings after JSON serialization and MUST be revived to
 * Date objects — IndexedDB keys are type-ordered (number < Date < string), so a
 * string `due` sorts outside every Date-typed range query and the restored
 * cards would silently vanish from due counts, the study queue, and stats.
 */
export async function importDatabase(snapshot: BackupSnapshot) {
  if (typeof snapshot.version === 'number' && snapshot.version > db.verno) {
    throw new Error(
      `Backup version ${snapshot.version} is newer than this app's schema (${db.verno}); refusing to import.`,
    );
  }

  const classes = reviveDates(snapshot.data.classes, ['createdAt']);
  const decks = reviveDates(snapshot.data.decks, ['createdAt']);
  const cards = reviveDates(snapshot.data.cards, ['createdAt', 'due', 'lastReviewed']);
  const reviews = reviveDates(snapshot.data.reviews, ['reviewedAt']);

  await db.transaction('rw', [db.classes, db.decks, db.cards, db.reviews], async () => {
    await db.classes.clear();
    await db.decks.clear();
    await db.cards.clear();
    await db.reviews.clear();

    if (classes.length) await db.classes.bulkAdd(classes as never[]);
    if (decks.length) await db.decks.bulkAdd(decks as never[]);
    if (cards.length) await db.cards.bulkAdd(cards as never[]);
    if (reviews.length) await db.reviews.bulkAdd(reviews as never[]);
  });
}

/**
 * Save the database snapshot to the filesystem via the Vite plugin endpoint.
 * Called automatically after every data mutation, debounced.
 */
async function saveToFilesystem() {
  try {
    const snapshot = await exportDatabase();
    const res = await fetch(BACKUP_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(snapshot),
    });
    if (res.ok) {
      console.log('[Denki Backup] Auto-saved to filesystem at', snapshot.exportedAt);
    } else {
      console.warn('[Denki Backup] Save failed:', await res.text());
    }
  } catch (err) {
    // Silently fail if backup endpoint is unavailable (e.g. production)
    console.warn('[Denki Backup] Endpoint unavailable:', err);
  }
}

/**
 * Trigger a debounced auto-save. Call this after every data mutation.
 */
export function triggerAutoSave() {
  if (debounceTimer) clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => {
    saveToFilesystem();
  }, DEBOUNCE_MS);
}

/**
 * Force an immediate save (no debounce). Use before app unload.
 */
export function forceSave() {
  if (debounceTimer) clearTimeout(debounceTimer);
  saveToFilesystem();
}

/**
 * Check if the database is empty, and if so, restore from the filesystem backup.
 * Returns true if data was restored.
 */
export async function restoreFromBackupIfNeeded(): Promise<boolean> {
  const classCount = await db.classes.count();
  const cardCount = await db.cards.count();

  // Only restore if database is completely empty
  if (classCount > 0 || cardCount > 0) {
    return false;
  }

  try {
    const res = await fetch(BACKUP_ENDPOINT);
    if (!res.ok) {
      console.log('[Denki Backup] No backup file found on server.');
      return false;
    }

    const snapshot = await res.json();
    if (!snapshot?.data?.classes?.length && !snapshot?.data?.cards?.length) {
      console.log('[Denki Backup] Backup file is empty, nothing to restore.');
      return false;
    }

    await importDatabase(snapshot);
    console.log(
      `[Denki Backup] Restored from backup (${snapshot.exportedAt}): ` +
        `${snapshot.data.classes?.length || 0} classes, ` +
        `${snapshot.data.decks?.length || 0} decks, ` +
        `${snapshot.data.cards?.length || 0} cards, ` +
        `${snapshot.data.reviews?.length || 0} reviews`
    );
    return true;
  } catch (err) {
    console.warn('[Denki Backup] Failed to restore from backup:', err);
    return false;
  }
}

/**
 * Manually trigger a full export + download as a JSON file (user-initiated backup)
 */
export async function downloadBackup() {
  const snapshot = await exportDatabase();
  const blob = new Blob([JSON.stringify(snapshot, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `denki-backup-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
}
