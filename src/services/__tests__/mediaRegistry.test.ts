import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '../../db';
import {
  MEDIA_MAX_SINGLE_BYTES,
  MEDIA_REFERENCE_PREFIX,
  acquireMediaObjectUrl,
  activeMediaObjectUrlCount,
  createMediaReference,
  parseMediaReference,
  registerMediaBlob,
  registerMediaBytes,
  resolveMediaAsset,
  revokeAllMediaObjectUrls,
} from '../mediaRegistry';

const originalCreateObjectUrl = URL.createObjectURL;
const originalRevokeObjectUrl = URL.revokeObjectURL;

function installObjectUrlMocks() {
  let sequence = 0;
  Object.defineProperty(URL, 'createObjectURL', {
    configurable: true,
    writable: true,
    value: vi.fn(() => `blob:denki-test-${++sequence}`),
  });
  Object.defineProperty(URL, 'revokeObjectURL', {
    configurable: true,
    writable: true,
    value: vi.fn(),
  });
}

function restoreObjectUrlApi() {
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

describe('runtime media registry', () => {
  beforeEach(async () => {
    installObjectUrlMocks();
    await db.media.clear();
  });

  afterEach(() => {
    if (activeMediaObjectUrlCount() > 0) revokeAllMediaObjectUrls();
    restoreObjectUrlApi();
    vi.restoreAllMocks();
  });

  it('stores identical content once and resolves a verified asset', async () => {
    const createdAt = new Date('2026-01-01T00:00:00Z');
    const first = await registerMediaBytes(
      'image/png',
      new Uint8Array([1, 2, 3, 4]),
      createdAt,
    );
    const second = await registerMediaBytes(
      'IMAGE/PNG',
      new Uint8Array([1, 2, 3, 4]),
      new Date('2026-02-01T00:00:00Z'),
    );

    expect(second).toBe(first);
    expect(await db.media.count()).toBe(1);
    const asset = await resolveMediaAsset(first);
    expect(asset).toMatchObject({
      hash: first.slice(MEDIA_REFERENCE_PREFIX.length),
      mimeType: 'image/png',
      byteLength: 4,
      createdAt,
    });
    expect([...new Uint8Array(await asset!.data.arrayBuffer())]).toEqual([
      1, 2, 3, 4,
    ]);
  });

  it('keeps identical bytes with different MIME types as different assets', async () => {
    const bytes = new Uint8Array([1, 2, 3]);
    const png = await registerMediaBytes('image/png', bytes);
    const gif = await registerMediaBytes('image/gif', bytes);

    expect(png).not.toBe(gif);
    expect(await db.media.count()).toBe(2);
  });

  it('sanitizes SVG before storing and hashing it', async () => {
    const reference = await registerMediaBytes(
      'image/svg+xml',
      new TextEncoder().encode(`
        <svg xmlns="http://www.w3.org/2000/svg">
          <script>alert(1)</script>
          <rect width="4" height="4" onclick="alert(2)" />
        </svg>
      `),
    );
    const asset = await resolveMediaAsset(reference);
    const source = await asset!.data.text();

    expect(source).toContain('<svg');
    expect(source).toContain('<rect');
    expect(source).not.toMatch(/script|onclick/i);
  });

  it('preflights Blob size and MIME before reading it', async () => {
    const oversized = {
      type: 'image/png',
      size: MEDIA_MAX_SINGLE_BYTES + 1,
      arrayBuffer: vi.fn(async () => new ArrayBuffer(0)),
    } as unknown as Blob;

    await expect(registerMediaBlob(oversized)).rejects.toThrow(/16 MiB/i);
    expect(oversized.arrayBuffer).not.toHaveBeenCalled();
    await expect(
      registerMediaBlob(new Blob(['<html>'], { type: 'text/html' })),
    ).rejects.toThrow(/unsupported/i);
    expect(await db.media.count()).toBe(0);
  });

  it('rejects malformed references and returns null for missing assets', async () => {
    expect(parseMediaReference('https://example.com/image.png')).toBeNull();
    expect(parseMediaReference(null)).toBeNull();
    expect(() =>
      parseMediaReference(`${MEDIA_REFERENCE_PREFIX}not-a-hash`),
    ).toThrow(/malformed/i);

    const missing = createMediaReference('a'.repeat(64));
    await expect(resolveMediaAsset(missing)).resolves.toBeNull();
    await expect(acquireMediaObjectUrl(missing)).resolves.toBeNull();
  });

  it('fails closed when stored bytes no longer match their hash', async () => {
    const reference = await registerMediaBytes(
      'image/png',
      new Uint8Array([1, 2, 3]),
    );
    const hash = reference.slice(MEDIA_REFERENCE_PREFIX.length);
    await db.media.update(hash, {
      data: new Blob([new Uint8Array([9, 9, 9])], { type: 'image/png' }),
    });

    await expect(resolveMediaAsset(reference)).rejects.toThrow(/integrity/i);
    await expect(acquireMediaObjectUrl(reference)).rejects.toThrow(/integrity/i);
  });

  it('reuses object URLs until the final lease is released', async () => {
    const reference = await registerMediaBytes(
      'image/png',
      new Uint8Array([1, 2, 3]),
    );
    const first = await acquireMediaObjectUrl(reference);
    const second = await acquireMediaObjectUrl(reference);

    expect(first?.url).toBe('blob:denki-test-1');
    expect(second?.url).toBe(first?.url);
    expect(URL.createObjectURL).toHaveBeenCalledTimes(1);
    expect(activeMediaObjectUrlCount()).toBe(1);

    first?.release();
    first?.release();
    expect(URL.revokeObjectURL).not.toHaveBeenCalled();
    expect(activeMediaObjectUrlCount()).toBe(1);

    second?.release();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:denki-test-1');
    expect(URL.revokeObjectURL).toHaveBeenCalledTimes(1);
    expect(activeMediaObjectUrlCount()).toBe(0);
  });

  it('revokes all active URLs during library teardown', async () => {
    const firstReference = await registerMediaBytes(
      'image/png',
      new Uint8Array([1]),
    );
    const secondReference = await registerMediaBytes(
      'image/png',
      new Uint8Array([2]),
    );
    await acquireMediaObjectUrl(firstReference);
    await acquireMediaObjectUrl(secondReference);

    revokeAllMediaObjectUrls();

    expect(URL.revokeObjectURL).toHaveBeenCalledTimes(2);
    expect(activeMediaObjectUrlCount()).toBe(0);
  });
});
