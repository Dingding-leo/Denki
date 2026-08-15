import React, { useState } from 'react';
import { CheckCircle, KeyRound, Loader2, Scissors, Trash2, Upload } from 'lucide-react';
import { generateFlashcards, type Flashcard as AIFlashcard } from '../services/ai';
import { useFlashcardStore } from '../store/useFlashcardStore';

const AIGeneratePage: React.FC = () => {
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [importResult, setImportResult] = useState('');
  const [cards, setCards] = useState<AIFlashcard[]>([]);
  const [apiKey, setApiKey] = useState(() => localStorage.getItem('denki_ai_key') || '');
  const [showSettings, setShowSettings] = useState(() => !localStorage.getItem('denki_ai_key'));
  const [importing, setImporting] = useState(false);
  const [selectedClassId, setSelectedClassId] = useState<number | null>(null);
  const [selectedDeckId, setSelectedDeckId] = useState<number | null>(null);

  const classes = useFlashcardStore((state) => state.classes);
  const allDecks = useFlashcardStore((state) => state.decks);
  const loadClasses = useFlashcardStore((state) => state.loadClasses);
  const loadDecks = useFlashcardStore((state) => state.loadDecks);
  const bulkCreateCards = useFlashcardStore((state) => state.bulkCreateCards);

  const decks = React.useMemo(
    () => selectedClassId === null
      ? []
      : allDecks.filter((deck) => deck.classId === selectedClassId),
    [allDecks, selectedClassId],
  );

  React.useEffect(() => {
    void loadClasses();
  }, [loadClasses]);

  React.useEffect(() => {
    if (selectedClassId !== null) void loadDecks(selectedClassId);
  }, [selectedClassId, loadDecks]);

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (loadEvent) => {
      const content = loadEvent.target?.result;
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
        setError('No usable cards came back. Try a more structured set of notes.');
      } else {
        setCards(result);
      }
    } catch (caughtError: unknown) {
      const message = caughtError instanceof Error ? caughtError.message : 'Generation failed';
      setError(message);
      if (message.includes('API key')) setShowSettings(true);
    } finally {
      setLoading(false);
    }
  };

  const handleSaveApiKey = (event: React.FormEvent) => {
    event.preventDefault();
    localStorage.setItem('denki_ai_key', apiKey);
    setShowSettings(false);
  };

  const approveAndImport = async () => {
    if (!selectedClassId || !selectedDeckId) {
      setError('Choose a class and deck before filing these cards.');
      return;
    }

    const validCards = cards.filter((card) => card.question.trim() && card.answer.trim());
    setImporting(true);
    setError('');

    try {
      await bulkCreateCards(
        validCards.map((card) => ({
          classId: selectedClassId,
          deckId: selectedDeckId,
          front: card.question.trim(),
          back: card.answer.trim(),
          cardType: 'standard' as const,
        })),
      );

      const skipped = cards.length - validCards.length;
      setCards([]);
      setText('');
      setImportResult(
        `Filed ${validCards.length} card${validCards.length === 1 ? '' : 's'}${skipped ? `; ${skipped} blank draft${skipped === 1 ? '' : 's'} skipped` : ''}.`,
      );
    } catch (caughtError) {
      setError(`Import failed: ${caughtError instanceof Error ? caughtError.message : 'unknown error'}`);
    } finally {
      setImporting(false);
    }
  };

  const updateCard = (id: string, field: 'question' | 'answer', value: string) => {
    setCards((currentCards) => currentCards.map((card) => (
      card.id === id ? { ...card, [field]: value } : card
    )));
  };

  return (
    <section className="zine-page zine-card-lab">
      <header className="zine-page-header">
        <div>
          <p className="zine-kicker">Card Lab / Assisted typesetting</p>
          <h1 className="zine-page-title">Cut notes into cards.</h1>
          <p className="zine-page-deck">
            Paste source material, let your configured provider propose question–answer cuts, then edit every draft before it enters the archive.
          </p>
        </div>

        <button
          type="button"
          className="ghost-btn"
          onClick={() => setShowSettings(true)}
          title="Provider settings"
        >
          <KeyRound size={15} />
          {apiKey ? 'Provider connected' : 'Set provider key'}
        </button>
      </header>

      {importResult && (
        <div className="zine-inline-alert is-success" role="status">{importResult}</div>
      )}

      {showSettings && (
        <section className="panel zine-lab-panel">
          <div className="zine-section-heading">
            <span className="zine-section-number">A</span>
            <h2>Provider key</h2>
          </div>

          <form onSubmit={handleSaveApiKey} className="zine-lab-form">
            <label className="zine-form-label">
              <span>OpenRouter or OpenAI-compatible key</span>
              <input
                type="password"
                value={apiKey}
                onChange={(event) => setApiKey(event.target.value)}
                placeholder="sk-or-v1-…"
                autoComplete="off"
              />
            </label>

            <p className="zine-caption">
              The key remains in this browser's local storage. Source text is sent to the configured provider when you generate drafts.
            </p>

            <div className="zine-toolbar is-end">
              {apiKey && (
                <button
                  type="button"
                  className="ghost-btn"
                  onClick={() => {
                    localStorage.removeItem('denki_ai_key');
                    setApiKey('');
                  }}
                >
                  Remove key
                </button>
              )}
              {apiKey && (
                <button type="button" className="ghost-btn" onClick={() => setShowSettings(false)}>
                  Close
                </button>
              )}
              <button type="submit" className="btn-primary">Save key</button>
            </div>
          </form>
        </section>
      )}

      <section className="panel zine-lab-panel">
        <div className="zine-section-heading">
          <span className="zine-section-number">B</span>
          <h2>Source copy</h2>
        </div>

        <label className="zine-form-label">
          <span>Lecture notes, textbook excerpt, or study outline</span>
          <textarea
            value={text}
            onChange={(event) => setText(event.target.value)}
            placeholder="Paste source material here…"
            rows={12}
          />
        </label>

        <p className="zine-caption">
          Privacy note: generation sends this text to your configured provider. Avoid patient data and other sensitive material.
        </p>

        <div className="zine-toolbar">
          <label className="ghost-btn zine-file-button">
            <Upload size={15} />
            Load .txt / .md
            <input type="file" accept=".txt,.md" onChange={handleFileUpload} />
          </label>

          <button
            type="button"
            className="btn-primary"
            onClick={handleGenerate}
            disabled={loading || !text.trim()}
          >
            {loading ? (
              <><Loader2 size={16} className="spin" /> Cutting drafts…</>
            ) : (
              <><Scissors size={16} /> Cut card drafts</>
            )}
          </button>
        </div>

        {error && <div className="zine-inline-alert is-error" role="alert">{error}</div>}
      </section>

      {cards.length > 0 && (
        <section className="panel zine-lab-panel">
          <header className="zine-draft-header">
            <div>
              <p className="zine-section-kicker">C / Proof before filing</p>
              <h2>{cards.length} card draft{cards.length === 1 ? '' : 's'}</h2>
            </div>

            <div className="zine-filing-controls">
              <label>
                <span className="zine-field-label">Class</span>
                <select
                  value={selectedClassId ?? ''}
                  onChange={(event) => {
                    setSelectedClassId(event.target.value ? Number(event.target.value) : null);
                    setSelectedDeckId(null);
                  }}
                >
                  <option value="">Choose class…</option>
                  {classes.map((studyClass) => (
                    <option key={studyClass.id} value={studyClass.id}>{studyClass.name}</option>
                  ))}
                </select>
              </label>

              <label>
                <span className="zine-field-label">Deck</span>
                <select
                  value={selectedDeckId ?? ''}
                  onChange={(event) => setSelectedDeckId(event.target.value ? Number(event.target.value) : null)}
                  disabled={!selectedClassId}
                >
                  <option value="">Choose deck…</option>
                  {decks.map((deck) => <option key={deck.id} value={deck.id}>{deck.name}</option>)}
                </select>
              </label>

              <button
                type="button"
                className="btn-primary"
                onClick={approveAndImport}
                disabled={importing || !selectedClassId || !selectedDeckId}
              >
                <CheckCircle size={16} />
                {importing ? 'Filing…' : 'File all cards'}
              </button>
            </div>
          </header>

          <div className="zine-draft-list">
            {cards.map((card, index) => (
              <article className="zine-card-draft" key={card.id}>
                <div className="zine-card-draft-index">{String(index + 1).padStart(2, '0')}</div>

                <label className="zine-form-label">
                  <span>Question cut</span>
                  <textarea
                    value={card.question}
                    onChange={(event) => updateCard(card.id, 'question', event.target.value)}
                  />
                </label>

                <label className="zine-form-label">
                  <span>Answer cut</span>
                  <textarea
                    value={card.answer}
                    onChange={(event) => updateCard(card.id, 'answer', event.target.value)}
                  />
                </label>

                <button
                  type="button"
                  className="ghost-btn zine-remove-draft"
                  onClick={() => setCards((currentCards) => currentCards.filter((item) => item.id !== card.id))}
                  title="Remove draft"
                  aria-label={`Remove card draft ${index + 1}`}
                >
                  <Trash2 size={17} />
                </button>
              </article>
            ))}
          </div>
        </section>
      )}
    </section>
  );
};

export default AIGeneratePage;
