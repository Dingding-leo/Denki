import { act, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useUIStore } from '../../store/uiStore';

const mocks = vi.hoisted(() => ({
  listener: null as null | ((activity: unknown) => void),
  reload: vi.fn(),
}));

vi.mock('../../services/maintenanceLock', () => ({
  getForeignMaintenanceActivity: () => null,
  subscribeForeignMaintenanceActivity: (
    listener: (activity: unknown) => void,
  ) => {
    mocks.listener = listener;
    return () => {
      mocks.listener = null;
    };
  },
}));

vi.mock('../../services/appReload', () => ({
  scheduleApplicationReload: mocks.reload,
}));

import { MaintenanceBlocker } from '../ui/MaintenanceBlocker';

const activity = {
  version: 1,
  ownerId: 'another-tab',
  fence: 2,
  operation: 'backup-restore',
  label: 'Portable backup restore',
  startedAt: Date.now(),
  updatedAt: Date.now(),
  expiresAt: Date.now() + 60_000,
};

describe('MaintenanceBlocker', () => {
  beforeEach(() => {
    mocks.listener = null;
    mocks.reload.mockReset();
    useUIStore.setState({
      paletteOpen: true,
      shortcutsOpen: true,
      pendingConfirm: null,
    });
  });

  it('blocks the foreign tab, closes transient UI, and reloads after release', () => {
    render(<MaintenanceBlocker />);

    act(() => {
      mocks.listener?.(activity);
    });

    expect(
      screen.getByRole('alertdialog', {
        name: /another denki tab is updating the library/i,
      }),
    ).toBeInTheDocument();
    expect(screen.getByText(/Portable backup restore/)).toBeInTheDocument();
    expect(useUIStore.getState().paletteOpen).toBe(false);
    expect(useUIStore.getState().shortcutsOpen).toBe(false);

    act(() => {
      mocks.listener?.(null);
    });

    expect(mocks.reload).toHaveBeenCalledWith(100);
  });
});
