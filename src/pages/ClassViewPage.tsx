import React, { useState, useMemo, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Trash2, Play, Upload, Download, Edit2, RotateCcw, ChevronRight } from 'lucide-react';
import { useFlashcardStore } from '../store/useFlashcardStore';
import { AnalyticsDashboard } from '../components/AnalyticsDashboard';
import { ManageCardsModal } from '../components/modals/ManageCardsModal';
import { EditEntityModal } from '../components/modals/EditEntityModal';
import { exportDeckToCsv } from '../services/deckExport';
import { ImportModal } from '../components/modals/ImportModal';
import { celebrate } from '../services/celebrate';
import { confirmDialog, toast } from '../store/uiStore';

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
  const [editingClass, setEditingClass] = useState(false);
  const [editingDeck, setEditingDeck] = useState<{ id: number; name: string; description: string } | null>(null);

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
    
    celebrate({
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
          
          <div style={{ display: 'flex', gap: '8px' }}>
            <button
              onClick={() => setEditingClass(true)}
              style={{ padding: '6px 12px', fontSize: '12px' }}
              className="btn-premium-secondary"
              aria-label="Edit class name and description"
            >
              <Edit2 size={13} /> Edit
            </button>
            <button
              onClick={async () => {
                const ok = await confirmDialog({
                  title: `Delete “${activeClass.name}”`,
                  message: 'This permanently deletes the class with every deck, card and review inside it. This cannot be undone.',
                  confirmLabel: 'Delete class',
                  danger: true,
                });
                if (ok) {
                  await store.deleteClass(activeClass.id || 0);
                  toast('Class deleted', 'info');
                  navigate('/');
                }
              }}
              style={{ padding: '6px 12px', fontSize: '12px' }}
              className="btn-premium-danger"
            >
              <Trash2 size={13} /> Delete Class
            </button>
          </div>
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
                  className="btn-premium-primary"
                >
                  <Play size={16} /> Study All Due in Class ({classDueCount})
                </button>
              ) : (
                <span style={{ fontSize: '13px', color: '#10b981', fontWeight: 600 }}>
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
                className="btn-premium-secondary"
                style={{ height: '37px', padding: '0 20px' }}
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
                        <div style={{ display: 'flex', gap: '2px' }}>
                        <button
                          onClick={() => deck.id && setEditingDeck({ id: deck.id, name: deck.name, description: deck.description })}
                          style={{ background: 'transparent', border: 'none', color: '#8e8e93', cursor: 'pointer', opacity: 0.6, padding: '4px' }}
                          title="Edit deck name and description"
                          aria-label="Edit deck name and description"
                          onMouseEnter={e => e.currentTarget.style.opacity = '1'}
                          onMouseLeave={e => e.currentTarget.style.opacity = '0.6'}
                        >
                          <Edit2 size={14} />
                        </button>
                        <button
                          onClick={async () => {
                            if (!deck.id) return;
                            const ok = await confirmDialog({
                              title: `Delete “${deck.name}”`,
                              message: 'This permanently deletes the deck and every card inside it, including all review history. This cannot be undone.',
                              confirmLabel: 'Delete deck',
                              danger: true,
                            });
                            if (ok) {
                              await store.deleteDeck(deck.id);
                              toast('Deck deleted', 'info');
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
                            style={{ width: '32px', height: '32px', padding: 0 }}
                            className="btn-premium-secondary hover-lift"
                            aria-label="Import cards via CSV"
                            title="Import Cards via CSV"
                          >
                            <Upload size={13} />
                          </button>

                          <button
                            onClick={() => deck.id && exportDeckToCsv(deck.id, deck.name)}
                            disabled={deck.total === 0}
                            style={{ width: '32px', height: '32px', padding: 0 }}
                            className="btn-premium-secondary hover-lift"
                            aria-label="Export deck to CSV"
                            title="Export deck to CSV"
                          >
                            <Download size={13} />
                          </button>

                          <button
                            onClick={async () => {
                              if (!deck.id) return;
                              const ok = await confirmDialog({
                                title: `Reset progress for “${deck.name}”`,
                                message: 'All learning history and scheduling for this deck will be erased — every card returns to New. This cannot be undone.',
                                confirmLabel: 'Reset progress',
                                danger: true,
                              });
                              if (ok) {
                                await store.resetDeckProgress(deck.id);
                                toast('Deck progress reset', 'info');
                              }
                            }}
                            style={{ width: '32px', height: '32px', padding: 0 }}
                            className="btn-premium-danger hover-lift"
                            title="Reset all learning history and progress for this deck"
                          >
                            <RotateCcw size={13} />
                          </button>
                        </div>

                        {/* Primary actions (Manage Cards, Study) */}
                        <div style={{ display: 'flex', gap: '6px' }}>
                          <button
                            onClick={() => deck.id && setManagingDeckId(deck.id)}
                            style={{ height: '32px', padding: '0 12px', fontSize: '11px' }}
                            className="btn-premium-secondary hover-lift"
                          >
                            <Edit2 size={11} /> Cards
                          </button>

                          <button
                            onClick={() => deck.id && deck.total > 0 && handleStartDeckStudy(deck.id)}
                            disabled={deck.total === 0}
                            style={{ height: '32px', padding: '0 14px', fontSize: '11px' }}
                            className="btn-premium-primary hover-lift"
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
            <AnalyticsDashboard scope="class" />
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

      {editingClass && (
        <EditEntityModal
          title="Edit Class"
          namePlaceholder="e.g. Dental Anatomy"
          initialName={activeClass.name}
          initialDescription={activeClass.description}
          onSave={async (name, description) => {
            await store.updateClass(activeClass.id || 0, name, description);
            toast('Class updated');
          }}
          onClose={() => setEditingClass(false)}
        />
      )}

      {editingDeck !== null && (
        <EditEntityModal
          title="Edit Deck"
          namePlaceholder="e.g. Tooth Morphology"
          initialName={editingDeck.name}
          initialDescription={editingDeck.description}
          onSave={async (name, description) => {
            await store.updateDeck(editingDeck.id, name, description);
            toast('Deck updated');
          }}
          onClose={() => setEditingDeck(null)}
        />
      )}
    </>
  );
};
