import React, { useEffect, useRef, useState } from 'react';
import {
  Download,
  HardDrive,
  Loader2,
  RotateCcw,
  Sliders,
  Upload,
  Volume2,
  X,
} from 'lucide-react';
import {
  downloadBackup,
  type BackupSnapshot,
} from '../../services/backup';
import { scheduleApplicationReload } from '../../services/appReload';
import { importDatabaseExclusively } from '../../services/maintenanceOperations';
import { celebrate } from '../../services/celebrate';
import {
  clearEmbeddedMediaMigrationCursor,
  getEmbeddedMediaMigrationStatus,
  migrateEmbeddedMediaToCompletion,
  type EmbeddedMediaMigrationCursor,
} from '../../services/embeddedMediaMigration';
import { DEFAULT_PARAMS, FSRS_VERSION } from '../../services/scheduler';
import {
  RETENTION_KEY,
  SCHEDULER_SETTING_RANGES,
  clearLegacySchedulerOverrides,
  loadSchedulerParams,
  normalizeSchedulerParams,
} from '../../services/schedulerParams';
import {
  SPEECH_SPEED_KEY,
  SPEECH_SPEED_MAX,
  SPEECH_SPEED_MIN,
  loadSpeechRate,
  normalizeSpeechRate,
} from '../../services/speech';
import { useFlashcardStore } from '../../store/useFlashcardStore';
import { confirmDialog, toast } from '../../store/uiStore';

interface SettingsModalProps {
  onClose: () => void;
}

const sectionStyle: React.CSSProperties = {
  borderTop: '1px solid rgba(211, 220, 207, 0.12)',
  paddingTop: '16px',
};

const sectionHeadingStyle: React.CSSProperties = {
  fontSize: '11px',
  color: 'var(--text-muted)',
  textTransform: 'uppercase',
  letterSpacing: '0.9px',
  marginBottom: '14px',
  fontWeight: 800,
};

const helpStyle: React.CSSProperties = {
  fontSize: '11px',
  color: 'var(--text-muted)',
  marginTop: '5px',
  lineHeight: 1.5,
};

function persistPreferences(retention: number, speechSpeed: number): void {
  try {
    localStorage.setItem(RETENTION_KEY, String(retention));
    localStorage.setItem(SPEECH_SPEED_KEY, String(speechSpeed));
    localStorage.removeItem('denki-new-cards-per-day');
    clearLegacySchedulerOverrides();
  } catch (error) {
    throw new Error(
      error instanceof Error
        ? `Browser storage rejected the preferences: ${error.message}`
        : 'Browser storage rejected the preferences.',
      { cause: error },
    );
  }
}

function loadMigrationStatusSafely(): EmbeddedMediaMigrationCursor | null {
  try {
    return getEmbeddedMediaMigrationStatus();
  } catch (error) {
    console.warn('Unable to read media-optimization progress:', error);
    return null;
  }
}

function migrationStatusText(
  status: EmbeddedMediaMigrationCursor | null,
): string {
  if (!status) {
    return 'Not started. Denki will scan cards and deck notes in small transactions.';
  }
  if (status.phase === 'complete') {
    return `Last scan complete: ${status.scannedRows.toLocaleString()} rows checked, ${status.migratedRows.toLocaleString()} rows optimized, ${status.mediaObjectsCreated.toLocaleString()} media objects created.`;
  }
  const phase = status.phase === 'cards' ? 'cards' : 'deck notes';
  return `Paused in ${phase}: ${status.scannedRows.toLocaleString()} rows checked, ${status.migratedRows.toLocaleString()} rows optimized, ${status.mediaObjectsCreated.toLocaleString()} media objects created.`;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({ onClose }) => {
  const initialScheduler = loadSchedulerParams();
  const [retention, setRetention] = useState(initialScheduler.requestRetention);
  const [speechSpeed, setSpeechSpeed] = useState(loadSpeechRate);
  const [exporting, setExporting] = useState(false);
  const [importing, setImporting] = useState(false);
  const [optimizingMedia, setOptimizingMedia] = useState(false);
  const [stoppingMedia, setStoppingMedia] = useState(false);
  const [migrationStatus, setMigrationStatus] = useState(
    loadMigrationStatusSafely,
  );

  const dialogRef = useRef<HTMLFormElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const migrationAbortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    const previousFocus = document.activeElement as HTMLElement | null;
    closeButtonRef.current?.focus();

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        if (!optimizingMedia) onClose();
        return;
      }

      if (event.key !== 'Tab') return;
      const focusable = dialogRef.current?.querySelectorAll<HTMLElement>(
        'button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])',
      );
      if (!focusable || focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    window.addEventListener('keydown', handleKeyDown, true);
    return () => {
      window.removeEventListener('keydown', handleKeyDown, true);
      previousFocus?.focus();
    };
  }, [onClose, optimizingMedia]);

  useEffect(() => () => {
    migrationAbortRef.current?.abort();
  }, []);

  const handleSave = (event: React.FormEvent) => {
    event.preventDefault();
    if (optimizingMedia) return;

    const normalizedScheduler = normalizeSchedulerParams({
      requestRetention: retention,
    });
    const normalizedSpeech = normalizeSpeechRate(speechSpeed);

    try {
      persistPreferences(
        normalizedScheduler.requestRetention,
        normalizedSpeech,
      );
    } catch (error) {
      toast(
        error instanceof Error ? error.message : 'Preferences could not be saved.',
        'error',
      );
      return;
    }

    celebrate({
      particleCount: 24,
      spread: 36,
      origin: { y: 0.8 },
      colors: ['#7f9c86', '#a7b79f'],
    });
    toast('Preferences saved', 'success');
    onClose();
  };

  const handleReset = async () => {
    if (optimizingMedia) return;
    const confirmed = await confirmDialog({
      title: 'Reset preferences',
      message:
        'Restore target retention and speech speed to their defaults? Cards and review history are not affected.',
      confirmLabel: 'Reset preferences',
      danger: true,
    });
    if (!confirmed) return;

    const defaultRetention = DEFAULT_PARAMS.requestRetention;
    setRetention(defaultRetention);
    setSpeechSpeed(1);
    try {
      persistPreferences(defaultRetention, 1);
      toast('Preferences restored to defaults', 'info');
    } catch (error) {
      toast(
        error instanceof Error ? error.message : 'Preferences could not be reset.',
        'error',
      );
    }
  };

  const handleExport = async () => {
    if (exporting || optimizingMedia) return;
    setExporting(true);
    try {
      await downloadBackup();
      toast('Portable backup download started', 'success');
    } catch (error) {
      toast(
        `Backup export failed: ${error instanceof Error ? error.message : 'unknown error'}`,
        'error',
      );
    } finally {
      setExporting(false);
    }
  };

  const handleImportFile = async (
    event: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file || importing || optimizingMedia) return;

    const confirmed = await confirmDialog({
      title: 'Import portable backup',
      message:
        'This replaces every current class, deck, card, review log, media object, and active study queue. When included, target retention and speech speed are restored too; your AI-provider key remains unchanged. This cannot be undone.',
      confirmLabel: 'Replace data & preferences',
      danger: true,
    });
    if (!confirmed) return;

    setImporting(true);
    try {
      const parsed: unknown = JSON.parse(await file.text());
      await importDatabaseExclusively(parsed as BackupSnapshot);
      try {
        clearEmbeddedMediaMigrationCursor();
      } catch (error) {
        console.warn('Unable to clear stale media-migration progress:', error);
      }
      toast('Backup restored. Reloading Denki…', 'success');
      scheduleApplicationReload();
    } catch (error) {
      toast(
        `Import failed: ${error instanceof Error ? error.message : 'invalid backup file'}`,
        'error',
      );
    } finally {
      setImporting(false);
    }
  };

  const handleMediaOptimization = async () => {
    if (optimizingMedia || importing || exporting) return;
    if (useFlashcardStore.getState().session) {
      toast('Finish or exit the active study session before optimizing media.', 'info');
      return;
    }

    const currentStatus = loadMigrationStatusSafely();
    const restart = currentStatus?.phase === 'complete';
    const confirmed = await confirmDialog({
      title: restart ? 'Scan embedded media again' : 'Optimize embedded media',
      message:
        'Denki will process cards and deck notes in small atomic batches. You may stop between batches, and portable backup remains valid throughout. Denki reloads after the run so no stale in-memory card text can overwrite the migrated database.',
      confirmLabel: restart ? 'Scan again' : currentStatus ? 'Resume optimization' : 'Optimize media',
    });
    if (!confirmed) return;

    const controller = new AbortController();
    migrationAbortRef.current = controller;
    setOptimizingMedia(true);
    setStoppingMedia(false);

    try {
      const result = await migrateEmbeddedMediaToCompletion({
        batchSize: 20,
        restart,
        signal: controller.signal,
        onProgress(batch) {
          setMigrationStatus(batch.cursor);
        },
      });
      setMigrationStatus(result.cursor);
      toast(
        result.stopped
          ? 'Media optimization stopped at a safe batch boundary. Reloading Denki…'
          : `Media optimization complete: ${result.cursor.migratedRows.toLocaleString()} rows updated. Reloading Denki…`,
        result.stopped ? 'info' : 'success',
      );
      migrationAbortRef.current = null;
      scheduleApplicationReload(350);
    } catch (error) {
      setMigrationStatus(loadMigrationStatusSafely());
      toast(
        `Media optimization failed: ${error instanceof Error ? error.message : 'unknown error'}. Reloading Denki to reconcile committed batches…`,
        'error',
      );
      migrationAbortRef.current = null;
      scheduleApplicationReload(900);
    }
  };

  const handleStopMediaOptimization = () => {
    if (!optimizingMedia || stoppingMedia) return;
    setStoppingMedia(true);
    migrationAbortRef.current?.abort();
  };

  const migrationButtonLabel = optimizingMedia
    ? stoppingMedia
      ? 'Stopping after batch…'
      : 'Stop after current batch'
    : migrationStatus?.phase === 'complete'
      ? 'Scan again'
      : migrationStatus
        ? 'Resume optimization'
        : 'Optimize media';

  return (
    <div
      onMouseDown={(event) => {
        if (
          event.target === event.currentTarget &&
          !optimizingMedia
        ) {
          onClose();
        }
      }}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(4, 10, 7, 0.76)',
        backdropFilter: 'blur(8px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 2000,
        padding: '20px',
      }}
    >
      <form
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="settings-dialog-title"
        onSubmit={handleSave}
        className="glass-panel"
        style={{
          width: '100%',
          maxWidth: '540px',
          maxHeight: 'calc(100vh - 40px)',
          overflowY: 'auto',
          display: 'flex',
          flexDirection: 'column',
          gap: '18px',
          textAlign: 'left',
        }}
      >
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            paddingBottom: '12px',
            borderBottom: '2px solid var(--border)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '9px' }}>
            <Sliders size={18} aria-hidden="true" />
            <h3
              id="settings-dialog-title"
              style={{
                fontSize: '18px',
                fontWeight: 800,
                color: 'var(--text-primary)',
              }}
            >
              Preferences & Algorithm
            </h3>
          </div>
          <button
            ref={closeButtonRef}
            type="button"
            onClick={onClose}
            disabled={optimizingMedia}
            className="btn-premium-secondary"
            aria-label="Close preferences"
            style={{ width: '32px', height: '32px', padding: 0 }}
          >
            <X size={16} />
          </button>
        </div>

        <section>
          <h4 style={{ ...sectionHeadingStyle, marginTop: 0 }}>
            Canonical FSRS {FSRS_VERSION}
          </h4>
          <div
            style={{
              border: '1px solid var(--border)',
              background: 'rgba(140, 155, 114, 0.08)',
              padding: '12px 14px',
              marginBottom: '16px',
            }}
          >
            <strong
              style={{
                display: 'block',
                color: 'var(--text-primary)',
                fontSize: '12px',
                marginBottom: '5px',
              }}
            >
              Model coefficients are fixed to the published 17-weight reference.
            </strong>
            <p style={{ ...helpStyle, margin: 0 }}>
              Only target retention is configurable. Retired Easy-bonus and
              Hard-multiplier overrides are removed because they changed the
              algorithm rather than merely configuring it.
            </p>
          </div>

          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              marginBottom: '6px',
            }}
          >
            <label
              htmlFor="retention-setting"
              style={{
                fontSize: '13px',
                color: 'var(--text-secondary)',
                fontWeight: 600,
              }}
            >
              Target retention
            </label>
            <span
              style={{
                fontSize: '12px',
                color: 'var(--accent-color)',
                fontWeight: 700,
                fontFamily: 'monospace',
              }}
            >
              {Math.round(retention * 100)}%
            </span>
          </div>
          <input
            id="retention-setting"
            type="range"
            min={SCHEDULER_SETTING_RANGES.retention.min}
            max={SCHEDULER_SETTING_RANGES.retention.max}
            step="0.01"
            value={retention}
            disabled={optimizingMedia}
            onChange={(event) =>
              setRetention(event.currentTarget.valueAsNumber)
            }
            style={{ width: '100%', accentColor: 'var(--accent-color)' }}
          />
          <p style={helpStyle}>
            Higher retention schedules more frequent reviews. Changes apply to
            future ratings without rewriting existing review history.
          </p>
        </section>

        <section style={sectionStyle}>
          <h4 style={sectionHeadingStyle}>Read aloud</h4>
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              marginBottom: '6px',
            }}
          >
            <label
              htmlFor="speech-speed-setting"
              style={{
                fontSize: '13px',
                color: 'var(--text-secondary)',
                fontWeight: 600,
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
              }}
            >
              <Volume2 size={14} aria-hidden="true" /> Speech speed
            </label>
            <span
              style={{
                fontSize: '12px',
                color: 'var(--accent-color)',
                fontWeight: 700,
                fontFamily: 'monospace',
              }}
            >
              {speechSpeed.toFixed(1)}×
            </span>
          </div>
          <input
            id="speech-speed-setting"
            type="range"
            min={SPEECH_SPEED_MIN}
            max={SPEECH_SPEED_MAX}
            step="0.1"
            value={speechSpeed}
            disabled={optimizingMedia}
            onChange={(event) =>
              setSpeechSpeed(event.currentTarget.valueAsNumber)
            }
            style={{ width: '100%', accentColor: 'var(--accent-color)' }}
          />
          <p style={helpStyle}>
            Used for automatic question/answer reading and manual speaker
            buttons.
          </p>
        </section>

        <section style={sectionStyle}>
          <h4 style={sectionHeadingStyle}>Storage optimization</h4>
          <div
            style={{
              display: 'flex',
              alignItems: 'flex-start',
              gap: '10px',
              border: '1px solid var(--border)',
              background: 'rgba(127, 156, 134, 0.07)',
              padding: '12px 14px',
              marginBottom: '12px',
            }}
          >
            <HardDrive
              size={16}
              aria-hidden="true"
              style={{ flex: '0 0 auto', marginTop: '1px' }}
            />
            <div>
              <strong
                style={{
                  display: 'block',
                  color: 'var(--text-primary)',
                  fontSize: '12px',
                  marginBottom: '4px',
                }}
              >
                Deduplicate embedded images, audio, and video
              </strong>
              <p style={{ ...helpStyle, margin: 0 }}>
                {migrationStatusText(migrationStatus)}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() =>
              optimizingMedia
                ? handleStopMediaOptimization()
                : void handleMediaOptimization()
            }
            disabled={
              importing ||
              exporting ||
              (optimizingMedia && stoppingMedia)
            }
            className="btn-premium-secondary"
          >
            {optimizingMedia && (
              <Loader2 size={13} className="spin" aria-hidden="true" />
            )}
            {migrationButtonLabel}
          </button>
          <p style={helpStyle}>
            Work is committed in small transactions. Stop requests take effect
            after the current batch, and backup v5 remains valid at every batch
            boundary. Denki reloads after the run.
          </p>
        </section>

        <section style={sectionStyle}>
          <h4 style={sectionHeadingStyle}>Portable backup</h4>
          <p style={{ ...helpStyle, marginTop: 0, marginBottom: '12px' }}>
            The JSON backup contains classes, decks, cards, review history,
            verified media, target retention, and speech speed. Older data-only
            Denki backups remain supported. Secrets such as your AI-provider key
            are excluded.
          </p>
          <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
            <button
              type="button"
              onClick={() => void handleExport()}
              disabled={exporting || importing || optimizingMedia}
              className="btn-premium-secondary"
            >
              <Download size={13} />{' '}
              {exporting ? 'Preparing…' : 'Export backup'}
            </button>
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={exporting || importing || optimizingMedia}
              className="btn-premium-secondary"
            >
              <Upload size={13} /> {importing ? 'Validating…' : 'Import backup'}
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="application/json,.json"
              disabled={importing || optimizingMedia}
              onChange={(event) => void handleImportFile(event)}
              style={{ display: 'none' }}
            />
          </div>
        </section>

        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: '12px',
            borderTop: '2px solid var(--border)',
            paddingTop: '16px',
          }}
        >
          <button
            type="button"
            onClick={() => void handleReset()}
            disabled={optimizingMedia}
            className="btn-premium-danger"
          >
            <RotateCcw size={12} /> Reset defaults
          </button>
          <div style={{ display: 'flex', gap: '10px' }}>
            <button
              type="button"
              onClick={onClose}
              disabled={optimizingMedia}
              className="btn-premium-secondary"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={optimizingMedia}
              className="btn-premium-primary"
            >
              Apply changes
            </button>
          </div>
        </div>
      </form>
    </div>
  );
};
