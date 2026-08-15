import React, { useRef, useState } from 'react';
import { Upload, HelpCircle, CheckCircle, AlertCircle, RefreshCw } from 'lucide-react';
import { useFlashcardStore } from '../store/useFlashcardStore';
import { celebrate } from '../services/celebrate';
import { importAnkiPackage } from '../services/ankiImport';
import { triggerAutoSave } from '../services/backup';

interface AnkiImporterProps {
  classId: number;
  onComplete?: () => void;
}

interface ImportStatus {
  type: 'idle' | 'success' | 'error';
  message: string;
  decksCreated?: number;
  cardsImported?: number;
}

export const AnkiImporter: React.FC<AnkiImporterProps> = ({ classId, onComplete }) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [loading, setLoading] = useState(false);
  const [progressMsg, setProgressMsg] = useState('');
  const [status, setStatus] = useState<ImportStatus>({ type: 'idle', message: '' });

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
      const result = await importAnkiPackage(classId, file, setProgressMsg);
      setProgressMsg('Refreshing your library...');
      await refreshImportedData();

      setStatus({
        type: 'success',
        message: `Successfully imported ${result.cardsImported} flashcards across ${result.decksCreated} decks.`,
        ...result,
      });

      celebrate({
        particleCount: 120,
        spread: 80,
        origin: { y: 0.7 },
        colors: ['#818cf8', '#6366f1', '#3b82f6', '#10b981'],
      });

      if (onComplete) setTimeout(onComplete, 2200);
    } catch (error) {
      console.error(error);
      setStatus({
        type: 'error',
        message: error instanceof Error
          ? error.message
          : 'An error occurred while loading or parsing the Anki package.',
      });
    } finally {
      setLoading(false);
      setProgressMsg('');
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const triggerFileInput = () => {
    if (!loading) fileInputRef.current?.click();
  };

  const handleDrop = (event: React.DragEvent) => {
    event.preventDefault();
    setIsDragging(false);
    const file = event.dataTransfer.files[0];
    if (file) void processFile(file);
  };

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) void processFile(file);
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
        aria-label="Import an Anki package"
        onDragOver={(event) => {
          event.preventDefault();
          if (!loading) setIsDragging(true);
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={handleDrop}
        onClick={triggerFileInput}
        onKeyDown={handleDropzoneKeyDown}
        style={{
          border: isDragging ? '2px dashed #818cf8' : '2px dashed rgba(255, 255, 255, 0.15)',
          borderRadius: '12px',
          padding: '45px 20px',
          textAlign: 'center',
          cursor: loading ? 'progress' : 'pointer',
          background: isDragging ? 'rgba(129, 140, 248, 0.05)' : 'rgba(255, 255, 255, 0.01)',
          transition: 'all 0.2s ease',
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
          onChange={handleFileChange}
          style={{ display: 'none' }}
        />

        {loading ? (
          <RefreshCw
            size={36}
            className="animate-spin"
            style={{ color: '#818cf8', animation: 'spin 1.5s linear infinite' }}
          />
        ) : (
          <Upload size={36} style={{ color: isDragging ? '#818cf8' : '#a5b4fc' }} />
        )}

        <div>
          <p style={{ fontWeight: 600, fontSize: '15px', color: '#f3f4f6', marginBottom: '4px' }}>
            {loading ? progressMsg : 'Drag and drop your Anki .apkg deck file here'}
          </p>
          <p style={{ fontSize: '13px', color: '#9ca3af' }}>
            {loading ? 'The package is being processed locally on this device.' : 'or click to browse from your device'}
          </p>
        </div>

        <div style={{
          fontSize: '11px',
          color: '#818cf8',
          background: 'rgba(129, 140, 248, 0.07)',
          padding: '5px 12px',
          borderRadius: '6px',
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
          border: '1px solid rgba(129, 140, 248, 0.15)',
        }}>
          <HelpCircle size={12} /> Local import · images · audio · cloze · nested decks
        </div>
      </div>

      {status.type !== 'idle' && (
        <div style={{
          display: 'flex',
          alignItems: 'flex-start',
          gap: '12px',
          padding: '16px',
          borderRadius: '10px',
          background: status.type === 'success' ? 'rgba(16, 185, 129, 0.1)' : 'rgba(239, 68, 68, 0.1)',
          border: `1px solid ${status.type === 'success' ? 'rgba(16, 185, 129, 0.2)' : 'rgba(239, 68, 68, 0.2)'}`,
        }}>
          {status.type === 'success' ? (
            <CheckCircle size={20} style={{ color: '#10b981', flexShrink: 0, marginTop: '2px' }} />
          ) : (
            <AlertCircle size={20} style={{ color: '#ef4444', flexShrink: 0, marginTop: '2px' }} />
          )}

          <div style={{ flex: 1 }}>
            <p style={{
              fontWeight: 600,
              fontSize: '14px',
              color: status.type === 'success' ? '#6ee7b7' : '#fca5a5',
              marginBottom: '2px',
            }}>
              {status.type === 'success' ? 'Anki package imported' : 'Import failed safely'}
            </p>
            <p style={{ fontSize: '13px', color: '#d1d5db', lineHeight: 1.4 }}>
              {status.message}
            </p>
          </div>
        </div>
      )}
    </div>
  );
};
