import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '../../db';
import {
  BACKUP_FORMAT_VERSION,
  exportDatabase,
  importDatabase,
} from '../backup';
import { BACKUP_MEDIA_REFERENCE_PREFIX } from '../backupMedia';
import { STATES } from '../scheduler';

const IMAGE_DATA_URL = `data:image/png;base64,${btoa(
  String.fromCharCode(137, 80, 78, 71, 1, 2, 3, 4),
)}`;

async function clearDatabase(): Promise<void> {
  await Promise.all([
    db.reviews.clear(),
    db.cards.clear(),
    db.decks.clear(),
    db.classes.clear(),
  ]);
}

async function seedLibrary(front = 'Question'): Promise<{
  classId: number;
  deckId: number;
  cardId: number;
}> {
  const classId = await db.classes.add({
    name: 'Media class',
    description: '',
    createdAt: new Date('2026-01-01T00:00:00Z'),
  });
  const deckId = await db.decks.add({
    classId,
    name: 'Media deck',
    description: '',
    notes: `Deck note ${IMAGE_DATA_URL}`,
    createdAt: new Date('2026-01-01T00:00:00Z'),
  });
  const cardId = await db.cards.add({
    classId,
    deckId,
    front: `${front} <img src="${IMAGE_DATA_URL}">`,
    back: `Answer ${IMAGE_DATA_URL}`,
    cardType: 'standard',
    createdAt: new Date('2026-01-01T00:00:00Z'),
    state: STATES.New,
    stability: 0,
    difficulty: 0,
    elapsedDays: 0,
    scheduledDays: 0,
    due: new Date('2026-01-01T00:00:00Z'),
  });
  return { classId, deckId, cardId };
}

describe('database-level content-addressed backup media', () => {
  beforeEach(async () => {
    await clearDatabase();
    localStorage.clear();
  });

  it('exports one media object and restores exact card and deck text', async () => {
    await seedLibrary();
    const snapshot = await exportDatabase();

    expect(snapshot.formatVersion).toBe(BACKUP_FORMAT_VERSION);
    expect(snapshot.data.media).toHaveLength(1);
    expect(JSON.stringify(snapshot.data.cards)).not.toContain(IMAGE_DATA_URL);
    expect(JSON.stringify(snapshot.data.decks)).not.toContain(IMAGE_DATA_URL);
    expect(JSON.stringify(snapshot.data.cards)).toContain(
      BACKUP_MEDIA_REFERENCE_PREFIX,
    );

    await clearDatabase();
    await importDatabase(JSON.parse(JSON.stringify(snapshot)));

    const [card] = await db.cards.toArray();
    const [deck] = await db.decks.toArray();
    expect(card.front).toBe(`Question <img src="${IMAGE_DATA_URL}">`);
    expect(card.back).toBe(`Answer ${IMAGE_DATA_URL}`);
    expect(deck.notes).toBe(`Deck note ${IMAGE_DATA_URL}`);
  });

  it('rejects tampered media before replacing the current library', async () => {
    const { cardId } = await seedLibrary('Original');
    const snapshot = JSON.parse(JSON.stringify(await exportDatabase()));
    snapshot.data.media[0].base64 = btoa(String.fromCharCode(9, 9, 9, 9));
    snapshot.data.media[0].byteLength = 4;

    await db.cards.update(cardId, { front: 'Current library must survive' });

    await expect(importDatabase(snapshot)).rejects.toThrow(/integrity check/i);
    expect((await db.cards.get(cardId))?.front).toBe(
      'Current library must survive',
    );
  });
});
