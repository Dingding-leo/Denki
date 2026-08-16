import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Check, Edit3, Eye, Loader2 } from 'lucide-react';
import { renderContent } from '../services/markdown';
import { useFlashcardStore } from '../store/useFlashcardStore';

interface StudyNotepadProps {
  deckId: number;
  deckName: string;
}

type SaveState = 'saved' | 'saving' | 'error';

function readLegacyNotes(deckId: number): string {
  try {
    return localStorage.getItem(`denki-notes-${deckId}`) ?? '';
  } catch {
    return '';
  }
}

function removeLegacyNotes(deckId: number): void {
  try {
    localStorage.removeItem(`denki-notes-${deckId}`);
  } catch {
    // Restricted storage contexts should not block database-backed notes.
  }
}

export const StudyNotepad: React.FC<StudyNotepadProps> = (props) => (
  <StudyNotepadForDeck key={props.deckId} {...props} />
);

const StudyNotepadForDeck: React.FC<StudyNotepadProps> = ({ deckId, deckName }) => {
  const saveDeckNotes = useFlashcardStore((state) => state.saveDeckNotes);
  const initial = useState(() => {
    const deck = useFlashcardStore.getState().decks.find((candidate) => candidate.id === deckId);
    const legacyNotes = readLegacyNotes(deckId);
    const databaseNotes = deck?.notes ?? '';
    const migrateLegacy = databaseNotes.length === 0 && legacyNotes.length > 0;
    return {
      text: migrateLegacy ? legacyNotes : databaseNotes,
      migrateLegacy,
    };
  })[0];

  const [deckNotes, setDeckNotes] = useState(initial.text);
  const [notesMode, setNotesMode] = useState<'edit' | 'preview'>('preview');
  const [saveState, setSaveState] = useState<SaveState>(
    initial.migrateLegacy ? 'saving' : 'saved',
  );
  const latestNotesRef = useRef(deckNotes);
  const saveTimerRef = useRef<number | null>(null);
  const mountedRef = useRef(true);

  const persistNotes = useCallback(async (notes: string, migratedLegacy = false) => {
    try {
      await saveDeckNotes(deckId, notes);
      if (migratedLegacy) removeLegacyNotes(deckId);
      if (mountedRef.current) setSaveState('saved');
    } catch (error) {
      console.error('Failed to save deck notes:', error);
      if (mountedRef.current) setSaveState('error');
    }
  }, [deckId, saveDeckNotes]);

  useEffect(() => {
    mountedRef.current = true;
    const migrationTimer = initial.migrateLegacy
      ? window.setTimeout(() => void persistNotes(initial.text, true), 0)
      : null;

    return () => {
      mountedRef.current = false;
      if (migrationTimer !== null) window.clearTimeout(migrationTimer);
      if (saveTimerRef.current !== null) {
        window.clearTimeout(saveTimerRef.current);
      }
      // Flush the latest keystrokes before leaving the study view. Dexie's
      // promise continues even though this component has already unmounted.
      void saveDeckNotes(deckId, latestNotesRef.current);
    };
  }, [deckId, initial.migrateLegacy, initial.text, persistNotes, saveDeckNotes]);

  const handleNotesChange = (text: string) => {
    latestNotesRef.current = text;
    setDeckNotes(text);
    setSaveState('saving');

    if (saveTimerRef.current !== null) {
      window.clearTimeout(saveTimerRef.current);
    }
    saveTimerRef.current = window.setTimeout(() => {
      saveTimerRef.current = null;
      void persistNotes(latestNotesRef.current);
    }, 350);
  };

  const previewHtml = renderContent(
    deckNotes || '*No notes yet. Choose Write to add a summary, formula, or observation.*',
    false,
    true,
  );

  return (
    <section
      className="glass-panel"
      aria-label={`Notes for ${deckName}`}
      style={{
        flex: 0.8,
        maxWidth: '600px',
        width: '100%',
        display: 'flex',
        flexDirection: 'column',
        gap: '12px',
        padding: '20px',
        textAlign: 'left',
      }}
    >
      <header style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        gap: '12px',
        borderBottom: '1px solid var(--border)',
        paddingBottom: '10px',
      }}>
        <div style={{ minWidth: 0 }}>
          <h3 style={{ fontSize: '12px', fontWeight: 800, color: 'var(--text-primary)', margin: 0 }}>
            Deck notes
          </h3>
          <p
            title={`${deckName}.md`}
            style={{
              margin: '3px 0 0',
              fontSize: '10px',
              color: 'var(--text-muted)',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              maxWidth: '280px',
            }}
          >
            {deckName}.md
          </p>
        </div>

        <div className="segmented-control" aria-label="Deck notes view">
          <button
            type="button"
            onClick={() => setNotesMode('edit')}
            className={`segmented-control-item ${notesMode === 'edit' ? 'active' : ''}`}
            aria-pressed={notesMode === 'edit'}
          >
            <Edit3 size={12} /> Write
          </button>
          <button
            type="button"
            onClick={() => setNotesMode('preview')}
            className={`segmented-control-item ${notesMode === 'preview' ? 'active' : ''}`}
            aria-pressed={notesMode === 'preview'}
          >
            <Eye size={12} /> Preview
          </button>
        </div>
      </header>

      {notesMode === 'edit' ? (
        <textarea
          className="notes-editor"
          value={deckNotes}
          onChange={(event) => handleNotesChange(event.target.value)}
          placeholder="# Deck notes\n\nWrite observations, formulas, or summaries here. Markdown is supported."
          aria-label={`Edit notes for ${deckName}`}
        />
      ) : (
        <div
          className="markdown-content notes-preview"
          dangerouslySetInnerHTML={{ __html: previewHtml }}
        />
      )}

      <span
        role="status"
        aria-live="polite"
        style={{
          minHeight: '16px',
          display: 'flex',
          justifyContent: 'flex-end',
          alignItems: 'center',
          gap: '5px',
          fontSize: '10px',
          color: saveState === 'error' ? '#cf8e82' : 'var(--text-muted)',
        }}
      >
        {saveState === 'saving' ? (
          <><Loader2 size={11} className="spin" /> Saving…</>
        ) : saveState === 'error' ? (
          'Save failed — your current text remains open'
        ) : (
          <><Check size={11} /> Saved with this deck</>
        )}
      </span>
    </section>
  );
};
