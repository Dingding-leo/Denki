import React, { useEffect, useRef, useState } from 'react';
import { Download, RotateCcw, Sliders, Upload, Volume2, X } from 'lucide-react';
import { downloadBackup, importDatabase, type BackupSnapshot } from '../../services/backup';
import { celebrate } from '../../services/celebrate';
import {
  EASY_BONUS_KEY,
  HARD_MULTIPLIER_KEY,
  RETENTION_KEY,
  SCHEDULER_SETTING_RANGES,
  loadSchedulerParams,
  normalizeSchedulerParams,
} from '../../services/schedulerParams';
import { confirmDialog, toast } from '../../store/uiStore';

interface SettingsModalProps {
  onClose: () => void;
}

const SPEECH_SPEED_KEY = 'denki-speech-speed';
const SPEECH_SPEED_MIN = 0.5;
const SPEECH_SPEED_MAX = 2;

const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, Number.isFinite(value) ? value : min));

const readSpeechSpeed = (): number => {
  try {
    const raw = localStorage.getItem(SPEECH_SPEED_KEY);
    const parsed = raw === null ? 1 : Number.parseFloat(raw);
    return clamp(parsed, SPEECH_SPEED_MIN, SPEECH_SPEED_MAX);
  } catch {
    return 1;
  }
};

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

const fieldLabelStyle: React.CSSProperties = {
  display: 'block',
  fontSize: '11px',
  color: 'var(--text-secondary)',
  marginBottom: '6px',
  fontWeight: 700,
  textTransform: 'uppercase',
  letterSpacing: '0.45px',
};

const helpStyle: React.CSSProperties = {
  fontSize: '11px',
  color: 'var(--text-muted)',
  marginTop: '5px',
  lineHeight: 1.4,
};

export const SettingsModal: React.FC<SettingsModalProps> = ({ onClose }) => {
  const initialScheduler = loadSchedulerParams();
  const [retention, setRetention] = useState(initialScheduler.requestRetention);
  const [easyBonus, setEasyBonus] = useState(initialScheduler.easyBonus);
  const [hardMultiplier, setHardMultiplier] = useState(initialScheduler.hardIntervalMultiplier);
  const [speechSpeed, setSpeechSpeed] = useState(readSpeechSpeed);
  const [exporting, setExporting] = useState(false);
  const [importing, setImporting] = useState(false);

  const dialogRef = useRef<HTMLFormElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const previousFocus = document.activeElement as HTMLElement | null;
    closeButtonRef.current?.focus();

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
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
  }, [onClose]);

  const persistPreferences = (
    nextRetention: number,
    nextEasyBonus: number,
    nextHardMultiplier: number,
    nextSpeechSpeed: number,
  ) => {
    localStorage.setItem(RETENTION_KEY, String(nextRetention));
    localStorage.setItem(EASY_BONUS_KEY, String(nextEasyBonus));
    localStorage.setItem(HARD_MULTIPLIER_KEY, String(nextHardMultiplier));
    localStorage.setItem(SPEECH_SPEED_KEY, String(nextSpeechSpeed));
    localStorage.removeItem('denki-new-cards-per-day');
  };

  const handleSave = (event: React.FormEvent) => {
    event.preventDefault();
    const normalizedScheduler = normalizeSchedulerParams({
      requestRetention: retention,
      easyBonus,
      hardIntervalMultiplier: hardMultiplier,
    });
    const normalizedSpeech = clamp(speechSpeed, SPEECH_SPEED_MIN, SPEECH_SPEED_MAX);

    persistPreferences(
      normalizedScheduler.requestRetention,
      normalizedScheduler.easyBonus,
      normalizedScheduler.hardIntervalMultiplier,
      normalizedSpeech,
    );

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
    const confirmed = await confirmDialog({
      title: 'Reset preferences',
      message: 'Restore all scheduling and speech preferences to their defaults? Your cards and review history are not affected.',
      confirmLabel: 'Reset preferences',
      danger: true,
    });
    if (!confirmed) return;

    setRetention(0.9);
    setEasyBonus(1.3);
    setHardMultiplier(1.2);
    setSpeechSpeed(1);
    persistPreferences(0.9, 1.3, 1.2, 1);
    toast('Preferences restored to defaults', 'info');
  };

  const handleExport = async () => {
    if (exporting) return;
    setExporting(true);
    try {
      await downloadBackup();
      toast('Backup download started', 'success');
    } catch (error) {
      toast(
        `Backup export failed: ${error instanceof Error ? error.message : 'unknown error'}`,
        'error',
      );
    } finally {
      setExporting(false);
    }
  };

  const handleImportFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file || importing) return;

    const confirmed = await confirmDialog({
      title: 'Import backup',
      message: 'This replaces every current class, deck, card, review log, and active study queue with the backup file. The replacement cannot be undone.',
      confirmLabel: 'Replace everything',
      danger: true,
    });
    if (!confirmed) return;

    setImporting(true);
    try {
      const parsed: unknown = JSON.parse(await file.text());
      await importDatabase(parsed as BackupSnapshot);
      toast('Backup restored. Reloading Denki…', 'success');
      window.location.reload();
    } catch (error) {
      toast(
        `Import failed: ${error instanceof Error ? error.message : 'invalid backup file'}`,
        'error',
      );
    } finally {
      setImporting(false);
    }
  };

  return (
    <div
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
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
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingBottom: '12px', borderBottom: '2px solid var(--border)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '9px' }}>
            <Sliders size={18} aria-hidden="true" />
            <h3 id="settings-dialog-title" style={{ fontSize: '18px', fontWeight: 800, color: 'var(--text-primary)' }}>
              Preferences & Algorithm
            </h3>
          </div>
          <button
            ref={closeButtonRef}
            type="button"
            onClick={onClose}
            className="btn-premium-secondary"
            aria-label="Close preferences"
            style={{ width: '32px', height: '32px', padding: 0 }}
          >
            <X size={16} />
          </button>
        </div>

        <section>
          <h4 style={{ ...sectionHeadingStyle, marginTop: 0 }}>Spaced repetition</h4>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                <label htmlFor="retention-setting" style={{ fontSize: '13px', color: 'var(--text-secondary)', fontWeight: 600 }}>
                  Target retention
                </label>
                <span style={{ fontSize: '12px', color: 'var(--accent-color)', fontWeight: 700, fontFamily: 'monospace' }}>
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
                onChange={(event) => setRetention(event.currentTarget.valueAsNumber)}
                style={{ width: '100%', accentColor: 'var(--accent-color)' }}
              />
              <p style={helpStyle}>Higher retention schedules more frequent reviews. Changes apply to future ratings.</p>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '14px' }}>
              <label>
                <span style={fieldLabelStyle}>Easy bonus</span>
                <input
                  type="number"
                  min={SCHEDULER_SETTING_RANGES.easyBonus.min}
                  max={SCHEDULER_SETTING_RANGES.easyBonus.max}
                  step="0.1"
                  value={easyBonus}
                  onChange={(event) => {
                    if (Number.isFinite(event.currentTarget.valueAsNumber)) {
                      setEasyBonus(event.currentTarget.valueAsNumber);
                    }
                  }}
                  className="input-premium"
                />
              </label>

              <label>
                <span style={fieldLabelStyle}>Hard multiplier</span>
                <input
                  type="number"
                  min={SCHEDULER_SETTING_RANGES.hardMultiplier.min}
                  max={SCHEDULER_SETTING_RANGES.hardMultiplier.max}
                  step="0.05"
                  value={hardMultiplier}
                  onChange={(event) => {
                    if (Number.isFinite(event.currentTarget.valueAsNumber)) {
                      setHardMultiplier(event.currentTarget.valueAsNumber);
                    }
                  }}
                  className="input-premium"
                />
              </label>
            </div>

          </div>
        </section>

        <section style={sectionStyle}>
          <h4 style={sectionHeadingStyle}>Read aloud</h4>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
            <label htmlFor="speech-speed-setting" style={{ fontSize: '13px', color: 'var(--text-secondary)', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Volume2 size={14} aria-hidden="true" /> Speech speed
            </label>
            <span style={{ fontSize: '12px', color: 'var(--accent-color)', fontWeight: 700, fontFamily: 'monospace' }}>
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
            onChange={(event) => setSpeechSpeed(event.currentTarget.valueAsNumber)}
            style={{ width: '100%', accentColor: 'var(--accent-color)' }}
          />
          <p style={helpStyle}>Used for both automatic question/answer reading and manual speaker buttons.</p>
        </section>

        <section style={sectionStyle}>
          <h4 style={sectionHeadingStyle}>Data & backup</h4>
          <p style={{ ...helpStyle, marginTop: 0, marginBottom: '12px' }}>
            Your library is local to this browser. Export a JSON backup regularly and before clearing browser data.
          </p>
          <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
            <button
              type="button"
              onClick={() => void handleExport()}
              disabled={exporting || importing}
              className="btn-premium-secondary"
            >
              <Download size={13} /> {exporting ? 'Preparing…' : 'Export backup'}
            </button>
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={exporting || importing}
              className="btn-premium-secondary"
            >
              <Upload size={13} /> {importing ? 'Validating…' : 'Import backup'}
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="application/json,.json"
              disabled={importing}
              onChange={(event) => void handleImportFile(event)}
              style={{ display: 'none' }}
            />
          </div>
        </section>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px', borderTop: '2px solid var(--border)', paddingTop: '16px' }}>
          <button type="button" onClick={() => void handleReset()} className="btn-premium-danger">
            <RotateCcw size={12} /> Reset defaults
          </button>
          <div style={{ display: 'flex', gap: '10px' }}>
            <button type="button" onClick={onClose} className="btn-premium-secondary">Cancel</button>
            <button type="submit" className="btn-premium-primary">Apply changes</button>
          </div>
        </div>
      </form>
    </div>
  );
};
