const MEBIBYTE = 1024 * 1024;

/**
 * A format-v5 backup can legitimately contain up to 160 MiB of decoded media,
 * which expands under base64 and JSON. Keep the file boundary above that valid
 * envelope while still rejecting inputs large enough to predictably exhaust a
 * browser tab during `File.text()` and `JSON.parse()`.
 */
export const MAX_BACKUP_FILE_BYTES = 512 * MEBIBYTE;

function fileSizeError(byteLength: number): Error {
  return new Error(
    `Backup file is ${(byteLength / MEBIBYTE).toFixed(1)} MiB; Denki accepts at most ${MAX_BACKUP_FILE_BYTES / MEBIBYTE} MiB.`,
  );
}

export function assertBackupFileByteLength(byteLength: number): void {
  if (!Number.isSafeInteger(byteLength) || byteLength < 0) {
    throw new Error('Backup file size is invalid.');
  }
  if (byteLength > MAX_BACKUP_FILE_BYTES) {
    throw fileSizeError(byteLength);
  }
}

/** Parse JSON text from either a user-selected file or the development endpoint. */
export function parseBackupJsonText(source: string): unknown {
  assertBackupFileByteLength(new Blob([source]).size);

  const text = source.charCodeAt(0) === 0xfeff ? source.slice(1) : source;
  if (!text.trim()) throw new Error('Backup file is empty.');

  try {
    return JSON.parse(text) as unknown;
  } catch (error) {
    throw new Error('Backup file is not valid JSON.', { cause: error });
  }
}

/** Read and parse a user-selected backup only after its byte size is bounded. */
export async function readBackupJsonFile(file: File): Promise<unknown> {
  assertBackupFileByteLength(file.size);
  return parseBackupJsonText(await file.text());
}

/** Serialize a download only when Denki can accept the resulting file again. */
export function serializeBackupJson(snapshot: unknown): string {
  const json = JSON.stringify(snapshot, null, 2);
  if (json === undefined) {
    throw new Error('Backup snapshot could not be serialized.');
  }

  assertBackupFileByteLength(new Blob([json]).size);
  return json;
}
