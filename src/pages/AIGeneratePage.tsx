import React, { useState } from 'react';
import { Sparkles, Trash2, CheckCircle, Upload, Key, Loader2 } from 'lucide-react';
import { generateFlashcards, type Flashcard as AIFlashcard } from '../services/ai';
import { useFlashcardStore } from '../store/useFlashcardStore';
import type { Deck } from '../db/schema';

const AIGeneratePage: React.FC = () => {
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [importResult, setImportResult] = useState('');
  const [cards, setCards] = useState<AIFlashcard[]>([]);
  const [apiKey, setApiKey] = useState(() => localStorage.getItem('denki_ai_key') || '');
  const [showSettings, setShowSettings] = useState(!localStorage.getItem('denki_ai_key'));
  const [importing, setImporting] = useState(false);
  const [selectedClassId, setSelectedClassId] = useState<number | null>(null);
  const [selectedDeckId, setSelectedDeckId] = useState<number | null>(null);
  const [decks, setDecks] = useState<Deck[]>([]);

  const { classes, loadClasses, loadDecks, bulkCreateCards } = useFlashcardStore();

  React.useEffect(() => { void loadClasses(); }, [loadClasses]);

  React.useEffect(() => {
    if (selectedClassId) {
      loadDecks(selectedClassId).then(() => {
        const store = useFlashcardStore.getState();
        setDecks(store.decks.filter(d => d.classId === selectedClassId));
      });
    }
  }, [selectedClassId, loadDecks]);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const content = ev.target?.result;
      if (typeof content === 'string') setText(content);
    };
    reader.readAsText(file);
  };

  const handleGenerate = async () => {
    setError('');
    setImportResult('');
    setLoading(true);
    try {
      const result = await generateFlashcards(text, apiKey);
      if (result.length === 0) {
        setError('No flashcards generated. Try providing more structured content.');
      } else {
        setCards(result);
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Generation failed';
      setError(message);
      if (message.includes('API key')) setShowSettings(true);
    } finally {
      setLoading(false);
    }
  };

  const handleSaveApiKey = (e: React.FormEvent) => {
    e.preventDefault();
    localStorage.setItem('denki_ai_key', apiKey);
    setShowSettings(false);
  };

  const approveAndImport = async () => {
    if (!selectedClassId || !selectedDeckId) {
      setError('Please select a Class and Deck to import into.');
      return;
    }
    const valid = cards.filter(c => c.question.trim() && c.answer.trim());
    setImporting(true);
    setError('');
    try {
      // One bulk transaction (+ one stats refresh) instead of N per-card writes.
      await bulkCreateCards(
        valid.map(c => ({
          classId: selectedClassId,
          deckId: selectedDeckId,
          front: c.question.trim(),
          back: c.answer.trim(),
          cardType: 'standard' as const,
        })),
      );
      const skipped = cards.length - valid.length;
      setCards([]);
      setText('');
      setImportResult(`Imported ${valid.length} card${valid.length === 1 ? '' : 's'}${skipped ? ` — ${skipped} blank skipped` : ''}.`);
    } catch (err) {
      setError('Import failed: ' + (err instanceof Error ? err.message : 'unknown error'));
    } finally {
      setImporting(false);
    }
  };

  return (
    <div style={{ padding: '0 0 40px 0' }}>
      <div className="page-header">
        <h1>
          <Sparkles size={24} style={{ verticalAlign: 'middle', marginRight: 10, color: '#a78bfa' }} />
          AI Flashcard Generator
        </h1>
        <button
          className="ghost-btn"
          onClick={() => setShowSettings(true)}
          title="API Settings"
        >
          <Key size={16} style={{ marginRight: 6 }} />
          {apiKey ? 'Key configured' : 'Set API Key'}
        </button>
      </div>

      {importResult && (
        <div style={{ marginBottom: 24, padding: '12px 16px', background: 'rgba(16,185,129,0.1)', border: '1px solid rgba(16,185,129,0.3)', borderRadius: 12, color: '#6ee7b7', fontSize: '0.9rem' }}>
          {importResult}
        </div>
      )}

      {showSettings && (
        <div className="panel" style={{ marginBottom: 24 }}>
          <h3 style={{ marginTop: 0 }}>API Settings</h3>
          <form onSubmit={handleSaveApiKey} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <label style={{ fontSize: '0.9rem', color: 'var(--text-muted)' }}>
              OpenRouter API Key (or any OpenAI-compatible endpoint)
              <input
                type="password"
                value={apiKey}
                onChange={e => setApiKey(e.target.value)}
                placeholder="sk-or-v1-..."
                style={{
                  display: 'block', width: '100%', marginTop: 6,
                  padding: '10px 14px', borderRadius: 10,
                  background: 'rgba(255,255,255,0.05)', border: '1px solid var(--border)',
                  color: 'var(--text-main)', fontSize: '0.95rem'
                }}
              />
            </label>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              {apiKey && (
                <button
                  type="button"
                  className="ghost-btn"
                  style={{ color: 'var(--danger)' }}
                  onClick={() => { localStorage.removeItem('denki_ai_key'); setApiKey(''); }}
                >
                  Remove key
                </button>
              )}
              {apiKey && <button type="button" className="ghost-btn" onClick={() => setShowSettings(false)}>Cancel</button>}
              <button type="submit" className="btn-primary">Save Key</button>
            </div>
          </form>
        </div>
      )}

      <div className="panel" style={{ marginBottom: 24 }}>
        <label style={{ display: 'block', marginBottom: 12, fontWeight: 600 }}>
          Paste lecture notes, textbook excerpts, or any text:
        </label>
        <p style={{ fontSize: '12px', color: '#6b7280', marginBottom: 12, lineHeight: 1.4 }}>
          The text you paste is sent to your configured AI provider to generate cards — it leaves this device.
          Content is not stored on any server, but please avoid pasting anything sensitive.
        </p>
        <textarea
          value={text}
          onChange={e => setText(e.target.value)}
          placeholder="Paste your content here... e.g. The mitochondria is the powerhouse of the cell..."
          rows={10}
          style={{
            width: '100%', padding: '14px', borderRadius: 12,
            background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border)',
            color: 'var(--text-main)', fontSize: '0.95rem', resize: 'vertical',
            fontFamily: 'inherit', lineHeight: 1.6
          }}
        />

        <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginTop: 16, flexWrap: 'wrap' }}>
          <label className="ghost-btn" style={{ cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <Upload size={16} />
            Upload .txt/.md
            <input type="file" accept=".txt,.md" onChange={handleFileUpload} style={{ display: 'none' }} />
          </label>

          <button
            className="btn-primary"
            onClick={handleGenerate}
            disabled={loading || !text.trim()}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}
          >
            {loading ? <><Loader2 size={18} className="spin" /> Generating...</> : <><Sparkles size={18} /> Generate Flashcards</>}
          </button>
        </div>

        {error && (
          <div style={{ marginTop: 12, padding: '10px 16px', background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 10, color: '#fca5a5', fontSize: '0.9rem' }}>
            {error}
          </div>
        )}
      </div>

      {cards.length > 0 && (
        <div className="panel">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
            <h3 style={{ margin: 0 }}>Generated Cards ({cards.length})</h3>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <select
                id="import-class"
                value={selectedClassId ?? ''}
                onChange={e => setSelectedClassId(e.target.value ? Number(e.target.value) : null)}
                style={{
                  padding: '8px 14px', borderRadius: 10,
                  background: 'rgba(255,255,255,0.05)', border: '1px solid var(--border)',
                  color: 'var(--text-main)', fontSize: '0.9rem'
                }}
              >
                <option value="">Select class...</option>
                {classes.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
              <select
                value={selectedDeckId ?? ''}
                onChange={e => setSelectedDeckId(e.target.value ? Number(e.target.value) : null)}
                disabled={!selectedClassId}
                style={{
                  padding: '8px 14px', borderRadius: 10,
                  background: 'rgba(255,255,255,0.05)', border: '1px solid var(--border)',
                  color: 'var(--text-main)', fontSize: '0.9rem'
                }}
              >
                <option value="">Select deck...</option>
                {decks.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
              </select>
              <button
                className="btn-primary"
                onClick={approveAndImport}
                disabled={importing || !selectedClassId || !selectedDeckId}
                style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
              >
                <CheckCircle size={18} />
                {importing ? 'Importing...' : 'Import All'}
              </button>
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {cards.map(card => (
              <div key={card.id} className="ai-card-row" style={{
                display: 'grid', gridTemplateColumns: '1fr 1fr auto', gap: 12,
                padding: '16px', borderRadius: 14,
                background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.04)',
                alignItems: 'start'
              }}>
                <div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Question</div>
                  <textarea
                    value={card.question}
                    onChange={e => {
                      const idx = cards.findIndex(c => c.id === card.id);
                      const next = [...cards];
                      next[idx] = { ...next[idx], question: e.target.value };
                      setCards(next);
                    }}
                    style={{
                      width: '100%', padding: '8px 12px', borderRadius: 8,
                      background: 'rgba(255,255,255,0.03)', border: '1px solid transparent',
                      color: 'var(--text-main)', fontSize: '0.9rem', resize: 'vertical',
                      fontFamily: 'inherit', minHeight: 60
                    }}
                  />
                </div>
                <div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Answer</div>
                  <textarea
                    value={card.answer}
                    onChange={e => {
                      const idx = cards.findIndex(c => c.id === card.id);
                      const next = [...cards];
                      next[idx] = { ...next[idx], answer: e.target.value };
                      setCards(next);
                    }}
                    style={{
                      width: '100%', padding: '8px 12px', borderRadius: 8,
                      background: 'rgba(255,255,255,0.03)', border: '1px solid transparent',
                      color: 'var(--text-main)', fontSize: '0.9rem', resize: 'vertical',
                      fontFamily: 'inherit', minHeight: 60
                    }}
                  />
                </div>
                <button
                  className="ghost-btn"
                  onClick={() => setCards(cards.filter(c => c.id !== card.id))}
                  title="Remove"
                  style={{ color: 'var(--danger)', padding: 8 }}
                >
                  <Trash2 size={18} />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      <style>{`
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        .spin { animation: spin 1s linear infinite; }
        @media (max-width: 640px) {
          .ai-card-row { grid-template-columns: 1fr !important; }
        }
      `}</style>
    </div>
  );
};

export default AIGeneratePage;
