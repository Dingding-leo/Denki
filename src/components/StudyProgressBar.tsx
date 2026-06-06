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
        height: '12px',
        borderRadius: '6px',
        background: 'rgba(0, 0, 0, 0.45)',
        display: 'flex',
        overflow: 'hidden',
        border: '1px solid rgba(255,255,255,0.08)',
        boxShadow: '0 2px 5px rgba(0,0,0,0.3) inset',
      }}>
        {progressSegments.unseen > 0 && (
          <div style={{ width: `${progressSegments.pctUnseen}%`, height: '100%', background: '#4b5563', transition: 'width 0.3s ease' }} title={`Unseen: ${progressSegments.unseen} cards`} />
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
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%', flexWrap: 'wrap', gap: '8px' }}>
        <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
          <span style={{ fontSize: '10px', color: '#8e8e93', fontWeight: 700, letterSpacing: '0.5px' }}>DECK STATUS:</span>
          <div style={{ display: 'flex', gap: '6px', alignItems: 'center', flexWrap: 'wrap' }}>
            <span className="badge-premium" style={{ background: 'rgba(75, 85, 99, 0.15)', borderColor: 'rgba(75, 85, 99, 0.25)', color: '#d1d5db', fontSize: '9px', padding: '2px 6px' }} title="Unseen / New">
              <span style={{ width: '5px', height: '5px', borderRadius: '50%', background: '#4b5563', marginRight: '4px', display: 'inline-block' }} />New: {progressSegments.unseen}
            </span>
            <span className="badge-premium badge-premium-danger" style={{ fontSize: '9px', padding: '2px 6px' }} title="Rating 1 (Not at all)">
              <span style={{ width: '5px', height: '5px', borderRadius: '50%', background: '#ef4444', marginRight: '4px', display: 'inline-block' }} />1: {progressSegments.score1}
            </span>
            <span className="badge-premium" style={{ background: 'rgba(249, 115, 22, 0.12)', borderColor: 'rgba(249, 115, 22, 0.25)', color: '#fdba74', fontSize: '9px', padding: '2px 6px' }} title="Rating 2 (Slightly)">
              <span style={{ width: '5px', height: '5px', borderRadius: '50%', background: '#f97316', marginRight: '4px', display: 'inline-block' }} />2: {progressSegments.score2}
            </span>
            <span className="badge-premium badge-premium-amber" style={{ fontSize: '9px', padding: '2px 6px' }} title="Rating 3 (Moderately)">
              <span style={{ width: '5px', height: '5px', borderRadius: '50%', background: '#eab308', marginRight: '4px', display: 'inline-block' }} />3: {progressSegments.score3}
            </span>
            <span className="badge-premium badge-premium-green" style={{ fontSize: '9px', padding: '2px 6px' }} title="Rating 4 (Very well)">
              <span style={{ width: '5px', height: '5px', borderRadius: '50%', background: '#10b981', marginRight: '4px', display: 'inline-block' }} />4: {progressSegments.score4}
            </span>
            <span className="badge-premium badge-premium-blue" style={{ fontSize: '9px', padding: '2px 6px' }} title="Rating 5 (Perfectly)">
              <span style={{ width: '5px', height: '5px', borderRadius: '50%', background: '#3b82f6', marginRight: '4px', display: 'inline-block' }} />5: {progressSegments.score5}
            </span>
          </div>
        </div>

        <span className="badge-premium" style={{ fontSize: '10px', color: '#a5b4fc', borderColor: 'rgba(99, 102, 241, 0.25)', background: 'rgba(99, 102, 241, 0.08)', fontWeight: 700 }}>
          Session Card: {currentIndex + 1} / {queue.length}
        </span>
      </div>
    </div>
  );
};
