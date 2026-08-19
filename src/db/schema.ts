export interface Class {
  id?: number;
  name: string;
  description: string;
  createdAt: Date;
}

export interface Deck {
  id?: number;
  classId: number;        // Linked parent Class foreign key
  name: string;
  description: string;
  createdAt: Date;
  notes?: string;         // Deck-level markdown study notes
}

/**
 * Passive binary content keyed by SHA-256(normalized MIME + NUL + stored bytes).
 * ArrayBuffer is used as the durable IndexedDB representation; Blob objects are
 * reconstructed only when a renderer acquires an object-URL lease.
 */
export interface MediaAsset {
  hash: string;
  mimeType: string;
  byteLength: number;
  data: ArrayBuffer;
  createdAt: Date;
}

export type CardType = 'standard' | 'cloze';

export interface Card {
  id?: number;
  classId: number;        // Linked parent Class (for quick aggregated queries)
  deckId: number;         // Linked parent Deck foreign key
  front: string;          // Supports markdown & cloze tags like {{c1::answer}}
  back: string;           // Supports markdown & drawings
  cardType: CardType;
  createdAt: Date;
  
  // Spaced Repetition (FSRS-based) parameters
  state: number;          // 0 = New, 1 = Learning, 2 = Review, 3 = Relearning
  stability: number;      // Stability of memory (in days)
  difficulty: number;     // Difficulty of the card (1.0 to 10.0)
  elapsedDays: number;    // Days since last review
  scheduledDays: number;  // Interval in days until next due
  due: Date;              // Exact due date/time
  lastReviewed?: Date;    // Timestamp of last review
  lastRating?: number;    // Current scores are 1-4; legacy 5 is displayed as Easy
  /** Optional in the TS shape only so v4 records can be migrated; DB v5 guarantees it. */
  schedulerVersion?: string;
}

export interface ReviewLog {
  id?: number;
  cardId: number;
  deckId: number;
  classId: number;        // Linked Class (for class-level statistics)
  reviewedAt: Date;
  rating: number;         // 1 = Again, 2 = Hard, 3 = Good, 4 = Easy (legacy logs may contain 5)
  stability: number;      // Stability before this review
  difficulty: number;     // Difficulty before this review
  elapsedDays: number;    // Days elapsed since last review
  scheduledDays: number;  // Next scheduled interval in days
  /** Optional in the TS shape only so legacy rows/backups can be normalized. */
  schedulerVersion?: string;
}
