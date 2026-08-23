import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '../../db';
import type { Card } from '../../db/schema';
import {
  BACKUP_RESOURCE_LIMITS,
  importDatabase,
  prepareBackupImport,
} from '../backup';

async function seedExistingLibrary(): Promise<void> {
  const classId = await db.classes.add({
    name: 'Existing class',
    description: '',
    createdAt: new Date(),
  });
  const deckId = await db.decks.add({
    classId,
    name: 'Existing deck',
    description: '',
    createdAt: new Date(),
  });
  await db.cards.add({
    classId,
    deckId,
    front: 'existing card',
    back: 'answer',
    cardType: 'standard',
    createdAt: new Date(),
    state: 0,
    stability: 0,
    difficulty: 0,
    elapsedDays: 0,
    scheduledDays: 0,
    due: new Date(),
  } as Card);
}

function validLegacySnapshot(front = 'question') {
  const now = new Date('2026-08-23T00:00:00.000Z').toISOString();
  return {
    version: db.verno,
    data: {
      classes: [
        { id: 101, name: 'Imported', description: '', createdAt: now },
      ],
      decks: [
        {
          id: 201,
          classId: 101,
          name: 'Imported deck',
          description: '',
          createdAt: now,
        },
      ],
      cards: [
        {
          id: 301,
          classId: 101,
          deckId: 201,
          front,
          back: 'answer',
          cardType: 'standard',
          createdAt: now,
          state: 0,
          stability: 0,
          difficulty: 0,
          elapsedDays: 0,
          scheduledDays: 0,
          due: now,
        },
      ],
      reviews: [],
    },
  };
}

describe('portable backup structural budgets', () => {
  beforeEach(async () => {
    localStorage.clear();
    await Promise.all([
      db.reviews.clear(),
      db.cards.clear(),
      db.decks.clear(),
      db.classes.clear(),
      db.media.clear(),
    ]);
  });

  it('rejects an oversized sparse card table before row traversal', async () => {
    const cards = new Array(BACKUP_RESOURCE_LIMITS.maxCards + 1);

    await expect(
      prepareBackupImport({
        version: db.verno,
        data: { classes: [], decks: [], cards, reviews: [] },
      }),
    ).rejects.toThrow(/more than 250,000 cards/i);
  });

  it('rejects an oversized sparse review table before row traversal', async () => {
    const reviews = new Array(BACKUP_RESOURCE_LIMITS.maxReviews + 1);

    await expect(
      prepareBackupImport({
        version: db.verno,
        data: { classes: [], decks: [], cards: [], reviews },
      }),
    ).rejects.toThrow(/more than 2,000,000 reviews/i);
  });

  it('rejects an oversized card field before clearing current data', async () => {
    await seedExistingLibrary();
    const snapshot = validLegacySnapshot(
      'x'.repeat(BACKUP_RESOURCE_LIMITS.maxCardFieldCharacters + 1),
    );

    await expect(importDatabase(snapshot)).rejects.toThrow(
      /card 1 front exceeds/i,
    );
    expect((await db.cards.toArray()).map((card) => card.front)).toEqual([
      'existing card',
    ]);
  });
});
