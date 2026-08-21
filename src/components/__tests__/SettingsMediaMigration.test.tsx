import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useFlashcardStore } from '../../store/useFlashcardStore';

const mocks = vi.hoisted(() => ({
  status: null as null | Record<string, unknown>,
  clearCursor: vi.fn(),
  migrate: vi.fn(),
  confirm: vi.fn(),
  toast: vi.fn(),
  celebrate: vi.fn(),
  reload: vi.fn(),
}));

vi.mock('../../services/embeddedMediaMigration', () => ({
  clearEmbeddedMediaMigrationCursor: mocks.clearCursor,
  getEmbeddedMediaMigrationStatus: () => mocks.status,
  migrateEmbeddedMediaToCompletion: mocks.migrate,
}));

vi.mock('../../store/uiStore', () => ({
  confirmDialog: mocks.confirm,
  toast: mocks.toast,
}));

vi.mock('../../services/appReload', () => ({
  scheduleApplicationReload: mocks.reload,
}));

vi.mock('../../services/celebrate', () => ({
  celebrate: mocks.celebrate,
}));

import { SettingsModal } from '../modals/SettingsModal';

const pausedCursor = {
  version: 1,
  phase: 'cards',
  lastId: 12,
  scannedRows: 12,
  migratedRows: 8,
  mediaObjectsCreated: 3,
  startedAt: '2026-08-20T00:00:00.000Z',
  updatedAt: '2026-08-20T00:01:00.000Z',
} as const;

const completeCursor = {
  ...pausedCursor,
  phase: 'complete',
  lastId: 0,
  scannedRows: 20,
  migratedRows: 10,
  mediaObjectsCreated: 4,
} as const;

const activeSession = {
  deckId: 1,
  queue: [
    {
      id: 1,
      classId: 1,
      deckId: 1,
      front: 'Question',
      back: 'Answer',
      cardType: 'standard' as const,
      createdAt: new Date('2026-08-20T00:00:00.000Z'),
      state: 0,
      stability: 0,
      difficulty: 0,
      elapsedDays: 0,
      scheduledDays: 0,
      due: new Date('2026-08-20T00:00:00.000Z'),
    },
  ],
  currentIndex: 0,
  completedCount: 0,
  initialQueueSize: 1,
  totalCards: 1,
  history: [],
};

describe('Settings media optimization', () => {
  beforeEach(() => {
    mocks.status = null;
    mocks.clearCursor.mockReset();
    mocks.migrate.mockReset();
    mocks.confirm.mockReset();
    mocks.toast.mockReset();
    mocks.celebrate.mockReset();
    mocks.reload.mockReset();
    mocks.confirm.mockResolvedValue(true);
    useFlashcardStore.setState({ session: null });
  });

  afterEach(() => {
    useFlashcardStore.setState({ session: null });
  });

  it('resumes a paused scan and stops only through its AbortSignal', async () => {
    mocks.status = pausedCursor;
    let signal: AbortSignal | undefined;
    let resolveRun: ((value: unknown) => void) | undefined;
    mocks.migrate.mockImplementation((options: { signal: AbortSignal }) => {
      signal = options.signal;
      return new Promise((resolve) => {
        resolveRun = resolve;
      });
    });

    render(<SettingsModal onClose={vi.fn()} />);

    expect(screen.getByText(/Paused in cards: 12 rows checked/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Resume optimization' }));

    await waitFor(() => expect(mocks.migrate).toHaveBeenCalledTimes(1));
    expect(mocks.migrate).toHaveBeenCalledWith(
      expect.objectContaining({ batchSize: 20, restart: false }),
    );
    expect(signal?.aborted).toBe(false);

    fireEvent.click(
      screen.getByRole('button', { name: 'Stop after current batch' }),
    );
    expect(signal?.aborted).toBe(true);
    expect(
      screen.getByRole('button', { name: 'Stopping after batch…' }),
    ).toBeDisabled();

    await act(async () => {
      resolveRun?.({ cursor: pausedCursor, stopped: true });
    });
    expect(mocks.toast).toHaveBeenCalledWith(
      expect.stringMatching(/safe batch boundary/i),
      'info',
    );
    expect(mocks.reload).toHaveBeenCalledWith(350);
  });

  it('blocks optimization while a valid study session is active', async () => {
    useFlashcardStore.setState({ session: activeSession });
    render(<SettingsModal onClose={vi.fn()} />);

    fireEvent.click(screen.getByRole('button', { name: 'Optimize media' }));

    expect(mocks.confirm).not.toHaveBeenCalled();
    expect(mocks.migrate).not.toHaveBeenCalled();
    expect(mocks.toast).toHaveBeenCalledWith(
      expect.stringMatching(/active study session/i),
      'info',
    );
  });

  it('restarts a completed scan explicitly', async () => {
    mocks.status = completeCursor;
    mocks.migrate.mockResolvedValue({
      cursor: completeCursor,
      stopped: false,
    });
    render(<SettingsModal onClose={vi.fn()} />);

    fireEvent.click(screen.getByRole('button', { name: 'Scan again' }));

    await waitFor(() => expect(mocks.migrate).toHaveBeenCalledTimes(1));
    expect(mocks.migrate).toHaveBeenCalledWith(
      expect.objectContaining({ restart: true }),
    );
    await waitFor(() => {
      expect(mocks.toast).toHaveBeenCalledWith(
        expect.stringMatching(/optimization complete/i),
        'success',
      );
    });
    expect(mocks.reload).toHaveBeenCalledWith(350);
  });
});
