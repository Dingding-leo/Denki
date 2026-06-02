import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { BookOpen, Volume2, Sparkles, Keyboard, Eye, ChevronLeft, ChevronRight } from 'lucide-react';
import { useFlashcardStore } from '../store/useFlashcardStore';
import { Flashcard } from '../components/Flashcard';
import { MatchGame } from '../components/MatchGame';
import { LearnMode } from '../components/LearnMode';
import { marked } from 'marked';
import DOMPurify from 'dompurify';
import confetti from 'canvas-confetti';

export const StudySessionPage: React.FC = () => {
  const { classId, deckId } = useParams();
  const navigate = useNavigate();
  const store = useFlashcardStore();
  
  const [studyMode, setStudyMode] = useState<'review' | 'match' | 'learn'>('review');
  const [isFlipped, setIsFlipped] = useState(false);
  const [showNotes, setShowNotes] = useState(false);
  const [autoSpeak, setAutoSpeak] = useState(false);
  
  const [deckNotes, setDeckNotes] = useState('');
  const [notesMode, setNotesMode] = useState<'edit' | 'preview'>('preview');
  
  const [checkpointOpen, setCheckpointOpen] = useState(false);
  const [roundAverages, setRoundAverages] = useState<number[]>([]);
  
  const cardStartTimeRef = useRef<number>(Date.now());

  useEffect(() => {
    if (classId) {
      store.startClassStudySession(parseInt(classId, 10));
    } else if (deckId) {
      store.startStudySession(parseInt(deckId, 10));
    }
    return () => {
      // Don't auto end session here, because unmounting could happen on navigate away, we handle it in handleExitStudy or before navigate.
    };
  }, [classId, deckId]);

  const activeStudyDeckId = store.session?.deckId || null;

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't intercept if user is typing in a textarea or input
      if (e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLInputElement) {
        return;
      }
      
      if (!store.session || store.session.queue.length === 0 || checkpointOpen) return;

      if (e.code === 'Space' || e.code === 'Enter') {
        e.preventDefault();
        setIsFlipped(true);
      }
      
      if (isFlipped) {
        if (e.key === '1') handleRateCard(1);
        if (e.key === '2') handleRateCard(2);
        if (e.key === '3') handleRateCard(3);
        if (e.key === '4') handleRateCard(4);
        if (e.key === '5') handleRateCard(5);
      }

      if (e.key === 'ArrowRight') {
        store.nextCard();
        setIsFlipped(false);
      }
      if (e.key === 'ArrowLeft') {
        store.previousCard();
        setIsFlipped(false);
      }
      if (e.key === 'Escape') {
        handleExitStudy();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [store.session, isFlipped, checkpointOpen]);
  
  const handleRateCard = async (rating: number) => {
    if (!store.session) return;
    const timeSpentMs = Date.now() - cardStartTimeRef.current;
    
    await store.rateCard(rating as any);
    setIsFlipped(false);
    
    cardStartTimeRef.current = Date.now();

    if (store.session.completedCount > 0 && store.session.completedCount % 10 === 0 && store.session.completedCount !== store.session.queue.length) {
      const avg = Math.round(timeSpentMs / 1000); // Simplified average for now
      setRoundAverages(prev => [...prev, avg]);
      setCheckpointOpen(true);
      
      confetti({
        particleCount: 50,
        spread: 60,
        origin: { y: 0.6 }
      });
    } else if (store.session.currentIndex >= store.session.queue.length - 1) {
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
  
  const handleNotesChange = (text: string) => {
    setDeckNotes(text);
    if (activeStudyDeckId) {
      localStorage.setItem(`denki-notes-${activeStudyDeckId}`, text);
    }
  };

  useEffect(() => {
    if (activeStudyDeckId) {
      const saved = localStorage.getItem(`denki-notes-${activeStudyDeckId}`);
      if (saved) setDeckNotes(saved);
      else setDeckNotes('');
    }
  }, [activeStudyDeckId]);

  const renderContent = (content: string, isCloze: boolean = false, isMarkdown: boolean = false) => {
    if (!content) return '';
    let processed = content;
    
    if (isCloze) {
      processed = processed.replace(/\{\{c\d+::(.*?)\}\}/g, '<span class="cloze-highlight">$1</span>');
    }
    
    if (isMarkdown) {
      const html = marked.parse(processed);
      return DOMPurify.sanitize(html as string);
    }
    
    return DOMPurify.sanitize(processed);
  };

  const currentStreak = store.currentStreak;

  const progressSegments = useMemo(() => {
    if (!store.session || store.session.queue.length === 0) return null;
    
    let score1 = 0, score2 = 0, score3 = 0, score4 = 0, score5 = 0, unseen = 0;
    
    store.session.queue.forEach(card => {
      const r = card.lastRating;
      if (r === 1) score1++;
      else if (r === 2) score2++;
      else if (r === 3) score3++;
      else if (r === 4) score4++;
      else if (r === 5) score5++;
      else unseen++;
    });
    
    const total = store.session.queue.length;
    return {
      unseen, score1, score2, score3, score4, score5,
      pctUnseen: (unseen/total)*100,
      pct1: (score1/total)*100,
      pct2: (score2/total)*100,
      pct3: (score3/total)*100,
      pct4: (score4/total)*100,
      pct5: (score5/total)*100,
    };
  }, [store.session?.queue]);

  if (!store.session) {
    return <div style={{ display: 'flex', height: '100vh', justifyContent: 'center', alignItems: 'center', color: '#f3f4f6' }}>Loading study session...</div>;
  }

  return (
          <div style={{
            position: 'fixed',
            top: 0, left: 0, right: 0, bottom: 0,
            background: '#07090e',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
            padding: '24px',
          }}>
            
            {/* Header Study indicators */}
            <div style={{ width: '100%', maxWidth: showNotes && studyMode === 'review' ? '1600px' : '960px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', transition: 'max-width 0.3s ease' }}>
              <div>
                <span style={{ fontSize: '10px', color: '#6b7280', textTransform: 'uppercase', fontWeight: 700, letterSpacing: '1px' }}>Immersion Study</span>
                <h3 style={{ fontSize: '18px', fontWeight: 800, color: '#f3f4f6', marginTop: '2px' }}>
                  {store.session.deckId 
                    ? store.decks.find(d => d.id === store.session?.deckId)?.name 
                    : store.classes.find(c => c.id === store.session?.classId)?.name || 'Study Session'}
                </h3>
              </div>

              {/* Study Mode Selector Tab Panels */}
              <div style={{
                display: 'flex',
                background: 'rgba(255,255,255,0.03)',
                border: '1px solid rgba(255,255,255,0.08)',
                borderRadius: '8px',
                padding: '3px',
                gap: '4px',
              }}>
                <button
                  onClick={() => setStudyMode('review')}
                  style={{
                    background: studyMode === 'review' ? 'rgba(99, 102, 241, 0.15)' : 'transparent',
                    border: 'none',
                    color: studyMode === 'review' ? '#a5b4fc' : '#9ca3af',
                    borderRadius: '6px',
                    padding: '6px 16px',
                    fontSize: '12px',
                    fontWeight: 600,
                    cursor: 'pointer',
                    transition: 'all 0.2s',
                  }}
                >
                  FSRS Spaced Review
                </button>
                {store.session.deckId && (
                  <button
                    onClick={() => setStudyMode('match')}
                    style={{
                      background: studyMode === 'match' ? 'rgba(129, 140, 248, 0.15)' : 'transparent',
                      border: 'none',
                      color: studyMode === 'match' ? '#a5b4fc' : '#9ca3af',
                      borderRadius: '6px',
                      padding: '6px 16px',
                      fontSize: '12px',
                      fontWeight: 600,
                      cursor: 'pointer',
                      transition: 'all 0.2s',
                    }}
                  >
                    Match Game (Timed)
                  </button>
                )}
                <button
                  onClick={() => setStudyMode('learn')}
                  style={{
                    background: studyMode === 'learn' ? 'rgba(16, 185, 129, 0.15)' : 'transparent',
                    border: 'none',
                    color: studyMode === 'learn' ? '#6ee7b7' : '#9ca3af',
                    borderRadius: '6px',
                    padding: '6px 16px',
                    fontSize: '12px',
                    fontWeight: 600,
                    cursor: 'pointer',
                    transition: 'all 0.2s',
                  }}
                >
                  Learn Mode (Active)
                </button>
              </div>

              <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                {studyMode === 'review' && (
                  <>
                    <button
                      onClick={() => setShowNotes(!showNotes)}
                      style={{
                        background: showNotes ? 'rgba(99, 102, 241, 0.15)' : 'rgba(255, 255, 255, 0.03)',
                        border: showNotes ? '1px solid rgba(99, 102, 241, 0.3)' : '1px solid rgba(255, 255, 255, 0.08)',
                        color: showNotes ? '#a5b4fc' : '#9ca3af',
                        borderRadius: '8px',
                        padding: '6px 14px',
                        fontSize: '12px',
                        fontWeight: 600,
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px',
                        transition: 'all 0.25s ease',
                      }}
                      className="hover-lift"
                      title="Toggle Markdown Notepad"
                    >
                      <BookOpen size={14} />
                      <span>Notepad: {showNotes ? 'ON' : 'OFF'}</span>
                    </button>

                    <button
                      onClick={() => setAutoSpeak(!autoSpeak)}
                      style={{
                        background: autoSpeak ? 'rgba(16, 185, 129, 0.15)' : 'rgba(255, 255, 255, 0.03)',
                        border: autoSpeak ? '1px solid rgba(16, 185, 129, 0.3)' : '1px solid rgba(255, 255, 255, 0.08)',
                        color: autoSpeak ? '#34d399' : '#9ca3af',
                        borderRadius: '8px',
                        padding: '6px 14px',
                        fontSize: '12px',
                        fontWeight: 600,
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px',
                        transition: 'all 0.25s ease',
                      }}
                      className="hover-lift"
                      title="Automatically speak cards aloud"
                    >
                      <Volume2 size={14} />
                      <span>Auto Aloud: {autoSpeak ? 'ON' : 'OFF'}</span>
                    </button>
                  </>
                )}

                <button
                  onClick={handleExitStudy}
                  style={{
                    background: 'rgba(255, 255, 255, 0.03)',
                    border: '1px solid rgba(255, 255, 255, 0.08)',
                    color: '#ef4444',
                    borderRadius: '8px',
                    padding: '6px 14px',
                    fontSize: '12px',
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                  className="hover-lift"
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
            ) : store.session.queue.length === 0 || store.session.currentIndex >= store.session.queue.length ? (
              // Completion overlay celebration
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
                <div style={{
                  width: '56px',
                  height: '56px',
                  borderRadius: '50%',
                  background: 'rgba(16, 185, 129, 0.1)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#10b981',
                  marginBottom: '10px',
                }}>
                  <BookOpen size={26} />
                </div>
                <h2 className="green-gradient-text" style={{ fontSize: '22px', fontWeight: 800 }}>Spaced Repetition Completed</h2>
                <p style={{ color: '#9ca3af', fontSize: '14px', lineHeight: 1.5, maxWidth: '400px' }}>
                  Excellent work! All due flashcards in this deck have been successfully processed and rescheduled by the FSRS algorithm.
                </p>
                <button
                  onClick={handleExitStudy}
                  style={{
                    background: '#6366f1',
                    color: 'white',
                    border: 'none',
                    borderRadius: '8px',
                    padding: '10px 24px',
                    fontWeight: 600,
                    cursor: 'pointer',
                    marginTop: '10px',
                  }}
                  className="hover-lift"
                >
                  Return to Workspace
                </button>
              </div>
            ) : checkpointOpen ? (
              // Round Checkpoint overlay celebration
              <div className="glass-panel" style={{
                textAlign: 'center',
                padding: '40px 40px',
                maxWidth: '540px',
                width: '100%',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: '20px',
                animation: 'scaleIn 0.3s ease',
              }}>
                <div style={{
                  width: '56px',
                  height: '56px',
                  borderRadius: '50%',
                  background: 'rgba(245, 158, 11, 0.1)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#f59e0b',
                  marginBottom: '6px',
                }}>
                  <Sparkles size={26} />
                </div>
                
                <h2 className="gradient-text" style={{ fontSize: '22px', fontWeight: 800 }}>Round Checkpoint! 🎯</h2>
                <p style={{ color: '#9ca3af', fontSize: '13px', lineHeight: 1.4, maxWidth: '400px' }}>
                  Fantastic job! You've successfully prioritized and reviewed **{store.session.completedCount} cards** in this session.
                </p>

                <div style={{ display: 'flex', gap: '20px', width: '100%', justifyContent: 'center', margin: '5px 0' }}>
                  <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)', padding: '12px 20px', borderRadius: '8px', flex: 1 }}>
                    <span style={{ fontSize: '10px', color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Current Streak</span>
                    <h4 style={{ fontSize: '18px', fontWeight: 700, color: '#f59e0b', marginTop: '4px' }}>🔥 {currentStreak} days</h4>
                  </div>
                  <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)', padding: '12px 20px', borderRadius: '8px', flex: 1 }}>
                    <span style={{ fontSize: '10px', color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Queue Progress</span>
                    <h4 style={{ fontSize: '18px', fontWeight: 700, color: '#a5b4fc', marginTop: '4px' }}>
                      {Math.round((store.session.currentIndex / store.session.queue.length) * 100)}%
                    </h4>
                  </div>
                </div>

                {/* Scientific Cognitive Fatigue Tracker */}
                {roundAverages.length > 0 && (() => {
                  const baseline = roundAverages[0] || 1;
                  const currentRoundAvg = roundAverages[roundAverages.length - 1] || 1;
                  const percentSlowdown = Math.round(((currentRoundAvg - baseline) / baseline) * 100);
                  
                  return (
                    <div style={{
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '12px',
                      width: '100%',
                      padding: '16px',
                      background: 'rgba(255,255,255,0.02)',
                      border: '1px solid rgba(255,255,255,0.06)',
                      borderRadius: '10px',
                      textAlign: 'left',
                    }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontSize: '11px', color: '#9ca3af', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                          🧠 Scientific Fatigue Tracker
                        </span>
                        <span style={{ fontSize: '11px', color: percentSlowdown > 25 ? '#ef4444' : '#10b981', fontWeight: 700 }}>
                          {percentSlowdown > 0 ? `+${percentSlowdown}% slowdown` : percentSlowdown < 0 ? `${percentSlowdown}% faster!` : 'Stable Speed'}
                        </span>
                      </div>

                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', margin: '4px 0' }}>
                        <div>
                          <p style={{ fontSize: '10px', color: '#6b7280' }}>Baseline (Round 1)</p>
                          <h4 style={{ fontSize: '16px', fontWeight: 700, color: '#d1d5db' }}>{baseline}s<span style={{ fontSize: '10px', fontWeight: 500, color: '#6b7280' }}>/card</span></h4>
                        </div>
                        <div>
                          <p style={{ fontSize: '10px', color: '#6b7280' }}>Current (Round {roundAverages.length})</p>
                          <h4 style={{ fontSize: '16px', fontWeight: 700, color: percentSlowdown > 25 ? '#ef4444' : '#a5b4fc' }}>{currentRoundAvg}s<span style={{ fontSize: '10px', fontWeight: 500, color: '#6b7280' }}>/card</span></h4>
                        </div>
                      </div>

                      {/* Recommendation Alert message */}
                      <div style={{
                        padding: '10px 12px',
                        borderRadius: '6px',
                        background: percentSlowdown > 25 ? 'rgba(239, 68, 68, 0.08)' : 'rgba(16, 185, 129, 0.08)',
                        border: `1px solid ${percentSlowdown > 25 ? 'rgba(239, 68, 68, 0.15)' : 'rgba(16, 185, 129, 0.15)'}`,
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                      }}>
                        <span style={{ fontSize: '14px' }}>{percentSlowdown > 25 ? '⚠️' : '✅'}</span>
                        <p style={{ fontSize: '11px', color: '#d1d5db', margin: 0, lineHeight: 1.3 }}>
                          {percentSlowdown > 25 
                            ? 'Cognitive fatigue detected (>25% slowdown). We highly advise pausing for a 5-minute stretch.'
                            : 'Optimal recall efficiency. Your brain is in a highly focused state. Keep going!'}
                        </p>
                      </div>

                      {/* Visual historical trend bar chart */}
                      {roundAverages.length > 1 && (
                        <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: '8px', textAlign: 'left' }}>
                          <span style={{ fontSize: '10px', color: '#9ca3af', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                            📈 Performance Speed Curve (seconds/card)
                          </span>
                          <div style={{
                            display: 'flex',
                            alignItems: 'flex-end',
                            height: '70px',
                            gap: '8px',
                            padding: '10px 15px',
                            background: 'rgba(255,255,255,0.01)',
                            border: '1px solid rgba(255,255,255,0.04)',
                            borderRadius: '8px',
                          }}>
                            {roundAverages.map((avg, idx) => {
                              const maxVal = Math.max(...roundAverages, 1);
                              const heightPct = Math.max(15, (avg / maxVal) * 100);
                              const isLast = idx === roundAverages.length - 1;
                              
                              return (
                                <div 
                                  key={idx} 
                                  style={{ 
                                    flex: 1, 
                                    height: `${heightPct}%`, 
                                    background: isLast ? 'linear-gradient(to top, #6366f1, #818cf8)' : 'rgba(99, 102, 241, 0.3)',
                                    borderRadius: '3px 3px 0 0',
                                    transition: 'height 0.3s ease',
                                    position: 'relative',
                                    boxShadow: isLast ? '0 0 10px rgba(99, 102, 241, 0.4)' : 'none',
                                  }}
                                  title={`Round ${idx + 1}: ${avg}s/card`}
                                >
                                  <span style={{
                                    position: 'absolute',
                                    top: '-15px',
                                    left: '50%',
                                    transform: 'translateX(-50%)',
                                    fontSize: '8px',
                                    color: '#9ca3af',
                                    fontFamily: 'monospace',
                                  }}>
                                    {avg}s
                                  </span>
                                  <span style={{
                                    position: 'absolute',
                                    bottom: '-12px',
                                    left: '50%',
                                    transform: 'translateX(-50%)',
                                    fontSize: '7px',
                                    color: '#4b5563',
                                    fontWeight: 700,
                                  }}>
                                    R{idx + 1}
                                  </span>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })()}

                <button
                  onClick={() => {
                    setCheckpointOpen(false);
                    cardStartTimeRef.current = Date.now();
                  }}
                  style={{
                    background: '#6366f1',
                    color: 'white',
                    border: 'none',
                    borderRadius: '8px',
                    padding: '12px 24px',
                    fontWeight: 700,
                    cursor: 'pointer',
                    fontSize: '14px',
                    boxShadow: '0 4px 15px rgba(99,102,241,0.25)',
                    width: '100%',
                    marginTop: '10px',
                  }}
                  className="hover-lift"
                >
                  Continue Studying (Space / Enter)
                </button>
                
                <button
                  onClick={handleExitStudy}
                  style={{
                    background: 'transparent',
                    border: 'none',
                    color: '#9ca3af',
                    fontSize: '12px',
                    cursor: 'pointer',
                    padding: '6px',
                  }}
                  onMouseEnter={e => e.currentTarget.style.color = '#ef4444'}
                  onMouseLeave={e => e.currentTarget.style.color = '#9ca3af'}
                >
                  I want to pause & exit
                </button>
              </div>
            ) : (
              // Active flashcard spaced flow
              <div style={{ width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '20px' }}>
                
                {/* Brainscape-Style Deck Mastery Stacked Progress Bar */}
                {progressSegments && (
                  <div style={{ width: '100%', maxWidth: showNotes ? '1600px' : '960px', display: 'flex', flexDirection: 'column', gap: '8px', transition: 'max-width 0.3s ease' }}>
                    
                    {/* Contiguous Stacked bar representing the entire deck's state */}
                    <div style={{
                      width: '100%',
                      height: '8px',
                      borderRadius: '4px',
                      background: 'rgba(255,255,255,0.04)',
                      display: 'flex',
                      overflow: 'hidden',
                      border: '1px solid rgba(255,255,255,0.05)',
                    }}>
                      {progressSegments.unseen > 0 && (
                        <div style={{ width: `${progressSegments.pctUnseen}%`, height: '100%', background: '#374151', transition: 'width 0.3s ease' }} title={`Unseen: ${progressSegments.unseen} cards`} />
                      )}
                      {progressSegments.score1 > 0 && (
                        <div style={{ width: `${progressSegments.pct1}%`, height: '100%', background: '#ef4444', transition: 'width 0.3s ease' }} title={`Not at all (1): ${progressSegments.score1} cards`} />
                      )}
                      {progressSegments.score2 > 0 && (
                        <div style={{ width: `${progressSegments.pct2}%`, height: '100%', background: '#f97316', transition: 'width 0.3s ease' }} title={`Slightly (2): ${progressSegments.score2} cards`} />
                      )}
                      {progressSegments.score3 > 0 && (
                        <div style={{ width: `${progressSegments.pct3}%`, height: '100%', background: '#eab308', transition: 'width 0.3s ease' }} title={`Moderately (3): ${progressSegments.score3} cards`} />
                      )}
                      {progressSegments.score4 > 0 && (
                        <div style={{ width: `${progressSegments.pct4}%`, height: '100%', background: '#10b981', transition: 'width 0.3s ease' }} title={`Very well (4): ${progressSegments.score4} cards`} />
                      )}
                      {progressSegments.score5 > 0 && (
                        <div style={{ width: `${progressSegments.pct5}%`, height: '100%', background: '#3b82f6', transition: 'width 0.3s ease' }} title={`Perfectly (5): ${progressSegments.score5} cards`} />
                      )}
                    </div>

                    {/* Legendary labels & Session metrics indicators */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%' }}>
                      <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                        <span style={{ fontSize: '9px', color: '#4b5563', fontWeight: 800, letterSpacing: '0.5px' }}>DECK MASTERY:</span>
                        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '3px', fontSize: '10px', color: '#9ca3af' }} title="Unseen / New">
                            <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#374151' }} /> {progressSegments.unseen}
                          </span>
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '3px', fontSize: '10px', color: '#fca5a5' }} title="Rating 1 (Not at all)">
                            <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#ef4444' }} /> {progressSegments.score1}
                          </span>
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '3px', fontSize: '10px', color: '#fdba74' }} title="Rating 2 (Slightly)">
                            <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#f97316' }} /> {progressSegments.score2}
                          </span>
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '3px', fontSize: '10px', color: '#fde047' }} title="Rating 3 (Moderately)">
                            <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#eab308' }} /> {progressSegments.score3}
                          </span>
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '3px', fontSize: '10px', color: '#6ee7b7' }} title="Rating 4 (Very well)">
                            <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#10b981' }} /> {progressSegments.score4}
                          </span>
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '3px', fontSize: '10px', color: '#93c5fd' }} title="Rating 5 (Perfectly)">
                            <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#3b82f6' }} /> {progressSegments.score5}
                          </span>
                        </div>
                      </div>

                      <span style={{ fontSize: '10px', color: '#6b7280', fontWeight: 700 }}>
                        Session: {store.session.currentIndex + 1} / {store.session.queue.length}
                      </span>
                    </div>
                  </div>
                )}

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
                  {/* Left Column: Flashcard Face with Navigation Chevrons */}
                  <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: '16px', width: '100%', position: 'relative' }}>
                    
                    {/* Left Navigation Chevron Button */}
                    <button
                      onClick={() => {
                        store.previousCard();
                        setIsFlipped(false);
                      }}
                      disabled={store.session.currentIndex === 0}
                      style={{
                        background: 'rgba(255, 255, 255, 0.02)',
                        border: '1px solid rgba(255, 255, 255, 0.05)',
                        color: store.session.currentIndex === 0 ? '#4b5563' : '#9ca3af',
                        borderRadius: '50%',
                        width: '44px',
                        height: '44px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        cursor: store.session.currentIndex === 0 ? 'not-allowed' : 'pointer',
                        opacity: store.session.currentIndex === 0 ? 0.3 : 1,
                        transition: 'all 0.2s ease',
                      }}
                      className={store.session.currentIndex === 0 ? '' : 'hover-lift'}
                      title="Previous Card (ArrowLeft)"
                    >
                      <ChevronLeft size={20} />
                    </button>

                    <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
                      <Flashcard
                        card={store.session.queue[store.session.currentIndex]}
                        isFlipped={isFlipped}
                        onFlip={() => setIsFlipped(prev => !prev)}
                        autoSpeak={autoSpeak}
                      />
                    </div>

                    {/* Right Navigation Chevron Button */}
                    <button
                      onClick={() => {
                        store.nextCard();
                        setIsFlipped(false);
                      }}
                      disabled={store.session.currentIndex === store.session.queue.length - 1}
                      style={{
                        background: 'rgba(255, 255, 255, 0.02)',
                        border: '1px solid rgba(255, 255, 255, 0.05)',
                        color: store.session.currentIndex === store.session.queue.length - 1 ? '#4b5563' : '#9ca3af',
                        borderRadius: '50%',
                        width: '44px',
                        height: '44px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        cursor: store.session.currentIndex === store.session.queue.length - 1 ? 'not-allowed' : 'pointer',
                        opacity: store.session.currentIndex === store.session.queue.length - 1 ? 0.3 : 1,
                        transition: 'all 0.2s ease',
                      }}
                      className={store.session.currentIndex === store.session.queue.length - 1 ? '' : 'hover-lift'}
                      title="Next Card / Skip (ArrowRight)"
                    >
                      <ChevronRight size={20} />
                    </button>

                  </div>

                  {/* Right Column: Markdown Study Notes */}
                  {showNotes && activeStudyDeckId !== null && (
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
                          <span style={{ fontSize: '10px', color: '#6b7280', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '150px' }}>
                            ({store.decks.find(d => d.id === activeStudyDeckId)?.name}.md)
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
                          dangerouslySetInnerHTML={{ __html: renderContent(deckNotes || '*No notes typed yet. Click Write to add notes.*', false, true) }}
                        />
                      )}

                      <span style={{ fontSize: '10px', color: '#6b7280', textAlign: 'right' }}>
                        ⚡ Saved automatically
                      </span>
                    </div>
                  )}
                </div>

                {/* Submit Spacing grades buttons */}
                <div style={{ width: '100%', maxWidth: '720px', minHeight: '70px', display: 'flex', justifyContent: 'center' }}>
                  {!isFlipped ? (
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
                  <span>Press <strong>Space</strong> to Flip. Press keys <strong>1 - 5</strong> to submit confidence. Press <strong>Left / Right Arrows</strong> to navigate cards.</span>
                </div>

              </div>
            )}
          </div>
  );
};
