import { describe, expect, it } from 'vitest';
import {
  BACKUP_MEDIA_LIMITS,
  BACKUP_MEDIA_REFERENCE_PREFIX,
  createBackupMediaReference,
  externalizeBackupMedia,
  hashBackupMedia,
  hydrateBackupMedia,
} from '../backupMedia';

function base64(bytes: readonly number[]): string {
  return btoa(String.fromCharCode(...bytes));
}

function dataUrl(mimeType: string, bytes: readonly number[]): string {
  return `data:${mimeType};base64,${base64(bytes)}`;
}

describe('content-addressed portable backup media', () => {
  it('deduplicates repeated media across cards and deck notes, then restores it', async () => {
    const image = dataUrl('image/png', [137, 80, 78, 71, 1, 2, 3]);
    const decks = [{ id: 1, notes: `Deck image: ![](${image})` }];
    const cards = [
      { id: 1, front: `<img src="${image}">`, back: image },
      { id: 2, front: image, back: 'plain text' },
    ];

    const externalized = await externalizeBackupMedia(decks, cards);

    expect(externalized.media).toHaveLength(1);
    const [asset] = externalized.media;
    const reference = createBackupMediaReference(asset.hash);
    expect(asset).toMatchObject({
      mimeType: 'image/png',
      byteLength: 7,
      base64: base64([137, 80, 78, 71, 1, 2, 3]),
    });
    expect(externalized.decks[0].notes).toContain(reference);
    expect(externalized.cards[0].front).toContain(reference);
    expect(externalized.cards[0].back).toBe(reference);
    expect(externalized.cards[1].front).toBe(reference);
    expect(JSON.stringify(externalized)).not.toContain(image);

    const hydrated = await hydrateBackupMedia(
      externalized.decks,
      externalized.cards,
      externalized.media,
      4,
    );
    expect(hydrated.decks).toEqual(decks);
    expect(hydrated.cards).toEqual(cards);
  });

  it('keeps equal bytes with different MIME types in separate assets', async () => {
    const bytes = [1, 2, 3, 4];
    const png = dataUrl('image/png', bytes);
    const gif = dataUrl('image/gif', bytes);

    const externalized = await externalizeBackupMedia(
      [],
      [{ front: png, back: gif }],
    );

    expect(externalized.media).toHaveLength(2);
    expect(new Set(externalized.media.map((asset) => asset.hash)).size).toBe(2);
    expect(
      await hashBackupMedia('image/png', new Uint8Array(bytes)),
    ).not.toBe(await hashBackupMedia('image/gif', new Uint8Array(bytes)));
  });

  it('rejects media whose bytes do not match the declared SHA-256 hash', async () => {
    const image = dataUrl('image/png', [1, 2, 3]);
    const externalized = await externalizeBackupMedia(
      [],
      [{ front: image, back: 'a' }],
    );
    const tampered = externalized.media.map((asset) => ({
      ...asset,
      base64: base64([9, 9, 9]),
    }));

    await expect(
      hydrateBackupMedia(
        externalized.decks,
        externalized.cards,
        tampered,
        4,
      ),
    ).rejects.toThrow(/integrity check/i);
  });

  it('rejects missing, unreferenced, duplicate, and malformed media references', async () => {
    const image = dataUrl('image/png', [1, 2, 3]);
    const externalized = await externalizeBackupMedia(
      [],
      [{ front: image, back: 'a' }],
    );

    await expect(
      hydrateBackupMedia(
        externalized.decks,
        externalized.cards,
        [],
        4,
      ),
    ).rejects.toThrow(/missing media/i);

    await expect(
      hydrateBackupMedia(
        [],
        [{ front: 'plain', back: 'a' }],
        externalized.media,
        4,
      ),
    ).rejects.toThrow(/unreferenced media/i);

    await expect(
      hydrateBackupMedia(
        externalized.decks,
        externalized.cards,
        [...externalized.media, ...externalized.media],
        4,
      ),
    ).rejects.toThrow(/duplicate media hash/i);

    await expect(
      hydrateBackupMedia(
        [],
        [{ front: `${BACKUP_MEDIA_REFERENCE_PREFIX}not-a-hash`, back: 'a' }],
        [],
        4,
      ),
    ).rejects.toThrow(/malformed portable media reference/i);
  });

  it('does not allow v1-v3 backups to smuggle unresolved media references', async () => {
    const hash = 'a'.repeat(64);
    await expect(
      hydrateBackupMedia(
        [],
        [{ front: createBackupMediaReference(hash), back: 'a' }],
        undefined,
        3,
      ),
    ).rejects.toThrow(/legacy backup.*media references/i);
  });

  it('rejects an oversized media table before iterating its entries', async () => {
    const oversized = new Array(BACKUP_MEDIA_LIMITS.maxAssets + 1);
    await expect(
      hydrateBackupMedia([], [], oversized, 4),
    ).rejects.toThrow(/more than.*media objects/i);
  });
});
