import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useShallow } from 'zustand/react/shallow';
import { ChevronRight, Download, Edit2, Play, RotateCcw, Shuffle, Trash2, Upload } from 'lucide-react';
import { AnalyticsDashboard } from '../components/AnalyticsDashboard';
import { EditEntityModal } from '../components/modals/EditEntityModal';
import { ImportModal } from '../components/modals/ImportModal';
import { DrillSetupModal } from '../components/modals/DrillSetupModal';
import { ManageCardsModal } from '../components/modals/ManageCardsModal';
import { celebrate } from '../services/celebrate';
import { exportDeckToCsv } from '../services/deckExport';
import type { DrillBucket } from '../services/drill';
import { useFlashcardStore } from '../store/useFlashcardStore';
import { confirmDialog, toast } from '../store/uiStore';

function parseRouteId(value: string | undefined): number | null {
  if (!value) return null;
  const parsed = Number.parseInt(value, 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function readMatchRecord(deckId: number): number | null {
  try {
    const raw = localStorage.getItem(`denki-match-highscore-${deckId}`);
    if (raw === null) return null;
    const parsed = Number.parseFloat(raw);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
  } catch {
    return null;
  }
}

export const ClassViewPage: React.FC = () => {
  const { classId: routeClassId } = useParams();
  const navigate = useNavigate();
  const store = useFlashcardStore(useShallow((state) => ({
    classes: state.classes,
    classStats: state.classStats,
    decks: state.decks,
    deckStats: state.deckStats,
    createDeck: state.createDeck,
    startClassStudySession: state.startClassStudySession,
    startStudySession: state.startStudySession,
    startDrillSession: state.startDrillSession,
    deleteClass: state.deleteClass,
    deleteDeck: state.deleteDeck,
    resetDeckProgress: state.resetDeckProgress,
    updateClass: state.updateClass,
    updateDeck: state.updateDeck,
  })));

  const activeClassId = parseRouteId(routeClassId);
  const [classTab, setClassTab] = useState<'decks' | 'analytics'>('decks');
  const [newDeckName, setNewDeckName] = useState('');
  const [newDeckDesc, setNewDeckDesc] = useState('');
  const [managingDeckId, setManagingDeckId] = useState<number | null>(null);
  const [drillingDeck, setDrillingDeck] = useState<{ id: number; name: string } | null>(null);
  const [importingDeckId, setImportingDeckId] = useState<number | null>(null);
  const [editingClass, setEditingClass] = useState(false);
  const [editingDeck, setEditingDeck] = useState<{
    id: number;
    name: string;
    description: string;
  } | null>(null);
  const [pendingAction, setPendingAction] = useState<string | null>(null);

  useEffect(() => {
    useFlashcardStore.setState({ activeClassId });
    const { loadDecks, loadStats } = useFlashcardStore.getState();
    if (activeClassId !== null) {
      void Promise.all([loadDecks(activeClassId), loadStats(activeClassId)]);
    } else {
      void loadStats(null);
    }
  }, [activeClassId]);

  const classesWithMastery = useMemo(() => store.classes.map((studyClass) => {
    const stats = store.classStats[studyClass.id ?? 0] ?? {
      total: 0,
      dueCount: 0,
      masteryPct: 0,
      decksCount: 0,
    };
    return { ...studyClass, ...stats };
  }), [store.classes, store.classStats]);

  const activeClass = useMemo(() => (
    activeClassId === null
      ? null
      : classesWithMastery.find((studyClass) => studyClass.id === activeClassId) ?? null
  ), [activeClassId, classesWithMastery]);

  const activeClassDecks = useMemo(() => {
    if (activeClassId === null) return [];
    return store.decks
      .filter((deck) => deck.classId === activeClassId)
      .map((deck) => ({
        ...deck,
        ...(store.deckStats[deck.id ?? 0] ?? {
          total: 0,
          dueCount: 0,
          masteryPct: 0,
        }),
      }));
  }, [activeClassId, store.decks, store.deckStats]);

  const classDueCount = useMemo(
    () => activeClassDecks.reduce((total, deck) => total + deck.dueCount, 0),
    [activeClassDecks],
  );

  const runAction = async (
    key: string,
    action: () => Promise<void>,
    failureMessage: string,
  ) => {
    if (pendingAction !== null) return;
    setPendingAction(key);
    try {
      await action();
    } catch (error) {
      toast(
        `${failureMessage}: ${error instanceof Error ? error.message : 'unknown error'}`,
        'error',
      );
    } finally {
      setPendingAction(null);
    }
  };

  const handleCreateDeckSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (activeClassId === null || !newDeckName.trim()) return;

    await runAction('create-deck', async () => {
      await store.createDeck(activeClassId, newDeckName, newDeckDesc);
      setNewDeckName('');
      setNewDeckDesc('');
      celebrate({
        particleCount: 25,
        spread: 35,
        origin: { y: 0.8 },
        colors: ['#7f9c86', '#a7b79f'],
      });
    }, 'Deck could not be created');
  };

  const handleStartClassStudy = async (classId: number) => {
    await runAction('study-class', async () => {
      await store.startClassStudySession(classId);
      navigate(`/study/class/${classId}`);
    }, 'Class review could not start');
  };

  const handleStartDeckStudy = async (deckId: number) => {
    await runAction(`study-deck-${deckId}`, async () => {
      await store.startStudySession(deckId);
      navigate(`/study/deck/${deckId}`);
    }, 'Deck review could not start');
  };

  const handleStartDeckDrill = async (
    deckId: number,
    buckets: readonly DrillBucket[],
  ) => {
    if (pendingAction !== null) return;
    setPendingAction(`drill-deck-${deckId}`);
    try {
      await store.startDrillSession(deckId, buckets);
      setDrillingDeck(null);
      navigate(`/study/deck/${deckId}/drill`);
    } catch (error) {
      toast(
        `Deck drill could not start: ${error instanceof Error ? error.message : 'unknown error'}`,
        'error',
      );
      throw error;
    } finally {
      setPendingAction(null);
    }
  };

  if (!activeClass || activeClassId === null || activeClass.id === undefined) {
    return (
      <div className="glass-panel" style={{ maxWidth: '560px', margin: '60px auto', textAlign: 'center' }}>
        <h2 style={{ marginBottom: '8px' }}>Class not found</h2>
        <p style={{ color: 'var(--text-muted)', marginBottom: '18px' }}>
          This class may have been deleted, or the address is invalid.
        </p>
        <button type="button" className="btn-premium-primary" onClick={() => navigate('/')}>Return to Study Desk</button>
      </div>
    );
  }

  return (
    <>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '24px', maxWidth: '1000px', margin: '0 auto', width: '100%' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '16px', borderBottom: '1px solid var(--border)', paddingBottom: '20px' }}>
          <div>
            <span style={{ fontSize: '10px', textTransform: 'uppercase', letterSpacing: '1.5px', color: 'var(--accent-color)', fontWeight: 700 }}>Class Workspace</span>
            <h1 style={{ fontSize: '28px', fontWeight: 800, color: 'var(--text-primary)', marginTop: '4px' }}>{activeClass.name}</h1>
            <p style={{ color: 'var(--text-secondary)', fontSize: '14px', marginTop: '6px', lineHeight: 1.4 }}>{activeClass.description}</p>
          </div>

          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
            <button
              type="button"
              onClick={() => setEditingClass(true)}
              style={{ padding: '6px 12px', fontSize: '12px' }}
              className="btn-premium-secondary"
              aria-label="Edit class name and description"
            >
              <Edit2 size={13} /> Edit
            </button>
            <button
              type="button"
              disabled={pendingAction !== null}
              onClick={async () => {
                const confirmed = await confirmDialog({
                  title: `Delete “${activeClass.name}”`,
                  message: 'This permanently deletes the class with every deck, card and review inside it. This cannot be undone.',
                  confirmLabel: 'Delete class',
                  danger: true,
                });
                if (!confirmed) return;
                await runAction('delete-class', async () => {
                  await store.deleteClass(activeClass.id!);
                  toast('Class deleted', 'info');
                  navigate('/');
                }, 'Class could not be deleted');
              }}
              style={{ padding: '6px 12px', fontSize: '12px' }}
              className="btn-premium-danger"
              aria-label={`Delete ${activeClass.name}`}
            >
              <Trash2 size={13} /> Delete Class
            </button>
          </div>
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-start' }}>
          <div className="segmented-control">
            <button
              type="button"
              onClick={() => setClassTab('decks')}
              className={`segmented-control-item ${classTab === 'decks' ? 'active' : ''}`}
              aria-pressed={classTab === 'decks'}
            >
              Decks ({activeClassDecks.length})
            </button>
            <button
              type="button"
              onClick={() => setClassTab('analytics')}
              className={`segmented-control-item ${classTab === 'analytics' ? 'active' : ''}`}
              aria-pressed={classTab === 'analytics'}
            >
              Class Statistics
            </button>
          </div>
        </div>

        {classTab === 'decks' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
            <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center' }}>
              {classDueCount > 0 ? (
                <button
                  type="button"
                  disabled={pendingAction !== null}
                  onClick={() => void handleStartClassStudy(activeClass.id!)}
                  className="btn-premium-primary"
                >
                  <Play size={16} /> Study All Due in Class ({classDueCount})
                </button>
              ) : (
                <span style={{ fontSize: '13px', color: '#9eb3a1', fontWeight: 600 }}>
                  ✓ All caught up with this class
                </span>
              )}
            </div>

            <form onSubmit={(event) => void handleCreateDeckSubmit(event)} className="card-deck-premium" style={{ display: 'flex', gap: '16px', flexWrap: 'wrap', alignItems: 'flex-end', padding: '20px' }}>
              <div style={{ flex: 1, minWidth: '180px' }}>
                <label htmlFor="new-deck-name" style={{ display: 'block', fontSize: '11px', color: 'var(--text-muted)', marginBottom: '6px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Create New Deck</label>
                <input
                  id="new-deck-name"
                  type="text"
                  placeholder="e.g. Unit testing mockups…"
                  value={newDeckName}
                  onChange={(event) => setNewDeckName(event.target.value)}
                  className="input-premium"
                  required
                />
              </div>
              <div style={{ flex: 2, minWidth: '260px' }}>
                <label htmlFor="new-deck-description" style={{ display: 'block', fontSize: '11px', color: 'var(--text-muted)', marginBottom: '6px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Deck Description</label>
                <input
                  id="new-deck-description"
                  type="text"
                  placeholder="Briefly state the card categories…"
                  value={newDeckDesc}
                  onChange={(event) => setNewDeckDesc(event.target.value)}
                  className="input-premium"
                />
              </div>
              <button
                type="submit"
                disabled={pendingAction !== null || !newDeckName.trim()}
                className="btn-premium-secondary"
                style={{ height: '37px', padding: '0 20px' }}
              >
                {pendingAction === 'create-deck' ? 'Adding…' : 'Add Deck'}
              </button>
            </form>

            {activeClassDecks.length === 0 ? (
              <div className="card-deck-premium" style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)', fontSize: '14px' }}>
                No decks are inside this class yet. Add one above to start organizing cards.
              </div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '20px' }}>
                {activeClassDecks.map((deck) => {
                  if (deck.id === undefined) return null;
                  const matchRecord = readMatchRecord(deck.id);
                  const gradientId = `deck-mastery-${deck.id}`;
                  return (
                    <article key={deck.id} className="card-deck-premium" style={{ display: 'flex', flexDirection: 'column', minHeight: '210px', justifyContent: 'space-between' }}>
                      <div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
                          <h3 style={{ fontSize: '16px', fontWeight: 700, color: 'var(--text-primary)' }}>{deck.name}</h3>
                          <div style={{ display: 'flex', gap: '2px' }}>
                            <button
                              type="button"
                              onClick={() => setEditingDeck({ id: deck.id!, name: deck.name, description: deck.description })}
                              style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: '4px' }}
                              title="Edit deck name and description"
                              aria-label={`Edit ${deck.name}`}
                            >
                              <Edit2 size={14} />
                            </button>
                            <button
                              type="button"
                              disabled={pendingAction !== null}
                              onClick={async () => {
                                const confirmed = await confirmDialog({
                                  title: `Delete “${deck.name}”`,
                                  message: 'This permanently deletes the deck and every card inside it, including all review history. This cannot be undone.',
                                  confirmLabel: 'Delete deck',
                                  danger: true,
                                });
                                if (!confirmed) return;
                                await runAction(`delete-deck-${deck.id}`, async () => {
                                  await store.deleteDeck(deck.id!);
                                  toast('Deck deleted', 'info');
                                }, 'Deck could not be deleted');
                              }}
                              style={{ background: 'transparent', border: 'none', color: '#cf8e82', cursor: 'pointer', padding: '4px' }}
                              title="Delete deck"
                              aria-label={`Delete ${deck.name}`}
                            >
                              <Trash2 size={15} />
                            </button>
                          </div>
                        </div>

                        <p style={{ fontSize: '12px', color: 'var(--text-secondary)', lineHeight: 1.4, marginBottom: '8px' }}>{deck.description}</p>
                        {matchRecord !== null && (
                          <div style={{ marginBottom: '12px' }}>
                            <span className="badge-premium badge-premium-amber">
                              Match record: {matchRecord.toFixed(1)}s
                            </span>
                          </div>
                        )}
                      </div>

                      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', borderTop: '1px solid var(--border)', paddingTop: '12px', marginTop: 'auto' }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                            <div style={{ position: 'relative', width: '18px', height: '18px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                              <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
                                <circle cx="9" cy="9" r="7.5" fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="1.8" />
                                <circle
                                  cx="9" cy="9" r="7.5"
                                  fill="none"
                                  stroke={`url(#${gradientId})`}
                                  strokeWidth="1.8"
                                  strokeDasharray={47.1}
                                  strokeDashoffset={47.1 - (47.1 * deck.masteryPct) / 100}
                                  transform="rotate(-90 9 9)"
                                />
                                <defs>
                                  <linearGradient id={gradientId} x1="0" y1="0" x2="1" y2="1">
                                    <stop offset="0%" stopColor="#7f9c86" />
                                    <stop offset="100%" stopColor="#a7b79f" />
                                  </linearGradient>
                                </defs>
                              </svg>
                            </div>
                            <span style={{ fontSize: '11px', color: 'var(--text-secondary)', display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                              {deck.total} cards
                              {deck.dueCount > 0 && <span className="badge-premium badge-premium-blue">{deck.dueCount} due</span>}
                            </span>
                          </div>
                          <span style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 500 }}>
                            {Math.round(deck.masteryPct)}% mastered
                          </span>
                        </div>

                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
                          <div style={{ display: 'flex', gap: '6px' }}>
                            <button
                              type="button"
                              onClick={() => setImportingDeckId(deck.id!)}
                              style={{ width: '32px', height: '32px', padding: 0 }}
                              className="btn-premium-secondary hover-lift"
                              aria-label={`Import cards into ${deck.name}`}
                              title="Import cards"
                            >
                              <Upload size={13} />
                            </button>
                            <button
                              type="button"
                              onClick={() => void runAction(`export-deck-${deck.id}`, async () => {
                                await exportDeckToCsv(deck.id!, deck.name);
                                toast('CSV export started', 'success');
                              }, 'Deck could not be exported')}
                              disabled={deck.total === 0 || pendingAction !== null}
                              style={{ width: '32px', height: '32px', padding: 0 }}
                              className="btn-premium-secondary hover-lift"
                              aria-label={`Export ${deck.name} to CSV`}
                              title="Export deck to CSV"
                            >
                              <Download size={13} />
                            </button>
                            <button
                              type="button"
                              disabled={pendingAction !== null || deck.total === 0}
                              onClick={async () => {
                                const confirmed = await confirmDialog({
                                  title: `Reset progress for “${deck.name}”`,
                                  message: 'All learning history and scheduling for this deck will be erased — every card returns to New. This cannot be undone.',
                                  confirmLabel: 'Reset progress',
                                  danger: true,
                                });
                                if (!confirmed) return;
                                await runAction(`reset-deck-${deck.id}`, async () => {
                                  await store.resetDeckProgress(deck.id!);
                                  toast('Deck progress reset', 'info');
                                }, 'Deck progress could not be reset');
                              }}
                              style={{ width: '32px', height: '32px', padding: 0 }}
                              className="btn-premium-danger hover-lift"
                              aria-label={`Reset progress for ${deck.name}`}
                              title="Reset all learning progress"
                            >
                              <RotateCcw size={13} />
                            </button>
                          </div>

                          <div style={{ display: 'flex', gap: '6px' }}>
                            <button
                              type="button"
                              onClick={() => setManagingDeckId(deck.id!)}
                              style={{ height: '32px', padding: '0 12px', fontSize: '11px' }}
                              className="btn-premium-secondary hover-lift"
                            >
                              <Edit2 size={11} /> Cards
                            </button>
                            <button
                              type="button"
                              onClick={() => setDrillingDeck({ id: deck.id!, name: deck.name })}
                              disabled={deck.total === 0 || pendingAction !== null}
                              style={{ height: '32px', padding: '0 12px', fontSize: '11px' }}
                              className="btn-premium-secondary hover-lift"
                              title={deck.total === 0 ? 'Add cards before drilling' : 'Random one-pass drill'}
                            >
                              <Shuffle size={11} /> Drill
                            </button>
                            <button
                              type="button"
                              onClick={() => void handleStartDeckStudy(deck.id!)}
                              disabled={deck.total === 0 || pendingAction !== null}
                              style={{ height: '32px', padding: '0 14px', fontSize: '11px' }}
                              className="btn-premium-primary hover-lift"
                              title={deck.total === 0 ? 'Add cards before studying' : undefined}
                            >
                              Study <ChevronRight size={11} />
                            </button>
                          </div>
                        </div>
                      </div>
                    </article>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {classTab === 'analytics' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
            <AnalyticsDashboard scope="class" />
          </div>
        )}
      </div>

      {drillingDeck !== null && (
        <DrillSetupModal
          deckId={drillingDeck.id}
          deckName={drillingDeck.name}
          onClose={() => setDrillingDeck(null)}
          onStart={(buckets) => handleStartDeckDrill(drillingDeck.id, buckets)}
        />
      )}

      {managingDeckId !== null && (
        <ManageCardsModal
          classId={activeClassId}
          deckId={managingDeckId}
          onClose={() => setManagingDeckId(null)}
        />
      )}

      {importingDeckId !== null && (
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
            await runAction('edit-class', async () => {
              await store.updateClass(activeClass.id!, name, description);
              toast('Class updated', 'success');
            }, 'Class could not be updated');
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
            await runAction(`edit-deck-${editingDeck.id}`, async () => {
              await store.updateDeck(editingDeck.id, name, description);
              toast('Deck updated', 'success');
            }, 'Deck could not be updated');
          }}
          onClose={() => setEditingDeck(null)}
        />
      )}
    </>
  );
};
