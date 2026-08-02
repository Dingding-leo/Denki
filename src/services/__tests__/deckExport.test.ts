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

  it('neutralizes spreadsheet formula injection on export', () => {
    const csv = buildDeckCsv([
      { front: '=HYPERLINK("https://evil","x")', back: 'A', cardType: 'standard' },
      { front: 'Q', back: '@cmd', cardType: 'standard' },
      { front: '+1+2', back: '-3', cardType: 'standard' },
    ]);
    const rows = csv.split('\n').slice(1);
    // The leading ' prefix (the formula neutralizer) must survive quoting.
    expect(rows[0]).toBe('"\'=HYPERLINK(""https://evil"",""x"")",A,standard');
    expect(rows[1]).toBe('Q,\'@cmd,standard');
    expect(rows[2]).toBe("'+1+2,'-3,standard");
    // Every dangerous formula prefix was neutralized with a leading quote.
    for (const row of rows) {
      expect(row).not.toMatch(/^[=+\-@]/);
    }
  });
});
