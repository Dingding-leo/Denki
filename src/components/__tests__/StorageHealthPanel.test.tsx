import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  collect: vi.fn(),
  requestProtection: vi.fn(),
  toast: vi.fn(),
}));

vi.mock('../../services/storageHealth', () => ({
  collectStorageHealth: mocks.collect,
}));

vi.mock('../../services/dataSafety', () => ({
  requestPersistentStorageFromUserGesture: mocks.requestProtection,
}));

vi.mock('../../store/uiStore', () => ({
  toast: mocks.toast,
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
    mediaMetadataWarnings: 0,
  },
  browser: {
    usageBytes: 128 * 1024 * 1024,
    quotaBytes: 1024 * 1024 * 1024,
    usagePercent: 12.5,
    persisted: true,
    canRequestPersistence: true,
  },
  lastBackupExportedAt: '2026-08-20T00:00:00.000Z',
};

const unprotectedSnapshot = {
  ...snapshot,
  browser: {
    ...snapshot.browser,
    persisted: false,
  },
};

describe('StorageHealthPanel', () => {
  beforeEach(() => {
    mocks.collect.mockReset();
    mocks.requestProtection.mockReset();
    mocks.toast.mockReset();
    mocks.collect.mockResolvedValue(snapshot);
    mocks.requestProtection.mockResolvedValue('granted');
  });

  it('loads browser, library, media, persistence, and backup diagnostics', async () => {
    render(<StorageHealthPanel />);

    expect(
      screen.getByRole('button', { name: 'Refresh storage health' }),
    ).toBeDisabled();
    expect(
      await screen.findByText(/824 cards · 2,941 reviews/i),
    ).toBeInTheDocument();
    expect(screen.getByText(/12 objects · 8.0 MiB/i)).toBeInTheDocument();
    expect(screen.getByText(/128.0 MiB of 1.00 GiB/i)).toBeInTheDocument();
    expect(screen.getByText(/12.5% of reported quota/i)).toBeInTheDocument();
    expect(
      screen.getByText(/Protected from routine eviction/i),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Hosted deployments may share that origin/i),
    ).toBeInTheDocument();
    expect(screen.getByText(/Last portable backup:/i)).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Request protection' }),
    ).not.toBeInTheDocument();
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

  it('shows unavailable values when the first snapshot cannot be read', async () => {
    mocks.collect.mockRejectedValueOnce(new Error('database unavailable'));
    render(<StorageHealthPanel />);

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'database unavailable',
    );
    expect(screen.getAllByText('Unavailable').length).toBeGreaterThanOrEqual(4);
    expect(screen.queryByText('Loading…')).not.toBeInTheDocument();
    expect(screen.getByText('Database snapshot unavailable')).toBeInTheDocument();
    expect(screen.getByText('Registry metadata unavailable')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Refresh storage health' }),
    ).toBeEnabled();
  });

  it('requests protection from a user gesture and updates only on a real grant', async () => {
    mocks.collect.mockResolvedValue(unprotectedSnapshot);
    render(<StorageHealthPanel />);

    fireEvent.click(
      await screen.findByRole('button', { name: 'Request protection' }),
    );

    await waitFor(() =>
      expect(mocks.requestProtection).toHaveBeenCalledTimes(1),
    );
    expect(
      await screen.findByText('Protected from routine eviction'),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Request protection' }),
    ).not.toBeInTheDocument();
    expect(mocks.toast).toHaveBeenCalledWith(
      'Persistent storage protection granted',
      'success',
    );
  });

  it('keeps best-effort status when the browser denies protection', async () => {
    mocks.collect.mockResolvedValue(unprotectedSnapshot);
    mocks.requestProtection.mockResolvedValue('denied');
    render(<StorageHealthPanel />);

    const button = await screen.findByRole('button', {
      name: 'Request protection',
    });
    fireEvent.click(button);

    await waitFor(() =>
      expect(mocks.toast).toHaveBeenCalledWith(
        expect.stringMatching(/did not grant persistent storage/i),
        'info',
        7000,
      ),
    );
    expect(
      screen.getByText('Best-effort browser storage'),
    ).toBeInTheDocument();
    expect(button).toBeEnabled();
  });

  it('respects a parent maintenance lock', async () => {
    mocks.collect.mockResolvedValue(unprotectedSnapshot);
    render(<StorageHealthPanel disabled />);
    await screen.findByText(/824 cards · 2,941 reviews/i);

    expect(
      screen.getByRole('button', { name: 'Refresh storage health' }),
    ).toBeDisabled();
    expect(
      screen.getByRole('button', { name: 'Request protection' }),
    ).toBeDisabled();
  });
});
