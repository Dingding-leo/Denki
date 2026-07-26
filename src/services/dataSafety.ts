import { db } from '../db';
import { toast } from '../store/uiStore';

export const LAST_BACKUP_EXPORT_KEY = 'denki-last-backup-export';
const LAST_NUDGE_KEY = 'denki-backup-nudge-at';

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
const MIN_CARDS_FOR_NUDGE = 20;

/** Record that the user just exported a backup (called by downloadBackup). */
export function markBackupExported() {
  try {
    localStorage.setItem(LAST_BACKUP_EXPORT_KEY, String(Date.now()));
  } catch {
    /* storage unavailable — nothing to record */
  }
}

const readTimestamp = (key: string): number => {
  try {
    const raw = localStorage.getItem(key);
    const parsed = raw === null ? NaN : parseInt(raw, 10);
    return Number.isFinite(parsed) ? parsed : 0;
  } catch {
    return 0;
  }
};

let persistRequested = false;

/**
 * Ask the browser to protect IndexedDB from storage-pressure eviction.
 * Without this, a "Best Effort" origin can silently lose the whole database
 * when disk runs low — unacceptable for a local-first study archive.
 */
export async function requestPersistentStorage() {
  try {
    if (persistRequested || !navigator.storage?.persist) return;
    persistRequested = true;
    const alreadyPersisted = await navigator.storage.persisted();
    if (alreadyPersisted) return;
    const granted = await navigator.storage.persist();
    console.log(`[Denki] Persistent storage ${granted ? 'granted' : 'not granted'}`);
  } catch {
    /* unsupported browser — nothing to do */
  }
}

let nudgeChecked = false;

/** Test-only: clear the once-per-boot guards. */
export function _resetDataSafetyForTests() {
  persistRequested = false;
  nudgeChecked = false;
}

/**
 * Gentle weekly reminder to export a backup once the collection is worth
 * protecting. At most one nudge per week, and only when the last export
 * (if any) is older than a week.
 */
export async function maybeNudgeBackup() {
  try {
    if (nudgeChecked) return;
    nudgeChecked = true;
    const cardCount = await db.cards.count();
    if (cardCount < MIN_CARDS_FOR_NUDGE) return;

    const now = Date.now();
    const lastExport = readTimestamp(LAST_BACKUP_EXPORT_KEY);
    const lastNudge = readTimestamp(LAST_NUDGE_KEY);
    if (now - lastExport < WEEK_MS || now - lastNudge < WEEK_MS) return;

    localStorage.setItem(LAST_NUDGE_KEY, String(now));
    toast(
      lastExport === 0
        ? `You have ${cardCount} cards stored only in this browser — export a backup from Settings to keep them safe.`
        : 'It has been over a week since your last backup — export a fresh one from Settings.',
      'info',
      9000,
    );
  } catch {
    /* db unavailable — skip the nudge */
  }
}
