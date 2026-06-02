import React, { useState } from 'react';
import { X } from 'lucide-react';
import { useFlashcardStore } from '../../store/useFlashcardStore';
import { CSVImporter } from '../CSVImporter';
import { AnkiImporter } from '../AnkiImporter';

interface ImportModalProps {
  classId: number;
  deckId: number;
  onClose: () => void;
}

export const ImportModal: React.FC<ImportModalProps> = ({ classId, deckId, onClose }) => {
  const store = useFlashcardStore();
  const [importTab, setImportTab] = useState<'csv' | 'anki'>('csv');

  const handleComplete = () => {
    setTimeout(() => {
      onClose();
      if (classId !== null) {
        store.loadDecks(classId);
      }
    }, 1000);
  };

  return (
    <div style={{
      position: 'fixed',
      top: 0, left: 0, right: 0, bottom: 0,
      background: 'rgba(5, 7, 12, 0.85)',
      backdropFilter: 'blur(8px)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 100,
      padding: '20px',
    }}>
      <div className="glass-panel" style={{
        maxWidth: '500px',
        width: '100%',
        position: 'relative',
        display: 'flex',
        flexDirection: 'column',
        gap: '20px',
      }}>
        <button
          onClick={onClose}
          style={{
            position: 'absolute',
            top: '16px', right: '16px',
            background: 'transparent',
            border: 'none',
            color: '#9ca3af',
            cursor: 'pointer',
          }}
        >
          <X size={18} />
        </button>

        <div>
          <h3 style={{ fontSize: '18px', fontWeight: 800, color: '#f3f4f6' }}>Import Flashcards</h3>
          <p style={{ fontSize: '13px', color: '#9ca3af', marginTop: '4px' }}>
            Batch load cards into your collection
          </p>
        </div>

        <div style={{
          display: 'flex',
          background: 'rgba(255,255,255,0.03)',
          border: '1px solid rgba(255,255,255,0.08)',
          borderRadius: '8px',
          padding: '3px',
          gap: '4px',
        }}>
          <button
            onClick={() => setImportTab('csv')}
            style={{
              flex: 1,
              background: importTab === 'csv' ? 'rgba(99, 102, 241, 0.15)' : 'transparent',
              border: 'none',
              color: importTab === 'csv' ? '#a5b4fc' : '#9ca3af',
              borderRadius: '6px',
              padding: '8px',
              fontSize: '12px',
              fontWeight: 600,
              cursor: 'pointer',
              transition: 'all 0.2s',
            }}
          >
            CSV Upload
          </button>
          <button
            onClick={() => setImportTab('anki')}
            style={{
              flex: 1,
              background: importTab === 'anki' ? 'rgba(129, 140, 248, 0.15)' : 'transparent',
              border: 'none',
              color: importTab === 'anki' ? '#a5b4fc' : '#9ca3af',
              borderRadius: '6px',
              padding: '8px',
              fontSize: '12px',
              fontWeight: 600,
              cursor: 'pointer',
              transition: 'all 0.2s',
            }}
          >
            Anki (.apkg) Package
          </button>
        </div>

        {importTab === 'csv' ? (
          <CSVImporter
            classId={classId}
            deckId={deckId}
            onComplete={handleComplete}
          />
        ) : (
          <AnkiImporter
            classId={classId}
            onComplete={handleComplete}
          />
        )}
      </div>
    </div>
  );
};
