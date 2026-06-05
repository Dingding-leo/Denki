import React, { useState, useMemo, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Trash2, Play, Upload, Edit2, RotateCcw, ChevronRight } from 'lucide-react';
import { useFlashcardStore } from '../store/useFlashcardStore';
import { AnalyticsDashboard } from '../components/AnalyticsDashboard';
import { ManageCardsModal } from '../components/modals/ManageCardsModal';
import { ImportModal } from '../components/modals/ImportModal';
import confetti from 'canvas-confetti';

export const ClassViewPage: React.FC = () => {
  const { classId: routeClassId } = useParams();
  const navigate = useNavigate();
  const store = useFlashcardStore();
  
  const activeClassId = routeClassId ? parseInt(routeClassId, 10) : null;
  
  const [classTab, setClassTab] = useState<'decks' | 'analytics'>('decks');
  const [newDeckName, setNewDeckName] = useState('');
  const [newDeckDesc, setNewDeckDesc] = useState('');
  
  const [managingDeckId, setManagingDeckId] = useState<number | null>(null);
  const [importingDeckId, setImportingDeckId] = useState<number | null>(null);

  useEffect(() => {
    // Sync to store for Analytics Dashboard
    useFlashcardStore.setState({ activeClassId });
    if (activeClassId !== null) {
      store.loadDecks(activeClassId);
      store.loadStats(activeClassId);
    } else {
      store.loadStats(null);
    }
  }, [activeClassId]);

  const classesWithMastery = useMemo(() => {
    return store.classes.map(cls => {
      const stats = store.classStats[cls.id || 0] || {
        total: 0,
        dueCount: 0,
        masteryPct: 0,
        decksCount: 0,
      };

      return {
        ...cls,
        total: stats.total,
        dueCount: stats.dueCount,
        masteryPct: stats.masteryPct,
        decksCount: stats.decksCount,
      };
    });
  }, [store.classes, store.classStats]);

  const activeClass = useMemo(() => {
    if (activeClassId === null) return null;
    return classesWithMastery.find(c => c.id === activeClassId) || null;
  }, [activeClassId, classesWithMastery]);

  const activeClassDecks = useMemo(() => {
    if (activeClassId === null) return [];
    
    return store.decks.filter(d => d.classId === activeClassId).map(deck => {
      const stats = store.deckStats[deck.id || 0] || {
        total: 0,
        dueCount: 0,
        masteryPct: 0,
      };

      return {
        ...deck,
        total: stats.total,
        dueCount: stats.dueCount,
        masteryPct: stats.masteryPct,
      };
    });
  }, [activeClassId, store.decks, store.deckStats]);

  const classDueCount = useMemo(() => {
    return activeClassDecks.reduce((acc, d) => acc + d.dueCount, 0);
  }, [activeClassDecks]);

  const handleCreateDeckSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (activeClassId === null || !newDeckName.trim()) return;

    await store.createDeck(activeClassId, newDeckName.trim(), newDeckDesc.trim());
    setNewDeckName('');
    setNewDeckDesc('');
    
    confetti({
      particleCount: 25,
      spread: 35,
      origin: { y: 0.8 },
      colors: ['#6366f1', '#10b981']
    });
  };

  const handleStartClassStudy = async (classId: number) => {
    await store.startClassStudySession(classId);
    navigate(`/study/class/${classId}`);
  };

  const handleStartDeckStudy = async (deckId: number) => {
    await store.startStudySession(deckId);
    navigate(`/study/deck/${deckId}`);
  };

  if (!activeClass || activeClassId === null) {
    return <div>Class not found</div>;
  }

  return (
    <>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '24px', maxWidth: '1000px', margin: '0 auto', width: '100%' }}>
        {/* Class Banner Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', borderBottom: '1px solid rgba(255,255,255,0.06)', paddingBottom: '20px' }}>
          <div>
            <span style={{ fontSize: '10px', textTransform: 'uppercase', letterSpacing: '1.5px', color: '#6366f1', fontWeight: 700 }}>Class Workspace</span>
            <h1 style={{ fontSize: '28px', fontWeight: 800, color: '#f3f4f6', marginTop: '4px' }}>{activeClass.name}</h1>
            <p style={{ color: '#9ca3af', fontSize: '14px', marginTop: '6px', lineHeight: 1.4 }}>{activeClass.description}</p>
          </div>
          
          <button
            onClick={() => {
              if (confirm("Are you sure you want to delete this CLASS? This will permanently delete all decks and cards under this class!")) {
                store.deleteClass(activeClass.id || 0);
                navigate('/');
              }
            }}
            style={{ padding: '6px 12px', fontSize: '12px' }}
            className="btn-premium-danger"
          >
            <Trash2 size={13} /> Delete Class
          </button>
        </div>

        {/* Segmented Class Workspace tabs */}
        <div style={{ display: 'flex', justifyContent: 'flex-start' }}>
          <div className="segmented-control">
            <button
              onClick={() => setClassTab('decks')}
              className={`segmented-control-item ${classTab === 'decks' ? 'active' : ''}`}
            >
              Decks ({activeClassDecks.length})
            </button>
            <button
              onClick={() => setClassTab('analytics')}
              className={`segmented-control-item ${classTab === 'analytics' ? 'active' : ''}`}
            >
              Class Statistics
            </button>
          </div>
        </div>

        {/* DECKS LIST */}
        {classTab === 'decks' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
            <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center' }}>
              {classDueCount > 0 ? (
                <button
                  onClick={() => handleStartClassStudy(activeClass.id || 0)}
                  className="btn-premium-success"
                >
                  <Play size={16} /> Study All Due in Class ({classDueCount})
                </button>
              ) : (
                <span style={{ fontSize: '13px', color: '#30d158', fontWeight: 600 }}>
                  ✓ All caught up with this class!
                </span>
              )}
            </div>

            {/* Inline Quick Add Deck form */}
            <form onSubmit={handleCreateDeckSubmit} className="card-deck-premium" style={{ display: 'flex', gap: '16px', flexWrap: 'wrap', alignItems: 'flex-end', padding: '20px' }}>
              <div style={{ flex: 1, minWidth: '180px' }}>
                <label style={{ display: 'block', fontSize: '11px', color: '#8e8e93', marginBottom: '6px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Create New Deck</label>
                <input
                  type="text"
                  placeholder="e.g. Unit testing mockups..."
                  value={newDeckName}
                  onChange={e => setNewDeckName(e.target.value)}
                  className="input-premium"
                  required
                />
              </div>
              <div style={{ flex: 2, minWidth: '260px' }}>
                <label style={{ display: 'block', fontSize: '11px', color: '#8e8e93', marginBottom: '6px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Deck Description</label>
                <input
                  type="text"
                  placeholder="Briefly state the card categories..."
                  value={newDeckDesc}
                  onChange={e => setNewDeckDesc(e.target.value)}
                  className="input-premium"
                />
              </div>
              <button
                type="submit"
                className="btn-premium-primary"
                style={{ height: '40px', padding: '0 20px' }}
              >
                Add Deck
              </button>
            </form>

            {/* Grid of Decks in Class */}
            {activeClassDecks.length === 0 ? (
              <div className="card-deck-premium" style={{ textAlign: 'center', padding: '40px', color: '#6b7280', fontSize: '14px' }}>
                No decks found inside this class. Add a deck above to start adding flashcards!
              </div>
            ) : (
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
                gap: '20px',
              }}>
                {activeClassDecks.map(deck => (
                  <div key={deck.id} className="card-deck-premium" style={{ display: 'flex', flexDirection: 'column', minHeight: '210px', justifyContent: 'space-between' }}>
                    <div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
                        <h3 style={{ fontSize: '16px', fontWeight: 700, color: '#f3f4f6' }}>{deck.name}</h3>
                        <button
                          onClick={() => {
                            if (deck.id && window.confirm("Are you sure you want to delete this DECK? This will permanently delete all cards in it!")) {
                              store.deleteDeck(deck.id);
                            }
                          }}
                          style={{ background: 'transparent', border: 'none', color: '#ef4444', cursor: 'pointer', opacity: 0.6, padding: '4px' }}
                          title="Delete Deck"
                          onMouseEnter={e => e.currentTarget.style.opacity = '1'}
                          onMouseLeave={e => e.currentTarget.style.opacity = '0.6'}
                        >
                          <Trash2 size={15} />
                        </button>
                      </div>
                      
                      <p style={{ fontSize: '12px', color: '#9ca3af', lineHeight: 1.4, marginBottom: '8px' }}>{deck.description}</p>
                      {(() => {
                        const matchRecord = deck.id ? localStorage.getItem(`denki-match-highscore-${deck.id}`) : null;
                        if (!matchRecord) return null;
                        return (
                          <div style={{ marginBottom: '12px' }}>
                            <span className="badge-premium badge-premium-amber">
                              🏆 Match Record: {parseFloat(matchRecord).toFixed(1)}s
                            </span>
                          </div>
                        );
                      })()}
                    </div>

                    {/* Deck progress footer */}
                    <div style={{
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '12px',
                      borderTop: '1px solid rgba(255,255,255,0.06)',
                      paddingTop: '12px',
                      marginTop: 'auto'
                    }}>
                      {/* Top stats row */}
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                          {/* Small Mastery Indicator */}
                          <div style={{ position: 'relative', width: '18px', height: '18px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <svg width="18" height="18" viewBox="0 0 18 18">
                              <circle cx="9" cy="9" r="7.5" fill="none" stroke="rgba(255,255,255,0.04)" strokeWidth="1.8" />
                              <circle
                                cx="9" cy="9" r="7.5"
                                fill="none"
                                stroke="url(#deckMasterGrad)"
                                strokeWidth="1.8"
                                strokeDasharray={47.1}
                                strokeDashoffset={47.1 - (47.1 * deck.masteryPct) / 100}
                                transform="rotate(-90 9 9)"
                              />
                              <defs>
                                <linearGradient id="deckMasterGrad" x1="0" y1="0" x2="1" y2="1">
                                  <stop offset="0%" stopColor="#6366f1" />
                                  <stop offset="100%" stopColor="#10b981" />
                                </linearGradient>
                              </defs>
                            </svg>
                          </div>
                          
                          <span style={{ fontSize: '11px', color: '#d1d5db', display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                            {deck.total} cards
                            {deck.dueCount > 0 && (
                              <span className="badge-premium badge-premium-blue">
                                {deck.dueCount} due
                              </span>
                            )}
                          </span>
                        </div>

                        <span style={{ fontSize: '11px', color: '#8e8e93', fontWeight: 500 }}>
                          {Math.round(deck.masteryPct)}% mastered
                        </span>
                      </div>

                      {/* Bottom action row */}
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
                        {/* Secondary utility actions (Import, Reset) */}
                        <div style={{ display: 'flex', gap: '6px' }}>
                          <button
                            onClick={() => deck.id && setImportingDeckId(deck.id)}
                            style={{ width: '28px', height: '28px', padding: 0 }}
                            className="btn-premium-secondary"
                            title="Import Cards via CSV"
                          >
                            <Upload size={12} />
                          </button>

                          <button
                            onClick={async () => {
                              if (deck.id && window.confirm("Are you sure you want to reset all learning history and progress for this deck? This action cannot be undone.")) {
                                await store.resetDeckProgress(deck.id);
                              }
                            }}
                            style={{ width: '28px', height: '28px', padding: 0 }}
                            className="btn-premium-danger"
                            title="Reset all learning history and progress for this deck"
                          >
                            <RotateCcw size={12} />
                          </button>
                        </div>

                        {/* Primary actions (Manage Cards, Study) */}
                        <div style={{ display: 'flex', gap: '6px' }}>
                          <button
                            onClick={() => deck.id && setManagingDeckId(deck.id)}
                            style={{ height: '28px', padding: '0 10px', fontSize: '11px' }}
                            className="btn-premium-secondary"
                          >
                            <Edit2 size={11} /> Cards
                          </button>

                          <button
                            onClick={() => deck.id && deck.total > 0 && handleStartDeckStudy(deck.id)}
                            disabled={deck.total === 0}
                            style={{ height: '28px', padding: '0 12px', fontSize: '11px' }}
                            className="btn-premium-primary"
                            title={deck.total === 0 ? "Add cards before studying" : undefined}
                          >
                            Study <ChevronRight size={11} />
                          </button>
                        </div>
                      </div>
                    </div>

                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* CLASS STATISTICS DASHBOARD */}
        {classTab === 'analytics' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
            <AnalyticsDashboard />
          </div>
        )}
      </div>

      {managingDeckId !== null && activeClassId !== null && (
        <ManageCardsModal 
          classId={activeClassId} 
          deckId={managingDeckId} 
          onClose={() => setManagingDeckId(null)} 
        />
      )}
      
      {importingDeckId !== null && activeClassId !== null && (
        <ImportModal
          classId={activeClassId}
          deckId={importingDeckId}
          onClose={() => setImportingDeckId(null)}
        />
      )}
    </>
  );
};
