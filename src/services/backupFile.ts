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

/** Read and parse a user-selected backup only after its byte size is bounded. */
export async function readBackupJsonFile(file: File): Promise<unknown> {
  assertBackupFileByteLength(file.size);

  let text = await file.text();
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  if (!text.trim()) throw new Error('Backup file is empty.');

  try {
    return JSON.parse(text) as unknown;
  } catch (error) {
    throw new Error('Backup file is not valid JSON.', { cause: error });
  }
}

/** Serialize a download only when Denki can accept the resulting file again. */
export function serializeBackupJson(snapshot: unknown): string {
  const json = JSON.stringify(snapshot, null, 2);
  if (json === undefined) {
    throw new Error('Backup snapshot could not be serialized.');
  }

  const byteLength = new Blob([json]).size;
  assertBackupFileByteLength(byteLength);
  return json;
}
