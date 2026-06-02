import React, { useRef, useState } from 'react';
import { Upload, FileText, CheckCircle, AlertCircle, RefreshCw } from 'lucide-react';
import { useFlashcardStore } from '../store/useFlashcardStore';
import confetti from 'canvas-confetti';

interface CSVImporterProps {
  classId: number;
  deckId: number;
  onComplete?: () => void;
}

export const CSVImporter: React.FC<CSVImporterProps> = ({ classId, deckId, onComplete }) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const importFromCSV = useFlashcardStore(state => state.importFromCSV);
  
  const [isDragging, setIsDragging] = useState(false);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<{
    type: 'idle' | 'success' | 'error';
    message: string;
    successCount?: number;
    failedCount?: number;
  }>({ type: 'idle', message: '' });

  const processFile = (file: File) => {
    if (!file.name.endsWith('.csv')) {
      setStatus({
        type: 'error',
        message: 'Invalid file format. Please upload a valid .csv file.',
      });
      return;
    }

    setLoading(true);
    setStatus({ type: 'idle', message: '' });

    const reader = new FileReader();
    reader.onload = async (e) => {
      const text = e.target?.result as string;
      try {
        const result = await importFromCSV(classId, deckId, text);
        setLoading(false);
        
        if (result.success > 0) {
          setStatus({
            type: 'success',
            message: `Successfully imported ${result.success} cards!`,
            successCount: result.success,
            failedCount: result.failed,
          });
          
          // Celebrate with confetti
          confetti({
            particleCount: 80,
            spread: 60,
            origin: { y: 0.7 },
            colors: ['#6366f1', '#10b981', '#6ee7b7'],
          });

          if (onComplete) {
            setTimeout(onComplete, 2000);
          }
        } else {
          setStatus({
            type: 'error',
            message: 'No valid cards found. Ensure your CSV has at least 2 columns: Front, Back.',
            successCount: 0,
            failedCount: result.failed,
          });
        }
      } catch {
        setLoading(false);
        setStatus({
          type: 'error',
          message: 'An error occurred while parsing the CSV. Please try again.',
        });
      }
    };
    reader.readAsText(file);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      processFile(e.dataTransfer.files[0]);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      processFile(e.target.files[0]);
    }
  };

  const triggerFileInput = () => {
    fileInputRef.current?.click();
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={triggerFileInput}
        style={{
          border: isDragging ? '2px dashed #6366f1' : '2px dashed rgba(255, 255, 255, 0.15)',
          borderRadius: '12px',
          padding: '40px 20px',
          textAlign: 'center',
          cursor: 'pointer',
          background: isDragging ? 'rgba(99, 102, 241, 0.05)' : 'rgba(255, 255, 255, 0.01)',
          transition: 'all 0.2s ease',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '12px',
        }}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept=".csv"
          onChange={handleFileChange}
          style={{ display: 'none' }}
        />

        {loading ? (
          <RefreshCw size={36} className="animate-spin" style={{ color: '#6366f1', animation: 'spin 1.5s linear infinite' }} />
        ) : (
          <Upload size={36} style={{ color: isDragging ? '#6366f1' : '#9ca3af' }} />
        )}

        <div>
          <p style={{ fontWeight: 600, fontSize: '15px', color: '#f3f4f6', marginBottom: '4px' }}>
            {loading ? 'Parsing CSV data...' : 'Drag and drop your CSV file here'}
          </p>
          <p style={{ fontSize: '13px', color: '#9ca3af' }}>
            or click to browse from your device
          </p>
        </div>

        <div style={{
          fontSize: '11px',
          color: '#6b7280',
          background: 'rgba(255, 255, 255, 0.03)',
          padding: '4px 10px',
          borderRadius: '6px',
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
        }}>
          <FileText size={12} /> CSV columns: Front, Back, Type (optional)
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
              {status.type === 'success' ? 'Import Complete' : 'Import Failed'}
            </p>
            <p style={{ fontSize: '13px', color: '#d1d5db', lineHeight: 1.4 }}>
              {status.message}
            </p>
            {status.type === 'success' && status.failedCount !== undefined && status.failedCount > 0 && (
              <p style={{ fontSize: '12px', color: '#9ca3af', marginTop: '6px' }}>
                Note: {status.failedCount} rows were skipped due to missing front/back values.
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
