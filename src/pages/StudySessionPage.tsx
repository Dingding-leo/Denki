import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { BookOpen, Volume2, Keyboard, Eye } from 'lucide-react';
import { useFlashcardStore } from '../store/useFlashcardStore';
import { Flashcard } from '../components/Flashcard';
import { MatchGame } from '../components/MatchGame';
import { LearnMode } from '../components/LearnMode';
import { StudyNotepad } from '../components/StudyNotepad';
import { StudyProgressBar } from '../components/StudyProgressBar';
import { StudyCheckpoint } from '../components/StudyCheckpoint';
import { StudySessionSummary } from '../components/StudySessionSummary';
import confetti from 'canvas-confetti';

export const StudySessionPage: React.FC = () => {
  const { classId, deckId } = useParams();
  const navigate = useNavigate();
  const store = useFlashcardStore();
  
  const [studyMode, setStudyMode] = useState<'review' | 'match' | 'learn'>('review');
  const [isFlipped, setIsFlipped] = useState(false);
  const [showNotes, setShowNotes] = useState(false);
  const [autoSpeak, setAutoSpeak] = useState(false);
  
  const [checkpointOpen, setCheckpointOpen] = useState(false);
  const [roundAverages, setRoundAverages] = useState<number[]>([]);
  
  const cardStartTimeRef = useRef<number>(Date.now());
  const sessionStartTimeRef = useRef<number>(Date.now());

  useEffect(() => {
    sessionStartTimeRef.current = Date.now();
    if (classId) {
      store.startClassStudySession(parseInt(classId, 10), false);
    } else if (deckId) {
      store.startStudySession(parseInt(deckId, 10), false);
    }
  }, [classId, deckId]);

  const activeStudyDeckId = store.session?.deckId || null;
  const deckName = activeStudyDeckId 
    ? store.decks.find(d => d.id === activeStudyDeckId)?.name || 'Deck'
    : 'Workspace';

  // Refs for stable keydown handler in review mode
  const handleRateCardRef = useRef<(rating: number) => void>(() => {});
  const handleExitStudyRef = useRef<() => void>(() => {});
  const isFlippedRef = useRef(isFlipped);
  isFlippedRef.current = isFlipped;
  const checkpointOpenRef = useRef(checkpointOpen);
  checkpointOpenRef.current = checkpointOpen;

  useEffect(() => {
    // Only attach keyboard handler in review mode.
    if (studyMode !== 'review') return;

    const handleKeyDown = async (e: KeyboardEvent) => {
      // Don't intercept if user is typing in a textarea or input
      if (e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLInputElement) {
        return;
      }
      
      if (!store.session || store.session.queue.length === 0 || checkpointOpenRef.current) {
        if (e.key === 'Escape') {
          handleExitStudyRef.current();
        }
        return;
      }

      if (e.code === 'Space' || e.code === 'Enter') {
        e.preventDefault();
        setIsFlipped(true);
      }
      
      if (isFlippedRef.current) {
        if (e.key === '1') handleRateCardRef.current(1);
        if (e.key === '2') handleRateCardRef.current(2);
        if (e.key === '3') handleRateCardRef.current(3);
        if (e.key === '4') handleRateCardRef.current(4);
        if (e.key === '5') handleRateCardRef.current(5);
      }

      // Undo shortcut (Z key)
      if (e.key === 'z' || e.key === 'Z') {
        e.preventDefault();
        await store.undoLastRate();
        setIsFlipped(false);
      }

      if (e.key === 'Escape') {
        handleExitStudyRef.current();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [store.session, studyMode]);
  
  const handleRateCard = async (rating: number) => {
    if (!store.session) return;
    const timeSpentMs = Date.now() - cardStartTimeRef.current;
    
    await store.rateCard(rating as any);
    setIsFlipped(false);
    
    cardStartTimeRef.current = Date.now();

    if (store.session.completedCount > 0 && store.session.completedCount % 10 === 0 && store.session.completedCount !== store.session.queue.length) {
      const avg = Math.round(timeSpentMs / 1000); 
      setRoundAverages(prev => [...prev, avg]);
      setCheckpointOpen(true);
      
      confetti({
        particleCount: 50,
        spread: 60,
        origin: { y: 0.6 }
      });
    } else if (store.session.currentIndex >= store.session.queue.length) {
      confetti({
        particleCount: 150,
        spread: 90,
        origin: { y: 0.6 },
        colors: ['#10b981', '#34d399', '#6ee7b7']
      });
    }
  };

  const handleExitStudy = () => {
    store.endStudySession();
    navigate(-1);
  };

  // Keep refs current so the stable useEffect handler uses the latest implementations
  handleRateCardRef.current = handleRateCard;
  handleExitStudyRef.current = handleExitStudy;

  if (!store.session) {
    return <div style={{ display: 'flex', height: '100vh', justifyContent: 'center', alignItems: 'center', color: '#f3f4f6' }}>Loading study session...</div>;
  }

  const { queue, currentIndex, completedCount, history, isCram } = store.session;
  const currentStreak = store.currentStreak;
  const totalTimeSpent = (Date.now() - sessionStartTimeRef.current) / 1000;

  return (
    <div style={{
      position: 'fixed',
      top: 0, left: 0, right: 0, bottom: 0,
      background: '#07090e',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'flex-start',
      zIndex: 1000,
      padding: '0 24px',
      overflowY: 'auto',
    }}>
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        width: '100%',
        maxWidth: showNotes && studyMode === 'review' ? '1600px' : '960px',
        margin: '0 auto',
        padding: '24px 0',
        boxSizing: 'border-box',
        transition: 'max-width 0.3s ease',
      }}>
      
        {/* Header Study indicators */}
        <div style={{ width: '100%', maxWidth: showNotes && studyMode === 'review' ? '1600px' : '960px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', transition: 'max-width 0.3s ease' }}>
          <div>
            <span style={{ fontSize: '10px', color: '#6b7280', textTransform: 'uppercase', fontWeight: 700, letterSpacing: '1px' }}>
              {isCram ? 'Cram Session (All Cards)' : 'Spaced Repetition Review'}
            </span>
            <h3 style={{ fontSize: '18px', fontWeight: 800, color: '#f3f4f6', marginTop: '2px' }}>
              {store.session.deckId 
                ? store.decks.find(d => d.id === store.session?.deckId)?.name 
                : store.classes.find(c => c.id === store.session?.classId)?.name || 'Study Session'}
            </h3>
          </div>

          {/* Study Mode Selector Tab Panels */}
          <div className="segmented-control" style={{ padding: '3px' }}>
            <button
              onClick={() => setStudyMode('review')}
              style={{
                background: studyMode === 'review' ? 'rgba(99, 102, 241, 0.18)' : 'transparent',
                color: studyMode === 'review' ? '#a5b4fc' : '#8e8e93',
                fontSize: '12px',
              }}
              className={`segmented-control-item ${studyMode === 'review' ? 'active' : ''}`}
            >
              FSRS Spaced Review
            </button>
            {store.session.deckId && (
              <button
                onClick={() => setStudyMode('match')}
                style={{
                  background: studyMode === 'match' ? 'rgba(99, 102, 241, 0.18)' : 'transparent',
                  color: studyMode === 'match' ? '#a5b4fc' : '#8e8e93',
                  fontSize: '12px',
                }}
                className={`segmented-control-item ${studyMode === 'match' ? 'active' : ''}`}
              >
                Match Game (Timed)
              </button>
            )}
            <button
              onClick={() => setStudyMode('learn')}
              style={{
                background: studyMode === 'learn' ? 'rgba(16, 185, 129, 0.18)' : 'transparent',
                color: studyMode === 'learn' ? '#6ee7b7' : '#8e8e93',
                fontSize: '12px',
              }}
              className={`segmented-control-item ${studyMode === 'learn' ? 'active' : ''}`}
            >
              Learn Mode (Active)
            </button>
          </div>

          <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
            {studyMode === 'review' && queue.length > 0 && (
              <>
                <button
                  onClick={() => setShowNotes(!showNotes)}
                  style={{
                    height: '32px',
                    padding: '0 12px',
                    fontSize: '12px',
                    background: showNotes ? 'rgba(99, 102, 241, 0.12)' : 'rgba(255, 255, 255, 0.03)',
                    borderColor: showNotes ? 'rgba(99, 102, 241, 0.4)' : 'rgba(255, 255, 255, 0.08)',
                    color: showNotes ? '#a5b4fc' : '#9ca3af',
                    boxShadow: showNotes ? '0 0 10px rgba(99, 102, 241, 0.15)' : 'none',
                  }}
                  className="btn-premium-secondary"
                  title="Toggle Markdown Notepad"
                >
                  <BookOpen size={13} />
                  <span>Notepad: {showNotes ? 'ON' : 'OFF'}</span>
                </button>

                <button
                  onClick={() => setAutoSpeak(!autoSpeak)}
                  style={{
                    height: '32px',
                    padding: '0 12px',
                    fontSize: '12px',
                    background: autoSpeak ? 'rgba(16, 185, 129, 0.12)' : 'rgba(255, 255, 255, 0.03)',
                    borderColor: autoSpeak ? 'rgba(16, 185, 129, 0.4)' : 'rgba(255, 255, 255, 0.08)',
                    color: autoSpeak ? '#34d399' : '#9ca3af',
                    boxShadow: autoSpeak ? '0 0 10px rgba(16, 185, 129, 0.15)' : 'none',
                  }}
                  className="btn-premium-secondary"
                  title="Automatically speak cards aloud"
                >
                  <Volume2 size={13} />
                  <span>Auto Aloud: {autoSpeak ? 'ON' : 'OFF'}</span>
                </button>
              </>
            )}

            <button
              onClick={handleExitStudy}
              style={{
                height: '32px',
                padding: '0 14px',
                fontSize: '12px',
              }}
              className="btn-premium-danger"
            >
              Exit Session (Esc)
            </button>
          </div>
        </div>

        {studyMode === 'match' && store.session.deckId ? (
          <MatchGame
            deckId={store.session.deckId}
            onExit={handleExitStudy}
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
            <h2 className="gradient-text" style={{ fontSize: '22px', fontWeight: 800 }}>No Cards Due Today! 🎉</h2>
            <p style={{ color: '#9ca3af', fontSize: '14px', lineHeight: 1.5, maxWidth: '400px' }}>
              You have completed all scheduled spaced reviews for this deck. Would you like to Cram study all cards anyway?
            </p>
            <div style={{ display: 'flex', gap: '12px', marginTop: '10px' }}>
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
            onContinue={() => {
              setCheckpointOpen(false);
              cardStartTimeRef.current = Date.now();
            }}
            onExit={handleExitStudy}
          />
        ) : (
          // Active spaced review flow
          <div style={{ width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '20px' }}>
            
            {/* Brainscape-Style Deck Mastery Stacked Progress Bar */}
            <div style={{ width: '100%', maxWidth: showNotes ? '1600px' : '960px', display: 'flex', flexDirection: 'column', gap: '8px', transition: 'max-width 0.3s ease' }}>
              <StudyProgressBar queue={queue} currentIndex={currentIndex} />
            </div>

            {/* Side-by-Side Flex Layout if showNotes is true */}
            <div style={{
              display: 'flex',
              width: '100%',
              maxWidth: showNotes ? '1600px' : '960px',
              gap: '24px',
              alignItems: 'stretch',
              justifyContent: 'center',
              transition: 'max-width 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
            }}>
              {/* Left Column: Flashcard Face */}
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', width: '100%' }}>
                <Flashcard
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
            <div style={{ width: '100%', maxWidth: '720px', minHeight: '70px', display: 'flex', justifyContent: 'center' }}>
              {!isFlipped ? (
                <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                  {history.length > 0 && (
                    <button
                      onClick={async () => {
                        await store.undoLastRate();
                        setIsFlipped(false);
                      }}
                      style={{
                        background: 'rgba(255, 255, 255, 0.02)',
                        border: '1px solid rgba(255, 255, 255, 0.08)',
                        color: '#9ca3af',
                        borderRadius: '10px',
                        padding: '12px 24px',
                        fontSize: '15px',
                        fontWeight: 600,
                        cursor: 'pointer',
                      }}
                      className="hover-lift"
                      title="Undo last rating"
                    >
                      Undo (Z)
                    </button>
                  )}
                  <button
                    onClick={() => setIsFlipped(true)}
                    style={{
                      background: 'rgba(255, 255, 255, 0.04)',
                      border: '1px solid rgba(255, 255, 255, 0.08)',
                      color: '#f3f4f6',
                      borderRadius: '10px',
                      padding: '12px 30px',
                      fontSize: '15px',
                      fontWeight: 600,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                    }}
                    className="hover-lift"
                  >
                    Reveal Answer <Eye size={16} />
                  </button>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', width: '100%', alignItems: 'center' }}>
                  <span style={{ fontSize: '10px', color: '#9ca3af', fontWeight: 700, letterSpacing: '0.8px' }}>HOW WELL DID YOU KNOW THIS?</span>
                  <div style={{ display: 'flex', gap: '10px', width: '100%' }}>
                    
                    {/* Rating 1 - Not at all */}
                    <button
                      onClick={() => handleRateCard(1)}
                      className="btn-score-1 hover-lift"
                      style={{ flex: 1, border: '1px solid', borderRadius: '10px', padding: '12px 6px', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', transition: 'all 0.2s ease' }}
                      title="Not at all (1)"
                    >
                      <span style={{ fontSize: '18px', fontWeight: 800 }}>1</span>
                      <span style={{ fontSize: '10px', opacity: 0.8, marginTop: '2px', whiteSpace: 'nowrap' }}>Not at all</span>
                    </button>

                    {/* Rating 2 - Slightly */}
                    <button
                      onClick={() => handleRateCard(2)}
                      className="btn-score-2 hover-lift"
                      style={{ flex: 1, border: '1px solid', borderRadius: '10px', padding: '12px 6px', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', transition: 'all 0.2s ease' }}
                      title="Slightly (2)"
                    >
                      <span style={{ fontSize: '18px', fontWeight: 800 }}>2</span>
                      <span style={{ fontSize: '10px', opacity: 0.8, marginTop: '2px', whiteSpace: 'nowrap' }}>Slightly</span>
                    </button>

                    {/* Rating 3 - Moderately */}
                    <button
                      onClick={() => handleRateCard(3)}
                      className="btn-score-3 hover-lift"
                      style={{ flex: 1, border: '1px solid', borderRadius: '10px', padding: '12px 6px', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', transition: 'all 0.2s ease' }}
                      title="Moderately (3)"
                    >
                      <span style={{ fontSize: '18px', fontWeight: 800 }}>3</span>
                      <span style={{ fontSize: '10px', opacity: 0.8, marginTop: '2px', whiteSpace: 'nowrap' }}>Moderately</span>
                    </button>

                    {/* Rating 4 - Very well */}
                    <button
                      onClick={() => handleRateCard(4)}
                      className="btn-score-4 hover-lift"
                      style={{ flex: 1, border: '1px solid', borderRadius: '10px', padding: '12px 6px', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', transition: 'all 0.2s ease' }}
                      title="Very well (4)"
                    >
                      <span style={{ fontSize: '18px', fontWeight: 800 }}>4</span>
                      <span style={{ fontSize: '10px', opacity: 0.8, marginTop: '2px', whiteSpace: 'nowrap' }}>Very well</span>
                    </button>

                    {/* Rating 5 - Perfectly */}
                    <button
                      onClick={() => handleRateCard(5)}
                      className="btn-score-5 hover-lift"
                      style={{ flex: 1, border: '1px solid', borderRadius: '10px', padding: '12px 6px', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', transition: 'all 0.2s ease' }}
                      title="Perfectly (5)"
                    >
                      <span style={{ fontSize: '18px', fontWeight: 800 }}>5</span>
                      <span style={{ fontSize: '10px', opacity: 0.8, marginTop: '2px', whiteSpace: 'nowrap' }}>Perfectly</span>
                    </button>

                    {/* Undo Action Button */}
                    {history.length > 0 && (
                      <button
                        onClick={async () => {
                          await store.undoLastRate();
                          setIsFlipped(false);
                        }}
                        style={{
                          background: 'rgba(255, 255, 255, 0.02)',
                          border: '1px solid rgba(255, 255, 255, 0.08)',
                          color: '#9ca3af',
                          borderRadius: '10px',
                          padding: '12px 20px',
                          cursor: 'pointer',
                        }}
                        className="hover-lift"
                        title="Undo last rating"
                      >
                        Undo (Z)
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Shortcut markers */}
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              color: '#6b7280',
              fontSize: '11px',
              background: 'rgba(255,255,255,0.02)',
              padding: '6px 12px',
              borderRadius: '6px',
              border: '1px solid rgba(255,255,255,0.04)',
            }}>
              <Keyboard size={12} />
              <span>Press <strong>Space</strong> to Flip. Press keys <strong>1 - 5</strong> to submit confidence. Press <strong>Z</strong> to Undo last rating.</span>
            </div>

          </div>
        )}
      </div>
    </div>
  );
};
