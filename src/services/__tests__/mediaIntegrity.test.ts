import { describe, expect, it } from 'vitest';
import {
  MEDIA_MAX_SINGLE_BYTES,
  hashMediaBytes,
  normalizeMediaBytes,
  normalizeMediaMimeType,
} from '../mediaIntegrity';

describe('media integrity', () => {
  it('normalizes supported MIME types and rejects unsupported types', () => {
    expect(normalizeMediaMimeType(' Image/PNG ')).toBe('image/png');
    expect(() => normalizeMediaMimeType('text/html')).toThrow(/unsupported/i);
    expect(() => normalizeMediaMimeType(undefined)).toThrow(/missing|invalid/i);
  });

  it('hashes MIME type and bytes, keeping different MIME identities separate', async () => {
    const bytes = new Uint8Array([1, 2, 3, 4]);
    const first = await hashMediaBytes('image/png', bytes);
    const second = await hashMediaBytes('IMAGE/PNG', bytes);
    const differentType = await hashMediaBytes('image/gif', bytes);

    expect(first).toMatch(/^[a-f0-9]{64}$/);
    expect(second).toBe(first);
    expect(differentType).not.toBe(first);
  });

  it('copies ordinary bytes so callers cannot mutate stored input indirectly', () => {
    const input = new Uint8Array([1, 2, 3]);
    const normalized = normalizeMediaBytes('image/png', input);
    input[0] = 9;
    expect([...normalized.bytes]).toEqual([1, 2, 3]);
  });

  it('sanitizes SVG before hashing or persistence', () => {
    const source = `
      <svg xmlns="http://www.w3.org/2000/svg">
        <script>alert(1)</script>
        <foreignObject><iframe src="https://example.com"></iframe></foreignObject>
        <rect width="10" height="10" onclick="alert(2)" style="fill:red" />
      </svg>
    `;
    const normalized = normalizeMediaBytes(
      'image/svg+xml',
      new TextEncoder().encode(source),
    );
    const output = new TextDecoder().decode(normalized.bytes);

    expect(output).toContain('<svg');
    expect(output).toContain('<rect');
    expect(output).not.toMatch(/script|foreignObject|iframe|onclick|style=/i);
  });

  it('rejects empty and oversized media before hashing', () => {
    expect(() => normalizeMediaBytes('image/png', new Uint8Array())).toThrow(
      /empty|byte length/i,
    );
    expect(() =>
      normalizeMediaBytes(
        'image/png',
        new Uint8Array(MEDIA_MAX_SINGLE_BYTES + 1),
      ),
    ).toThrow(/16 MiB/i);
  });
});
