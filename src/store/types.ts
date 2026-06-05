import type { Class, Deck, Card, CardType } from '../db/schema';
import type { Rating } from '../services/scheduler';

export interface StudySessionHistoryEntry {
  card: Card;            // Stored state of the card BEFORE it was rated
  rating: Rating;        // Rating given
  reviewLogId?: number;  // IndexedDB review log id to delete on rollback
  insertedIdx?: number;  // Index in queue where it was reinserted (if rated 1 or 2)
}

export interface StudySession {
  deckId?: number;        // Selected deck ID (if studying specific deck)
  classId?: number;       // Selected class ID (if studying entire class)
  queue: Card[];
  currentIndex: number;
  completedCount: number;
  initialQueueSize: number;
  isCram?: boolean;       // If studying all cards instead of strictly due ones
  history: StudySessionHistoryEntry[];
}

export interface ClassStats {
  total: number;
  dueCount: number;
  masteryPct: number;
  decksCount: number;
}

export interface DeckStats {
  total: number;
  dueCount: number;
  masteryPct: number;
}

export interface GlobalStats {
  totalReviews: number;
  currentStreak: number;
  maxStreak: number;
  avgRecallRate: number;
  heatmapData: { date: string; count: number }[][]; // GitHub calendar style
  workloadForecast: { dayName: string; count: number }[]; // 7-day forecast
  cardStates: {
    newCount: number;
    learningCount: number;
    reviewCount: number;
    newPct: number;
    learningPct: number;
    reviewPct: number;
  };
}

export interface ClassSlice {
  classes: Class[];
  activeClassId: number | null;
  loadClasses: () => Promise<void>;
  createClass: (name: string, description: string) => Promise<number>;
  deleteClass: (classId: number) => Promise<void>;
}

export interface DeckSlice {
  decks: Deck[];
  activeDeckId: number | null;
  loadDecks: (classId?: number) => Promise<void>;
  createDeck: (classId: number, name: string, description: string) => Promise<number>;
  deleteDeck: (deckId: number) => Promise<void>;
  saveDeckNotes: (deckId: number, notes: string) => Promise<void>;
  resetDeckProgress: (deckId: number) => Promise<void>;
}

export interface CardSlice {
  cards: Card[]; // Stores the cards of the currently loaded deck (if any)
  loadCards: (deckId?: number) => Promise<void>;
  createCard: (classId: number, deckId: number, front: string, back: string, cardType: CardType) => Promise<number>;
  updateCard: (cardId: number, front: string, back: string, cardType: CardType) => Promise<void>;
  deleteCard: (cardId: number) => Promise<void>;
  bulkCreateCards: (cards: { classId: number; deckId: number; front: string; back: string; cardType: CardType }[]) => Promise<void>;
  manuallySetCardConfidence: (cardId: number, rating: number) => Promise<void>;
  importFromCSV: (classId: number, deckId: number, csvText: string) => Promise<{ success: number; failed: number }>;
}

export interface StudySlice {
  session: StudySession | null;
  startStudySession: (deckId: number, forceCram?: boolean) => Promise<void>;
  startClassStudySession: (classId: number, forceCram?: boolean) => Promise<void>;
  rateCard: (rating: Rating) => Promise<void>;
  undoLastRate: () => Promise<void>;
  previousCard: () => void;
  nextCard: () => void;
  endStudySession: () => void;
}

export interface StatsSlice {
  classStats: Record<number, ClassStats>;
  deckStats: Record<number, DeckStats>;
  globalStats: GlobalStats | null;
  currentStreak: number;
  maxStreak: number;
  
  loadClassStats: (classId: number) => Promise<void>;
  loadAllClassStats: () => Promise<void>;
  loadDeckStats: (classId: number) => Promise<void>;
  loadStats: (classId?: number | null) => Promise<void>;
}

// Global aggregated state
export type FlashcardState = ClassSlice & DeckSlice & CardSlice & StudySlice & StatsSlice;
