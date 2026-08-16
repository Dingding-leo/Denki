import React, { useEffect, useRef, useState } from 'react';
import { AlertCircle, CheckCircle, FileText, RefreshCw, Upload } from 'lucide-react';
import { celebrate } from '../services/celebrate';
import { useFlashcardStore } from '../store/useFlashcardStore';

interface CSVImporterProps {
  classId: number;
  deckId: number;
  onComplete?: () => void;
}

interface ImportStatus {
  type: 'idle' | 'success' | 'error';
  message: string;
  failedCount?: number;
}

export const CSVImporter: React.FC<CSVImporterProps> = ({ classId, deckId, onComplete }) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const completionTimerRef = useRef<number | null>(null);
  const importFromCSV = useFlashcardStore((state) => state.importFromCSV);

  const [isDragging, setIsDragging] = useState(false);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<ImportStatus>({ type: 'idle', message: '' });

  useEffect(() => () => {
    if (completionTimerRef.current !== null) {
      window.clearTimeout(completionTimerRef.current);
    }
  }, []);

  const processFile = async (file: File) => {
    if (loading) return;
    if (!/\.csv$/i.test(file.name)) {
      setStatus({
        type: 'error',
        message: 'Invalid file format. Choose a CSV file and try again.',
      });
      return;
    }

    setLoading(true);
    setStatus({ type: 'idle', message: '' });

    try {
      const text = await file.text();
      const result = await importFromCSV(classId, deckId, text);

      if (result.success === 0) {
        setStatus({
          type: 'error',
          message: result.failed > 0
            ? 'No valid cards were found. Every row needs a Front and Back value.'
            : 'The CSV is empty.',
          failedCount: result.failed,
        });
        return;
      }

      setStatus({
        type: 'success',
        message: `Imported ${result.success} card${result.success === 1 ? '' : 's'}.`,
        failedCount: result.failed,
      });

      celebrate({
        particleCount: 80,
        spread: 60,
        origin: { y: 0.7 },
        colors: ['#7f9c86', '#a7b79f', '#d4d9c8'],
      });

      if (onComplete) {
        completionTimerRef.current = window.setTimeout(() => {
          completionTimerRef.current = null;
          onComplete();
        }, 2000);
      }
    } catch (error) {
      setStatus({
        type: 'error',
        message: error instanceof Error
          ? error.message
          : 'The CSV could not be imported.',
      });
    } finally {
      setLoading(false);
      setIsDragging(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const triggerFileInput = () => {
    if (!loading) fileInputRef.current?.click();
  };

  const handleDropzoneKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      triggerFileInput();
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <div
        role="button"
        tabIndex={loading ? -1 : 0}
        aria-disabled={loading}
        aria-label="Import cards from a CSV file"
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
        onKeyDown={handleDropzoneKeyDown}
        style={{
          border: isDragging ? '2px dashed var(--accent-color)' : '2px dashed rgba(220, 226, 211, 0.24)',
          borderRadius: '10px',
          padding: '40px 20px',
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
          accept=".csv,text/csv"
          aria-label="Choose a CSV file"
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
            {loading ? 'Validating and importing the complete file…' : 'Drop a CSV file here'}
          </p>
          <p style={{ fontSize: '13px', color: 'var(--text-muted)' }}>
            or press Enter to browse from this device
          </p>
        </div>

        <div style={{
          fontSize: '11px',
          color: 'var(--text-secondary)',
          background: 'rgba(255, 255, 255, 0.025)',
          padding: '5px 10px',
          border: '1px solid rgba(220, 226, 211, 0.14)',
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
        }}>
          <FileText size={12} aria-hidden="true" /> Front, Back, Type (optional)
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
              {status.type === 'success' ? 'CSV import complete' : 'CSV import stopped safely'}
            </p>
            <p style={{ fontSize: '13px', color: 'var(--text-secondary)', lineHeight: 1.4 }}>
              {status.message}
            </p>
            {status.failedCount !== undefined && status.failedCount > 0 && (
              <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '6px' }}>
                {status.failedCount} invalid row{status.failedCount === 1 ? ' was' : 's were'} skipped.
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
