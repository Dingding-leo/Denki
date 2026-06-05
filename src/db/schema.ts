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
  lastRating?: number;    // Score of the last review log (1-5), or undefined if new
}

export interface ReviewLog {
  id?: number;
  cardId: number;
  deckId: number;
  classId: number;        // Linked Class (for class-level statistics)
  reviewedAt: Date;
  rating: number;         // 1 = Again, 2 = Hard, 3 = Good, 4 = Very Well, 5 = Perfect
  stability: number;      // Stability before this review
  difficulty: number;     // Difficulty before this review
  elapsedDays: number;    // Days elapsed since last review
  scheduledDays: number;  // Next scheduled interval in days
}
