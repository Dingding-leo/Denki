import { beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '../../db';
import {
  ANKI_IMPORT_LIMITS,
  collectReferencedAnkiMedia,
  commitAnkiImportPlan,
  createAnkiImportPlan,
  inspectAnkiZipArchive,
  replaceAnkiMediaReferences,
  sanitizeAnkiHtml,
  validateAnkiPackageFile,
  validateAnkiRows,
  type AnkiImportPlan,
} from '../ankiImport';

interface DeclaredZipEntry {
  name: string;
  compressedBytes?: number;
  uncompressedBytes?: number;
  compressionMethod?: number;
  flags?: number;
}

function makeCentralDirectory(entries: readonly DeclaredZipEntry[]): ArrayBuffer {
  const encoder = new TextEncoder();
  const encodedNames = entries.map((entry) => encoder.encode(entry.name));
  const centralBytes = entries.reduce(
    (total, _entry, index) => total + 46 + encodedNames[index].length,
    0,
  );
  const buffer = new ArrayBuffer(centralBytes + 22);
  const view = new DataView(buffer);
  const bytes = new Uint8Array(buffer);
  let cursor = 0;

  entries.forEach((entry, index) => {
    const filename = encodedNames[index];
    const compressedBytes = entry.compressedBytes ?? 16;
    const uncompressedBytes = entry.uncompressedBytes ?? compressedBytes;

    view.setUint32(cursor, 0x02014b50, true);
    view.setUint16(cursor + 4, 20, true);
    view.setUint16(cursor + 6, 20, true);
    view.setUint16(cursor + 8, entry.flags ?? 0, true);
    view.setUint16(cursor + 10, entry.compressionMethod ?? 8, true);
    view.setUint32(cursor + 20, compressedBytes, true);
    view.setUint32(cursor + 24, uncompressedBytes, true);
    view.setUint16(cursor + 28, filename.length, true);
    view.setUint32(cursor + 42, 0, true);
    bytes.set(filename, cursor + 46);
    cursor += 46 + filename.length;
  });

  view.setUint32(cursor, 0x06054b50, true);
  view.setUint16(cursor + 8, entries.length, true);
  view.setUint16(cursor + 10, entries.length, true);
  view.setUint32(cursor + 12, centralBytes, true);
  view.setUint32(cursor + 16, 0, true);
  view.setUint16(cursor + 20, 0, true);
  return buffer;
}

async function seedClass(): Promise<number> {
  return db.classes.add({
    name: 'Imported class',
    description: '',
    createdAt: new Date(),
  });
}

const basePlan: AnkiImportPlan = {
  deckNames: {
    '10': 'Biology::Cell structure',
    '20': 'Default',
  },
  cards: [
    {
      ankiDeckId: '10',
      front: 'What is the powerhouse of the cell?',
      back: 'Mitochondrion',
      cardType: 'standard',
    },
    {
      ankiDeckId: '20',
      front: '{{c1::ATP}} stores chemical energy.',
      back: '',
      cardType: 'cloze',
    },
  ],
};

describe('Anki import helpers', () => {
  beforeEach(async () => {
    await Promise.all([
      db.reviews.clear(),
      db.cards.clear(),
      db.decks.clear(),
      db.classes.clear(),
    ]);
  });

  it('replaces only referenced media, including filenames with regex characters', () => {
    const media = {
      'diagram (1).png': 'data:image/png;base64,diagram',
      'voice[1].mp3': 'data:audio/mpeg;base64,voice',
    };
    const source = [
      '<img src="diagram (1).png">',
      '<img src="missing.png">',
      '![diagram](diagram (1).png)',
      '[sound:voice[1].mp3]',
    ].join(' ');

    const result = replaceAnkiMediaReferences(source, media);

    expect(result).toContain('src="data:image/png;base64,diagram"');
    expect(result).toContain('<img src="missing.png">');
    expect(result).toContain('![diagram](data:image/png;base64,diagram)');
    expect(result).toContain(
      '<audio controls preload="none" src="data:audio/mpeg;base64,voice"',
    );
  });

  it('sanitizes executable and layout-affecting HTML while retaining safe structure', () => {
    const result = sanitizeAnkiHtml(
      '<p style="font-weight: bold">Safe</p><img src="x" onerror="alert(1)"><script>alert(2)</script>',
    );

    expect(result).toContain('<p>Safe</p>');
    expect(result).not.toContain('style=');
    expect(result).not.toContain('onerror');
    expect(result).not.toContain('<script');
  });

  it('identifies direct and URI-encoded media references without selecting unused assets', () => {
    const rows = [[
      '10',
      '<img src="diagram%20(1).png"> [sound:voice[1].mp3]',
    ]];
    const referenced = collectReferencedAnkiMedia(rows, {
      'diagram (1).png': '0',
      'voice[1].mp3': '1',
      'unused.png': '2',
    });

    expect(new Set(referenced)).toEqual(
      new Set(['diagram (1).png', 'voice[1].mp3']),
    );
  });

  it('rejects empty and oversized archive files before reading them', () => {
    expect(() => validateAnkiPackageFile({
      name: 'empty.apkg',
      size: 0,
    })).toThrow(/empty or unreadable/);

    expect(() => validateAnkiPackageFile({
      name: 'huge.apkg',
      size: ANKI_IMPORT_LIMITS.maxArchiveBytes + 1,
    })).toThrow(/safe import limit/);
  });

  it('preflights declared ZIP output sizes before decompression', () => {
    const safe = inspectAnkiZipArchive(makeCentralDirectory([
      {
        name: 'collection.anki2',
        compressedBytes: 1_000,
        uncompressedBytes: 2_000,
      },
      { name: 'media', compressedBytes: 20, uncompressedBytes: 40 },
      { name: '0', compressedBytes: 100, uncompressedBytes: 200 },
    ]));

    expect(safe.entryCount).toBe(3);
    expect(safe.entries['collection.anki2'].uncompressedBytes).toBe(2_000);

    expect(() => inspectAnkiZipArchive(makeCentralDirectory([
      {
        name: 'collection.anki2',
        uncompressedBytes: ANKI_IMPORT_LIMITS.maxDatabaseBytes + 1,
      },
    ]))).toThrow(/collection database is too large/);

    expect(() => inspectAnkiZipArchive(makeCentralDirectory([
      { name: 'collection.anki2' },
      {
        name: '0',
        uncompressedBytes: ANKI_IMPORT_LIMITS.maxSingleMediaBytes + 1,
      },
    ]))).toThrow(/media entry 0 is too large/);
  });

  it('rejects encrypted, unsupported, duplicate, and ZIP64 metadata', () => {
    expect(() => inspectAnkiZipArchive(makeCentralDirectory([
      { name: 'collection.anki2', flags: 1 },
    ]))).toThrow(/Encrypted/);

    expect(() => inspectAnkiZipArchive(makeCentralDirectory([
      { name: 'collection.anki2', compressionMethod: 99 },
    ]))).toThrow(/unsupported compression/);

    expect(() => inspectAnkiZipArchive(makeCentralDirectory([
      { name: 'collection.anki2' },
      { name: 'collection.anki2' },
    ]))).toThrow(/duplicate path/);

    const zip64 = makeCentralDirectory([{ name: 'collection.anki2' }]);
    const zip64View = new DataView(zip64);
    zip64View.setUint16(zip64.byteLength - 14, 0xffff, true);
    zip64View.setUint16(zip64.byteLength - 12, 0xffff, true);
    expect(() => inspectAnkiZipArchive(zip64)).toThrow(/ZIP64/);
  });

  it('rejects pathological card counts and field sizes before planning', () => {
    const tooManyRows = Array.from(
      { length: ANKI_IMPORT_LIMITS.maxCards + 1 },
      () => ['1', 'Q\x1fA'],
    );
    expect(() => validateAnkiRows(tooManyRows)).toThrow(/safe import limit/);

    expect(() => validateAnkiRows([[
      '1',
      'x'.repeat(ANKI_IMPORT_LIMITS.maxFieldChars + 1),
    ]])).toThrow(/unusually large note/);
  });

  it('preserves all answer fields and detects cloze cards when building a plan', () => {
    const plan = createAnkiImportPlan(
      { '10': 'Biology::Cells' },
      [['10', '{{c1::ATP}}\x1fEnergy currency\x1fMade in mitochondria']],
      {},
    );

    expect(plan.cards).toHaveLength(1);
    expect(plan.cards[0]).toMatchObject({
      ankiDeckId: '10',
      cardType: 'cloze',
      back: 'Energy currency<br>Made in mitochondria',
    });
  });

  it('does not import standard cards with an empty answer', () => {
    const plan = createAnkiImportPlan(
      { '10': 'Incomplete' },
      [['10', 'Question only']],
      {},
    );

    expect(plan.cards).toEqual([]);
  });

  it('commits decks and cards together, preserving nested names and used Default decks', async () => {
    const classId = await seedClass();

    const result = await commitAnkiImportPlan(classId, basePlan);
    const decks = await db.decks.orderBy('id').toArray();
    const cards = await db.cards.orderBy('id').toArray();

    expect(result).toEqual({ decksCreated: 2, cardsImported: 2 });
    expect(decks.map((deck) => deck.name)).toEqual([
      'Biology › Cell structure',
      'Default',
    ]);
    expect(cards).toHaveLength(2);
    expect(cards[0].deckId).toBe(decks[0].id);
    expect(cards[1].deckId).toBe(decks[1].id);
    expect(
      cards.every(
        (card) => card.createdAt instanceof Date && card.due instanceof Date,
      ),
    ).toBe(true);
    expect(cards.every((card) => card.state === 0)).toBe(true);
  });

  it('refuses to create imported rows when the destination class disappeared', async () => {
    await expect(commitAnkiImportPlan(999, basePlan)).rejects.toThrow(
      /destination class no longer exists/,
    );
    expect(await db.decks.count()).toBe(0);
    expect(await db.cards.count()).toBe(0);
  });

  it('routes unknown source deck ids into one explicit fallback deck', async () => {
    const classId = await seedClass();
    const plan: AnkiImportPlan = {
      deckNames: { '10': 'Known' },
      cards: [
        { ankiDeckId: '404', front: 'A', back: 'B', cardType: 'standard' },
        { ankiDeckId: '405', front: 'C', back: 'D', cardType: 'standard' },
      ],
    };

    await commitAnkiImportPlan(classId, plan);
    const decks = await db.decks.toArray();
    const cards = await db.cards.toArray();

    expect(decks).toHaveLength(1);
    expect(decks[0].name).toBe('Anki Import');
    expect(new Set(cards.map((card) => card.deckId))).toEqual(
      new Set([decks[0].id]),
    );
  });

  it('rolls back decks when card persistence fails', async () => {
    const classId = await seedClass();
    const bulkAdd = vi
      .spyOn(db.cards, 'bulkAdd')
      .mockRejectedValueOnce(new Error('quota exceeded'));

    await expect(commitAnkiImportPlan(classId, basePlan)).rejects.toThrow(
      'quota exceeded',
    );

    expect(await db.decks.count()).toBe(0);
    expect(await db.cards.count()).toBe(0);
    bulkAdd.mockRestore();
  });

  it('rejects empty packages before writing anything', async () => {
    const classId = await seedClass();

    await expect(
      commitAnkiImportPlan(classId, { deckNames: {}, cards: [] }),
    ).rejects.toThrow('No importable flashcards');
    expect(await db.decks.count()).toBe(0);
  });
});
