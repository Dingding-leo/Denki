import React, { useState, useEffect } from 'react';
import { marked } from 'marked';
import DOMPurify from 'dompurify';

interface StudyNotepadProps {
  deckId: number;
  deckName: string;
}

export const StudyNotepad: React.FC<StudyNotepadProps> = ({ deckId, deckName }) => {
  const [deckNotes, setDeckNotes] = useState('');
  const [notesMode, setNotesMode] = useState<'edit' | 'preview'>('preview');

  useEffect(() => {
    const saved = localStorage.getItem(`denki-notes-${deckId}`);
    if (saved) {
      setDeckNotes(saved);
    } else {
      setDeckNotes('');
    }
  }, [deckId]);

  const handleNotesChange = (text: string) => {
    setDeckNotes(text);
    localStorage.setItem(`denki-notes-${deckId}`, text);
  };

  const renderMarkdown = (content: string) => {
    if (!content) return '';
    try {
      const html = marked.parse(content);
      return DOMPurify.sanitize(html as string);
    } catch (err) {
      console.error('Failed to parse notes markdown:', err);
      return DOMPurify.sanitize(content);
    }
  };

  return (
    <div className="glass-panel" style={{
      flex: 0.8,
      maxWidth: '600px',
      width: '100%',
      display: 'flex',
      flexDirection: 'column',
      gap: '12px',
      padding: '20px',
      background: 'rgba(10, 15, 26, 0.8)',
      border: '1px solid rgba(255, 255, 255, 0.08)',
      borderRadius: '12px',
      animation: 'scaleIn 0.25s ease',
      textAlign: 'left',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid rgba(255, 255, 255, 0.06)', paddingBottom: '10px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <span style={{ fontSize: '12px', fontWeight: 700, color: '#f3f4f6' }}>
            📝 Deck Notes
          </span>
          <span style={{ fontSize: '10px', color: '#6b7280', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '150px' }} title={`${deckName}.md`}>
            ({deckName}.md)
          </span>
        </div>

        {/* Edit vs Preview Toggle Buttons */}
        <div style={{ display: 'flex', gap: '6px', background: 'rgba(0,0,0,0.2)', padding: '2px', borderRadius: '6px' }}>
          <button
            onClick={() => setNotesMode('edit')}
            style={{
              background: notesMode === 'edit' ? '#6366f1' : 'transparent',
              color: notesMode === 'edit' ? 'white' : '#9ca3af',
              border: 'none',
              borderRadius: '4px',
              padding: '3px 8px',
              fontSize: '10px',
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            Write
          </button>
          <button
            onClick={() => setNotesMode('preview')}
            style={{
              background: notesMode === 'preview' ? '#6366f1' : 'transparent',
              color: notesMode === 'preview' ? 'white' : '#9ca3af',
              border: 'none',
              borderRadius: '4px',
              padding: '3px 8px',
              fontSize: '10px',
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            Preview
          </button>
        </div>
      </div>

      {/* Text editor face */}
      {notesMode === 'edit' ? (
        <textarea
          className="notes-editor"
          value={deckNotes}
          onChange={e => handleNotesChange(e.target.value)}
          placeholder="# Deck Notes&#10;&#10;Write down your observations, formulas, or summaries here.&#10;&#10;- Auto-saves in real-time!&#10;- Supports Markdown style tags."
        />
      ) : (
        /* Markdown preview face */
        <div 
          className="markdown-content notes-preview"
          dangerouslySetInnerHTML={{ __html: renderMarkdown(deckNotes || '*No notes typed yet. Click Write to add notes.*') }}
        />
      )}

      <span style={{ fontSize: '10px', color: '#6b7280', textAlign: 'right' }}>
        ⚡ Saved automatically
      </span>
    </div>
  );
};
