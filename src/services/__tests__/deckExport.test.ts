import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '../../db';
import {
  buildDeckCsv,
  buildPortableDeckCsv,
} from '../deckExport';
import {
  MEDIA_REFERENCE_PREFIX,
  registerMediaBytes,
} from '../mediaRegistry';

describe('buildDeckCsv', () => {
  beforeEach(async () => {
    await db.media.clear();
  });

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
    expect(buildDeckCsv([
      { front: 'Q', back: 'A', cardType: 'standard' },
    ]).split('\n')[1]).toBe('Q,A,standard');
  });

  it('neutralizes spreadsheet formula injection on export', () => {
    const csv = buildDeckCsv([
      {
        front: '=HYPERLINK("https://evil","x")',
        back: 'A',
        cardType: 'standard',
      },
      { front: 'Q', back: '@cmd', cardType: 'standard' },
      { front: '+1+2', back: '-3', cardType: 'standard' },
    ]);
    const rows = csv.split('\n').slice(1);
    // The leading ' prefix (the formula neutralizer) must survive quoting.
    expect(rows[0]).toBe(
      '"\'=HYPERLINK(""https://evil"",""x"")",A,standard',
    );
    expect(rows[1]).toBe('Q,\'@cmd,standard');
    expect(rows[2]).toBe("'+1+2,'-3,standard");
    // Every dangerous formula prefix was neutralized with a leading quote.
    for (const row of rows) {
      expect(row).not.toMatch(/^[=+\-@]/);
    }
  });

  it('returns the same CSV when no runtime media is referenced', async () => {
    const cards = [{ front: 'Q', back: 'A', cardType: 'standard' }];
    await expect(buildPortableDeckCsv(cards)).resolves.toBe(
      buildDeckCsv(cards),
    );
  });

  it('re-embeds verified registry media so the CSV is self-contained', async () => {
    const reference = await registerMediaBytes(
      'image/png',
      new Uint8Array([1, 2, 3, 4]),
    );
    const dataUrl = `data:image/png;base64,${btoa(
      String.fromCharCode(1, 2, 3, 4),
    )}`;

    const csv = await buildPortableDeckCsv([
      {
        front: `<img src="${reference}" alt="diagram">`,
        back: `![diagram](${reference})`,
        cardType: 'standard',
      },
    ]);

    expect(csv).not.toContain(MEDIA_REFERENCE_PREFIX);
    expect(csv.split(dataUrl)).toHaveLength(3);
  });

  it('fails before download when referenced registry media is missing', async () => {
    const missing = `${MEDIA_REFERENCE_PREFIX}${'a'.repeat(64)}`;

    await expect(buildPortableDeckCsv([
      {
        front: `<img src="${missing}">`,
        back: 'A',
        cardType: 'standard',
      },
    ])).rejects.toThrow(/missing registry media/i);
  });

  it('fails closed when a registry object no longer matches its hash', async () => {
    const reference = await registerMediaBytes(
      'image/png',
      new Uint8Array([1, 2, 3]),
    );
    const hash = reference.slice(MEDIA_REFERENCE_PREFIX.length);
    await db.media.update(hash, {
      data: new Uint8Array([9, 9, 9]).buffer,
    });

    await expect(buildPortableDeckCsv([
      {
        front: `<img src="${reference}">`,
        back: 'A',
        cardType: 'standard',
      },
    ])).rejects.toThrow(/integrity/i);
  });

  it('rejects a valid hash prefix embedded in a longer custom URL', async () => {
    const reference = await registerMediaBytes(
      'image/png',
      new Uint8Array([1, 2, 3]),
    );

    await expect(buildPortableDeckCsv([
      {
        front: `<img src="${reference}suffix">`,
        back: 'A',
        cardType: 'standard',
      },
    ])).rejects.toThrow(/malformed runtime registry reference/i);
  });
});
