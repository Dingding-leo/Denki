import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useFlashcardStore } from '../../store/useFlashcardStore';

const mocks = vi.hoisted(() => ({
  prepare: vi.fn(),
  restore: vi.fn(),
  confirm: vi.fn(),
  toast: vi.fn(),
  clearCursor: vi.fn(),
  reload: vi.fn(),
  celebrate: vi.fn(),
}));

vi.mock('../../services/backup', () => ({
  downloadBackup: vi.fn(),
  prepareBackupImport: mocks.prepare,
}));

vi.mock('../../services/maintenanceOperations', () => ({
  importPreparedDatabaseExclusively: mocks.restore,
}));

vi.mock('../../services/embeddedMediaMigration', () => ({
  clearEmbeddedMediaMigrationCursor: mocks.clearCursor,
  getEmbeddedMediaMigrationStatus: () => null,
  migrateEmbeddedMediaToCompletion: vi.fn(),
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

const prepared = {
  summary: {
    formatVersion: 5,
    appVersion: '0.1.0',
    databaseVersion: 8,
    schedulerVersion: '4.5',
    exportedAt: '2026-08-21T12:00:00.000Z',
    classes: 3,
    decks: 17,
    cards: 824,
    reviews: 2941,
    media: 12,
    mediaBytes: 8 * 1024 * 1024,
    preferences: {
      requestRetention: 0.9,
      speechSpeed: 1.2,
    },
  },
};

function backupFile(source = '{"formatVersion":5}'): File {
  return {
    name: 'denki-backup-2026-08-21.json',
    text: vi.fn(async () => source),
  } as unknown as File;
}

function chooseFile(file: File): void {
  const input = document.querySelector(
    'input[type="file"]',
  ) as HTMLInputElement | null;
  if (!input) throw new Error('Backup file input not found.');
  fireEvent.change(input, { target: { files: [file] } });
}

describe('Settings backup preflight', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
    useFlashcardStore.setState({ session: null });
    mocks.prepare.mockReset();
    mocks.restore.mockReset();
    mocks.confirm.mockReset();
    mocks.toast.mockReset();
    mocks.clearCursor.mockReset();
    mocks.reload.mockReset();
    mocks.celebrate.mockReset();
    mocks.prepare.mockResolvedValue(prepared);
    mocks.confirm.mockResolvedValue(false);
    mocks.restore.mockResolvedValue(undefined);
  });

  afterEach(() => {
    useFlashcardStore.setState({ session: null });
  });

  it('fully validates the file before showing a structured destructive confirmation', async () => {
    render(<SettingsModal onClose={vi.fn()} />);
    chooseFile(backupFile());

    await waitFor(() => expect(mocks.prepare).toHaveBeenCalledTimes(1));
    expect(mocks.confirm).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Restore this validated backup?',
        confirmLabel: 'Replace local library',
        danger: true,
        details: expect.arrayContaining([
          expect.objectContaining({
            label: 'Contents',
            value: expect.stringMatching(/824 cards.*2,941 reviews/),
          }),
          expect.objectContaining({
            label: 'Media',
            value: expect.stringMatching(/12 objects.*8\.0 MiB/),
          }),
        ]),
      }),
    );
    expect(mocks.restore).not.toHaveBeenCalled();
    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: 'Import backup' }),
      ).toBeEnabled(),
    );
  });

  it('commits the exact prepared plan only after confirmation', async () => {
    mocks.confirm.mockResolvedValue(true);
    render(<SettingsModal onClose={vi.fn()} />);
    chooseFile(backupFile());

    await waitFor(() =>
      expect(mocks.restore).toHaveBeenCalledWith(prepared),
    );
    expect(mocks.clearCursor).toHaveBeenCalledTimes(1);
    expect(mocks.toast).toHaveBeenCalledWith(
      expect.stringMatching(/backup restored/i),
      'success',
    );
    expect(mocks.reload).toHaveBeenCalledTimes(1);
  });

  it('cannot close Settings with Escape while inspection is still running', async () => {
    let finishInspection: ((value: typeof prepared) => void) | undefined;
    mocks.prepare.mockImplementation(
      () => new Promise((resolve) => {
        finishInspection = resolve;
      }),
    );
    const onClose = vi.fn();
    render(<SettingsModal onClose={onClose} />);
    chooseFile(backupFile());

    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: 'Inspecting…' }),
      ).toBeDisabled(),
    );
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).not.toHaveBeenCalled();

    await act(async () => {
      finishInspection?.(prepared);
    });
    await waitFor(() => expect(mocks.confirm).toHaveBeenCalledTimes(1));
  });

  it('does not open a destructive confirmation for an invalid backup', async () => {
    mocks.prepare.mockRejectedValue(new Error('invalid card at row 2'));
    render(<SettingsModal onClose={vi.fn()} />);

    await act(async () => {
      chooseFile(backupFile());
    });

    await waitFor(() =>
      expect(mocks.toast).toHaveBeenCalledWith(
        expect.stringMatching(/invalid card at row 2/i),
        'error',
      ),
    );
    expect(mocks.confirm).not.toHaveBeenCalled();
    expect(mocks.restore).not.toHaveBeenCalled();
  });
});
