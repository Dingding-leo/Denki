import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  collect: vi.fn(),
}));

vi.mock('../../services/storageHealth', () => ({
  collectStorageHealth: mocks.collect,
}));

import { StorageHealthPanel } from '../settings/StorageHealthPanel';

const snapshot = {
  capturedAt: '2026-08-23T00:00:00.000Z',
  library: {
    classes: 3,
    decks: 17,
    cards: 824,
    reviews: 2941,
    mediaObjects: 12,
    mediaBytes: 8 * 1024 * 1024,
    mediaIntegrityWarnings: 0,
  },
  browser: {
    usageBytes: 128 * 1024 * 1024,
    quotaBytes: 1024 * 1024 * 1024,
    usagePercent: 12.5,
    persisted: true,
  },
  lastBackupExportedAt: '2026-08-20T00:00:00.000Z',
};

describe('StorageHealthPanel', () => {
  beforeEach(() => {
    mocks.collect.mockReset();
    mocks.collect.mockResolvedValue(snapshot);
  });

  it('loads browser, library, media, persistence, and backup diagnostics', async () => {
    render(<StorageHealthPanel />);

    expect(
      screen.getByRole('button', { name: 'Refresh storage health' }),
    ).toBeDisabled();
    expect(await screen.findByText(/824 cards · 2,941 reviews/i)).toBeInTheDocument();
    expect(screen.getByText(/12 objects · 8.0 MiB/i)).toBeInTheDocument();
    expect(screen.getByText(/128.0 MiB of 1.00 GiB/i)).toBeInTheDocument();
    expect(screen.getByText(/12.5% of reported quota/i)).toBeInTheDocument();
    expect(
      screen.getByText(/Protected from routine eviction/i),
    ).toBeInTheDocument();
    expect(screen.getByText(/Last portable backup:/i)).toBeInTheDocument();
  });

  it('refreshes on demand and surfaces a later failure without erasing data', async () => {
    mocks.collect
      .mockResolvedValueOnce(snapshot)
      .mockRejectedValueOnce(new Error('estimate failed'));
    render(<StorageHealthPanel />);
    await screen.findByText(/824 cards · 2,941 reviews/i);

    fireEvent.click(
      screen.getByRole('button', { name: 'Refresh storage health' }),
    );

    expect(await screen.findByRole('alert')).toHaveTextContent('estimate failed');
    expect(screen.getByText(/824 cards · 2,941 reviews/i)).toBeInTheDocument();
    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: 'Refresh storage health' }),
      ).toBeEnabled(),
    );
  });

  it('respects a parent maintenance lock', async () => {
    render(<StorageHealthPanel disabled />);
    await screen.findByText(/824 cards · 2,941 reviews/i);

    expect(
      screen.getByRole('button', { name: 'Refresh storage health' }),
    ).toBeDisabled();
  });
});
