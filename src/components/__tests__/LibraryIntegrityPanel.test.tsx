import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  audit: vi.fn(),
}));

vi.mock('../../services/libraryIntegrity', () => ({
  auditLibraryIntegrityExclusively: mocks.audit,
}));

import { LibraryIntegrityPanel } from '../settings/LibraryIntegrityPanel';

const healthyResult = {
  capturedAt: '2026-08-23T00:00:00.000Z',
  complete: true,
  stopped: false,
  healthy: true,
  errorCount: 0,
  warningCount: 0,
  issueCount: 0,
  issuesTruncated: false,
  issues: [],
  issueCounts: {},
  scanned: {
    classes: 3,
    decks: 17,
    cards: 824,
    reviews: 2941,
    media: 12,
    verifiedMediaBytes: 8 * 1024 * 1024,
    registryReferences: 22,
  },
  unreferencedMedia: { objects: 0, bytes: 0 },
};

const stoppedResult = {
  ...healthyResult,
  complete: false,
  stopped: true,
  healthy: false,
  scanned: {
    ...healthyResult.scanned,
    reviews: 250,
    media: 0,
    verifiedMediaBytes: 0,
  },
};

describe('LibraryIntegrityPanel', () => {
  beforeEach(() => {
    mocks.audit.mockReset();
    mocks.audit.mockResolvedValue(healthyResult);
  });

  it('runs the manual audit and renders a healthy summary', async () => {
    const onRunningChange = vi.fn();
    render(<LibraryIntegrityPanel onRunningChange={onRunningChange} />);

    fireEvent.click(
      screen.getByRole('button', { name: 'Run library integrity check' }),
    );

    expect(onRunningChange).toHaveBeenCalledWith(true);
    expect(
      await screen.findByText('No integrity issues found'),
    ).toBeInTheDocument();
    expect(screen.getByText(/824 cards/i)).toBeInTheDocument();
    expect(screen.getByText(/8.0 MiB verified media/i)).toBeInTheDocument();
    expect(onRunningChange).toHaveBeenLastCalledWith(false);
  });

  it('shows detailed findings without attempting a repair', async () => {
    mocks.audit.mockResolvedValueOnce({
      ...healthyResult,
      healthy: false,
      errorCount: 1,
      warningCount: 1,
      issueCount: 2,
      issues: [
        {
          code: 'missing-media',
          severity: 'error',
          entity: 'media',
          entityId: 'a'.repeat(64),
          message: 'Library content references missing registry media.',
        },
        {
          code: 'unreferenced-media',
          severity: 'warning',
          entity: 'library',
          entityId: null,
          message: 'One object is not referenced.',
        },
      ],
      issueCounts: {
        'missing-media': 1,
        'unreferenced-media': 1,
      },
      unreferencedMedia: { objects: 1, bytes: 1024 },
    });
    render(<LibraryIntegrityPanel />);

    fireEvent.click(
      screen.getByRole('button', { name: 'Run library integrity check' }),
    );

    expect(
      await screen.findByText('1 integrity error(s) found'),
    ).toBeInTheDocument();
    expect(screen.getByText('missing-media')).toBeInTheDocument();
    expect(screen.getByText(/Unreferenced verified media/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /repair/i })).not.toBeInTheDocument();
  });

  it('aborts an active check and renders the safe partial result', async () => {
    mocks.audit.mockImplementationOnce(
      ({ signal, onProgress }: { signal: AbortSignal; onProgress?: (value: unknown) => void }) =>
        new Promise((resolve) => {
          onProgress?.({
            phase: 'reviews',
            processed: 250,
            total: 2941,
            issueCount: 0,
          });
          signal.addEventListener(
            'abort',
            () => resolve(stoppedResult),
            { once: true },
          );
        }),
    );
    render(<LibraryIntegrityPanel />);

    fireEvent.click(
      screen.getByRole('button', { name: 'Run library integrity check' }),
    );
    expect(
      await screen.findByRole('button', { name: 'Stop library integrity check' }),
    ).toBeEnabled();
    fireEvent.click(
      screen.getByRole('button', { name: 'Stop library integrity check' }),
    );

    expect(
      await screen.findByText('Integrity check stopped safely'),
    ).toBeInTheDocument();
  });

  it('respects the parent maintenance-disabled state', async () => {
    render(<LibraryIntegrityPanel disabled />);

    expect(
      screen.getByRole('button', { name: 'Run library integrity check' }),
    ).toBeDisabled();
    await waitFor(() => expect(mocks.audit).not.toHaveBeenCalled());
  });
});
