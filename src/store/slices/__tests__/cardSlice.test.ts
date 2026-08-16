import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '../../../db';
import { useFlashcardStore } from '../../useFlashcardStore';

async function setup() {
  const classId = await db.classes.add({ name: 'C', description: '', createdAt: new Date() });
  const deckId = await db.decks.add({ classId, name: 'D', description: '', createdAt: new Date() });
  return { classId, deckId };
}

describe('card slice import and manual-confidence integrity', () => {
  beforeEach(async () => {
    await Promise.all([
      db.reviews.clear(),
      db.cards.clear(),
      db.decks.clear(),
      db.classes.clear(),
    ]);
    useFlashcardStore.setState({
      cards: [],
      activeClassId: null,
      activeDeckId: null,
    });
  });

  it('skips a Front,Back,Type header row instead of importing it as a card', async () => {
    const { classId, deckId } = await setup();
    const result = await useFlashcardStore.getState().importFromCSV(
      classId,
      deckId,
      'Front,Back,Type\nQ1,A1\nQ2,A2',
    );

    expect(result).toEqual({ success: 2, failed: 0 });
    const cards = await db.cards.where('deckId').equals(deckId).toArray();
    expect(cards.map((card) => card.front).sort()).toEqual(['Q1', 'Q2']);
  });

  it('imports quoted multiline fields and detects any cloze number', async () => {
    const { classId, deckId } = await setup();
    await useFlashcardStore.getState().importFromCSV(
      classId,
      deckId,
      '"The {{c2::cat}} sat","Line one\nLine two",cloze',
    );

    const cards = await db.cards.where('deckId').equals(deckId).toArray();
    expect(cards).toHaveLength(1);
    expect(cards[0].cardType).toBe('cloze');
    expect(cards[0].back).toBe('Line one\nLine two');
  });

  it('strips the formula-neutralizer apostrophe so export → import round-trips', async () => {
    const { classId, deckId } = await setup();
    await useFlashcardStore.getState().importFromCSV(
      classId,
      deckId,
      "'- bullet item,A\n'+2+2,B\n'@mention,C",
    );

    const cards = await db.cards.where('deckId').equals(deckId).toArray();
    expect(cards.map((card) => card.front).sort()).toEqual(['+2+2', '- bullet item', '@mention']);
  });

  it('writes nothing when the CSV is malformed after otherwise valid rows', async () => {
    const { classId, deckId } = await setup();

    await expect(
      useFlashcardStore.getState().importFromCSV(
        classId,
        deckId,
        'Q1,A1\n"unfinished,A2',
      ),
    ).rejects.toThrow(/unclosed quoted field/);

    expect(await db.cards.where('deckId').equals(deckId).count()).toBe(0);
  });

  it('refuses to import into a deck from another class', async () => {
    const { classId } = await setup();
    const otherClassId = await db.classes.add({ name: 'Other', description: '', createdAt: new Date() });
    const otherDeckId = await db.decks.add({
      classId: otherClassId,
      name: 'Other deck',
      description: '',
      createdAt: new Date(),
    });

    await expect(
      useFlashcardStore.getState().importFromCSV(classId, otherDeckId, 'Q,A'),
    ).rejects.toThrow(/does not belong/);
    expect(await db.cards.count()).toBe(0);
  });

  it('rejects out-of-range manual confidence values without mutating the card', async () => {
    const { classId, deckId } = await setup();
    const cardId = await useFlashcardStore.getState().createCard(
      classId,
      deckId,
      'Question',
      'Answer',
      'standard',
    );

    await expect(
      useFlashcardStore.getState().manuallySetCardConfidence(cardId, 9),
    ).rejects.toThrow(/Manual confidence/);

    const card = await db.cards.get(cardId);
    expect(card?.state).toBe(0);
    expect(await db.reviews.where('cardId').equals(cardId).count()).toBe(0);
  });
});
