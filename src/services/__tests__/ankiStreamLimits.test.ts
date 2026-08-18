import { describe, expect, it } from 'vitest';
import {
  readZipEntryBytes,
  type BoundedZipEntry,
  type ZipStreamHelper,
} from '../ankiImport';

function streamedEntry(
  chunks: readonly Uint8Array[],
  streamError?: Error,
): { entry: BoundedZipEntry; wasPaused: () => boolean } {
  let paused = false;

  const entry: BoundedZipEntry = {
    internalStream: () => {
      const dataCallbacks: Array<(chunk: Uint8Array) => void> = [];
      const errorCallbacks: Array<(error: Error) => void> = [];
      const endCallbacks: Array<() => void> = [];

      const helper = {
        on(event: string, callback: unknown) {
          if (event === 'data') {
            dataCallbacks.push(callback as (chunk: Uint8Array) => void);
          } else if (event === 'error') {
            errorCallbacks.push(callback as (error: Error) => void);
          } else if (event === 'end') {
            endCallbacks.push(callback as () => void);
          }
          return helper;
        },
        resume() {
          if (streamError) {
            for (const callback of errorCallbacks) callback(streamError);
            return helper;
          }

          for (const chunk of chunks) {
            if (paused) break;
            for (const callback of dataCallbacks) callback(chunk);
          }
          if (!paused) {
            for (const callback of endCallbacks) callback();
          }
          return helper;
        },
        pause() {
          paused = true;
          return helper;
        },
      } as unknown as ZipStreamHelper;

      return helper;
    },
  };

  return { entry, wasPaused: () => paused };
}

describe('bounded Anki ZIP streaming', () => {
  it('combines streamed chunks when actual output stays within the limit', async () => {
    const { entry, wasPaused } = streamedEntry([
      new Uint8Array([1, 2]),
      new Uint8Array([3, 4, 5]),
    ]);

    const output = await readZipEntryBytes(entry, 5, 'Fixture');

    expect([...output]).toEqual([1, 2, 3, 4, 5]);
    expect(wasPaused()).toBe(false);
  });

  it('pauses decompression as soon as actual output exceeds the limit', async () => {
    const { entry, wasPaused } = streamedEntry([
      new Uint8Array([1, 2, 3]),
      new Uint8Array([4, 5, 6]),
      new Uint8Array([7, 8, 9]),
    ]);

    await expect(readZipEntryBytes(entry, 5, 'Fixture')).rejects.toThrow(
      /safe decompressed size limit/,
    );
    expect(wasPaused()).toBe(true);
  });

  it('wraps decompressor failures without losing the underlying cause', async () => {
    const cause = new Error('bad deflate stream');
    const { entry } = streamedEntry([], cause);

    try {
      await readZipEntryBytes(entry, 100, 'Fixture');
      throw new Error('Expected the bounded stream to reject.');
    } catch (error) {
      expect(error).toBeInstanceOf(Error);
      expect((error as Error).message).toMatch(/could not be decompressed/);
      expect((error as Error & { cause?: unknown }).cause).toBe(cause);
    }
  });
});
