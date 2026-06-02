import { describe, it, expect } from 'vitest';
import { reviewCard, STATES } from '../scheduler';
import type { Card } from '../../db/schema';

describe('Denki Spaced Repetition Scheduler (FSRS)', () => {
  const createMockCard = (overrides?: Partial<Card>): Card => ({
    classId: 1,
    deckId: 1,
    front: 'Question',
    back: 'Answer',
    cardType: 'standard',
    createdAt: new Date(),
    state: STATES.New,
    stability: 0,
    difficulty: 0,
    elapsedDays: 0,
    scheduledDays: 0,
    due: new Date(),
    ...overrides,
  } as Card);

  describe('New Cards', () => {
    it('should transition to Learning state and set minimal stability when rated Again', () => {
      const card = createMockCard();
      const { updatedCard, log } = reviewCard(card, 1);

      expect(updatedCard.state).toBe(STATES.Learning);
      expect(updatedCard.stability).toBe(0.003); // ~5 minutes
      expect(updatedCard.difficulty).toBe(8.5);
      expect(log.rating).toBe(1);
    });

    it('should transition to Review state and set 3.6 hours stability when rated Moderately (3)', () => {
      const card = createMockCard();
      const { updatedCard } = reviewCard(card, 3);

      expect(updatedCard.state).toBe(STATES.Review);
      expect(updatedCard.stability).toBe(0.15); // 3.6 hours
      expect(updatedCard.difficulty).toBe(4.5);
      expect(updatedCard.scheduledDays).toBe(1.0);
    });

    it('should transition to Review state and set 12 hours stability when rated Very well (4)', () => {
      const card = createMockCard();
      const { updatedCard } = reviewCard(card, 4);

      expect(updatedCard.state).toBe(STATES.Review);
      expect(updatedCard.stability).toBe(0.5); // 12 hours
      expect(updatedCard.difficulty).toBe(3.0);
      expect(updatedCard.scheduledDays).toBe(1.0);
    });

    it('should transition to Review state and set 1.0 day stability when rated Perfectly (5)', () => {
      const card = createMockCard();
      const { updatedCard } = reviewCard(card, 5);

      expect(updatedCard.state).toBe(STATES.Review);
      expect(updatedCard.stability).toBe(1.0); // 1 day
      expect(updatedCard.difficulty).toBe(1.5);
      expect(updatedCard.scheduledDays).toBe(1.0);
    });
  });

  describe('Review Cards', () => {
    it('should expand stability when recall is successful (Good rating)', () => {
      // Setup a card that was reviewed 4 days ago, scheduled for 4 days
      const lastReviewed = new Date(Date.now() - 4 * 24 * 60 * 60 * 1000);
      const card = createMockCard({
        state: STATES.Review,
        stability: 4.0,
        difficulty: 4.5,
        lastReviewed,
      });

      const { updatedCard } = reviewCard(card, 3);

      expect(updatedCard.state).toBe(STATES.Review);
      expect(updatedCard.stability).toBeGreaterThanOrEqual(4.0);
      expect(updatedCard.scheduledDays).toBeGreaterThanOrEqual(4.0);
      expect(updatedCard.difficulty).toBe(4.4); // Good decreases difficulty slightly from 4.5
    });

    it('should collapse stability and shift to Relearning when rated Again', () => {
      const lastReviewed = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000);
      const card = createMockCard({
        state: STATES.Review,
        stability: 10.0,
        difficulty: 3.0,
        lastReviewed,
      });

      const { updatedCard } = reviewCard(card, 1);

      expect(updatedCard.state).toBe(STATES.Relearning);
      expect(updatedCard.stability).toBeLessThan(1.0);
      expect(updatedCard.difficulty).toBe(4.5); // Difficulty increases by 1.5 from 3.0
    });
  });
});
