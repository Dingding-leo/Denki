import React from 'react';
import type { Card } from '../db/schema';
import { formatInterval, STATES } from '../services/scheduler';
import {
  getReviewRatingDefinition,
  normalizeStoredRating,
  REVIEW_RATINGS,
} from '../services/reviewRatings';

interface CardMemorySnapshotProps {
  card: Card;
}

function stateLabel(state: number): string {
  switch (state) {
    case STATES.Learning:
      return 'Learning';
    case STATES.Review:
      return 'Review';
    case STATES.Relearning:
      return 'Relearning';
    default:
      return 'New';
  }
}

function relativeReviewTime(value: Date, referenceTime: number): string {
  const elapsedMs = Math.max(0, referenceTime - new Date(value).getTime());
  const minutes = Math.floor(elapsedMs / 60_000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months}mo ago`;
  return new Date(value).toLocaleDateString();
}

export const CardMemorySnapshot: React.FC<CardMemorySnapshotProps> = ({ card }) => {
  const [renderedAt] = React.useState(() => Date.now());
  const normalizedRating = normalizeStoredRating(card.lastRating);
  const ratingDefinition = getReviewRatingDefinition(card.lastRating);
  const reviewedAgo = card.lastReviewed
    ? relativeReviewTime(card.lastReviewed, renderedAt)
    : null;
  const interval = card.scheduledDays > 0 ? formatInterval(card.scheduledDays) : null;
  const isNew = normalizedRating === undefined;

  return (
    <section
      className={`card-memory-snapshot ${isNew ? 'is-new' : ''}`}
      aria-label="Previous memory level"
      title={`State: ${stateLabel(card.state)} · Stability: ${card.stability.toFixed(2)} days · Difficulty: ${card.difficulty.toFixed(1)}/10`}
    >
      <div className="card-memory-heading">
        <span>Previous level</span>
        <strong>
          {ratingDefinition
            ? `${ratingDefinition.label} · ${ratingDefinition.description}`
            : 'New card · no prior result'}
        </strong>
      </div>

      <div className="card-memory-scale" aria-hidden="true">
        {REVIEW_RATINGS.map((definition) => (
          <span
            key={definition.rating}
            className={`card-memory-level rating-${definition.rating} ${normalizedRating === definition.rating ? 'is-active' : ''}`}
          >
            <b>{definition.rating}</b>
            {definition.label}
          </span>
        ))}
      </div>

      <div className="card-memory-meta">
        {isNew ? (
          <span>This is the card's first recorded attempt.</span>
        ) : (
          <>
            <span>{stateLabel(card.state)} state</span>
            {reviewedAgo && <span>Last seen {reviewedAgo}</span>}
            {interval && <span>Current interval {interval}</span>}
          </>
        )}
      </div>
    </section>
  );
};
