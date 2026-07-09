import { describe, it, expect, beforeEach } from 'vitest';
import { db } from '../../../db';
import { useFlashcardStore } from '../../useFlashcardStore';

async function setup() {
  const classId = (await db.classes.add({ name: 'C', description: '', createdAt: new Date() })) as number;
  const deckId = (await db.decks.add({ classId, name: 'D', description: '', createdAt: new Date() })) as number;
  return { classId, deckId };
}

describe('importFromCSV', () => {
  beforeEach(async () => {
    await Promise.all([db.cards.clear(), db.decks.clear(), db.classes.clear()]);
    useFlashcardStore.setState({ activeClassId: null, activeDeckId: null });
  });

  it('skips a Front,Back,Type header row instead of importing it as a card', async () => {
    const { classId, deckId } = await setup();
    const res = await useFlashcardStore.getState().importFromCSV(classId, deckId, 'Front,Back,Type\nQ1,A1\nQ2,A2');
    expect(res.success).toBe(2);
    const cards = await db.cards.where('deckId').equals(deckId).toArray();
    expect(cards.map((c) => c.front).sort()).toEqual(['Q1', 'Q2']);
    expect(cards.find((c) => c.front === 'Front')).toBeUndefined();
  });

  it('imports every row when there is no header', async () => {
    const { classId, deckId } = await setup();
    const res = await useFlashcardStore.getState().importFromCSV(classId, deckId, 'Q1,A1\nQ2,A2');
    expect(res.success).toBe(2);
  });

  it('detects cloze cards by any {{cN::}} marker (not just c1)', async () => {
    const { classId, deckId } = await setup();
    await useFlashcardStore.getState().importFromCSV(classId, deckId, 'The {{c2::cat}} sat,hint');
    const cards = await db.cards.where('deckId').equals(deckId).toArray();
    expect(cards[0].cardType).toBe('cloze');
  });
});
