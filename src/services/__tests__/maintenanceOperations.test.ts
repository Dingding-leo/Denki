import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  importDatabase: vi.fn(),
}));

vi.mock('../backup', () => ({
  importDatabase: mocks.importDatabase,
}));

import {
  MaintenanceLockUnavailableError,
  resetMaintenanceLockForTests,
  withExclusiveMaintenanceLock,
} from '../maintenanceLock';
import { importDatabaseExclusively } from '../maintenanceOperations';

describe('exclusive backup restore', () => {
  beforeEach(async () => {
    mocks.importDatabase.mockReset();
    localStorage.clear();
    await resetMaintenanceLockForTests();
  });

  it('holds the cross-tab maintenance lease for the complete restore callback', async () => {
    let finishRestore: (() => void) | undefined;
    let restoreStarted: (() => void) | undefined;
    const started = new Promise<void>((resolve) => {
      restoreStarted = resolve;
    });

    mocks.importDatabase.mockImplementation(async () => {
      restoreStarted?.();
      await new Promise<void>((resolve) => {
        finishRestore = resolve;
      });
    });

    const restore = importDatabaseExclusively({ formatVersion: 5 });
    await started;

    await expect(
      withExclusiveMaintenanceLock(
        {
          operation: 'competing-maintenance',
          label: 'Competing maintenance',
        },
        async () => undefined,
      ),
    ).rejects.toBeInstanceOf(MaintenanceLockUnavailableError);
    expect(mocks.importDatabase).toHaveBeenCalledWith({ formatVersion: 5 });

    finishRestore?.();
    await restore;
  });

  it('does not enter the restore callback when another maintenance operation owns the lease', async () => {
    let releaseOwner: (() => void) | undefined;
    let ownerStarted: (() => void) | undefined;
    const started = new Promise<void>((resolve) => {
      ownerStarted = resolve;
    });

    const owner = withExclusiveMaintenanceLock(
      {
        operation: 'media-optimization',
        label: 'Media storage optimization',
      },
      async () => {
        ownerStarted?.();
        await new Promise<void>((resolve) => {
          releaseOwner = resolve;
        });
      },
    );
    await started;

    await expect(
      importDatabaseExclusively({ formatVersion: 5 }),
    ).rejects.toBeInstanceOf(MaintenanceLockUnavailableError);
    expect(mocks.importDatabase).not.toHaveBeenCalled();

    releaseOwner?.();
    await owner;
  });
});
