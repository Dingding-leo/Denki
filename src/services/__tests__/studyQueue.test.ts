import { describe, expect, it } from 'vitest';
import type { Card } from '../../db/schema';
import { buildStudyQueue, pickReinsertIndex, shuffleCards } from '../studyQueue';

const card = (id: number, deckId: number): Card => ({
  id,
  classId: 1,
  deckId,
  front: `q${id}`,
  back: `a${id}`,
  cardType: 'standard',
  createdAt: new Date(2026, 0, id),
  state: 0,
  stability: 0,
  difficulty: 0,
  elapsedDays: 0,
  scheduledDays: 0,
  due: new Date(),
});

function sequence(values: number[]): () => number {
  let index = 0;
  return () => values[index++ % values.length];
}

describe('study queue randomisation', () => {
  it('shuffles a copy without mutating or losing cards', () => {
    const input = [card(1, 1), card(2, 1), card(3, 1), card(4, 1)];
    const result = shuffleCards(input, sequence([0, 0.75, 0.25]));

    expect(input.map((item) => item.id)).toEqual([1, 2, 3, 4]);
    expect(result.map((item) => item.id)).not.toEqual(input.map((item) => item.id));
    expect(new Set(result.map((item) => item.id))).toEqual(new Set([1, 2, 3, 4]));
  });

  it('breaks avoidable same-deck runs in class-wide queues', () => {
    const input = [
      card(1, 1), card(2, 1), card(3, 1),
      card(4, 2), card(5, 2),
      card(6, 3), card(7, 3),
    ];
    const result = buildStudyQueue(input, sequence([0.1, 0.8, 0.2, 0.7, 0.3, 0.6]));

    for (let index = 1; index < result.length; index++) {
      if (result[index].deckId !== result[index - 1].deckId) continue;
      const laterAlternative = result
        .slice(index + 1)
        .some((candidate) => candidate.deckId !== result[index - 1].deckId);
      expect(laterAlternative).toBe(false);
    }
  });

  it('places Again cards inside a random short window rather than a fixed slot', () => {
    expect(pickReinsertIndex(20, 4, 1, () => 0)).toBe(6);
    expect(pickReinsertIndex(20, 4, 1, () => 0.999)).toBe(9);
  });

  it('places Hard cards later using a queue-relative random window', () => {
    const earliest = pickReinsertIndex(40, 5, 2, () => 0);
    const latest = pickReinsertIndex(40, 5, 2, () => 0.999);
    expect(earliest).toBeGreaterThanOrEqual(9);
    expect(latest).toBeGreaterThan(earliest);
    expect(latest).toBeLessThanOrEqual(40);
  });
});
