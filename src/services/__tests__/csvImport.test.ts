import { describe, expect, it } from 'vitest';
import { createCSVImportPlan, CSVParseError, parseCSVRows } from '../csvImport';

describe('CSV import parsing', () => {
  it('handles a BOM, CRLF, quoted commas, quoted newlines, and escaped quotes', () => {
    const rows = parseCSVRows(
      '\uFEFFFront,Back,Type\r\n' +
        '"Question, with comma","Line one\nLine two",standard\r\n' +
        '"He said ""hello""",Answer,cloze',
    );

    expect(rows).toEqual([
      ['Front', 'Back', 'Type'],
      ['Question, with comma', 'Line one\nLine two', 'standard'],
      ['He said "hello"', 'Answer', 'cloze'],
    ]);
  });

  it('rejects an unclosed quoted field instead of returning a partial file', () => {
    expect(() => parseCSVRows('Front,Back\n"unfinished,answer')).toThrow(CSVParseError);
  });

  it('skips the optional header and reports invalid rows without losing valid ones', () => {
    const plan = createCSVImportPlan(
      'Front,Back,Type\nQ1,A1\nmissing-back,\nonly-one-column\nThe {{c2::cat}} sat,hint',
    );

    expect(plan.failed).toBe(2);
    expect(plan.cards).toEqual([
      { front: 'Q1', back: 'A1', cardType: 'standard' },
      { front: 'The {{c2::cat}} sat', back: 'hint', cardType: 'cloze' },
    ]);
  });

  it('reverses Denki export formula neutralization without touching ordinary apostrophes', () => {
    const plan = createCSVImportPlan(
      "'- bullet,A\n'+2+2,B\n'@mention,C\n'ordinary apostrophe,D",
    );

    expect(plan.cards.map((card) => card.front)).toEqual([
      '- bullet',
      '+2+2',
      '@mention',
      "'ordinary apostrophe",
    ]);
  });
});
