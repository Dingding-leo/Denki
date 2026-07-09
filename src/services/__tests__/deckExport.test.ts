import { describe, it, expect } from 'vitest';
import { buildDeckCsv } from '../deckExport';

describe('buildDeckCsv', () => {
  it('emits a Front,Back,Type header', () => {
    expect(buildDeckCsv([]).split('\n')[0]).toBe('Front,Back,Type');
  });

  it('quotes fields containing commas, quotes, or newlines (RFC 4180)', () => {
    const csv = buildDeckCsv([
      { front: 'a,b', back: 'he said "hi"', cardType: 'standard' },
      { front: 'line1\nline2', back: 'plain', cardType: 'cloze' },
    ]);
    expect(csv.split('\n')[1]).toBe('"a,b","he said ""hi""",standard');
    expect(csv).toContain('"line1\nline2",plain,cloze');
  });

  it('leaves plain fields unquoted', () => {
    expect(buildDeckCsv([{ front: 'Q', back: 'A', cardType: 'standard' }]).split('\n')[1]).toBe('Q,A,standard');
  });
});
