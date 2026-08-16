import type { CardType } from '../db/schema';

export interface CSVCardDraft {
  front: string;
  back: string;
  cardType: CardType;
}

export interface CSVImportPlan {
  cards: CSVCardDraft[];
  failed: number;
}

export class CSVParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CSVParseError';
  }
}

/**
 * RFC-4180-style parser for Denki's existing Front,Back,Type import format.
 * Supports UTF-8 BOMs, CRLF, commas/newlines inside quoted fields, and escaped
 * double quotes. A malformed unclosed quote is rejected instead of partially
 * importing whatever happened to parse before the error.
 */
export function parseCSVRows(input: string): string[][] {
  const text = String(input ?? '').replace(/^\uFEFF/, '');
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let insideQuote = false;

  const finishField = () => {
    row.push(field.trim());
    field = '';
  };

  const finishRow = () => {
    finishField();
    if (row.some((cell) => cell.length > 0)) rows.push(row);
    row = [];
  };

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const next = text[index + 1];

    if (char === '"') {
      if (insideQuote && next === '"') {
        field += '"';
        index += 1;
      } else if (insideQuote) {
        insideQuote = false;
      } else if (field.trim().length === 0) {
        field = '';
        insideQuote = true;
      } else {
        // A quote in the middle of an unquoted field is literal text.
        field += char;
      }
      continue;
    }

    if (char === ',' && !insideQuote) {
      finishField();
      continue;
    }

    if ((char === '\r' || char === '\n') && !insideQuote) {
      if (char === '\r' && next === '\n') index += 1;
      finishRow();
      continue;
    }

    field += char;
  }

  if (insideQuote) {
    throw new CSVParseError('The CSV contains an unclosed quoted field. Check the final row and try again.');
  }

  if (field.length > 0 || row.length > 0) finishRow();
  return rows;
}

const stripFormulaNeutralizer = (value: string): string =>
  /^'[=+\-@]/.test(value) ? value.slice(1) : value;

export function createCSVImportPlan(text: string): CSVImportPlan {
  const rows = parseCSVRows(text);
  if (rows.length === 0) return { cards: [], failed: 0 };

  const first = rows[0];
  const hasHeader =
    first.length >= 2 &&
    first[0].trim().toLowerCase() === 'front' &&
    first[1].trim().toLowerCase() === 'back';
  const dataRows = hasHeader ? rows.slice(1) : rows;

  const cards: CSVCardDraft[] = [];
  let failed = 0;

  for (const row of dataRows) {
    if (row.length < 2) {
      failed += 1;
      continue;
    }

    const front = stripFormulaNeutralizer(row[0].trim());
    const back = stripFormulaNeutralizer(row[1].trim());
    const rawType = row[2]?.trim().toLowerCase();

    if (!front || !back) {
      failed += 1;
      continue;
    }

    const cardType: CardType =
      rawType === 'cloze' || /\{\{c\d+::/.test(front)
        ? 'cloze'
        : 'standard';

    cards.push({ front, back, cardType });
  }

  return { cards, failed };
}
