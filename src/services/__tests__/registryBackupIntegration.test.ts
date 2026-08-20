import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '../../db';
import { CURRENT_SCHEDULER_VERSION } from '../../domain/schedulerProvenance';
import {
  BACKUP_FORMAT_VERSION,
  exportDatabase,
  importDatabase,
} from '../backup';
import {
  MEDIA_REFERENCE_PREFIX,
  acquireMediaObjectUrl,
  activeMediaObjectUrlCount,
  registerMediaBytes,
  resolveMediaAsset,
  revokeAllMediaObjectUrls,
} from '../mediaRegistry';
import { FSRS_VERSION, STATES } from '../scheduler';

const INLINE_IMAGE = `data:image/png;base64,${btoa(
  String.fromCharCode(137, 80, 78, 71, 1, 2, 3),
)}`;
const originalCreateObjectUrl = URL.createObjectURL;
const originalRevokeObjectUrl = URL.revokeObjectURL;

function installObjectUrlMocks(): void {
  let sequence = 0;
  Object.defineProperty(URL, 'createObjectURL', {
    configurable: true,
    writable: true,
    value: vi.fn(() => `blob:registry-backup-${++sequence}`),
  });
  Object.defineProperty(URL, 'revokeObjectURL', {
    configurable: true,
    writable: true,
    value: vi.fn(),
  });
}

function restoreObjectUrlApi(): void {
  Object.defineProperty(URL, 'createObjectURL', {
    configurable: true,
    writable: true,
    value: originalCreateObjectUrl,
  });
  Object.defineProperty(URL, 'revokeObjectURL', {
    configurable: true,
    writable: true,
    value: originalRevokeObjectUrl,
  });
}

async function clearDatabase(): Promise<void> {
  await Promise.all([
    db.media.clear(),
    db.reviews.clear(),
    db.cards.clear(),
    db.decks.clear(),
    db.classes.clear(),
  ]);
}

async function seedLibrary(
  name: string,
  options: {
    inline?: boolean;
    registryBytes?: readonly number[];
    orphanBytes?: readonly number[];
  } = {},
): Promise<{
  classId: number;
  deckId: number;
  cardId: number;
  registryReference?: string;
  orphanReference?: string;
}> {
  const classId = await db.classes.add({
    name: `${name} class`,
    description: '',
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
  });
  const deckId = await db.decks.add({
    classId,
    name: `${name} deck`,
    description: '',
    notes: options.inline ? `Notes ${INLINE_IMAGE}` : 'Plain notes',
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
  });
  const registryReference = options.registryBytes
    ? await registerMediaBytes(
        'image/png',
        new Uint8Array(options.registryBytes),
        new Date('2026-01-02T00:00:00.000Z'),
      )
    : undefined;
  const orphanReference = options.orphanBytes
    ? await registerMediaBytes(
        'audio/mpeg',
        new Uint8Array(options.orphanBytes),
        new Date('2026-01-03T00:00:00.000Z'),
      )
    : undefined;

  const cardId = await db.cards.add({
    classId,
    deckId,
    front: registryReference
      ? `${name} <img src="${registryReference}">`
      : `${name} question`,
    back: options.inline ? `Answer ${INLINE_IMAGE}` : `${name} answer`,
    cardType: 'standard',
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    state: STATES.New,
    stability: 0,
    difficulty: 0,
    elapsedDays: 0,
    scheduledDays: 0,
    due: new Date('2026-01-01T00:00:00.000Z'),
  });

  return {
    classId,
    deckId,
    cardId,
    registryReference,
    orphanReference,
  };
}

function legacyV4Snapshot(front = 'Legacy question'): unknown {
  const now = '2026-04-01T00:00:00.000Z';
  return {
    formatVersion: 4,
    appVersion: __DENKI_VERSION__,
    databaseVersion: 6,
    schedulerVersion: FSRS_VERSION,
    exportedAt: now,
    data: {
      classes: [
        { id: 101, name: 'Legacy class', description: '', createdAt: now },
      ],
      decks: [
        {
          id: 201,
          classId: 101,
          name: 'Legacy deck',
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
          back: 'Legacy answer',
          cardType: 'standard',
          createdAt: now,
          state: STATES.New,
          stability: 0,
          difficulty: 0,
          elapsedDays: 0,
          scheduledDays: 0,
          due: now,
          schedulerVersion: CURRENT_SCHEDULER_VERSION,
        },
      ],
      reviews: [],
      media: [],
    },
  };
}

describe('registry-native portable backup integration', () => {
  beforeEach(async () => {
    installObjectUrlMocks();
    await clearDatabase();
    localStorage.clear();
  });

  afterEach(() => {
    revokeAllMediaObjectUrls();
    restoreObjectUrlApi();
    vi.restoreAllMocks();
  });

  it('round-trips inline text, referenced registry media, and registry-only assets', async () => {
    const seeded = await seedLibrary('Original', {
      inline: true,
      registryBytes: [9, 8, 7, 6],
      orphanBytes: [5, 4, 3],
    });
    const snapshot = await exportDatabase();

    expect(snapshot.formatVersion).toBe(BACKUP_FORMAT_VERSION);
    expect(snapshot.data.media).toHaveLength(3);
    expect((snapshot.data.media as Array<{ usage: string }>).map(
      (row) => row.usage,
    )).toEqual(expect.arrayContaining(['embedded', 'registry', 'registry']));
    expect(JSON.stringify(snapshot.data.cards)).not.toContain(INLINE_IMAGE);
    expect(JSON.stringify(snapshot.data.cards)).toContain(
      seeded.registryReference,
    );

    await clearDatabase();
    await importDatabase(JSON.parse(JSON.stringify(snapshot)));

    const [card] = await db.cards.toArray();
    const [deck] = await db.decks.toArray();
    expect(card.front).toBe(
      `Original <img src="${seeded.registryReference}">`,
    );
    expect(card.back).toBe(`Answer ${INLINE_IMAGE}`);
    expect(deck.notes).toBe(`Notes ${INLINE_IMAGE}`);
    expect(await db.media.count()).toBe(2);

    const referenced = await resolveMediaAsset(seeded.registryReference);
    const orphan = await resolveMediaAsset(seeded.orphanReference);
    expect([...new Uint8Array(await referenced!.data.arrayBuffer())]).toEqual([
      9, 8, 7, 6,
    ]);
    expect(orphan?.mimeType).toBe('audio/mpeg');
  });

  it('deduplicates content used both inline and through the registry', async () => {
    const sharedBytes = new Uint8Array([137, 80, 78, 71, 1, 2, 3]);
    const reference = await registerMediaBytes('image/png', sharedBytes);
    const classId = await db.classes.add({
      name: 'Shared class',
      description: '',
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
    });
    const deckId = await db.decks.add({
      classId,
      name: 'Shared deck',
      description: '',
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
    });
    await db.cards.add({
      classId,
      deckId,
      front: `<img src="${reference}">`,
      back: INLINE_IMAGE,
      cardType: 'standard',
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      state: STATES.New,
      stability: 0,
      difficulty: 0,
      elapsedDays: 0,
      scheduledDays: 0,
      due: new Date('2026-01-01T00:00:00.000Z'),
    });

    const snapshot = await exportDatabase();
    expect(snapshot.data.media).toMatchObject([
      { usage: 'both', hash: reference.slice(MEDIA_REFERENCE_PREFIX.length) },
    ]);

    await clearDatabase();
    await importDatabase(JSON.parse(JSON.stringify(snapshot)));
    expect((await db.cards.toArray())[0]).toMatchObject({
      front: `<img src="${reference}">`,
      back: INLINE_IMAGE,
    });
    expect(await db.media.count()).toBe(1);
  });

  it('clears a pre-existing runtime registry when importing a legacy v4 backup', async () => {
    const seeded = await seedLibrary('Current', {
      registryBytes: [9, 8, 7, 6],
      orphanBytes: [5, 4, 3],
    });
    expect(await db.media.count()).toBe(2);

    await importDatabase(legacyV4Snapshot());

    expect(await db.media.count()).toBe(0);
    expect((await db.cards.toArray())[0]?.front).toBe('Legacy question');
    await expect(resolveMediaAsset(seeded.registryReference)).resolves.toBeNull();
    await expect(resolveMediaAsset(seeded.orphanReference)).resolves.toBeNull();
  });

  it('rejects tampered v5 media without changing current study or registry data', async () => {
    const seeded = await seedLibrary('Current', {
      registryBytes: [9, 8, 7, 6],
    });
    const snapshot = JSON.parse(JSON.stringify(await exportDatabase()));
    snapshot.data.media.find((row: { usage: string }) =>
      row.usage === 'registry',
    ).base64 = btoa(String.fromCharCode(1, 1, 1, 1));
    await db.cards.update(seeded.cardId, {
      front: 'Current library must survive',
    });

    await expect(importDatabase(snapshot)).rejects.toThrow(/integrity check/i);
    expect((await db.cards.get(seeded.cardId))?.front).toBe(
      'Current library must survive',
    );
    expect(await db.media.count()).toBe(1);
    await expect(resolveMediaAsset(seeded.registryReference)).resolves.not.toBeNull();
  });

  it('rolls back all five tables when registry persistence fails', async () => {
    await seedLibrary('Incoming', {
      registryBytes: [1, 2, 3, 4],
      orphanBytes: [4, 3, 2, 1],
    });
    const incomingSnapshot = JSON.parse(JSON.stringify(await exportDatabase()));
    const incomingOrphanHash = incomingSnapshot.data.media.find(
      (row: { mimeType: string }) => row.mimeType === 'audio/mpeg',
    ).hash;

    await clearDatabase();
    const current = await seedLibrary('Current', {
      registryBytes: [9, 8, 7, 6],
    });
    vi.spyOn(db.media, 'bulkAdd').mockRejectedValueOnce(
      new Error('simulated media quota failure'),
    );

    await expect(importDatabase(incomingSnapshot)).rejects.toThrow(
      /media quota failure/i,
    );

    expect((await db.classes.toArray())[0]?.name).toBe('Current class');
    expect((await db.cards.toArray())[0]?.front).toContain('Current');
    expect(await db.media.count()).toBe(1);
    await expect(resolveMediaAsset(current.registryReference)).resolves.not.toBeNull();
    await expect(
      resolveMediaAsset(`${MEDIA_REFERENCE_PREFIX}${incomingOrphanHash}`),
    ).resolves.toBeNull();
  });

  it('revokes old object URLs only after a successful durable replacement', async () => {
    const seeded = await seedLibrary('Current', {
      registryBytes: [9, 8, 7, 6],
    });
    const lease = await acquireMediaObjectUrl(seeded.registryReference);
    expect(lease?.url).toBe('blob:registry-backup-1');
    expect(activeMediaObjectUrlCount()).toBe(1);

    const invalid = JSON.parse(JSON.stringify(await exportDatabase()));
    invalid.data.media[0].base64 = btoa(String.fromCharCode(0));
    await expect(importDatabase(invalid)).rejects.toThrow();
    expect(URL.revokeObjectURL).not.toHaveBeenCalled();
    expect(activeMediaObjectUrlCount()).toBe(1);

    await importDatabase(legacyV4Snapshot());
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:registry-backup-1');
    expect(activeMediaObjectUrlCount()).toBe(0);

    lease?.release();
    expect(URL.revokeObjectURL).toHaveBeenCalledTimes(1);
  });

  it('rejects runtime registry references in legacy backup formats', async () => {
    const reference = `${MEDIA_REFERENCE_PREFIX}${'a'.repeat(64)}`;
    await expect(
      importDatabase(legacyV4Snapshot(`<img src="${reference}">`)),
    ).rejects.toThrow(/legacy backup.*registry reference/i);
    expect(await db.cards.count()).toBe(0);
  });
});
