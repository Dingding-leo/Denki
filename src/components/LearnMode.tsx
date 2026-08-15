import React, { useState, useEffect, useRef, useEffectEvent } from 'react';
import { useFlashcardStore } from '../store/useFlashcardStore';
import { renderContent } from '../services/markdown';
import { CheckCircle, XCircle, ArrowRight, Sparkles } from 'lucide-react';
import { celebrate } from '../services/celebrate';
import { CardMemorySnapshot } from './CardMemorySnapshot';
import { REVIEW_RATINGS, type Rating } from '../services/reviewRatings';

interface LearnModeProps {
  onExit?: () => void;
}

export const LearnMode: React.FC<LearnModeProps> = ({ onExit }) => {
  const session = useFlashcardStore(s => s.session);
  const currentCard = session?.queue[session.currentIndex];

  const [inputVal, setInputVal] = useState('');
  const [checked, setChecked] = useState(false);
  const [isCorrect, setIsCorrect] = useState(false);
  const [overrideAllowed, setOverrideAllowed] = useState(false);
  
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Auto-focus textarea on card change
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.focus();
    }
  }, [session?.currentIndex, checked]);

  // Normalize string for fuzzy comparison
  const normalize = (str: string): string => {
    return str
      .toLowerCase()
      // Strip html tags
      .replace(/<[^>]*>/g, '')
      // Strip common markdown elements
      .replace(/[*_`#\-[\]]/g, '')
      // Strip common punctuation marks
      .replace(/[.,/#!$%^&*;:{}=\-_`~()?]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  };

  const getClozeAnswers = (frontText: string): string[] => {
    const regex = /\{\{c\d+::(.*?)\}\}/g;
    const matches = [...frontText.matchAll(regex)];
    return matches.map(m => m[1].trim());
  };

  const handleCheckAnswer = () => {
    if (!currentCard) return;

    let correct = false;

    if (inputVal.trim()) {
      if (currentCard.cardType === 'cloze') {
        const answers = getClozeAnswers(currentCard.front);
        const normalizedInput = normalize(inputVal);
        correct = answers.some(ans => normalize(ans) === normalizedInput);
      } else {
        const normalizedInput = normalize(inputVal);
        const normalizedBack = normalize(currentCard.back);
        correct = normalizedInput === normalizedBack;
      }
    }

    setIsCorrect(correct);
    setChecked(true);
    setOverrideAllowed(!correct); // Can override if marked wrong

    if (correct) {
      // Trigger subtle correct confetti
      celebrate({
        particleCount: 50,
        spread: 40,
        origin: { y: 0.75 },
        colors: ['#10b981', '#34d399', '#6ee7b7'],
      });
    }
  };

  const handleRating = async (rating: Rating) => {
    // Save review rating directly
    await useFlashcardStore.getState().rateCard(rating);
    
    // Reset state for next card
    setInputVal('');
    setChecked(false);
    setIsCorrect(false);
    setOverrideAllowed(false);
  };

  const handleOverride = () => {
    setIsCorrect(true);
    setOverrideAllowed(false);
    celebrate({
      particleCount: 40,
      spread: 40,
      origin: { y: 0.75 },
      colors: ['#10b981', '#a5b4fc'],
    });
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (!checked) {
        handleCheckAnswer();
      }
    }
  };

  const handleGlobalKeyDown = useEffectEvent((e: KeyboardEvent) => {
    const tag = (e.target as HTMLElement)?.tagName;
    if (tag === 'INPUT' || tag === 'SELECT') return;
    if (e.target === textareaRef.current && e.key !== 'Escape') return;

    if (e.key === 'Escape') {
      onExit?.();
      return;
    }

    if (!session || !currentCard) return;

    if (!checked) {
      if (e.key === ' ' || e.key === 'Enter') {
        e.preventDefault();
        handleCheckAnswer();
      }
      return;
    }

    if (['1', '2', '3', '4'].includes(e.key)) {
      e.preventDefault();
      void handleRating(Number.parseInt(e.key, 10) as Rating);
    } else if (e.key === ' ' || e.key === 'Enter') {
      e.preventDefault();
      void handleRating(isCorrect ? 3 : 1);
    } else if ((e.key === 'o' || e.key === 'O') && overrideAllowed) {
      handleOverride();
    }
  });

  useEffect(() => {
    const listener = (event: KeyboardEvent) => handleGlobalKeyDown(event);
    window.addEventListener('keydown', listener);
    return () => window.removeEventListener('keydown', listener);
  }, []);

  // Memoize the markdown parses BEFORE any early return so the hook order stays
  // unconditional (a hook after an early return is a rules-of-hooks violation
  // that crashes when the queue empties). Typing in the answer textarea
  // re-renders per keystroke, so these keep ~11 regex passes off the hot path.
  // `memoCard` is a reference-stable card object from the session queue, so it
  // is the correct memo dependency (content only changes with the card itself).
  const memoCard = currentCard;
  const frontHTML = React.useMemo(
    () => (memoCard ? renderContent(memoCard.front, memoCard.cardType === 'cloze', false) : ''),
    [memoCard],
  );
  const answerHTML = React.useMemo(
    () =>
      memoCard
        ? memoCard.cardType === 'cloze'
          ? renderContent(memoCard.front, true, true)
          : renderContent(memoCard.back, false, true)
        : '',
    [memoCard],
  );

  if (!session) return null;


  if (!currentCard) {
    return (
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '50px 20px',
        textAlign: 'center',
        minHeight: '400px',
        background: 'rgba(255,255,255,0.01)',
        border: '1px solid rgba(255,255,255,0.05)',
        borderRadius: '16px',
        backdropFilter: 'blur(20px)',
      }}>
        <Sparkles size={48} style={{ color: '#10b981', marginBottom: '16px', filter: 'drop-shadow(0 0 10px rgba(16, 185, 129, 0.3))' }} />
        <h3 style={{ fontSize: '22px', fontWeight: 800, color: '#f3f4f6', marginBottom: '8px' }}>Session Complete!</h3>
        <p style={{ color: '#9ca3af', fontSize: '14px', maxWidth: '380px', lineHeight: 1.5, marginBottom: '24px' }}>
          Amazing work! You've gone through the active recall queue.
        </p>
        {onExit && (
          <button className="btn-primary" onClick={onExit} style={{ padding: '10px 24px' }}>
            Exit Learn Mode
          </button>
        )}
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', width: '100%', maxWidth: '720px', margin: '0 auto' }}>
      
      {/*HUD Panel */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: '12px 20px',
        background: 'rgba(255,255,255,0.02)',
        border: '1px solid rgba(255,255,255,0.05)',
        borderRadius: '12px',
        backdropFilter: 'blur(10px)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontSize: '13px', color: '#10b981', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
            ✏️ Learn Mode
          </span>
          <span style={{ fontSize: '11px', color: '#6b7280' }}>|</span>
          <span style={{ fontSize: '13px', color: '#d1d5db' }}>
            Card {Math.min(session.currentIndex + 1, session.initialQueueSize)} of {session.initialQueueSize}
          </span>
        </div>

        {onExit && (
          <button className="btn-secondary" onClick={onExit} style={{ padding: '4px 12px', fontSize: '12px' }}>
            Exit
          </button>
        )}
      </div>

      <CardMemorySnapshot
        key={`memory-${currentCard.id ?? session.currentIndex}-${session.currentIndex}`}
        card={currentCard}
      />

      {/* Main Study Card Face */}
      <div style={{
        background: 'rgba(255, 255, 255, 0.01)',
        border: '1px solid rgba(255, 255, 255, 0.06)',
        borderRadius: '16px',
        padding: '30px',
        display: 'flex',
        flexDirection: 'column',
        gap: '24px',
        boxShadow: '0 8px 32px rgba(0, 0, 0, 0.2)',
        backdropFilter: 'blur(20px)',
      }}>
        
        {/* Front Question Face */}
        <div>
          <span style={{ fontSize: '11px', color: '#818cf8', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '1px' }}>
            Question
          </span>
          <div 
            style={{
              fontSize: '1.45rem',
              fontWeight: 600,
              color: '#f3f4f6',
              lineHeight: 1.5,
              marginTop: '8px',
            }}
            dangerouslySetInnerHTML={{
              __html: frontHTML
            }}
          />
        </div>

        {/* Dynamic Verification Section */}
        {!checked ? (
          // WRITING INTERFACE
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <span style={{ fontSize: '11px', color: '#9ca3af', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '1px' }}>
              Your Answer
            </span>
            <textarea
              ref={textareaRef}
              value={inputVal}
              onChange={e => setInputVal(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Type the answer here... (Press Enter to submit)"
              style={{
                width: '100%',
                minHeight: '100px',
                background: 'rgba(0, 0, 0, 0.2)',
                border: '1px solid rgba(255,255,255,0.1)',
                borderRadius: '10px',
                padding: '16px',
                color: '#f3f4f6',
                fontFamily: 'inherit',
                fontSize: '15px',
                resize: 'vertical',
                outline: 'none',
                transition: 'border-color 0.2s ease',
              }}
              onFocus={e => e.target.style.borderColor = 'rgba(99, 102, 241, 0.4)'}
              onBlur={e => e.target.style.borderColor = 'rgba(255,255,255,0.1)'}
            />
            <button
              className="btn-primary"
              onClick={handleCheckAnswer}
              style={{
                alignSelf: 'flex-end',
                padding: '10px 24px',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
              }}
            >
              {inputVal.trim() ? 'Check Answer' : 'Reveal Answer'} <ArrowRight size={16} />
            </button>
          </div>
        ) : (
          // VERIFIED OUTCOME
          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            
            {/* Verdict Header banner */}
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '12px',
              padding: '14px 20px',
              borderRadius: '10px',
              background: isCorrect ? 'rgba(16, 185, 129, 0.08)' : 'rgba(239, 68, 68, 0.08)',
              border: `1px solid ${isCorrect ? 'rgba(16, 185, 129, 0.15)' : 'rgba(239, 68, 68, 0.15)'}`,
            }}>
              {isCorrect ? (
                <>
                  <CheckCircle size={24} style={{ color: '#10b981' }} />
                  <div>
                    <h4 style={{ fontWeight: 700, color: '#34d399', fontSize: '15px' }}>Spot On! Correct Answer.</h4>
                    <p style={{ color: '#9ca3af', fontSize: '12px', marginTop: '2px' }}>Your active recall is perfectly locked in.</p>
                  </div>
                </>
              ) : (
                <>
                  <XCircle size={24} style={{ color: '#ef4444' }} />
                  <div style={{ flex: 1 }}>
                    <h4 style={{ fontWeight: 700, color: '#fca5a5', fontSize: '15px' }}>Not quite right.</h4>
                    <p style={{ color: '#9ca3af', fontSize: '12px', marginTop: '2px' }}>Review the comparison cards below to correct your mental blueprint.</p>
                  </div>
                  {overrideAllowed && (
                    <button 
                      onClick={handleOverride}
                      style={{
                        background: 'rgba(255,255,255,0.05)',
                        border: '1px solid rgba(255,255,255,0.1)',
                        borderRadius: '6px',
                        color: '#d1d5db',
                        fontSize: '12px',
                        padding: '6px 12px',
                        cursor: 'pointer',
                        transition: 'background 0.2s',
                      }}
                      onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.1)'}
                      onMouseLeave={e => e.currentTarget.style.background = 'rgba(255,255,255,0.05)'}
                    >
                      I was correct
                    </button>
                  )}
                </>
              )}
            </div>

            {/* Side-by-Side Comparison Panels */}
            <div style={{
              display: 'grid',
              gridTemplateColumns: isCorrect ? '1fr' : 'repeat(auto-fit, minmax(280px, 1fr))',
              gap: '16px',
            }}>
              <div style={{
                background: 'rgba(0,0,0,0.15)',
                border: `1px solid ${isCorrect ? 'rgba(16,185,129,0.1)' : 'rgba(239, 68, 68, 0.15)'}`,
                borderRadius: '10px',
                padding: '16px',
              }}>
                <span style={{ fontSize: '10px', color: isCorrect ? '#34d399' : '#fca5a5', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                  Your Typed Answer
                </span>
                <p style={{ fontSize: '14px', color: '#e5e7eb', marginTop: '8px', whiteSpace: 'pre-wrap', fontFamily: 'monospace' }}>
                  {inputVal}
                </p>
              </div>

              {!isCorrect && (
                <div style={{
                  background: 'rgba(0,0,0,0.15)',
                  border: '1px solid rgba(16, 185, 129, 0.2)',
                  borderRadius: '10px',
                  padding: '16px',
                }}>
                  <span style={{ fontSize: '10px', color: '#10b981', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                    Expected Correct Answer
                  </span>
                  <div 
                    style={{ fontSize: '14px', color: '#f3f4f6', marginTop: '8px', lineHeight: 1.4 }}
                    dangerouslySetInnerHTML={{
                      __html: answerHTML
                    }}
                  />
                </div>
              )}
            </div>

            {/* FSRS Rating Options Slider */}
            <div style={{
              marginTop: '12px',
              paddingTop: '20px',
              borderTop: '1px solid rgba(255,255,255,0.06)',
            }}>
              <p style={{ fontSize: '12px', color: '#9ca3af', fontWeight: 600, marginBottom: '14px', textAlign: 'center' }}>
                Rate your recall confidence for spaced repetition mapping:
              </p>
              
              <div className="learn-rating-grid">
                {REVIEW_RATINGS.map((option) => {
                  // A correct typed answer defaults to Good; Easy remains an
                  // explicit choice for genuinely effortless recall.
                  const isRecommended = isCorrect ? option.rating === 3 : option.rating === 1;

                  return (
                    <button
                      key={option.rating}
                      onClick={() => handleRating(option.rating)}
                      className={`btn-score-${option.rating}`}
                      style={{
                        padding: '10px 4px',
                        borderRadius: '8px',
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        gap: '2px',
                        cursor: 'pointer',
                        outline: isRecommended ? '2px solid var(--eye-sage, #818cf8)' : 'none',
                        transform: isRecommended ? 'scale(1.02)' : 'none',
                      }}
                    >
                      <span style={{ fontSize: '13px', fontWeight: 800 }}>{option.rating}</span>
                      <span style={{ fontSize: '10px', fontWeight: 700 }}>{option.label}</span>
                      <span style={{ fontSize: '8px', opacity: 0.72 }}>{option.description}</span>
                      {isRecommended && (
                        <span style={{
                          fontSize: '8px',
                          background: 'var(--eye-sage, #818cf8)',
                          color: 'var(--eye-canvas, #fff)',
                          padding: '1px 4px',
                          borderRadius: '4px',
                          marginTop: '3px',
                          textTransform: 'uppercase',
                          fontWeight: 700,
                        }}>
                          Rec
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>

          </div>
        )}

      </div>

      {/* Keyboard shortcut hints */}
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
        justifyContent: 'center',
      }}>
        {!checked ? (
          <span><strong>Enter</strong> to submit • <strong>Space</strong> to reveal without typing • <strong>Esc</strong> to exit</span>
        ) : (
          <span>Press <strong>1–4</strong> to rate • <strong>Space/Enter</strong> for recommended • {overrideAllowed && <><strong>O</strong> to override • </>}<strong>Esc</strong> to exit</span>
        )}
      </div>
    </div>
  );
};
