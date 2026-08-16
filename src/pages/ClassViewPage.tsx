import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useShallow } from 'zustand/react/shallow';
import {
  ChevronRight,
  Download,
  Edit2,
  Play,
  RotateCcw,
  Shuffle,
  Trash2,
  Upload,
} from 'lucide-react';
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

function clampPercentage(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}

export const ClassViewPage: React.FC = () => {
  const { classId: routeClassId } = useParams();
  const navigate = useNavigate();
  const store = useFlashcardStore(
    useShallow((state) => ({
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
    })),
  );

  const activeClassId = parseRouteId(routeClassId);
  const [classTab, setClassTab] = useState<'decks' | 'analytics'>('decks');
  const [newDeckName, setNewDeckName] = useState('');
  const [newDeckDesc, setNewDeckDesc] = useState('');
  const [managingDeckId, setManagingDeckId] = useState<number | null>(null);
  const [drillingDeck, setDrillingDeck] = useState<{
    id: number;
    name: string;
  } | null>(null);
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

  const classesWithMastery = useMemo(
    () =>
      store.classes.map((studyClass) => {
        const stats = store.classStats[studyClass.id ?? 0] ?? {
          total: 0,
          dueCount: 0,
          masteryPct: 0,
          decksCount: 0,
        };
        return { ...studyClass, ...stats };
      }),
    [store.classes, store.classStats],
  );

  const activeClass = useMemo(
    () =>
      activeClassId === null
        ? null
        : (classesWithMastery.find(
            (studyClass) => studyClass.id === activeClassId,
          ) ?? null),
    [activeClassId, classesWithMastery],
  );

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
    () =>
      activeClassDecks.reduce((total, deck) => total + deck.dueCount, 0),
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
        `${failureMessage}: ${
          error instanceof Error ? error.message : 'unknown error'
        }`,
        'error',
      );
    } finally {
      setPendingAction(null);
    }
  };

  const handleCreateDeckSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (activeClassId === null || !newDeckName.trim()) return;

    await runAction(
      'create-deck',
      async () => {
        await store.createDeck(activeClassId, newDeckName, newDeckDesc);
        setNewDeckName('');
        setNewDeckDesc('');
        celebrate({
          particleCount: 25,
          spread: 35,
          origin: { y: 0.8 },
          colors: ['#7f9c86', '#a7b79f'],
        });
      },
      'Deck could not be created',
    );
  };

  const handleStartClassStudy = async (classId: number) => {
    await runAction(
      'study-class',
      async () => {
        await store.startClassStudySession(classId);
        navigate(`/study/class/${classId}`);
      },
      'Class review could not start',
    );
  };

  const handleStartDeckStudy = async (deckId: number) => {
    await runAction(
      `study-deck-${deckId}`,
      async () => {
        await store.startStudySession(deckId);
        navigate(`/study/deck/${deckId}`);
      },
      'Deck review could not start',
    );
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
        `Deck drill could not start: ${
          error instanceof Error ? error.message : 'unknown error'
        }`,
        'error',
      );
      throw error;
    } finally {
      setPendingAction(null);
    }
  };

  if (!activeClass || activeClassId === null || activeClass.id === undefined) {
    return (
      <div
        className="glass-panel"
        style={{
          maxWidth: '560px',
          margin: '60px auto',
          textAlign: 'center',
        }}
      >
        <h2 style={{ marginBottom: '8px' }}>Class not found</h2>
        <p
          style={{
            color: 'var(--text-muted)',
            marginBottom: '18px',
          }}
        >
          This class may have been deleted, or the address is invalid.
        </p>
        <button
          type="button"
          className="btn-premium-primary"
          onClick={() => navigate('/')}
        >
          Return to Study Desk
        </button>
      </div>
    );
  }

  const classMastery = clampPercentage(activeClass.masteryPct);

  return (
    <>
      <section className="class-workspace">
        <header className="class-workspace-header">
          <div className="class-workspace-copy">
            <p className="zine-kicker">Class archive / active file</p>
            <h1 className="class-workspace-title">{activeClass.name}</h1>
            <p className="class-workspace-description">
              {activeClass.description || 'No class description added yet.'}
            </p>
          </div>

          <div className="class-workspace-actions">
            <button
              type="button"
              onClick={() => setEditingClass(true)}
              className="btn-premium-secondary class-workspace-action"
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
                  message:
                    'This permanently deletes the class with every deck, card and review inside it. This cannot be undone.',
                  confirmLabel: 'Delete class',
                  danger: true,
                });
                if (!confirmed) return;
                await runAction(
                  'delete-class',
                  async () => {
                    await store.deleteClass(activeClass.id!);
                    toast('Class deleted', 'info');
                    navigate('/');
                  },
                  'Class could not be deleted',
                );
              }}
              className="btn-premium-danger class-workspace-action"
              aria-label={`Delete ${activeClass.name}`}
            >
              <Trash2 size={13} /> Delete class
            </button>
          </div>
        </header>

        <div className="class-workspace-nav">
          <div className="segmented-control">
            <button
              type="button"
              onClick={() => setClassTab('decks')}
              className={`segmented-control-item ${
                classTab === 'decks' ? 'active' : ''
              }`}
              aria-pressed={classTab === 'decks'}
            >
              Decks ({activeClassDecks.length})
            </button>
            <button
              type="button"
              onClick={() => setClassTab('analytics')}
              className={`segmented-control-item ${
                classTab === 'analytics' ? 'active' : ''
              }`}
              aria-pressed={classTab === 'analytics'}
            >
              Class statistics
            </button>
          </div>

          {classTab === 'decks' &&
            (classDueCount > 0 ? (
              <button
                type="button"
                disabled={pendingAction !== null}
                onClick={() => void handleStartClassStudy(activeClass.id!)}
                className="btn-premium-primary class-study-all"
              >
                <Play size={14} />
                Study {classDueCount} due
              </button>
            ) : (
              <span className="class-caught-up">✓ Schedule clear</span>
            ))}
        </div>

        {classTab === 'decks' && (
          <div className="class-decks-view">
            <section
              className="class-summary-strip"
              aria-label="Class overview"
            >
              <div className="class-summary-item">
                <strong>{activeClassDecks.length}</strong>
                <span>Decks</span>
              </div>
              <div className="class-summary-item">
                <strong>{activeClass.total}</strong>
                <span>Total cards</span>
              </div>
              <div className="class-summary-item">
                <strong>{classDueCount}</strong>
                <span>Due now</span>
              </div>
              <div className="class-summary-item">
                <strong>{classMastery}%</strong>
                <span>Mastered</span>
              </div>
            </section>

            <header className="class-section-header">
              <div>
                <p className="zine-section-kicker">Deck archive</p>
                <h2>Study decks</h2>
                <p>
                  Open a deck to manage cards, run a one-pass drill, or continue
                  scheduled study.
                </p>
              </div>
            </header>

            {activeClassDecks.length === 0 ? (
              <div className="card-deck-premium class-empty-decks">
                No decks are inside this class yet. Add one below to start
                organising cards.
              </div>
            ) : (
              <div className="class-deck-grid">
                {activeClassDecks.map((deck, index) => {
                  if (deck.id === undefined) return null;
                  const matchRecord = readMatchRecord(deck.id);
                  const mastery = clampPercentage(deck.masteryPct);
                  const deckNumber = String(index + 1).padStart(2, '0');

                  return (
                    <article
                      key={deck.id}
                      className="card-deck-premium class-deck-card"
                    >
                      <header className="class-deck-card-header">
                        <div className="class-deck-card-copy">
                          <span className="class-deck-number">
                            Deck {deckNumber}
                          </span>
                          <h3>{deck.name}</h3>
                          <p>
                            {deck.description ||
                              'No deck description added yet.'}
                          </p>
                        </div>

                        <div className="class-deck-admin">
                          <button
                            type="button"
                            onClick={() =>
                              setEditingDeck({
                                id: deck.id!,
                                name: deck.name,
                                description: deck.description,
                              })
                            }
                            className="class-icon-button"
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
                                message:
                                  'This permanently deletes the deck and every card inside it, including all review history. This cannot be undone.',
                                confirmLabel: 'Delete deck',
                                danger: true,
                              });
                              if (!confirmed) return;
                              await runAction(
                                `delete-deck-${deck.id}`,
                                async () => {
                                  await store.deleteDeck(deck.id!);
                                  toast('Deck deleted', 'info');
                                },
                                'Deck could not be deleted',
                              );
                            }}
                            className="class-icon-button is-danger"
                            title="Delete deck"
                            aria-label={`Delete ${deck.name}`}
                          >
                            <Trash2 size={15} />
                          </button>
                        </div>
                      </header>

                      <div className="class-deck-metrics">
                        <div className="class-deck-metric">
                          <strong>{deck.total}</strong>
                          <span>Cards</span>
                        </div>
                        <div className="class-deck-metric">
                          <strong>{deck.dueCount}</strong>
                          <span>Due now</span>
                        </div>
                        <div className="class-deck-metric">
                          <strong>{mastery}%</strong>
                          <span>Mastered</span>
                        </div>
                      </div>

                      <div
                        className="class-deck-progress"
                        role="progressbar"
                        aria-label={`${deck.name} mastery`}
                        aria-valuemin={0}
                        aria-valuemax={100}
                        aria-valuenow={mastery}
                      >
                        <span style={{ width: `${mastery}%` }} />
                      </div>

                      {matchRecord !== null && (
                        <span className="badge-premium badge-premium-amber class-deck-record">
                          Match record: {matchRecord.toFixed(1)}s
                        </span>
                      )}

                      <footer className="class-deck-footer">
                        <div
                          className="class-deck-tools"
                          aria-label={`${deck.name} deck tools`}
                        >
                          <button
                            type="button"
                            onClick={() => setImportingDeckId(deck.id!)}
                            className="btn-premium-secondary class-deck-tool"
                            aria-label={`Import cards into ${deck.name}`}
                            title="Import cards"
                          >
                            <Upload size={13} />
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              void runAction(
                                `export-deck-${deck.id}`,
                                async () => {
                                  await exportDeckToCsv(deck.id!, deck.name);
                                  toast('CSV export started', 'success');
                                },
                                'Deck could not be exported',
                              )
                            }
                            disabled={
                              deck.total === 0 || pendingAction !== null
                            }
                            className="btn-premium-secondary class-deck-tool"
                            aria-label={`Export ${deck.name} to CSV`}
                            title="Export deck to CSV"
                          >
                            <Download size={13} />
                          </button>
                          <button
                            type="button"
                            disabled={
                              pendingAction !== null || deck.total === 0
                            }
                            onClick={async () => {
                              const confirmed = await confirmDialog({
                                title: `Reset progress for “${deck.name}”`,
                                message:
                                  'All learning history and scheduling for this deck will be erased — every card returns to New. This cannot be undone.',
                                confirmLabel: 'Reset progress',
                                danger: true,
                              });
                              if (!confirmed) return;
                              await runAction(
                                `reset-deck-${deck.id}`,
                                async () => {
                                  await store.resetDeckProgress(deck.id!);
                                  toast('Deck progress reset', 'info');
                                },
                                'Deck progress could not be reset',
                              );
                            }}
                            className="btn-premium-danger class-deck-tool"
                            aria-label={`Reset progress for ${deck.name}`}
                            title="Reset all learning progress"
                          >
                            <RotateCcw size={13} />
                          </button>
                        </div>

                        <div className="class-deck-actions">
                          <button
                            type="button"
                            onClick={() => setManagingDeckId(deck.id!)}
                            className="btn-premium-secondary class-deck-action"
                          >
                            <Edit2 size={11} /> Cards
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              setDrillingDeck({
                                id: deck.id!,
                                name: deck.name,
                              })
                            }
                            disabled={
                              deck.total === 0 || pendingAction !== null
                            }
                            className="btn-premium-secondary class-deck-action"
                            title={
                              deck.total === 0
                                ? 'Add cards before drilling'
                                : 'Random one-pass drill'
                            }
                          >
                            <Shuffle size={11} /> Drill
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              void handleStartDeckStudy(deck.id!)
                            }
                            disabled={
                              deck.total === 0 || pendingAction !== null
                            }
                            className="btn-premium-primary class-deck-action is-primary"
                            title={
                              deck.total === 0
                                ? 'Add cards before studying'
                                : undefined
                            }
                          >
                            Study <ChevronRight size={11} />
                          </button>
                        </div>
                      </footer>
                    </article>
                  );
                })}
              </div>
            )}

            <form
              onSubmit={(event) => void handleCreateDeckSubmit(event)}
              className="card-deck-premium class-create-deck"
            >
              <div className="class-create-deck-copy">
                <p className="zine-section-kicker">Add to archive</p>
                <h3>Create a deck</h3>
              </div>

              <label htmlFor="new-deck-name">
                <span>Deck name</span>
                <input
                  id="new-deck-name"
                  type="text"
                  placeholder="e.g. Unit testing mockups"
                  value={newDeckName}
                  onChange={(event) => setNewDeckName(event.target.value)}
                  className="input-premium"
                  required
                />
              </label>

              <label htmlFor="new-deck-description">
                <span>Description / optional</span>
                <input
                  id="new-deck-description"
                  type="text"
                  placeholder="Briefly state what belongs here"
                  value={newDeckDesc}
                  onChange={(event) => setNewDeckDesc(event.target.value)}
                  className="input-premium"
                />
              </label>

              <button
                type="submit"
                disabled={pendingAction !== null || !newDeckName.trim()}
                className="btn-premium-primary class-create-deck-submit"
              >
                {pendingAction === 'create-deck' ? 'Adding…' : 'Add deck'}
              </button>
            </form>
          </div>
        )}

        {classTab === 'analytics' && (
          <div className="class-analytics-view">
            <AnalyticsDashboard scope="class" />
          </div>
        )}
      </section>

      {drillingDeck !== null && (
        <DrillSetupModal
          deckId={drillingDeck.id}
          deckName={drillingDeck.name}
          onClose={() => setDrillingDeck(null)}
          onStart={(buckets) =>
            handleStartDeckDrill(drillingDeck.id, buckets)
          }
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
            await runAction(
              'edit-class',
              async () => {
                await store.updateClass(activeClass.id!, name, description);
                toast('Class updated', 'success');
              },
              'Class could not be updated',
            );
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
            await runAction(
              `edit-deck-${editingDeck.id}`,
              async () => {
                await store.updateDeck(editingDeck.id, name, description);
                toast('Deck updated', 'success');
              },
              'Deck could not be updated',
            );
          }}
          onClose={() => setEditingDeck(null)}
        />
      )}
    </>
  );
};
