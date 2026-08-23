import { describe, expect, it, vi } from 'vitest';
import {
  MAX_BACKUP_FILE_BYTES,
  assertBackupFileByteLength,
  readBackupJsonFile,
  serializeBackupJson,
} from '../backupFile';

function fakeFile(options: {
  size: number;
  source?: string;
  name?: string;
}): File {
  return {
    name: options.name ?? 'backup.json',
    size: options.size,
    text: vi.fn(async () => options.source ?? '{}'),
  } as unknown as File;
}

describe('portable backup file boundary', () => {
  it('rejects an oversized file before reading it', async () => {
    const file = fakeFile({ size: MAX_BACKUP_FILE_BYTES + 1 });

    await expect(readBackupJsonFile(file)).rejects.toThrow(/at most 512 MiB/i);
    expect(file.text).not.toHaveBeenCalled();
  });

  it('accepts a UTF-8 BOM and returns parsed JSON', async () => {
    const source = '\ufeff{"formatVersion":5,"data":{}}';
    const file = fakeFile({ size: new Blob([source]).size, source });

    await expect(readBackupJsonFile(file)).resolves.toEqual({
      formatVersion: 5,
      data: {},
    });
  });

  it('reports empty and malformed JSON clearly', async () => {
    await expect(
      readBackupJsonFile(fakeFile({ size: 3, source: '   ' })),
    ).rejects.toThrow(/empty/i);
    await expect(
      readBackupJsonFile(fakeFile({ size: 1, source: '{' })),
    ).rejects.toThrow(/not valid JSON/i);
  });

  it('rejects invalid byte lengths', () => {
    expect(() => assertBackupFileByteLength(-1)).toThrow(/size is invalid/i);
    expect(() => assertBackupFileByteLength(Number.NaN)).toThrow(
      /size is invalid/i,
    );
  });

  it('serializes a self-importable JSON backup', () => {
    const json = serializeBackupJson({
      formatVersion: 5,
      data: { classes: [], decks: [], cards: [], reviews: [], media: [] },
    });

    expect(JSON.parse(json)).toMatchObject({ formatVersion: 5 });
    expect(new Blob([json]).size).toBeLessThanOrEqual(MAX_BACKUP_FILE_BYTES);
  });
});
