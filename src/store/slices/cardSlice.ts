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

  updateCard: async (cardId, front, back, cardType) => {
    const card = await db.cards.get(cardId);
    if (!card) return;

    await db.cards.update(cardId, {
      front,
      back,
      cardType,
    });

    await get().loadCards(card.deckId);

    // Refresh deck/class/global stats
    await get().loadClassStats(card.classId);
    await get().loadDeckStats(card.classId);
    await get().loadStats(get().activeClassId);

    triggerAutoSave();
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
        // Explicit canonical confidence set: Again, Hard, Good, or Easy.
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

        // Add a new manual review log entry. Unlike reviewCard (which logs the
        // PRE-review stability), this log records the POST-set stability. For a
        // New card the pre-set stability is 0, and countNewIntroducedToday counts
        // stability===0 logs as session "introductions" — but a manual confidence
        // set is not a session introduction, so the log must carry a non-zero
        // stability or it would burn today's new-card allowance.
        await db.reviews.add({
          cardId,
          deckId: card.deckId,
          classId: card.classId,
          reviewedAt: new Date(),
          rating,
          stability, // post-set stability — never 0, so never counted as an introduction
          difficulty,
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

    // Skip an optional header row (the "Front, Back, Type" format the UI
    // documents) so it doesn't get imported as a literal flashcard.
    const first = rows[0];
    const hasHeader =
      first.length >= 2 &&
      first[0].trim().toLowerCase() === 'front' &&
      first[1].trim().toLowerCase() === 'back';
    const dataRows = hasHeader ? rows.slice(1) : rows;

    let success = 0;
    let failed = 0;

    await db.transaction('rw', db.cards, async () => {
      for (const row of dataRows) {
        if (row.length < 2) {
          failed++;
          continue;
        }

        // Strip the leading apostrophe that deckExport adds to neutralize
        // spreadsheet formula injection, so Denki's own export → import round-trip
        // doesn't leave a literal `'` on cards that start with = + - @. Only strip
        // when it's exactly the neutralizer pattern (`'` + one of the formula
        // chars) so a legitimate apostrophe-led field is untouched.
        const stripFormulaPrefix = (s: string) =>
          /^'[=+\-@]/.test(s) ? s.slice(1) : s;
        const front = stripFormulaPrefix(row[0].trim());
        const back = stripFormulaPrefix(row[1].trim());
        const rawType = row[2]?.trim().toLowerCase();
        
        let cardType: CardType = 'standard';
        if (rawType === 'cloze' || /\{\{c\d+::/.test(front)) {
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
