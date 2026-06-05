import React, { useState, useEffect, useRef } from 'react';
import { Timer, Star, RotateCcw, Award, Play } from 'lucide-react';
import { useFlashcardStore } from '../store/useFlashcardStore';
import { renderContent } from '../services/markdown';
import { db } from '../db';
import type { Card } from '../db/schema';
import confetti from 'canvas-confetti';

/** Fisher-Yates (Knuth) shuffle — unbiased O(n) in-place shuffle */
function shuffleArray<T>(array: T[]): T[] {
  const arr = [...array];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

interface MatchGameProps {
  deckId: number;
  onExit?: () => void;
}

interface MatchItem {
  id: string; // unique identifier e.g. "12-front"
  cardId: number;
  side: 'front' | 'back';
  content: string;
  isCloze: boolean;
  state: 'idle' | 'selected' | 'matched' | 'mismatched';
}

export const MatchGame: React.FC<MatchGameProps> = ({ deckId, onExit }) => {
  const store = useFlashcardStore();
  const deckName = store.decks.find(d => d.id === deckId)?.name || 'Deck';

  // Keep a ref to the latest deck cards loaded from the database
  const deckCardsRef = useRef<Card[]>([]);

  const [items, setItems] = useState<MatchItem[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [time, setTime] = useState<number>(0);
  const [isActive, setIsActive] = useState<boolean>(false);
  const [isCompleted, setIsCompleted] = useState<boolean>(false);
  const [highScore, setHighScore] = useState<number | null>(null);
  const [newHighScoreBadge, setNewHighScoreBadge] = useState<boolean>(false);
  const [gameSize, setGameSize] = useState<number>(6);

  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startTimeRef = useRef<number>(0);
  const penaltyRef = useRef<number>(0);

  // Load high score and cards from the database when deckId changes
  useEffect(() => {
    const stored = localStorage.getItem(`denki-match-highscore-${deckId}`);
    if (stored) {
      setHighScore(parseFloat(stored));
    }
    let cancelled = false;
    db.cards.where('deckId').equals(deckId).toArray().then(cards => {
      if (cancelled) return;
      deckCardsRef.current = cards;
      initializeGame();
    });
    return () => {
      cancelled = true;
      stopTimer();
    };
  }, [deckId]);

  // Start the timer when game is active
  useEffect(() => {
    if (isActive) {
      startTimeRef.current = Date.now();
      penaltyRef.current = 0;
      timerRef.current = setInterval(() => {
        const elapsed = (Date.now() - startTimeRef.current) / 1000 + penaltyRef.current;
        setTime(parseFloat(elapsed.toFixed(1)));
      }, 100);
    } else {
      stopTimer();
    }
    return () => stopTimer();
  }, [isActive]);

  const stopTimer = () => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  };

  const initializeGame = () => {
    stopTimer();
    setTime(0);
    setIsActive(false);
    setIsCompleted(false);
    setSelectedId(null);
    setNewHighScoreBadge(false);

    const currentCards = deckCardsRef.current;
    if (currentCards.length === 0) return;

    // 1. Select up to gameSize random cards
    const shuffledCards = shuffleArray(currentCards);
    const selectedCards = shuffledCards.slice(0, Math.min(currentCards.length, gameSize));

    // 2. Create Match Items (Fronts and Backs)
    const matchItems: MatchItem[] = [];
    selectedCards.forEach(card => {
      if (!card.id) return;
      const isCloze = card.front.includes('{{c') && card.front.includes('::');
      
      matchItems.push({
        id: `${card.id}-front`,
        cardId: card.id,
        side: 'front',
        content: card.front,
        isCloze,
        state: 'idle',
      });
      matchItems.push({
        id: `${card.id}-back`,
        cardId: card.id,
        side: 'back',
        content: card.back,
        isCloze: false,
        state: 'idle',
      });
    });

    // 3. Shuffle the 12 items
    setItems(shuffleArray(matchItems));
  };

  const startGame = () => {
    initializeGame();
    setIsActive(true);
  };

  const handleItemClick = (clickedId: string) => {
    if (!isActive || isCompleted) return;

    const clickedIdx = items.findIndex(item => item.id === clickedId);
    if (clickedIdx === -1) return;

    const clickedItem = items[clickedIdx];
    if (clickedItem.state === 'matched' || clickedItem.state === 'mismatched') return;

    // Case 1: First item selection
    if (selectedId === null) {
      setSelectedId(clickedId);
      setItems(prev => prev.map(item => item.id === clickedId ? { ...item, state: 'selected' } : item));
      return;
    }

    // Case 2: Click same item again -> Deselect
    if (selectedId === clickedId) {
      setSelectedId(null);
      setItems(prev => prev.map(item => item.id === clickedId ? { ...item, state: 'idle' } : item));
      return;
    }

    // Case 3: Match checking
    const firstIdx = items.findIndex(item => item.id === selectedId);
    if (firstIdx === -1) return;
    const firstItem = items[firstIdx];

    const isMatch = firstItem.cardId === clickedItem.cardId && firstItem.side !== clickedItem.side;

    if (isMatch) {
      // 1. Play success highlight
      setItems(prev => prev.map(item => 
        (item.id === clickedId || item.id === selectedId)
          ? { ...item, state: 'matched' }
          : item
      ));
      setSelectedId(null);
    } else {
      // 2. Play mismatch shake
      setItems(prev => prev.map(item => 
        (item.id === clickedId || item.id === selectedId)
          ? { ...item, state: 'mismatched' }
          : item
      ));
      setSelectedId(null);

      // Mismatch penalty of +1.5 seconds
      penaltyRef.current += 1.5;
      setTime(prev => parseFloat((prev + 1.5).toFixed(1)));

      // Reset cards to idle after 500ms
      setTimeout(() => {
        setItems(prev => prev.map(item => 
          (item.state === 'mismatched')
            ? { ...item, state: 'idle' }
            : item
        ));
      }, 500);
    }
  };

  // Win detection monitor
  useEffect(() => {
    if (!isActive || items.length === 0 || isCompleted) return;

    const allMatched = items.every(item => item.state === 'matched');
    if (allMatched) {
      setIsCompleted(true);
      setIsActive(false);
      stopTimer();

      // Compute final time with penalty
      const finalTime = parseFloat(((Date.now() - startTimeRef.current) / 1000 + penaltyRef.current).toFixed(1));
      setTime(finalTime);

      // Trigger confetti!
      confetti({
        particleCount: 150,
        spread: 80,
        origin: { y: 0.65 },
        colors: ['#818cf8', '#6366f1', '#eab308', '#10b981'],
      });

      // Compute high score
      const stored = localStorage.getItem(`denki-match-highscore-${deckId}`);
      if (!stored || finalTime < parseFloat(stored)) {
        localStorage.setItem(`denki-match-highscore-${deckId}`, String(finalTime));
        setHighScore(finalTime);
        setNewHighScoreBadge(true);
        
        // Extra celebratory confetti shower
        setTimeout(() => {
          confetti({
            particleCount: 100,
            angle: 60,
            spread: 55,
            origin: { x: 0 },
            colors: ['#eab308', '#6366f1']
          });
          confetti({
            particleCount: 100,
            angle: 120,
            spread: 55,
            origin: { x: 1 },
            colors: ['#eab308', '#6366f1']
          });
        }, 500);
      }
    }
  }, [items, isActive, isCompleted, deckId]);

  if (deckCardsRef.current.length < 3 && items.length === 0) {
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
        <Award size={48} style={{ color: '#ef4444', marginBottom: '16px', filter: 'drop-shadow(0 0 10px rgba(239, 68, 68, 0.3))' }} />
        <h3 style={{ fontSize: '20px', fontWeight: 700, color: '#f3f4f6', marginBottom: '8px' }}>Not Enough Cards</h3>
        <p style={{ color: '#9ca3af', fontSize: '14px', maxWidth: '380px', lineHeight: 1.5, marginBottom: '24px' }}>
          Quizlet Match requires at least **3 cards** to construct an interactive neon grid. Add more cards to this deck first!
        </p>
        {onExit && (
          <button className="btn-secondary" onClick={onExit} style={{ padding: '10px 24px' }}>
            Go Back
          </button>
        )}
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', width: '100%', maxWidth: '1000px', margin: '0 auto' }}>
      
      {/* Game Shake Styles Injector */}
      <style dangerouslySetInnerHTML={{ __html: `
        @keyframes cardShake {
          0%, 100% { transform: translateX(0); }
          20%, 60% { transform: translateX(-6px); }
          40%, 80% { transform: translateX(6px); }
        }
        .match-card-shake {
          animation: cardShake 0.4s ease-in-out;
        }
      `}} />

      {/* Header HUD */}
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
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <span style={{ fontSize: '13px', color: '#a5b4fc', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
            🎮 Quizlet Match
          </span>
          <span style={{ fontSize: '11px', color: '#6b7280' }}>|</span>
          <span style={{ fontSize: '13px', color: '#d1d5db', fontWeight: 600 }}>{deckName}</span>
        </div>

        <div style={{ display: 'flex', gap: '24px', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }} title="Current elapsed time">
            <Timer size={16} style={{ color: '#818cf8' }} />
            <span style={{ fontSize: '16px', fontWeight: 700, color: '#f3f4f6', fontFamily: 'monospace' }}>
              {time.toFixed(1)}s
            </span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }} title="High Score for this deck">
            <Star size={16} style={{ color: '#eab308' }} />
            <span style={{ fontSize: '14px', fontWeight: 600, color: '#9ca3af', fontFamily: 'monospace' }}>
              Record: {highScore ? `${highScore}s` : '--'}
            </span>
          </div>
        </div>
      </div>

      {/* Main Container */}
      {!isActive && !isCompleted ? (
        // LOBBY START OVERLAY
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          minHeight: '420px',
          background: 'rgba(255,255,255,0.01)',
          border: '1px solid rgba(255,255,255,0.05)',
          borderRadius: '16px',
          padding: '40px 20px',
          textAlign: 'center',
          backdropFilter: 'blur(20px)',
        }}>
          <div style={{
            width: '64px',
            height: '64px',
            borderRadius: '50%',
            background: 'rgba(99, 102, 241, 0.1)',
            border: '1px solid rgba(99, 102, 241, 0.2)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#818cf8',
            marginBottom: '20px',
            boxShadow: '0 0 20px rgba(99, 102, 241, 0.15)',
          }}>
            <Play size={30} fill="currentColor" style={{ marginLeft: '4px' }} />
          </div>

          <h2 className="gradient-text" style={{ fontSize: '26px', fontWeight: 800, marginBottom: '8px' }}>
            Ready to Match? ⚡
          </h2>
          <p style={{ color: '#9ca3af', fontSize: '14px', maxWidth: '420px', lineHeight: 1.5, marginBottom: '20px' }}>
            Clear the grid by clicking matching fronts and backs as fast as possible. Be quick—incorrect matches incur a +1.5s time penalty!
          </p>

          <div style={{ marginBottom: '24px' }}>
            <span style={{ fontSize: '11px', color: '#6b7280', textTransform: 'uppercase', fontWeight: 700, letterSpacing: '0.8px', display: 'block', marginBottom: '8px' }}>
              Grid Size / Cards
            </span>
            <div className="segmented-control">
              <button
                onClick={() => setGameSize(4)}
                className={`segmented-control-item ${gameSize === 4 ? 'active' : ''}`}
              >
                4 Cards
              </button>
              <button
                onClick={() => setGameSize(6)}
                className={`segmented-control-item ${gameSize === 6 ? 'active' : ''}`}
              >
                6 Cards
              </button>
              <button
                onClick={() => setGameSize(8)}
                className={`segmented-control-item ${gameSize === 8 ? 'active' : ''}`}
              >
                8 Cards
              </button>
              <button
                onClick={() => setGameSize(12)}
                className={`segmented-control-item ${gameSize === 12 ? 'active' : ''}`}
              >
                12 Cards
              </button>
            </div>
          </div>

          <div style={{ display: 'flex', gap: '12px' }}>
            <button className="btn-primary" onClick={startGame} style={{ padding: '12px 32px', fontSize: '15px' }}>
              Start Game
            </button>
            {onExit && (
              <button className="btn-secondary" onClick={onExit} style={{ padding: '12px 24px' }}>
                Cancel
              </button>
            )}
          </div>
        </div>
      ) : isCompleted ? (
        // VICTORY SCREEN OVERLAY
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          minHeight: '420px',
          background: 'rgba(255,255,255,0.01)',
          border: '1px solid rgba(255,255,255,0.05)',
          borderRadius: '16px',
          padding: '40px 20px',
          textAlign: 'center',
          backdropFilter: 'blur(20px)',
          position: 'relative',
          overflow: 'hidden',
        }}>
          {newHighScoreBadge && (
            <div style={{
              position: 'absolute',
              top: '20px',
              background: '#eab308',
              color: '#0a0e17',
              fontSize: '11px',
              fontWeight: 800,
              padding: '4px 12px',
              borderRadius: '20px',
              textTransform: 'uppercase',
              letterSpacing: '1px',
              boxShadow: '0 0 15px rgba(234, 179, 8, 0.4)',
            }}>
              🏆 New Personal Best!
            </div>
          )}

          <div style={{
            width: '64px',
            height: '64px',
            borderRadius: '50%',
            background: 'rgba(16, 185, 129, 0.1)',
            border: '1px solid rgba(16, 185, 129, 0.2)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#10b981',
            marginBottom: '20px',
            boxShadow: '0 0 20px rgba(16, 185, 129, 0.2)',
          }}>
            <Award size={32} />
          </div>

          <h2 className="gradient-text" style={{ fontSize: '28px', fontWeight: 800, marginBottom: '8px' }}>
            Board Cleared! 🎉
          </h2>
          
          <div style={{ margin: '16px 0 28px 0' }}>
            <p style={{ color: '#9ca3af', fontSize: '13px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Your Finish Time</p>
            <h1 style={{ fontSize: '48px', fontWeight: 900, color: '#f3f4f6', margin: '4px 0', fontFamily: 'monospace' }}>
              {time.toFixed(1)}s
            </h1>
            {newHighScoreBadge ? (
              <p style={{ color: '#eab308', fontSize: '13px', fontWeight: 600 }}>
                You beat your previous record by building super speed connections!
              </p>
            ) : highScore ? (
              <p style={{ color: '#6b7280', fontSize: '12px' }}>
                Your best score is {highScore}s. Can you break it next time?
              </p>
            ) : null}
          </div>

          <div style={{ display: 'flex', gap: '12px' }}>
            <button className="btn-primary" onClick={startGame} style={{ padding: '12px 28px', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <RotateCcw size={16} /> Play Again
            </button>
            {onExit && (
              <button className="btn-secondary" onClick={onExit} style={{ padding: '12px 24px' }}>
                Exit Match
              </button>
            )}
          </div>
        </div>
      ) : (
        // ACTIVE PLAYING GRID
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
          gap: '16px',
          minHeight: '400px',
          perspective: '1000px',
        }}>
          {items.map(item => {
            const isSelected = item.state === 'selected';
            const isMatched = item.state === 'matched';
            const isMismatched = item.state === 'mismatched';

            let cardStyle: React.CSSProperties = {
              background: 'rgba(255, 255, 255, 0.02)',
              border: '1px solid rgba(255, 255, 255, 0.08)',
              borderRadius: '12px',
              padding: '20px',
              minHeight: '120px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              textAlign: 'center',
              cursor: 'pointer',
              userSelect: 'none',
              backdropFilter: 'blur(10px)',
              transition: 'all 0.25s cubic-bezier(0.4, 0, 0.2, 1), opacity 0.4s ease-out',
              fontSize: '14px',
              color: '#d1d5db',
              lineHeight: 1.4,
              overflow: 'hidden',
              wordBreak: 'break-word',
              boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
            };

            // Selected card style
            if (isSelected) {
              cardStyle = {
                ...cardStyle,
                background: 'rgba(129, 140, 248, 0.08)',
                border: '2px solid #818cf8',
                color: '#f3f4f6',
                transform: 'scale(1.03) translateZ(10px)',
                boxShadow: '0 0 20px rgba(129, 140, 248, 0.35)',
              };
            }

            // Matched card style - disappear elegantly
            if (isMatched) {
              cardStyle = {
                ...cardStyle,
                opacity: 0,
                pointerEvents: 'none',
                transform: 'scale(0.9)',
              };
            }

            // Mismatched style - red flash
            if (isMismatched) {
              cardStyle = {
                ...cardStyle,
                background: 'rgba(239, 68, 68, 0.08)',
                border: '2px solid #ef4444',
                color: '#fca5a5',
                boxShadow: '0 0 20px rgba(239, 68, 68, 0.35)',
              };
            }

            return (
              <div
                key={item.id}
                onClick={() => handleItemClick(item.id)}
                className={isMismatched ? 'match-card-shake' : ''}
                style={cardStyle}
              >
                <div 
                  style={{
                    maxHeight: '100%',
                    overflowY: 'auto',
                    width: '100%',
                  }}
                  dangerouslySetInnerHTML={{
                    __html: renderContent(item.content, item.isCloze, true)
                  }}
                />
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
