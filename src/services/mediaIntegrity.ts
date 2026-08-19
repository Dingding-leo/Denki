import DOMPurify from 'dompurify';

const MEBIBYTE = 1024 * 1024;

export const MEDIA_MAX_SINGLE_BYTES = 16 * MEBIBYTE;

const SUPPORTED_MEDIA_TYPES = new Set([
  'image/png',
  'image/jpeg',
  'image/gif',
  'image/webp',
  'image/avif',
  'image/bmp',
  'image/svg+xml',
  'audio/mpeg',
  'audio/mp4',
  'audio/aac',
  'audio/wav',
  'audio/ogg',
  'audio/opus',
  'audio/flac',
  'video/mp4',
  'video/webm',
] as const);

export interface NormalizedMediaBytes {
  mimeType: string;
  bytes: Uint8Array;
}

function requireSubtleCrypto(): SubtleCrypto {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) {
    throw new Error(
      'Secure SHA-256 support is unavailable, so media cannot be processed.',
    );
  }
  return subtle;
}

export function normalizeMediaMimeType(value: unknown): string {
  if (typeof value !== 'string') {
    throw new Error('Media MIME type is missing or invalid.');
  }
  const normalized = value.trim().toLowerCase();
  if (!SUPPORTED_MEDIA_TYPES.has(normalized as never)) {
    throw new Error(`Unsupported media type: ${value || '(empty)'}`);
  }
  return normalized;
}

export function isSupportedMediaMimeType(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  return SUPPORTED_MEDIA_TYPES.has(value.trim().toLowerCase() as never);
}

export function assertMediaByteLength(
  byteLength: number,
  label = 'Media',
): void {
  if (!Number.isSafeInteger(byteLength) || byteLength <= 0) {
    throw new Error(`${label} is empty or has an invalid byte length.`);
  }
  if (byteLength > MEDIA_MAX_SINGLE_BYTES) {
    throw new Error(
      `${label} exceeds the ${MEDIA_MAX_SINGLE_BYTES / MEBIBYTE} MiB per-file limit.`,
    );
  }
}

function sanitizeSvgBytes(bytes: Uint8Array): Uint8Array {
  const source = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  const sanitized = DOMPurify.sanitize(source, {
    USE_PROFILES: { svg: true, svgFilters: true },
    FORBID_TAGS: [
      'script',
      'foreignObject',
      'iframe',
      'object',
      'embed',
      'image',
      'audio',
      'video',
      'animate',
      'animateMotion',
      'animateTransform',
      'set',
    ],
    FORBID_ATTR: ['style', 'href', 'xlink:href'],
    ALLOW_DATA_ATTR: false,
  });

  if (!/<svg[\s>]/i.test(sanitized)) {
    throw new Error('SVG media does not contain a safe root element.');
  }

  const output = new TextEncoder().encode(sanitized);
  assertMediaByteLength(output.byteLength, 'Sanitized SVG media');
  return output;
}

/**
 * Normalize and bound bytes before hashing or persistence. SVG is sanitized
 * first so the stored hash identifies the exact passive content Denki serves.
 */
export function normalizeMediaBytes(
  mimeType: unknown,
  input: Uint8Array,
): NormalizedMediaBytes {
  const normalizedMime = normalizeMediaMimeType(mimeType);
  assertMediaByteLength(input.byteLength);
  const copied = input.slice();
  const bytes =
    normalizedMime === 'image/svg+xml' ? sanitizeSvgBytes(copied) : copied;
  return { mimeType: normalizedMime, bytes };
}

/** Hash normalized MIME + NUL + exact persisted bytes. */
export async function hashMediaBytes(
  mimeType: string,
  bytes: Uint8Array,
): Promise<string> {
  const normalizedMime = normalizeMediaMimeType(mimeType);
  assertMediaByteLength(bytes.byteLength);
  const mimeBytes = new TextEncoder().encode(normalizedMime);
  const input = new Uint8Array(mimeBytes.length + 1 + bytes.length);
  input.set(mimeBytes, 0);
  input[mimeBytes.length] = 0;
  input.set(bytes, mimeBytes.length + 1);

  const digest = await requireSubtleCrypto().digest('SHA-256', input);
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}
