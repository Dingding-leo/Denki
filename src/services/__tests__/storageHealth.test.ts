import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '../../db';
import type { Card } from '../../db/schema';
import { LAST_BACKUP_EXPORT_KEY } from '../dataSafety';
import { collectStorageHealth } from '../storageHealth';

const originalStorageDescriptor = Object.getOwnPropertyDescriptor(
  globalThis.navigator,
  'storage',
);

function installStorageApi(options: {
  usage?: number;
  quota?: number;
  persisted?: boolean;
}): void {
  Object.defineProperty(globalThis.navigator, 'storage', {
    configurable: true,
    value: {
      estimate: vi.fn(async () => ({
        usage: options.usage,
        quota: options.quota,
      })),
      persisted: vi.fn(async () => options.persisted ?? false),
      persist: vi.fn(async () => true),
    },
  });
}

async function seedLibrary(): Promise<void> {
  const classId = await db.classes.add({
    name: 'Storage',
    description: '',
    createdAt: new Date(),
  });
  const deckId = await db.decks.add({
    classId,
    name: 'Health',
    description: '',
    createdAt: new Date(),
  });
  const cardId = await db.cards.add({
    classId,
    deckId,
    front: 'Question',
    back: 'Answer',
    cardType: 'standard',
    createdAt: new Date(),
    state: 0,
    stability: 0,
    difficulty: 0,
    elapsedDays: 0,
    scheduledDays: 0,
    due: new Date(),
  } as Card);
  await db.reviews.add({
    cardId,
    classId,
    deckId,
    reviewedAt: new Date(),
    rating: 3,
    stability: 0,
    difficulty: 0,
    elapsedDays: 0,
    scheduledDays: 1,
  });
  await db.media.put({
    hash: 'a'.repeat(64),
    mimeType: 'image/png',
    byteLength: 4,
    data: new Uint8Array([1, 2, 3, 4]).buffer,
    createdAt: new Date(),
  });
}

describe('storage health diagnostics', () => {
  beforeEach(async () => {
    vi.restoreAllMocks();
    localStorage.clear();
    await Promise.all([
      db.reviews.clear(),
      db.cards.clear(),
      db.decks.clear(),
      db.classes.clear(),
      db.media.clear(),
    ]);
  });

  afterEach(() => {
    if (originalStorageDescriptor) {
      Object.defineProperty(
        globalThis.navigator,
        'storage',
        originalStorageDescriptor,
      );
    } else {
      Reflect.deleteProperty(globalThis.navigator, 'storage');
    }
  });

  it('reports one consistent library snapshot and browser quota', async () => {
    await seedLibrary();
    installStorageApi({ usage: 25, quota: 100, persisted: true });
    localStorage.setItem(
      LAST_BACKUP_EXPORT_KEY,
      String(new Date('2026-08-20T00:00:00.000Z').getTime()),
    );

    const result = await collectStorageHealth();

    expect(result.library).toEqual({
      classes: 1,
      decks: 1,
      cards: 1,
      reviews: 1,
      mediaObjects: 1,
      mediaBytes: 4,
      mediaMetadataWarnings: 0,
    });
    expect(result.browser).toEqual({
      usageBytes: 25,
      quotaBytes: 100,
      usagePercent: 25,
      persisted: true,
      canRequestPersistence: true,
    });
    expect(result.lastBackupExportedAt).toBe('2026-08-20T00:00:00.000Z');
  });

  it('surfaces malformed media metadata without reading binary payloads', async () => {
    await seedLibrary();
    await db.media.put({
      hash: 'b'.repeat(64),
      mimeType: 'image/png',
      byteLength: 'invalid' as never,
      data: new Uint8Array([9, 9]).buffer,
      createdAt: new Date(),
    });
    installStorageApi({});

    const result = await collectStorageHealth();

    expect(result.library.mediaObjects).toBe(2);
    expect(result.library.mediaBytes).toBe(4);
    expect(result.library.mediaMetadataWarnings).toBe(1);
    expect(result.browser.usageBytes).toBeNull();
    expect(result.browser.quotaBytes).toBeNull();
    expect(result.browser.usagePercent).toBeNull();
    expect(result.browser.canRequestPersistence).toBe(true);
  });

  it('keeps database diagnostics available when browser APIs fail', async () => {
    await seedLibrary();
    Object.defineProperty(globalThis.navigator, 'storage', {
      configurable: true,
      value: {
        estimate: vi.fn(async () => {
          throw new Error('denied');
        }),
        persisted: vi.fn(async () => {
          throw new Error('denied');
        }),
      },
    });

    const result = await collectStorageHealth();

    expect(result.library.cards).toBe(1);
    expect(result.browser).toEqual({
      usageBytes: null,
      quotaBytes: null,
      usagePercent: null,
      persisted: null,
      canRequestPersistence: false,
    });
  });
});
