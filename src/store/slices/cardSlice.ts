import type { StateCreator } from 'zustand';
import { db } from '../../db';
import type { CardType } from '../../db/schema';
import { STATES } from '../../services/scheduler';
import { triggerAutoSave } from '../../services/backup';
import type { FlashcardState, CardSlice } from '../types';

/**
 * Standard CSV Parsing helper that handles quotes, escaped quotes, and newlines
 */
function parseCSV(text: string): string[][] {
  const lines: string[][] = [];
  let row: string[] = [];
  let currentVal = '';
  let insideQuote = false;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    const nextChar = text[i + 1];

    if (char === '"') {
      if (insideQuote && nextChar === '"') {
        currentVal += '"';
        i++;
      } else {
        insideQuote = !insideQuote;
      }
    } else if (char === ',' && !insideQuote) {
      row.push(currentVal.trim());
      currentVal = '';
    } else if ((char === '\r' || char === '\n') && !insideQuote) {
      if (char === '\r' && nextChar === '\n') i++;
      row.push(currentVal.trim());
      if (row.length > 0 && row.some(cell => cell.length > 0)) {
        lines.push(row);
      }
      row = [];
      currentVal = '';
    } else {
      currentVal += char;
    }
  }
  if (currentVal || row.length > 0) {
    row.push(currentVal.trim());
    if (row.length > 0 && row.some(cell => cell.length > 0)) {
      lines.push(row);
    }
  }
  return lines;
}

export const createCardSlice: StateCreator<
  FlashcardState,
  [],
  [],
  CardSlice
> = (set, get) => ({
  cards: [],

  loadCards: async (deckId) => {
    let allCards;
    if (deckId !== undefined) {
      allCards = await db.cards.where('deckId').equals(deckId).toArray();
    } else {
      allCards = await db.cards.toArray();
    }
    set({ cards: allCards });
  },

  createCard: async (classId, deckId, front, back, cardType) => {
    const id = await db.cards.add({
      classId,
      deckId,
      front,
      back,
      cardType,
      createdAt: new Date(),
      state: STATES.New,
      stability: 0,
      difficulty: 0,
      elapsedDays: 0,
      scheduledDays: 0,
      due: new Date(),
    });
    
    await get().loadCards(deckId);
    
    // Refresh deck/class/global stats
    await get().loadClassStats(classId);
    await get().loadDeckStats(classId);
    await get().loadStats(get().activeClassId);
    
    triggerAutoSave();
    return id;
  },

  deleteCard: async (cardId) => {
    const card = await db.cards.get(cardId);
    if (!card) return;

    await db.transaction('rw', [db.cards, db.reviews], async () => {
      await db.cards.delete(cardId);
      await db.reviews.where('cardId').equals(cardId).delete();
    });

    await get().loadCards(card.deckId);

    // Refresh deck/class/global stats
    await get().loadClassStats(card.classId);
    await get().loadDeckStats(card.classId);
    await get().loadStats(get().activeClassId);

    triggerAutoSave();
  },

  bulkCreateCards: async (cardsToCreate) => {
    if (cardsToCreate.length === 0) return;
    const parentClassId = cardsToCreate[0].classId;

    await db.transaction('rw', db.cards, async () => {
      const now = new Date();
      const cardEntries = cardsToCreate.map(c => ({
        classId: c.classId,
        deckId: c.deckId,
        front: c.front,
        back: c.back,
        cardType: c.cardType,
        createdAt: now,
        state: STATES.New,
        stability: 0,
        difficulty: 0,
        elapsedDays: 0,
        scheduledDays: 0,
        due: now,
      }));
      await db.cards.bulkAdd(cardEntries);
    });

    const activeDeckId = get().activeDeckId;
    if (activeDeckId) {
      await get().loadCards(activeDeckId);
    }

    // Refresh deck/class/global stats
    if (parentClassId) {
      await get().loadClassStats(parentClassId);
      await get().loadDeckStats(parentClassId);
    }
    await get().loadStats(get().activeClassId);

    triggerAutoSave();
  },

  manuallySetCardConfidence: async (cardId, rating) => {
    const card = await db.cards.get(cardId);
    if (!card) return;

    await db.transaction('rw', [db.cards, db.reviews], async () => {
      if (rating === 0) {
        // Reset progress: Delete all reviews for this card
        await db.reviews.where('cardId').equals(cardId).delete();

        // Reset spaced parameters to New state
        await db.cards.update(cardId, {
          state: STATES.New,
          stability: 0,
          difficulty: 0,
          elapsedDays: 0,
          scheduledDays: 0,
          due: new Date(),
          lastReviewed: undefined,
          lastRating: undefined,
        });
      } else {
        // Explicit confidence set: 1, 2, 3, 4, or 5
        let difficulty = 4.5;
        let stability = 0.15;
        let state = STATES.Review;

        if (rating === 1) {
          difficulty = 8.5;
          stability = 0.003;
          state = STATES.Learning;
        } else if (rating === 2) {
          difficulty = 6.5;
          stability = 0.04;
        } else if (rating === 3) {
          difficulty = 4.5;
          stability = 0.15;
        } else if (rating === 4) {
          difficulty = 3.0;
          stability = 0.5;
        } else if (rating === 5) {
          difficulty = 1.5;
          stability = 1.0;
        }

        const scheduledDays = Number(stability.toFixed(4));
        const due = new Date(Date.now() + scheduledDays * 24 * 60 * 60 * 1000);

        // Update card parameters
        await db.cards.update(cardId, {
          state,
          stability,
          difficulty,
          elapsedDays: 0.0001,
          scheduledDays,
          due,
          lastReviewed: new Date(),
          lastRating: rating,
        });

        // Add a new manual review log entry
        await db.reviews.add({
          cardId,
          deckId: card.deckId,
          classId: card.classId,
          reviewedAt: new Date(),
          rating,
          stability: card.stability,
          difficulty: card.difficulty,
          elapsedDays: 0.0001,
          scheduledDays,
        });
      }
    });

    // Refresh store arrays
    const activeDeckId = get().activeDeckId;
    if (activeDeckId) {
      await get().loadCards(activeDeckId);
    }

    // Refresh statistics
    await get().loadClassStats(card.classId);
    await get().loadDeckStats(card.classId);
    await get().loadStats(get().activeClassId);

    triggerAutoSave();
  },

  importFromCSV: async (classId, deckId, csvText) => {
    const rows = parseCSV(csvText);
    if (rows.length === 0) return { success: 0, failed: 0 };

    let success = 0;
    let failed = 0;

    await db.transaction('rw', db.cards, async () => {
      for (const row of rows) {
        if (row.length < 2) {
          failed++;
          continue;
        }

        const front = row[0].trim();
        const back = row[1].trim();
        const rawType = row[2]?.trim().toLowerCase();
        
        let cardType: CardType = 'standard';
        if (rawType === 'cloze' || front.includes('{{c1::')) {
          cardType = 'cloze';
        }

        if (front && back) {
          await db.cards.add({
            classId,
            deckId,
            front,
            back,
            cardType,
            createdAt: new Date(),
            state: STATES.New,
            stability: 0,
            difficulty: 0,
            elapsedDays: 0,
            scheduledDays: 0,
            due: new Date(),
          });
          success++;
        } else {
          failed++;
        }
      }
    });

    await get().loadCards(deckId);

    // Refresh stats
    await get().loadClassStats(classId);
    await get().loadDeckStats(classId);
    await get().loadStats(get().activeClassId);

    triggerAutoSave();
    return { success, failed };
  },
});
