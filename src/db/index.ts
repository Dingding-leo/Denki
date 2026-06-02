import Dexie, { type Table } from 'dexie';
import type { Class, Deck, Card, ReviewLog } from './schema';

class DenkiDatabase extends Dexie {
  classes!: Table<Class, number>;
  decks!: Table<Deck, number>;
  cards!: Table<Card, number>;
  reviews!: Table<ReviewLog, number>;

  constructor() {
    super('DenkiDatabase');
    
    // Version 3 adds compound indices for optimized stats calculations and FSRS queue queries
    this.version(3).stores({
      classes: '++id, name, createdAt',
      decks: '++id, classId, name, createdAt',
      cards: '++id, classId, deckId, state, due, lastReviewed, cardType, lastRating, [classId+due], [deckId+due], [classId+state], [deckId+state]',
      reviews: '++id, cardId, deckId, classId, reviewedAt, rating, [classId+reviewedAt]',
    });
  }
}

export const db = new DenkiDatabase();
