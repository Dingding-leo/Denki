import { beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '../../db';
import type { Card } from '../../db/schema';
import { exportDatabase, importDatabase } from '../backup';
import { BACKUP_MEDIA_REFERENCE_PREFIX } from '../backupMedia';
import {
  EMBEDDED_MEDIA_MIGRATION_STORAGE_KEY,
  clearEmbeddedMediaMigrationCursor,
  getEmbeddedMediaMigrationStatus,
  migrateEmbeddedMediaToCompletion,
  runEmbeddedMediaMigrationBatch,
} from '../embeddedMediaMigration';
import {
  MEDIA_REFERENCE_PREFIX,
  resolveMediaAsset,
} from '../mediaRegistry';
import { STATES } from '../scheduler';

const PNG_DATA_URL = `data:image/png;base64,${btoa(
  String.fromCharCode(1, 2, 3, 4),
)}`;

async function clearDatabase(): Promise<void> {
  await Promise.all([
    db.media.clear(),
    db.reviews.clear(),
    db.cards.clear(),
    db.decks.clear(),
    db.classes.clear(),
  ]);
}

async function seedLibrary(options: {
  cardCount?: number;
  cardMedia?: string;
  deckNotes?: string;
} = {}): Promise<{
  classId: number;
  deckId: number;
  cardIds: number[];
}> {
  const classId = await db.classes.add({
    name: 'Migration class',
    description: '',
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
  });
  const deckId = await db.decks.add({
    classId,
    name: 'Migration deck',
    description: '',
    notes: options.deckNotes,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
  });

  const cardIds: number[] = [];
  for (let index = 0; index < (options.cardCount ?? 1); index += 1) {
    cardIds.push(await db.cards.add({
      classId,
      deckId,
      front: `Question ${index} ${options.cardMedia ?? ''}`.trim(),
      back: `Answer ${index} ${options.cardMedia ?? ''}`.trim(),
      cardType: 'standard',
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      state: STATES.New,
      stability: 0,
      difficulty: 0,
      elapsedDays: 0,
      scheduledDays: 0,
      due: new Date('2026-01-01T00:00:00.000Z'),
    } as Card));
  }
  return { classId, deckId, cardIds };
}

function references(text: string): string[] {
  return text.match(
    new RegExp(`${MEDIA_REFERENCE_PREFIX}[a-f0-9]{64}`, 'g'),
  ) ?? [];
}

describe('resumable embedded-media migration', () => {
  beforeEach(async () => {
    vi.restoreAllMocks();
    await clearDatabase();
    localStorage.clear();
  });

  it('resumes across bounded batches and deduplicates cards plus deck notes', async () => {
    const seeded = await seedLibrary({
      cardCount: 2,
      cardMedia: `<img src="${PNG_DATA_URL}">`,
      deckNotes: `Notes ${PNG_DATA_URL}`,
    });

    const first = await runEmbeddedMediaMigrationBatch(1);
    expect(first).toMatchObject({
      scannedThisBatch: 1,
      migratedThisBatch: 1,
      mediaObjectsCreatedThisBatch: 1,
      done: false,
    });
    expect(first.cursor).toMatchObject({
      phase: 'cards',
      lastId: seeded.cardIds[0],
    });
    expect(await db.media.count()).toBe(1);

    const cardsAfterFirst = await db.cards.orderBy('id').toArray();
    expect(cardsAfterFirst[0].front).toContain(MEDIA_REFERENCE_PREFIX);
    expect(cardsAfterFirst[1].front).toContain(PNG_DATA_URL);

    const completed = await migrateEmbeddedMediaToCompletion({ batchSize: 1 });
    expect(completed.stopped).toBe(false);
    expect(completed.cursor).toMatchObject({
      phase: 'complete',
      scannedRows: 3,
      migratedRows: 3,
      mediaObjectsCreated: 1,
    });

    const cards = await db.cards.orderBy('id').toArray();
    const deck = await db.decks.get(seeded.deckId);
    expect(cards.every((card) => !card.front.includes(PNG_DATA_URL))).toBe(true);
    expect(cards.every((card) => !card.back.includes(PNG_DATA_URL))).toBe(true);
    expect(deck?.notes).not.toContain(PNG_DATA_URL);
    const allReferences = [
      ...cards.flatMap((card) => [
        ...references(card.front),
        ...references(card.back),
      ]),
      ...references(deck?.notes ?? ''),
    ];
    expect(new Set(allReferences).size).toBe(1);
    expect(await db.media.count()).toBe(1);
  });

  it('exports and restores a valid mixed-state backup at a batch boundary', async () => {
    await seedLibrary({
      cardCount: 2,
      cardMedia: `<img src="${PNG_DATA_URL}">`,
    });
    await runEmbeddedMediaMigrationBatch(1);

    const snapshot = JSON.parse(JSON.stringify(await exportDatabase()));
    expect(JSON.stringify(snapshot.data.cards)).toContain(
      MEDIA_REFERENCE_PREFIX,
    );
    expect(JSON.stringify(snapshot.data.cards)).toContain(
      BACKUP_MEDIA_REFERENCE_PREFIX,
    );
    expect(JSON.stringify(snapshot.data.cards)).not.toContain(PNG_DATA_URL);
    expect(snapshot.data.media).toMatchObject([{ usage: 'both' }]);

    await clearDatabase();
    clearEmbeddedMediaMigrationCursor();
    await importDatabase(snapshot);

    const cards = await db.cards.orderBy('id').toArray();
    expect(cards[0].front).toContain(MEDIA_REFERENCE_PREFIX);
    expect(cards[1].front).toContain(PNG_DATA_URL);
    expect(await db.media.count()).toBe(1);
  });

  it('rolls media and card text back together when a durable update fails', async () => {
    const seeded = await seedLibrary({
      cardMedia: `<img src="${PNG_DATA_URL}">`,
    });
    vi.spyOn(db.cards, 'update').mockRejectedValueOnce(
      new Error('simulated card write failure'),
    );

    await expect(runEmbeddedMediaMigrationBatch(10)).rejects.toThrow(
      /card write failure/i,
    );

    expect((await db.cards.get(seeded.cardIds[0]))?.front).toContain(
      PNG_DATA_URL,
    );
    expect(await db.media.count()).toBe(0);
    expect(getEmbeddedMediaMigrationStatus()).toBeNull();
  });

  it('is idempotent when a committed batch loses its local checkpoint', async () => {
    const seeded = await seedLibrary({
      cardMedia: `<img src="${PNG_DATA_URL}">`,
    });
    const setItem = vi.spyOn(Storage.prototype, 'setItem');
    setItem.mockImplementationOnce(() => {
      throw new Error('simulated browser quota failure');
    });

    await expect(runEmbeddedMediaMigrationBatch(10)).rejects.toThrow(
      /batch was committed.*checkpoint/i,
    );
    expect((await db.cards.get(seeded.cardIds[0]))?.front).toContain(
      MEDIA_REFERENCE_PREFIX,
    );
    expect(await db.media.count()).toBe(1);
    expect(getEmbeddedMediaMigrationStatus()).toBeNull();

    setItem.mockRestore();
    await migrateEmbeddedMediaToCompletion({ batchSize: 10 });
    expect(await db.media.count()).toBe(1);
    expect(getEmbeddedMediaMigrationStatus()?.phase).toBe('complete');
  });

  it('sanitizes SVG before hashing, persistence, and reference replacement', async () => {
    const unsafeSvg = `
      <svg xmlns="http://www.w3.org/2000/svg">
        <script>alert(1)</script>
        <rect width="4" height="4" onclick="alert(2)" />
      </svg>
    `;
    const dataUrl = `data:image/svg+xml;base64,${btoa(unsafeSvg)}`;
    const seeded = await seedLibrary({
      cardMedia: `<img src="${dataUrl}">`,
    });

    await migrateEmbeddedMediaToCompletion({ batchSize: 10 });

    const card = await db.cards.get(seeded.cardIds[0]);
    const [reference] = references(card?.front ?? '');
    expect(reference).toBeDefined();
    const asset = await resolveMediaAsset(reference);
    const source = await asset?.data.text();
    expect(source).toContain('<svg');
    expect(source).toContain('<rect');
    expect(source).not.toMatch(/script|onclick/i);
  });

  it('stops only between committed batches and then resumes safely', async () => {
    await seedLibrary({
      cardCount: 3,
      cardMedia: `<img src="${PNG_DATA_URL}">`,
    });
    const controller = new AbortController();

    const stopped = await migrateEmbeddedMediaToCompletion({
      batchSize: 1,
      signal: controller.signal,
      onProgress(result) {
        if (result.scannedThisBatch > 0) controller.abort();
      },
    });

    expect(stopped.stopped).toBe(true);
    expect(stopped.cursor).toMatchObject({ phase: 'cards', scannedRows: 1 });
    expect((await db.cards.orderBy('id').toArray())[0].front).toContain(
      MEDIA_REFERENCE_PREFIX,
    );

    const resumed = await migrateEmbeddedMediaToCompletion({ batchSize: 1 });
    expect(resumed.stopped).toBe(false);
    expect(resumed.cursor.phase).toBe('complete');
    expect(
      (await db.cards.toArray()).every((card) =>
        card.front.includes(MEDIA_REFERENCE_PREFIX),
      ),
    ).toBe(true);
  });

  it('rejects reserved portable tokens without advancing the cursor', async () => {
    const seeded = await seedLibrary();
    await db.cards.update(seeded.cardIds[0], {
      front: `denki-backup-media://sha256/${'a'.repeat(64)}`,
    });

    await expect(runEmbeddedMediaMigrationBatch(10)).rejects.toThrow(
      /reserved portable-backup media token/i,
    );
    expect(await db.media.count()).toBe(0);
    expect(localStorage.getItem(EMBEDDED_MEDIA_MIGRATION_STORAGE_KEY)).toBeNull();
  });

  it('can restart a completed scan to catch newly embedded media', async () => {
    const seeded = await seedLibrary();
    await migrateEmbeddedMediaToCompletion({ batchSize: 10 });
    expect(getEmbeddedMediaMigrationStatus()?.phase).toBe('complete');

    await db.cards.update(seeded.cardIds[0], {
      front: `<img src="${PNG_DATA_URL}">`,
    });
    const rerun = await migrateEmbeddedMediaToCompletion({
      batchSize: 10,
      restart: true,
    });

    expect(rerun.cursor.phase).toBe('complete');
    expect((await db.cards.get(seeded.cardIds[0]))?.front).toContain(
      MEDIA_REFERENCE_PREFIX,
    );
    expect(await db.media.count()).toBe(1);
  });

  it('clears malformed checkpoint data and starts from the beginning', () => {
    localStorage.setItem(
      EMBEDDED_MEDIA_MIGRATION_STORAGE_KEY,
      JSON.stringify({ version: 1, phase: 'cards', lastId: -1 }),
    );
    expect(getEmbeddedMediaMigrationStatus()).toBeNull();
    clearEmbeddedMediaMigrationCursor();
  });
});
