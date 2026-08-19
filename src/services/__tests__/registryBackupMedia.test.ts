import { describe, expect, it } from 'vitest';
import type { MediaAsset } from '../../db/schema';
import { BACKUP_MEDIA_REFERENCE_PREFIX } from '../backupMedia';
import { hashMediaBytes } from '../mediaIntegrity';
import {
  exportRegistryNativeBackupMedia,
  importRegistryNativeBackupMedia,
} from '../registryBackupMedia';

function base64(bytes: readonly number[]): string {
  return btoa(String.fromCharCode(...bytes));
}

function dataUrl(mimeType: string, bytes: readonly number[]): string {
  return `data:${mimeType};base64,${base64(bytes)}`;
}

function buffer(bytes: readonly number[]): ArrayBuffer {
  const output = new ArrayBuffer(bytes.length);
  new Uint8Array(output).set(bytes);
  return output;
}

async function registryAsset(
  mimeType: string,
  bytes: readonly number[],
  createdAt = new Date('2026-01-01T00:00:00.000Z'),
): Promise<MediaAsset> {
  const input = new Uint8Array(bytes);
  return {
    hash: await hashMediaBytes(mimeType, input),
    mimeType,
    byteLength: input.byteLength,
    data: buffer(bytes),
    createdAt,
  };
}

describe('registry-native backup media', () => {
  it('stores equal embedded and registry content once with both usages', async () => {
    const bytes = [1, 2, 3, 4];
    const inline = dataUrl('image/png', bytes);
    const asset = await registryAsset('image/png', bytes);
    const exported = await exportRegistryNativeBackupMedia(
      [{ notes: `Notes ${inline}` }],
      [{ front: `<img src="${inline}">`, back: inline }],
      [asset],
      '2026-02-01T00:00:00.000Z',
    );

    expect(exported.media).toHaveLength(1);
    expect(exported.media[0]).toMatchObject({
      hash: asset.hash,
      mimeType: 'image/png',
      byteLength: 4,
      base64: base64(bytes),
      createdAt: '2026-01-01T00:00:00.000Z',
      usage: 'both',
    });
    expect(exported.cards[0].front).toContain(
      `${BACKUP_MEDIA_REFERENCE_PREFIX}${asset.hash}`,
    );

    const imported = await importRegistryNativeBackupMedia(
      exported.decks,
      exported.cards,
      JSON.parse(JSON.stringify(exported.media)),
    );
    expect(imported.decks).toEqual([{ notes: `Notes ${inline}` }]);
    expect(imported.cards).toEqual([
      { front: `<img src="${inline}">`, back: inline },
    ]);
    expect(imported.media).toHaveLength(1);
    expect(imported.media[0]).toMatchObject({
      hash: asset.hash,
      mimeType: 'image/png',
      byteLength: 4,
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
    });
    expect([...new Uint8Array(imported.media[0].data)]).toEqual(bytes);
  });

  it('preserves registry-only orphan assets as complete local database state', async () => {
    const asset = await registryAsset('audio/mpeg', [9, 8, 7]);
    const exported = await exportRegistryNativeBackupMedia(
      [],
      [{ front: 'plain', back: 'text' }],
      [asset],
      '2026-02-01T00:00:00.000Z',
    );

    expect(exported.media).toMatchObject([
      { hash: asset.hash, usage: 'registry' },
    ]);

    const imported = await importRegistryNativeBackupMedia(
      exported.decks,
      exported.cards,
      exported.media,
    );
    expect(imported.cards).toEqual([{ front: 'plain', back: 'text' }]);
    expect(imported.media).toHaveLength(1);
    expect(imported.media[0].hash).toBe(asset.hash);
  });

  it('rejects tampered registry bytes before returning durable rows', async () => {
    const asset = await registryAsset('image/png', [1, 2, 3]);
    const exported = await exportRegistryNativeBackupMedia(
      [],
      [{ front: 'plain', back: 'text' }],
      [asset],
      '2026-02-01T00:00:00.000Z',
    );
    const tampered = JSON.parse(JSON.stringify(exported.media));
    tampered[0].base64 = base64([9, 9, 9]);

    await expect(
      importRegistryNativeBackupMedia([], exported.cards, tampered),
    ).rejects.toThrow(/integrity check/i);
  });

  it('rejects an embedded usage row that no text references', async () => {
    const bytes = new Uint8Array([1, 2, 3]);
    const hash = await hashMediaBytes('image/png', bytes);

    await expect(
      importRegistryNativeBackupMedia(
        [],
        [{ front: 'plain', back: 'text' }],
        [
          {
            hash,
            mimeType: 'image/png',
            byteLength: 3,
            base64: base64([1, 2, 3]),
            createdAt: '2026-01-01T00:00:00.000Z',
            usage: 'embedded',
          },
        ],
      ),
    ).rejects.toThrow(/unreferenced embedded media/i);
  });

  it('rejects missing embedded media, noncanonical dates, and invalid usage', async () => {
    const missing = `${BACKUP_MEDIA_REFERENCE_PREFIX}${'a'.repeat(64)}`;
    await expect(
      importRegistryNativeBackupMedia(
        [],
        [{ front: missing, back: 'text' }],
        [],
      ),
    ).rejects.toThrow(/missing embedded media/i);

    const bytes = new Uint8Array([1]);
    const hash = await hashMediaBytes('image/png', bytes);
    const base = {
      hash,
      mimeType: 'image/png',
      byteLength: 1,
      base64: base64([1]),
      createdAt: '2026-01-01T00:00:00.000Z',
      usage: 'registry',
    };

    await expect(
      importRegistryNativeBackupMedia([], [], [
        { ...base, createdAt: '2026-01-01' },
      ]),
    ).rejects.toThrow(/canonical ISO/i);
    await expect(
      importRegistryNativeBackupMedia([], [], [
        { ...base, usage: 'unknown' },
      ]),
    ).rejects.toThrow(/usage/i);
  });
});
