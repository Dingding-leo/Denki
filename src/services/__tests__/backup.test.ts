import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '../../db';
import type { Card } from '../../db/schema';
import { exportDatabase, importDatabase } from '../backup';

async function seedCard(front = 'existing') {
  const classId = await db.classes.add({ name: 'C', description: '', createdAt: new Date() });
  const deckId = await db.decks.add({ classId, name: 'D', description: '', createdAt: new Date() });
  const cardId = await db.cards.add({
    classId,
    deckId,
    front,
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
  return { classId, deckId, cardId };
}

describe('backup export/import integrity', () => {
  beforeEach(async () => {
    await Promise.all([
      db.reviews.clear(),
      db.cards.clear(),
      db.decks.clear(),
      db.classes.clear(),
    ]);
    localStorage.clear();
  });

  it('restores cards with Date-typed fields so due-range queries still match', async () => {
    const { classId, deckId, cardId } = await seedCard('q');
    const due = new Date('2026-01-01T00:00:00Z');
    await db.cards.update(cardId, {
      state: 2,
      stability: 5,
      difficulty: 5,
      scheduledDays: 5,
      due,
      lastReviewed: new Date('2025-12-27T00:00:00Z'),
    });
    await db.reviews.add({
      cardId,
      deckId,
      classId,
      reviewedAt: new Date('2025-12-27T00:00:00Z'),
      rating: 3,
      stability: 1,
      difficulty: 5,
      elapsedDays: 1,
      scheduledDays: 5,
    });

    const snapshot = await exportDatabase();
    const overWire = JSON.parse(JSON.stringify(snapshot));
    await importDatabase(overWire);

    const restored = await db.cards.toArray();
    const restoredReviews = await db.reviews.toArray();
    expect(restored).toHaveLength(1);
    expect(restored[0].due).toBeInstanceOf(Date);
    expect(restored[0].lastReviewed).toBeInstanceOf(Date);
    expect(restoredReviews[0].reviewedAt).toBeInstanceOf(Date);

    const dueCount = await db.cards
      .where('[classId+due]')
      .between([classId, new Date(0)], [classId, new Date('2027-01-01')])
      .count();
    expect(dueCount).toBe(1);
  });

  it('refuses to import a snapshot newer than the current schema', async () => {
    await expect(
      importDatabase({
        version: db.verno + 1,
        data: { classes: [], decks: [], cards: [], reviews: [] },
      }),
    ).rejects.toThrow(/newer than/);
  });

  it('rejects malformed required tables before clearing existing data', async () => {
    await seedCard();

    await expect(importDatabase({
      version: db.verno,
      data: {
        classes: [],
        decks: [],
        cards: null as unknown as unknown[],
        reviews: [],
      },
    })).rejects.toThrow(/cards table/);

    expect(await db.cards.count()).toBe(1);
  });

  it('rejects invalid dates instead of accepting Invalid Date objects', async () => {
    const { classId, deckId } = await seedCard();
    const badSnapshot = {
      version: db.verno,
      data: {
        classes: [{ id: classId, name: 'C', description: '', createdAt: new Date().toISOString() }],
        decks: [{ id: deckId, classId, name: 'D', description: '', createdAt: new Date().toISOString() }],
        cards: [{
          id: 9001,
          classId,
          deckId,
          front: 'q',
          back: 'a',
          cardType: 'standard',
          createdAt: new Date().toISOString(),
          state: 0,
          stability: 0,
          difficulty: 0,
          elapsedDays: 0,
          scheduledDays: 0,
          due: 'not-a-date',
        }],
        reviews: [],
      },
    };

    await expect(importDatabase(badSnapshot)).rejects.toThrow(/invalid card/);
    expect((await db.cards.toArray())[0].front).toBe('existing');
  });

  it('rejects orphaned or mismatched class/deck/card relationships', async () => {
    await seedCard();
    const now = new Date().toISOString();
    const orphaned = {
      version: db.verno,
      data: {
        classes: [{ id: 101, name: 'C', description: '', createdAt: now }],
        decks: [{ id: 201, classId: 999, name: 'Orphan', description: '', createdAt: now }],
        cards: [],
        reviews: [],
      },
    };

    await expect(importDatabase(orphaned)).rejects.toThrow(/missing class/);
    expect(await db.cards.count()).toBe(1);
  });

  it('rejects review logs whose references do not match their card', async () => {
    await seedCard();
    const now = new Date().toISOString();
    const mismatched = {
      version: db.verno,
      data: {
        classes: [{ id: 101, name: 'C', description: '', createdAt: now }],
        decks: [{ id: 201, classId: 101, name: 'D', description: '', createdAt: now }],
        cards: [{
          id: 301,
          classId: 101,
          deckId: 201,
          front: 'q',
          back: 'a',
          cardType: 'standard',
          createdAt: now,
          state: 2,
          stability: 2,
          difficulty: 5,
          elapsedDays: 1,
          scheduledDays: 2,
          due: now,
        }],
        reviews: [{
          id: 401,
          cardId: 301,
          classId: 101,
          deckId: 999,
          reviewedAt: now,
          rating: 3,
          stability: 1,
          difficulty: 5,
          elapsedDays: 1,
          scheduledDays: 2,
        }],
      },
    };

    await expect(importDatabase(mismatched)).rejects.toThrow(/invalid card\/deck\/class references/);
    expect(await db.cards.count()).toBe(1);
  });

  it('clears a persisted study queue after a successful full restore', async () => {
    await seedCard();
    const snapshot = JSON.parse(JSON.stringify(await exportDatabase()));
    localStorage.setItem('denki.study-session.v1', '{"stale":true}');

    await importDatabase(snapshot);

    expect(localStorage.getItem('denki.study-session.v1')).toBeNull();
  });
});
