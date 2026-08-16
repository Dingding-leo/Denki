import React, { useEffect, useRef, useState } from 'react';
import { AlertCircle, CheckCircle, HelpCircle, RefreshCw, Upload } from 'lucide-react';
import { importAnkiPackage } from '../services/ankiImport';
import { triggerAutoSave } from '../services/backup';
import { celebrate } from '../services/celebrate';
import { useFlashcardStore } from '../store/useFlashcardStore';

interface AnkiImporterProps {
  classId: number;
  onComplete?: () => void;
}

interface ImportStatus {
  type: 'idle' | 'success' | 'error';
  message: string;
}

export const AnkiImporter: React.FC<AnkiImporterProps> = ({ classId, onComplete }) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const completionTimerRef = useRef<number | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [loading, setLoading] = useState(false);
  const [progressMessage, setProgressMessage] = useState('');
  const [status, setStatus] = useState<ImportStatus>({ type: 'idle', message: '' });

  useEffect(() => () => {
    if (completionTimerRef.current !== null) {
      window.clearTimeout(completionTimerRef.current);
    }
  }, []);

  const refreshImportedData = async () => {
    const store = useFlashcardStore.getState();
    await store.loadDecks(classId);
    await Promise.all([
      store.loadClassStats(classId),
      store.loadDeckStats(classId),
      store.loadStats(classId),
    ]);
    triggerAutoSave();
  };

  const processFile = async (file: File) => {
    if (loading) return;

    setLoading(true);
    setStatus({ type: 'idle', message: '' });

    try {
      const result = await importAnkiPackage(classId, file, setProgressMessage);
      setProgressMessage('Refreshing your library…');
      await refreshImportedData();

      setStatus({
        type: 'success',
        message: `Imported ${result.cardsImported} flashcard${result.cardsImported === 1 ? '' : 's'} across ${result.decksCreated} deck${result.decksCreated === 1 ? '' : 's'}.`,
      });

      celebrate({
        particleCount: 100,
        spread: 75,
        origin: { y: 0.7 },
        colors: ['#7f9c86', '#a7b79f', '#d4d9c8'],
      });

      if (onComplete) {
        completionTimerRef.current = window.setTimeout(() => {
          completionTimerRef.current = null;
          onComplete();
        }, 2200);
      }
    } catch (error) {
      console.error(error);
      setStatus({
        type: 'error',
        message: error instanceof Error
          ? error.message
          : 'The Anki package could not be loaded or parsed.',
      });
    } finally {
      setLoading(false);
      setIsDragging(false);
      setProgressMessage('');
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const triggerFileInput = () => {
    if (!loading) fileInputRef.current?.click();
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <div
        role="button"
        tabIndex={loading ? -1 : 0}
        aria-disabled={loading}
        aria-label="Import an Anki package"
        onDragOver={(event) => {
          event.preventDefault();
          if (!loading) setIsDragging(true);
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={(event) => {
          event.preventDefault();
          setIsDragging(false);
          const file = event.dataTransfer.files[0];
          if (file) void processFile(file);
        }}
        onClick={triggerFileInput}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            triggerFileInput();
          }
        }}
        style={{
          border: isDragging ? '2px dashed var(--accent-color)' : '2px dashed rgba(220, 226, 211, 0.24)',
          borderRadius: '10px',
          padding: '44px 20px',
          textAlign: 'center',
          cursor: loading ? 'progress' : 'pointer',
          background: isDragging ? 'rgba(127, 156, 134, 0.08)' : 'rgba(255, 255, 255, 0.015)',
          transition: 'border-color 0.15s ease, background 0.15s ease',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '12px',
          outline: 'none',
        }}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept=".apkg"
          aria-label="Choose an Anki package"
          disabled={loading}
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) void processFile(file);
          }}
          style={{ display: 'none' }}
        />

        {loading ? (
          <RefreshCw size={36} aria-hidden="true" style={{ color: 'var(--accent-color)', animation: 'spin 1.5s linear infinite' }} />
        ) : (
          <Upload size={36} aria-hidden="true" style={{ color: isDragging ? 'var(--accent-color)' : 'var(--text-muted)' }} />
        )}

        <div>
          <p style={{ fontWeight: 600, fontSize: '15px', color: 'var(--text-primary)', marginBottom: '4px' }}>
            {loading ? progressMessage : 'Drop an Anki .apkg package here'}
          </p>
          <p style={{ fontSize: '13px', color: 'var(--text-muted)' }}>
            {loading ? 'The package is processed locally on this device.' : 'or press Enter to browse from this device'}
          </p>
        </div>

        <div style={{
          fontSize: '11px',
          color: 'var(--text-secondary)',
          background: 'rgba(255, 255, 255, 0.025)',
          padding: '5px 11px',
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
          border: '1px solid rgba(220, 226, 211, 0.14)',
        }}>
          <HelpCircle size={12} aria-hidden="true" /> Images · audio · cloze · nested decks
        </div>
      </div>

      {status.type !== 'idle' && (
        <div
          role={status.type === 'error' ? 'alert' : 'status'}
          aria-live="polite"
          style={{
            display: 'flex',
            alignItems: 'flex-start',
            gap: '12px',
            padding: '16px',
            borderRadius: '8px',
            background: status.type === 'success' ? 'rgba(127, 156, 134, 0.1)' : 'rgba(180, 96, 82, 0.1)',
            border: `1px solid ${status.type === 'success' ? 'rgba(127, 156, 134, 0.3)' : 'rgba(180, 96, 82, 0.3)'}`,
          }}
        >
          {status.type === 'success' ? (
            <CheckCircle size={20} style={{ color: '#9eb3a1', flexShrink: 0, marginTop: '2px' }} />
          ) : (
            <AlertCircle size={20} style={{ color: '#cf8e82', flexShrink: 0, marginTop: '2px' }} />
          )}
          <div style={{ flex: 1 }}>
            <p style={{ fontWeight: 600, fontSize: '14px', color: 'var(--text-primary)', marginBottom: '2px' }}>
              {status.type === 'success' ? 'Anki import complete' : 'Anki import stopped safely'}
            </p>
            <p style={{ fontSize: '13px', color: 'var(--text-secondary)', lineHeight: 1.4 }}>
              {status.message}
            </p>
          </div>
        </div>
      )}
    </div>
  );
};
