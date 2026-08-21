import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { db } from '../../db';
import {
  MaintenanceLockUnavailableError,
  assertMaintenanceWriteAllowed,
  getForeignMaintenanceActivity,
  getMaintenanceOwnerId,
  resetMaintenanceLockForTests,
  withExclusiveMaintenanceLock,
} from '../maintenanceLock';

const PRESENCE_STORAGE_KEY = 'denki-maintenance-presence-v1';
const RETIRED_SESSION_OWNER_KEY = 'denki-maintenance-owner-v1';

function foreignPresence(expiresAt = Date.now() + 60_000) {
  const now = Date.now();
  return {
    version: 1,
    ownerId: 'foreign-tab-owner',
    fence: 9,
    operation: 'backup-restore',
    label: 'Portable backup restore',
    startedAt: now,
    updatedAt: now,
    expiresAt,
  };
}

describe('cross-tab maintenance lock', () => {
  beforeEach(async () => {
    await resetMaintenanceLockForTests();
    localStorage.clear();
    sessionStorage.clear();
    await Promise.all([
      db.reviews.clear(),
      db.cards.clear(),
      db.decks.clear(),
      db.classes.clear(),
      db.media.clear(),
    ]);
  });

  afterEach(async () => {
    await resetMaintenanceLockForTests();
    localStorage.clear();
    sessionStorage.clear();
  });

  it('never trusts a sessionStorage owner that a duplicated tab could inherit', () => {
    sessionStorage.setItem(RETIRED_SESSION_OWNER_KEY, 'copied-tab-owner');

    expect(getMaintenanceOwnerId()).not.toBe('copied-tab-owner');
  });

  it('allows the owner tab to write and rejects a concurrent maintenance operation', async () => {
    let releaseFirst: (() => void) | undefined;
    let firstEntered: (() => void) | undefined;
    const entered = new Promise<void>((resolve) => {
      firstEntered = resolve;
    });

    const first = withExclusiveMaintenanceLock(
      {
        operation: 'media-optimization',
        label: 'Media storage optimization',
      },
      async () => {
        await db.classes.add({
          name: 'Owned write',
          description: '',
          createdAt: new Date(),
        });
        firstEntered?.();
        await new Promise<void>((resolve) => {
          releaseFirst = resolve;
        });
      },
    );

    await entered;
    await expect(
      withExclusiveMaintenanceLock(
        {
          operation: 'backup-restore',
          label: 'Portable backup restore',
        },
        async () => undefined,
      ),
    ).rejects.toBeInstanceOf(MaintenanceLockUnavailableError);
    expect(await db.classes.count()).toBe(1);

    releaseFirst?.();
    await first;
    expect(localStorage.getItem(PRESENCE_STORAGE_KEY)).toBeNull();
  });

  it('fences every main-database write when another tab owns the live presence lease', async () => {
    localStorage.setItem(
      PRESENCE_STORAGE_KEY,
      JSON.stringify(foreignPresence()),
    );

    expect(getForeignMaintenanceActivity()?.label).toBe(
      'Portable backup restore',
    );
    expect(() => assertMaintenanceWriteAllowed()).toThrow(
      MaintenanceLockUnavailableError,
    );
    await expect(
      db.classes.add({
        name: 'Blocked write',
        description: '',
        createdAt: new Date(),
      }),
    ).rejects.toBeInstanceOf(MaintenanceLockUnavailableError);
    expect(await db.classes.count()).toBe(0);
  });

  it('ignores and removes an expired foreign marker', async () => {
    localStorage.setItem(
      PRESENCE_STORAGE_KEY,
      JSON.stringify(foreignPresence(Date.now() - 1)),
    );

    expect(getForeignMaintenanceActivity()).toBeNull();
    expect(localStorage.getItem(PRESENCE_STORAGE_KEY)).toBeNull();
    await expect(
      db.classes.add({
        name: 'Allowed after expiry',
        description: '',
        createdAt: new Date(),
      }),
    ).resolves.toBeTypeOf('number');
  });

  it('releases the lease after a failed maintenance callback', async () => {
    await expect(
      withExclusiveMaintenanceLock(
        {
          operation: 'failing-operation',
          label: 'Failing operation',
        },
        async () => {
          throw new Error('simulated failure');
        },
      ),
    ).rejects.toThrow(/simulated failure/);

    await expect(
      withExclusiveMaintenanceLock(
        {
          operation: 'recovery-operation',
          label: 'Recovery operation',
        },
        async () => 'recovered',
      ),
    ).resolves.toBe('recovered');
  });
});
