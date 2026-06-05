import React, { useMemo } from 'react';
import type { Card } from '../db/schema';

interface StudyProgressBarProps {
  queue: Card[];
  currentIndex: number;
}

export const StudyProgressBar: React.FC<StudyProgressBarProps> = ({ queue, currentIndex }) => {
  const progressSegments = useMemo(() => {
    if (queue.length === 0) return null;
    
    let score1 = 0, score2 = 0, score3 = 0, score4 = 0, score5 = 0, unseen = 0;
    
    queue.forEach(card => {
      const r = card.lastRating;
      if (r === 1) score1++;
      else if (r === 2) score2++;
      else if (r === 3) score3++;
      else if (r === 4) score4++;
      else if (r === 5) score5++;
      else unseen++;
    });
    
    const total = queue.length;
    return {
      unseen, score1, score2, score3, score4, score5,
      pctUnseen: (unseen / total) * 100,
      pct1: (score1 / total) * 100,
      pct2: (score2 / total) * 100,
      pct3: (score3 / total) * 100,
      pct4: (score4 / total) * 100,
      pct5: (score5 / total) * 100,
    };
  }, [queue]);

  if (!progressSegments) return null;

  return (
    <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: '8px' }}>
      
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
          Session: {currentIndex + 1} / {queue.length}
        </span>
      </div>
    </div>
  );
};
