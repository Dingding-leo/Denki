import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '../../db';
import type { Card } from '../../db/schema';
import { useUIStore } from '../../store/uiStore';
import {
  _resetDataSafetyForTests,
  markBackupExported,
  maybeNudgeBackup,
  requestPersistentStorageFromUserGesture,
} from '../dataSafety';

const originalStorageDescriptor = Object.getOwnPropertyDescriptor(
  globalThis.navigator,
  'storage',
);

const seedCard = (i: number): Card => ({
  classId: 1,
  deckId: 1,
  front: `q${i}`,
  back: `a${i}`,
  cardType: 'standard',
  createdAt: new Date(),
  state: 0,
  stability: 0,
  difficulty: 0,
  elapsedDays: 0,
  scheduledDays: 0,
  due: new Date(),
});

function installPersistenceApi(
  persist: () => Promise<boolean>,
): void {
  Object.defineProperty(globalThis.navigator, 'storage', {
    configurable: true,
    value: { persist },
  });
}

describe('data safety', () => {
  beforeEach(async () => {
    await db.cards.clear();
    localStorage.removeItem('denki-last-backup-export');
    localStorage.removeItem('denki-backup-nudge-at');
    useUIStore.setState({ toasts: [] });
    _resetDataSafetyForTests();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    if (originalStorageDescriptor) {
      Object.defineProperty(
        globalThis.navigator,
        'storage',
        originalStorageDescriptor,
      );
    } else {
      Reflect.deleteProperty(globalThis.navigator, 'storage');
    }
  });

  it('stays quiet below the card threshold', async () => {
    for (let i = 0; i < 5; i++) await db.cards.add(seedCard(i));
    await maybeNudgeBackup();
    expect(useUIStore.getState().toasts).toHaveLength(0);
  });

  it('nudges once when there are many cards and no backup on record', async () => {
    for (let i = 0; i < 25; i++) await db.cards.add(seedCard(i));
    await maybeNudgeBackup();
    const toasts = useUIStore.getState().toasts;
    expect(toasts).toHaveLength(1);
    expect(toasts[0].message).toContain('backup');
    // A second call in the same session must not stack another toast
    await maybeNudgeBackup();
    expect(useUIStore.getState().toasts).toHaveLength(1);
  });

  it('stays quiet when a backup was exported recently', async () => {
    for (let i = 0; i < 25; i++) await db.cards.add(seedCard(i));
    markBackupExported();
    await maybeNudgeBackup();
    expect(useUIStore.getState().toasts).toHaveLength(0);
  });

  it('stays quiet when a nudge was already shown this week', async () => {
    for (let i = 0; i < 25; i++) await db.cards.add(seedCard(i));
    localStorage.setItem('denki-backup-nudge-at', String(Date.now() - 1000));
    await maybeNudgeBackup();
    expect(useUIStore.getState().toasts).toHaveLength(0);
  });

  it('reports a user-initiated persistent-storage grant exactly', async () => {
    const persist = vi.fn(async () => true);
    installPersistenceApi(persist);

    await expect(
      requestPersistentStorageFromUserGesture(),
    ).resolves.toBe('granted');
    expect(persist).toHaveBeenCalledTimes(1);
  });

  it('does not claim protection when the browser denies the request', async () => {
    const persist = vi.fn(async () => false);
    installPersistenceApi(persist);

    await expect(
      requestPersistentStorageFromUserGesture(),
    ).resolves.toBe('denied');
  });

  it('reports persistent-storage requests as unavailable when unsupported or failing', async () => {
    Object.defineProperty(globalThis.navigator, 'storage', {
      configurable: true,
      value: {},
    });
    await expect(
      requestPersistentStorageFromUserGesture(),
    ).resolves.toBe('unavailable');

    installPersistenceApi(async () => {
      throw new Error('blocked');
    });
    await expect(
      requestPersistentStorageFromUserGesture(),
    ).resolves.toBe('unavailable');
  });
});
