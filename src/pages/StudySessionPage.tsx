import React, { useState, useEffect, useRef, useEffectEvent } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useShallow } from 'zustand/react/shallow';
import { BookOpen, Volume2, Keyboard, Eye, ArrowLeft, X } from 'lucide-react';
import { useFlashcardStore } from '../store/useFlashcardStore';
import { Flashcard } from '../components/Flashcard';
import { MatchGame } from '../components/MatchGame';
import { LearnMode } from '../components/LearnMode';
import { StudyNotepad } from '../components/StudyNotepad';
import { StudyProgressBar } from '../components/StudyProgressBar';
import { StudyCheckpoint } from '../components/StudyCheckpoint';
import { StudySessionSummary } from '../components/StudySessionSummary';
import { celebrate } from '../services/celebrate';
import { reviewCard, formatInterval, type Rating } from '../services/scheduler';
import { loadSchedulerParams } from '../services/schedulerParams';

export const StudySessionPage: React.FC = () => {
  const { classId, deckId } = useParams();
  const navigate = useNavigate();
  const store = useFlashcardStore(useShallow((s) => ({
    session: s.session,
    decks: s.decks,
    classes: s.classes,
    currentStreak: s.currentStreak,
    startClassStudySession: s.startClassStudySession,
    startStudySession: s.startStudySession,
    rateCard: s.rateCard,
    undoLastRate: s.undoLastRate,
    endStudySession: s.endStudySession,
  })));

  const [studyMode, setStudyMode] = useState<'review' | 'match' | 'learn'>('review');
  const [isFlipped, setIsFlipped] = useState(false);
  const [showNotes, setShowNotes] = useState(false);
  const [autoSpeak, setAutoSpeak] = useState(false);
  const [showShortcuts, setShowShortcuts] = useState(true);
  const [checkpointOpen, setCheckpointOpen] = useState(false);
  const [roundAverages, setRoundAverages] = useState<number[]>([]);
  const [totalTimeSpent, setTotalTimeSpent] = useState(0);

  const cardStartTimeRef = useRef(0);
  const sessionStartTimeRef = useRef(0);
  const roundTimesRef = useRef<number[]>([]);

  useEffect(() => {
    const now = Date.now();
    sessionStartTimeRef.current = now;
    cardStartTimeRef.current = now;
    roundTimesRef.current = [];

    const actions = useFlashcardStore.getState();
    if (classId) {
      void actions.startClassStudySession(Number.parseInt(classId, 10), false);
    } else if (deckId) {
      void actions.startStudySession(Number.parseInt(deckId, 10), false);
    }
  }, [classId, deckId]);

  const activeStudyDeckId = store.session?.deckId || null;
  const deckName = activeStudyDeckId
    ? store.decks.find(d => d.id === activeStudyDeckId)?.name || 'Deck'
    : 'Workspace';

  const handleRateCard = async (rating: number) => {
    const actions = useFlashcardStore.getState();
    if (!actions.session) return;

    const timeSpentMs = Date.now() - cardStartTimeRef.current;
    roundTimesRef.current.push(timeSpentMs / 1000);

    await actions.rateCard(rating as Rating);
    setIsFlipped(false);
    cardStartTimeRef.current = Date.now();

    const session = useFlashcardStore.getState().session;
    if (!session) return;

    if (session.completedCount > 0 && session.completedCount % 10 === 0 && session.currentIndex < session.queue.length) {
      const times = roundTimesRef.current;
      const average = times.length
        ? Math.round(times.reduce((sum, value) => sum + value, 0) / times.length)
        : 0;
      roundTimesRef.current = [];
      setRoundAverages(prev => [...prev, average]);
      setCheckpointOpen(true);
      celebrate({ particleCount: 50, spread: 60, origin: { y: 0.6 } });
    } else if (session.currentIndex >= session.queue.length) {
      const elapsed = sessionStartTimeRef.current > 0
        ? (Date.now() - sessionStartTimeRef.current) / 1000
        : 0;
      setTotalTimeSpent(elapsed);
      celebrate({
        particleCount: 150,
        spread: 90,
        origin: { y: 0.6 },
        colors: ['#10b981', '#34d399', '#6ee7b7'],
      });
    }
  };

  const handleExitStudy = () => {
    useFlashcardStore.getState().endStudySession();
    navigate(-1);
  };

  const handleContinue = () => {
    setCheckpointOpen(false);
    cardStartTimeRef.current = Date.now();
  };

  const handleReviewKeyDown = useEffectEvent(async (e: KeyboardEvent) => {
    if (e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLInputElement) return;

    const session = useFlashcardStore.getState().session;
    if (!session || session.queue.length === 0) {
      if (e.key === 'Escape') handleExitStudy();
      return;
    }

    if (checkpointOpen) {
      if (e.code === 'Space' || e.code === 'Enter') {
        e.preventDefault();
        handleContinue();
      } else if (e.key === 'Escape') {
        handleExitStudy();
      }
      return;
    }

    if (e.code === 'Space' || e.code === 'Enter') {
      e.preventDefault();
      setIsFlipped(prev => !prev);
    }

    const rating = Number.parseInt(e.key, 10);
    if (isFlipped && rating >= 1 && rating <= 5) {
      e.preventDefault();
      await handleRateCard(rating);
      return;
    }

    if (e.key === 'z' || e.key === 'Z') {
      e.preventDefault();
      await useFlashcardStore.getState().undoLastRate();
      setIsFlipped(false);
      return;
    }

    if (e.key === 'Escape') handleExitStudy();
  });

  useEffect(() => {
    if (studyMode !== 'review') return;
    const listener = (event: KeyboardEvent) => { void handleReviewKeyDown(event); };
    window.addEventListener('keydown', listener);
    return () => window.removeEventListener('keydown', listener);
  }, [studyMode]);

  if (!store.session) {
    return <div style={{ display: 'flex', height: '100vh', justifyContent: 'center', alignItems: 'center', color: '#f3f4f6' }}>Loading study session...</div>;
  }

  const { queue, currentIndex, completedCount, history, isCram } = store.session;
  const currentStreak = store.currentStreak;

  // Compute intervals for FSRS transparency when card is flipped. Uses the
  // user's saved params and a fixed (no-fuzz) RNG so previews stay stable across
  // renders and match what rating the card will actually schedule.
  let predictedIntervals: string[] = ['', '', '', '', ''];
  if (isFlipped && currentIndex < queue.length) {
    const currentCard = queue[currentIndex];
    const previewParams = loadSchedulerParams();
    predictedIntervals = ([1, 2, 3, 4, 5] as Rating[]).map(rating => {
      const { updatedCard } = reviewCard(currentCard, rating, new Date(), previewParams, () => 0.5);
      return formatInterval(updatedCard.scheduledDays);
    });
  }

  return (
    <div style={{
      position: 'fixed',
      top: 0, left: 0, right: 0, bottom: 0,
      background: 'var(--bg-primary)',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      zIndex: 1000,
      padding: '0 24px',
      overflow: 'hidden',
    }}>

      <header className="study-top-nav">
        {/* Left Side: Back button and Deck name stack */}
        <div style={{ display: 'flex', alignItems: 'center' }}>
          <button 
            onClick={handleExitStudy}
            style={{
              width: '36px',
              height: '36px',
              borderRadius: '50%',
              padding: 0,
              marginRight: '14px',
            }}
            className="btn-premium-secondary"
            aria-label="Exit session"
            title="Exit Session (Esc)"
          >
            <ArrowLeft size={16} />
          </button>
          <div style={{ textAlign: 'left' }}>
            <h3 style={{ fontSize: '15px', fontWeight: 800, color: '#ffffff', lineHeight: 1.2 }}>
              {store.session.deckId 
                ? store.decks.find(d => d.id === store.session?.deckId)?.name 
                : store.classes.find(c => c.id === store.session?.classId)?.name || 'Study Session'}
            </h3>
            <span style={{ fontSize: '9px', color: '#8e8e93', textTransform: 'uppercase', fontWeight: 700, letterSpacing: '0.8px' }}>
              {isCram ? 'Cram Session' : 'Spaced Repetition'}
            </span>
          </div>
        </div>

        {/* Center: Segmented control tabs */}
        <div className="segmented-control" style={{ padding: '3px', background: 'rgba(255, 255, 255, 0.04)' }}>
          <button
            onClick={() => setStudyMode('review')}
            style={{
              background: studyMode === 'review' ? 'rgba(99, 102, 241, 0.18)' : 'transparent',
              color: studyMode === 'review' ? '#a5b4fc' : '#8e8e93',
              fontSize: '12px',
              padding: '6px 14px',
              fontWeight: 600,
            }}
            className={`segmented-control-item ${studyMode === 'review' ? 'active' : ''}`}
          >
            Review Mode
          </button>
          {store.session.deckId && (
            <button
              onClick={() => setStudyMode('match')}
              style={{
                background: studyMode === 'match' ? 'rgba(99, 102, 241, 0.18)' : 'transparent',
                color: studyMode === 'match' ? '#a5b4fc' : '#8e8e93',
                fontSize: '12px',
                padding: '6px 14px',
                fontWeight: 600,
              }}
              className={`segmented-control-item ${studyMode === 'match' ? 'active' : ''}`}
            >
              Match Game
            </button>
          )}
          <button
            onClick={() => setStudyMode('learn')}
            style={{
              background: studyMode === 'learn' ? 'rgba(16, 185, 129, 0.18)' : 'transparent',
              color: studyMode === 'learn' ? '#6ee7b7' : '#8e8e93',
              fontSize: '12px',
              padding: '6px 14px',
              fontWeight: 600,
            }}
            className={`segmented-control-item ${studyMode === 'learn' ? 'active' : ''}`}
          >
            Learn Mode
          </button>
        </div>

        {/* Right Side: Tools toolbar */}
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          {studyMode === 'review' && queue.length > 0 && (
            <>
              <button
                onClick={() => setShowNotes(!showNotes)}
                style={{
                  width: '36px',
                  height: '36px',
                  borderRadius: '50%',
                  padding: 0,
                  background: showNotes ? 'rgba(99, 102, 241, 0.12)' : 'rgba(255, 255, 255, 0.03)',
                  borderColor: showNotes ? 'rgba(99, 102, 241, 0.35)' : 'rgba(255, 255, 255, 0.08)',
                  color: showNotes ? '#a5b4fc' : '#9ca3af',
                  boxShadow: showNotes ? '0 0 12px rgba(99, 102, 241, 0.2)' : 'none',
                }}
                className="btn-premium-secondary"
                aria-label="Toggle notepad"
                aria-pressed={showNotes}
                title={`Toggle Notepad (${showNotes ? 'ON' : 'OFF'})`}
              >
                <BookOpen size={15} />
              </button>

              <button
                onClick={() => setAutoSpeak(!autoSpeak)}
                style={{
                  width: '36px',
                  height: '36px',
                  borderRadius: '50%',
                  padding: 0,
                  background: autoSpeak ? 'rgba(16, 185, 129, 0.12)' : 'rgba(255, 255, 255, 0.03)',
                  borderColor: autoSpeak ? 'rgba(16, 185, 129, 0.35)' : 'rgba(255, 255, 255, 0.08)',
                  color: autoSpeak ? '#34d399' : '#9ca3af',
                  boxShadow: autoSpeak ? '0 0 12px rgba(16, 185, 129, 0.2)' : 'none',
                }}
                className="btn-premium-secondary"
                aria-label="Auto-pronounce answers"
                aria-pressed={autoSpeak}
                title={`Auto Pronounce English (${autoSpeak ? 'ON' : 'OFF'})`}
              >
                <Volume2 size={15} />
              </button>

              <button
                onClick={() => setShowShortcuts(!showShortcuts)}
                style={{
                  width: '36px',
                  height: '36px',
                  borderRadius: '50%',
                  padding: 0,
                  background: showShortcuts ? 'rgba(59, 130, 246, 0.12)' : 'rgba(255, 255, 255, 0.03)',
                  borderColor: showShortcuts ? 'rgba(59, 130, 246, 0.35)' : 'rgba(255, 255, 255, 0.08)',
                  color: showShortcuts ? '#93c5fd' : '#9ca3af',
                  boxShadow: showShortcuts ? '0 0 12px rgba(59, 130, 246, 0.2)' : 'none',
                }}
                className="btn-premium-secondary"
                aria-label="Keyboard shortcuts"
                title="Keyboard Shortcuts Guide"
              >
                <Keyboard size={15} />
              </button>
            </>
          )}

          <button
            onClick={handleExitStudy}
            style={{
              width: '36px',
              height: '36px',
              borderRadius: '50%',
              padding: 0,
            }}
            className="btn-premium-danger"
            aria-label="Exit session"
            title="Exit Session (Esc)"
          >
            <X size={15} />
          </button>
        </div>
      </header>

      <div style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        width: '100%',
        maxWidth: showNotes && studyMode === 'review' ? '1600px' : '880px',
        margin: '0 auto',
        padding: '94px 0 24px 0',
        boxSizing: 'border-box',
        transition: 'max-width 0.3s ease',
      }}>

        {studyMode === 'match' && store.session.deckId ? (
          <MatchGame
            deckId={store.session.deckId}
            onExit={handleExitStudy}
            onExitToSession={() => setStudyMode('review')}
          />
        ) : studyMode === 'learn' ? (
          <LearnMode
            onExit={handleExitStudy}
          />
        ) : queue.length === 0 ? (
          // Cram prompt if review session is empty because no cards are due
          <div className="glass-panel" style={{
            textAlign: 'center',
            padding: '60px 40px',
            maxWidth: '640px',
            width: '100%',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: '16px',
          }}>
            <BookOpen size={48} style={{ color: '#818cf8' }} />
            {store.session.totalCards === 0 ? (
              <>
                <h2 className="gradient-text" style={{ fontSize: '22px', fontWeight: 800 }}>This Deck Is Empty</h2>
                <p style={{ color: '#9ca3af', fontSize: '14px', lineHeight: 1.5, maxWidth: '400px' }}>
                  There are no cards here yet. Head back and add some cards to start studying.
                </p>
              </>
            ) : (
              <>
                <h2 className="gradient-text" style={{ fontSize: '22px', fontWeight: 800 }}>No Cards Due Today! 🎉</h2>
                <p style={{ color: '#9ca3af', fontSize: '14px', lineHeight: 1.5, maxWidth: '400px' }}>
                  You have completed all scheduled spaced reviews for this deck. Would you like to Cram study all cards anyway?
                </p>
              </>
            )}
            <div style={{ display: 'flex', gap: '12px', marginTop: '10px' }}>
              {store.session.totalCards > 0 && (
                <button
                  onClick={() => {
                    if (classId) {
                      store.startClassStudySession(parseInt(classId, 10), true);
                    } else if (deckId) {
                      store.startStudySession(parseInt(deckId, 10), true);
                    }
                  }}
                  style={{ background: '#6366f1', color: 'white', border: 'none', borderRadius: '8px', padding: '10px 24px', fontWeight: 600, cursor: 'pointer' }}
                  className="hover-lift"
                >
                  Cram Study (All Cards)
                </button>
              )}
              <button
                onClick={handleExitStudy}
                style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', color: '#9ca3af', borderRadius: '8px', padding: '10px 24px', fontWeight: 600, cursor: 'pointer' }}
                className="hover-lift"
              >
                Back to Dashboard
              </button>
            </div>
          </div>
        ) : currentIndex >= queue.length ? (
          // Completion screen displaying detailed statistics summary
          <StudySessionSummary
            history={history}
            totalTimeSpent={totalTimeSpent}
            onExit={handleExitStudy}
          />
        ) : checkpointOpen ? (
          // Round Checkpoint overlay
          <StudyCheckpoint
            completedCount={completedCount}
            currentIndex={currentIndex}
            queueLength={queue.length}
            currentStreak={currentStreak}
            roundAverages={roundAverages}
            onContinue={handleContinue}
            onExit={handleExitStudy}
          />
        ) : (
          // Active spaced review flow
          <div style={{ width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '20px' }}>
            
            {/* Brainscape-Style Deck Mastery Stacked Progress Bar */}
            <div style={{ width: '100%', maxWidth: showNotes && studyMode === 'review' ? '1600px' : '880px', display: 'flex', flexDirection: 'column', gap: '8px', transition: 'max-width 0.3s ease' }}>
              <StudyProgressBar queue={queue} currentIndex={currentIndex} />
            </div>

            {/* Side-by-Side Flex Layout if showNotes is true */}
            <div style={{
              display: 'flex',
              width: '100%',
              maxWidth: showNotes && studyMode === 'review' ? '1600px' : '880px',
              gap: '24px',
              alignItems: 'stretch',
              justifyContent: 'center',
              transition: 'max-width 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
            }}>
              {/* Left Column: Flashcard Face */}
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', width: '100%' }}>
                <Flashcard
                  // Remount per card so advancing doesn't animate a reverse-flip
                  // that briefly shows the NEXT card's answer during un-flip.
                  key={queue[currentIndex]?.id ?? currentIndex}
                  card={queue[currentIndex]}
                  isFlipped={isFlipped}
                  onFlip={() => setIsFlipped(prev => !prev)}
                  autoSpeak={autoSpeak}
                />
              </div>

              {/* Right Column: Markdown Study Notes */}
              {showNotes && activeStudyDeckId !== null && (
                <StudyNotepad deckId={activeStudyDeckId} deckName={deckName} />
              )}
            </div>
            {/* Submit Spacing grades buttons */}
            <div style={{ width: '100%', maxWidth: '760px', minHeight: '80px', display: 'flex', justifyContent: 'center', zIndex: 10 }}>
              {!isFlipped ? (
                <div style={{ display: 'flex', gap: '16px', alignItems: 'center' }}>
                  {history.length > 0 && (
                    <button
                      onClick={async () => {
                        await store.undoLastRate();
                        setIsFlipped(false);
                      }}
                      style={{
                        background: 'rgba(255, 255, 255, 0.03)',
                        border: '1px solid rgba(255, 255, 255, 0.08)',
                        color: '#e5e7eb',
                        borderRadius: '12px',
                        padding: '14px 28px',
                        fontSize: '14px',
                        fontWeight: 700,
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                      }}
                      className="hover-lift"
                      aria-label="Undo last rating"
                      title="Undo last rating"
                    >
                      Undo <kbd className="keycap-badge">Z</kbd>
                    </button>
                  )}
                  <button
                    onClick={() => setIsFlipped(true)}
                    className="btn-premium-primary"
                    style={{ 
                      padding: '16px 48px', 
                      fontSize: '16px', 
                      borderRadius: '30px', 
                      fontWeight: 800,
                      letterSpacing: '0.5px',
                      background: 'linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%)',
                      boxShadow: '0 8px 30px rgba(99, 102, 241, 0.45)',
                    }}
                  >
                    Reveal Answer <Eye size={16} />
                  </button>
                </div>
              ) : (
                <div className="rating-dock">
                  <span style={{ fontSize: '10px', color: '#8e8e93', fontWeight: 800, letterSpacing: '0.8px', textAlign: 'center', textTransform: 'uppercase' }}>
                    How well did you know this?
                  </span>
                  
                  <div style={{ display: 'flex', gap: '10px', width: '100%' }}>
                    {/* Rating 1 - Not at all */}
                    <button
                      onClick={() => handleRateCard(1)}
                      className="rating-btn-card rating-btn-1"
                      title="Not at all (1)"
                    >
                      <span style={{ fontSize: '11px', fontWeight: 800, opacity: 0.9, marginBottom: '2px', color: '#fca5a5' }}>{predictedIntervals[0]}</span>
                      <span style={{ fontSize: '20px', fontWeight: 800 }}>1</span>
                      <span style={{ fontSize: '10px', fontWeight: 700, opacity: 0.9 }}>Not at all</span>
                      <kbd className="keycap-badge" style={{ marginTop: '4px' }}>1</kbd>
                    </button>

                    {/* Rating 2 - Slightly */}
                    <button
                      onClick={() => handleRateCard(2)}
                      className="rating-btn-card rating-btn-2"
                      title="Slightly (2)"
                    >
                      <span style={{ fontSize: '11px', fontWeight: 800, opacity: 0.9, marginBottom: '2px', color: '#fcd34d' }}>{predictedIntervals[1]}</span>
                      <span style={{ fontSize: '20px', fontWeight: 800 }}>2</span>
                      <span style={{ fontSize: '10px', fontWeight: 700, opacity: 0.9 }}>Slightly</span>
                      <kbd className="keycap-badge" style={{ marginTop: '4px' }}>2</kbd>
                    </button>

                    {/* Rating 3 - Moderately */}
                    <button
                      onClick={() => handleRateCard(3)}
                      className="rating-btn-card rating-btn-3"
                      title="Moderately (3)"
                    >
                      <span style={{ fontSize: '11px', fontWeight: 800, opacity: 0.9, marginBottom: '2px', color: '#fef08a' }}>{predictedIntervals[2]}</span>
                      <span style={{ fontSize: '20px', fontWeight: 800 }}>3</span>
                      <span style={{ fontSize: '10px', fontWeight: 700, opacity: 0.9 }}>Moderately</span>
                      <kbd className="keycap-badge" style={{ marginTop: '4px' }}>3</kbd>
                    </button>

                    {/* Rating 4 - Very well */}
                    <button
                      onClick={() => handleRateCard(4)}
                      className="rating-btn-card rating-btn-4"
                      title="Very well (4)"
                    >
                      <span style={{ fontSize: '11px', fontWeight: 800, opacity: 0.9, marginBottom: '2px', color: '#6ee7b7' }}>{predictedIntervals[3]}</span>
                      <span style={{ fontSize: '20px', fontWeight: 800 }}>4</span>
                      <span style={{ fontSize: '10px', fontWeight: 700, opacity: 0.9 }}>Very Well</span>
                      <kbd className="keycap-badge" style={{ marginTop: '4px' }}>4</kbd>
                    </button>

                    {/* Rating 5 - Perfectly */}
                    <button
                      onClick={() => handleRateCard(5)}
                      className="rating-btn-card rating-btn-5"
                      title="Perfectly (5)"
                    >
                      <span style={{ fontSize: '11px', fontWeight: 800, opacity: 0.9, marginBottom: '2px', color: '#93c5fd' }}>{predictedIntervals[4]}</span>
                      <span style={{ fontSize: '20px', fontWeight: 800 }}>5</span>
                      <span style={{ fontSize: '10px', fontWeight: 700, opacity: 0.9 }}>Perfectly</span>
                      <kbd className="keycap-badge" style={{ marginTop: '4px' }}>5</kbd>
                    </button>

                    {/* Undo Button inside the dock */}
                    {history.length > 0 && (
                      <button
                        onClick={async () => {
                          await store.undoLastRate();
                          setIsFlipped(false);
                        }}
                        style={{
                          flex: 0.8,
                          background: 'rgba(255, 255, 255, 0.02)',
                          border: '1px solid rgba(255, 255, 255, 0.05)',
                          borderRadius: '12px',
                          cursor: 'pointer',
                          display: 'flex',
                          flexDirection: 'column',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: '4px',
                          padding: '12px 6px',
                          color: '#9ca3af',
                          transition: 'all 0.2s',
                        }}
                        className="hover-lift"
                        aria-label="Undo last rating"
                      title="Undo last rating"
                      >
                        <span style={{ fontSize: '12px', fontWeight: 700 }}>Undo</span>
                        <kbd className="keycap-badge">Z</kbd>
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Shortcut markers */}
            {showShortcuts && (
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
                color: '#8e8e93',
                fontSize: '11px',
                background: 'rgba(255, 255, 255, 0.02)',
                padding: '8px 16px',
                borderRadius: '10px',
                border: '1px solid rgba(255, 255, 255, 0.04)',
                marginTop: '8px',
                animation: 'slideUpFade 0.3s ease',
              }}>
                <Keyboard size={13} style={{ color: '#818cf8' }} />
                <span>
                  Press <kbd className="keycap-badge">Space</kbd> or <kbd className="keycap-badge">Enter</kbd> to Flip &bull; Press keys <kbd className="keycap-badge">1</kbd> &ndash; <kbd className="keycap-badge">5</kbd> to rate &bull; Press <kbd className="keycap-badge">Z</kbd> to Undo last rating
                </span>
              </div>
            )}

          </div>
        )}
      </div>
    </div>
  );
};
