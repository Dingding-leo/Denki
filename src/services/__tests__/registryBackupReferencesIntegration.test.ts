import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '../../db';
import { exportDatabase, importDatabase } from '../backup';
import {
  MEDIA_REFERENCE_PREFIX,
  registerMediaBytes,
  resolveMediaAsset,
} from '../mediaRegistry';
import { STATES } from '../scheduler';

async function clearDatabase(): Promise<void> {
  await Promise.all([
    db.media.clear(),
    db.reviews.clear(),
    db.cards.clear(),
    db.decks.clear(),
    db.classes.clear(),
  ]);
}

async function createDestination(front: string): Promise<number> {
  const classId = await db.classes.add({
    name: 'Reference class',
    description: '',
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
  });
  const deckId = await db.decks.add({
    classId,
    name: 'Reference deck',
    description: '',
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
  });
  return db.cards.add({
    classId,
    deckId,
    front,
    back: 'Answer',
    cardType: 'standard',
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    state: STATES.New,
    stability: 0,
    difficulty: 0,
    elapsedDays: 0,
    scheduledDays: 0,
    due: new Date('2026-01-01T00:00:00.000Z'),
  });
}

describe('registry-native backup reference completeness', () => {
  beforeEach(async () => {
    await clearDatabase();
    localStorage.clear();
  });

  it('refuses to export a library with a missing runtime registry object', async () => {
    const missing = `${MEDIA_REFERENCE_PREFIX}${'a'.repeat(64)}`;
    await createDestination(`<img src="${missing}">`);

    await expect(exportDatabase()).rejects.toThrow(
      /missing registry media/i,
    );
  });

  it('refuses an incomplete v5 backup before replacing the current library', async () => {
    const currentReference = await registerMediaBytes(
      'image/png',
      new Uint8Array([1, 2, 3]),
    );
    const currentCardId = await createDestination(
      `<img src="${currentReference}">`,
    );
    const snapshot = JSON.parse(JSON.stringify(await exportDatabase()));
    const missing = `${MEDIA_REFERENCE_PREFIX}${'b'.repeat(64)}`;
    snapshot.data.cards[0].front = `<img src="${missing}">`;

    await expect(importDatabase(snapshot)).rejects.toThrow(
      /missing registry media/i,
    );

    expect((await db.cards.get(currentCardId))?.front).toBe(
      `<img src="${currentReference}">`,
    );
    expect(await db.media.count()).toBe(1);
    await expect(resolveMediaAsset(currentReference)).resolves.not.toBeNull();
  });
});
