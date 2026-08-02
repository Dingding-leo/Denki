import { describe, it, expect, beforeEach } from 'vitest';
import { db } from '../../db';
import { exportDatabase, importDatabase } from '../backup';
import type { Card } from '../../db/schema';

describe('backup export/import round-trip', () => {
  beforeEach(async () => {
    await Promise.all([db.classes.clear(), db.decks.clear(), db.cards.clear(), db.reviews.clear()]);
  });

  it('restores cards with Date-typed fields so due-range queries still match', async () => {
    const classId = (await db.classes.add({ name: 'C', description: '', createdAt: new Date() })) as number;
    const deckId = (await db.decks.add({ classId, name: 'D', description: '', createdAt: new Date() })) as number;
    const due = new Date('2026-01-01T00:00:00Z');
    await db.cards.add({
      classId,
      deckId,
      front: 'q',
      back: 'a',
      cardType: 'standard',
      createdAt: new Date(),
      state: 2,
      stability: 5,
      difficulty: 5,
      elapsedDays: 0,
      scheduledDays: 5,
      due,
    } as Card);

    // Reproduce the real backup path: export -> JSON serialize (Date -> string) -> import.
    const snapshot = await exportDatabase();
    const overWire = JSON.parse(JSON.stringify(snapshot));
    await importDatabase(overWire);

    const restored = await db.cards.toArray();
    expect(restored).toHaveLength(1);
    expect(restored[0].due instanceof Date).toBe(true);

    // The Date-typed compound range query must still find the restored card.
    const dueCount = await db.cards
      .where('[classId+due]')
      .between([classId, new Date(0)], [classId, new Date('2027-01-01')])
      .count();
    expect(dueCount).toBe(1);
  });

  it('refuses to import a snapshot newer than the current schema', async () => {
    await expect(
      importDatabase({ version: db.verno + 1, data: { classes: [], decks: [], cards: [], reviews: [] } }),
    ).rejects.toThrow(/newer than/);
  });

  it('refuses to import cards missing required fields instead of wiping the database', async () => {
    // Seed a real card so we can assert it survives a bad import attempt.
    const classId = (await db.classes.add({ name: 'C', description: '', createdAt: new Date() })) as number;
    const deckId = (await db.decks.add({ classId, name: 'D', description: '', createdAt: new Date() })) as number;
    await db.cards.add({
      classId,
      deckId,
      front: 'existing',
      back: 'card',
      cardType: 'standard',
      createdAt: new Date(),
      state: 0,
      stability: 0,
      difficulty: 0,
      elapsedDays: 0,
      scheduledDays: 0,
      due: new Date(),
    } as Card);

    // A card row that survives JSON round-trip but is missing `state`/`stability`.
    const badSnapshot = {
      version: db.verno,
      data: {
        classes: [{ id: classId, name: 'C', description: '', createdAt: new Date().toISOString() }],
        decks: [{ id: deckId, classId, name: 'D', description: '', createdAt: new Date().toISOString() }],
        cards: [
          {
            id: 1,
            classId,
            deckId,
            front: 'q',
            back: 'a',
            cardType: 'standard',
            createdAt: new Date().toISOString(),
            due: new Date().toISOString(),
            // state, stability missing
          },
        ],
        reviews: [],
      },
    };

    await expect(importDatabase(badSnapshot as never)).rejects.toThrow(/invalid card/);

    // The seeded data must still be present — the clear happened after validation.
    expect(await db.classes.count()).toBe(1);
    expect(await db.decks.count()).toBe(1);
    expect(await db.cards.count()).toBe(1);
    expect((await db.cards.toArray())[0].front).toBe('existing');
  });
});
