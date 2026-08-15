import React, { useMemo } from 'react';
import type { Card } from '../db/schema';
import {
  normalizeStoredRating,
  REVIEW_RATINGS,
  type Rating,
} from '../services/reviewRatings';

interface StudyProgressBarProps {
  queue: Card[];
  currentIndex: number;
}

export const StudyProgressBar: React.FC<StudyProgressBarProps> = ({ queue, currentIndex }) => {
  const progressSegments = useMemo(() => {
    if (queue.length === 0) return null;

    const uniqueCardsMap = new Map<number, Card>();
    queue.forEach((card) => {
      if (card.id !== undefined) uniqueCardsMap.set(card.id, card);
    });

    const counts: Record<Rating, number> = { 1: 0, 2: 0, 3: 0, 4: 0 };
    let unseen = 0;

    uniqueCardsMap.forEach((card) => {
      const rating = normalizeStoredRating(card.lastRating);
      if (rating === undefined) unseen++;
      else counts[rating]++;
    });

    const total = uniqueCardsMap.size;
    const percent = (count: number) => (total > 0 ? (count / total) * 100 : 0);
    return { unseen, counts, total, pctUnseen: percent(unseen), percent };
  }, [queue]);

  if (!progressSegments) return null;

  return (
    <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: '6px' }}>
      <div style={{
        width: '100%',
        height: '6px',
        borderRadius: '3px',
        background: 'rgba(0, 0, 0, 0.45)',
        display: 'flex',
        overflow: 'hidden',
        border: '1px solid rgba(255,255,255,0.06)',
      }}>
        {progressSegments.unseen > 0 && (
          <div
            style={{ width: `${progressSegments.pctUnseen}%`, height: '100%', background: '#4b5563', transition: 'width 0.3s ease' }}
            title={`New: ${progressSegments.unseen} cards`}
          />
        )}
        {REVIEW_RATINGS.map((definition) => {
          const count = progressSegments.counts[definition.rating];
          return count > 0 ? (
            <div
              key={definition.rating}
              style={{
                width: `${progressSegments.percent(count)}%`,
                height: '100%',
                background: definition.color,
                transition: 'width 0.3s ease',
              }}
              title={`${definition.label} (${definition.rating}): ${count} cards`}
            />
          ) : null;
        })}
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%', flexWrap: 'wrap', gap: '8px' }}>
        <div style={{ display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap' }}>
          <span style={{ fontSize: '10px', color: '#8e8e93', fontWeight: 800, letterSpacing: '0.5px' }}>DECK STATUS</span>
          <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap', fontSize: '10px', color: '#8e8e93' }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
              <span style={{ width: '5px', height: '5px', borderRadius: '50%', background: '#4b5563', display: 'inline-block' }} />
              New: {progressSegments.unseen}
            </span>
            {REVIEW_RATINGS.map((definition) => (
              <span
                key={definition.rating}
                style={{ display: 'flex', alignItems: 'center', gap: '4px', color: definition.color }}
              >
                <span style={{ width: '5px', height: '5px', borderRadius: '50%', background: definition.color, display: 'inline-block' }} />
                {definition.label}: {progressSegments.counts[definition.rating]}
              </span>
            ))}
          </div>
        </div>

        <span className="badge-premium" style={{ fontSize: '9px', color: '#a5b4fc', borderColor: 'rgba(99, 102, 241, 0.25)', background: 'rgba(99, 102, 241, 0.08)', fontWeight: 700 }}>
          Session Card: {Math.min(currentIndex + 1, queue.length)} / {queue.length}
        </span>
      </div>
    </div>
  );
};
