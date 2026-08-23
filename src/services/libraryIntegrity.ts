import { isValidSchedulerVersion } from '../domain/schedulerProvenance';
import { db } from '../db';
import type { Card, Class, Deck, ReviewLog } from '../db/schema';
import { findRuntimeRegistryReferences } from './backupRegistryReferences';
import { withExclusiveMaintenanceLock } from './maintenanceLock';
import {
  createMediaReference,
  resolveMediaAsset,
} from './mediaRegistry';

const MEBIBYTE = 1024 * 1024;
const MAX_CLASSES = 10_000;
const MAX_DECKS = 50_000;
const MAX_CARDS = 250_000;
const MAX_REVIEWS = 2_000_000;
const MAX_MEDIA_OBJECTS = 5_000;
const MAX_TOTAL_TEXT_CHARACTERS = 96 * MEBIBYTE;
const MAX_DEEP_MEDIA_BYTES = 512 * MEBIBYTE;
const MAX_REFERENCES_PER_FIELD = 256;
const MAX_RECORDED_ISSUES = 200;
const PROGRESS_INTERVAL = 250;
const MEDIA_PROGRESS_INTERVAL = 10;

export type LibraryIntegritySeverity = 'error' | 'warning';

export type LibraryIntegrityIssueCode =
  | 'invalid-class'
  | 'invalid-deck'
  | 'orphan-deck'
  | 'invalid-card'
  | 'orphan-card'
  | 'card-owner-mismatch'
  | 'invalid-card-provenance'
  | 'invalid-review'
  | 'orphan-review'
  | 'review-owner-mismatch'
  | 'invalid-review-provenance'
  | 'malformed-media-reference'
  | 'too-many-media-references'
  | 'missing-media'
  | 'corrupt-media'
  | 'unreferenced-media';

export type LibraryIntegrityEntity =
  | 'class'
  | 'deck'
  | 'card'
  | 'review'
  | 'media'
  | 'library';

export interface LibraryIntegrityIssue {
  code: LibraryIntegrityIssueCode;
  severity: LibraryIntegritySeverity;
  entity: LibraryIntegrityEntity;
  entityId: string | null;
  message: string;
}

export type LibraryIntegrityPhase =
  | 'preflight'
  | 'classes'
  | 'decks'
  | 'cards'
  | 'reviews'
  | 'media'
  | 'complete';

export interface LibraryIntegrityProgress {
  phase: LibraryIntegrityPhase;
  processed: number;
  total: number;
  issueCount: number;
}

export interface LibraryIntegrityResult {
  capturedAt: string;
  complete: boolean;
  stopped: boolean;
  healthy: boolean;
  errorCount: number;
  warningCount: number;
  issueCount: number;
  issuesTruncated: boolean;
  issues: readonly LibraryIntegrityIssue[];
  issueCounts: Readonly<Partial<Record<LibraryIntegrityIssueCode, number>>>;
  scanned: {
    classes: number;
    decks: number;
    cards: number;
    reviews: number;
    media: number;
    verifiedMediaBytes: number;
    registryReferences: number;
  };
  unreferencedMedia: {
    objects: number;
    bytes: number;
  };
}

export interface LibraryIntegrityAuditOptions {
  signal?: AbortSignal;
  onProgress?: (progress: LibraryIntegrityProgress) => void;
}

interface AuditState {
  issues: LibraryIntegrityIssue[];
  issueCounts: Partial<Record<LibraryIntegrityIssueCode, number>>;
  issueCount: number;
  errorCount: number;
  warningCount: number;
  issuesTruncated: boolean;
  scanned: LibraryIntegrityResult['scanned'];
  unreferencedMedia: LibraryIntegrityResult['unreferencedMedia'];
}

interface AuditRuntimeOptions extends LibraryIntegrityAuditOptions {
  assertOwned(): Promise<void>;
}

export class LibraryIntegrityBudgetError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'LibraryIntegrityBudgetError';
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function isPositiveInteger(value: unknown): value is number {
  return Number.isSafeInteger(value) && Number(value) > 0;
}

function isFiniteNonNegative(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}

function isValidDate(value: unknown): value is Date {
  return value instanceof Date && Number.isFinite(value.getTime());
}

function isOptionalValidDate(value: unknown): boolean {
  return value === undefined || value === null || isValidDate(value);
}

function isOptionalRating(value: unknown): boolean {
  return (
    value === undefined ||
    value === null ||
    (Number.isInteger(value) && Number(value) >= 1 && Number(value) <= 5)
  );
}

function entityId(value: unknown): string | null {
  return isPositiveInteger(value) ? String(value) : null;
}

function abortReason(signal: AbortSignal): Error {
  return signal.reason instanceof Error
    ? signal.reason
    : new DOMException('The integrity check was stopped.', 'AbortError');
}

function throwIfAborted(signal: AbortSignal): void {
  if (signal.aborted) throw abortReason(signal);
}

function hasAbortName(value: unknown): boolean {
  return (
    !!value &&
    typeof value === 'object' &&
    'name' in value &&
    value.name === 'AbortError'
  );
}

function isUserAbort(error: unknown, signal: AbortSignal): boolean {
  // IndexedDB and fake-indexeddb may surface a DOMException from a
  // different realm, where `instanceof DOMException` is false.
  return hasAbortName(error) || hasAbortName(signal.reason);
}

function emitProgress(
  state: AuditState,
  options: AuditRuntimeOptions,
  phase: LibraryIntegrityPhase,
  processed: number,
  total: number,
  force = false,
): void {
  if (
    !force &&
    processed !== total &&
    processed % PROGRESS_INTERVAL !== 0
  ) {
    return;
  }
  options.onProgress?.({
    phase,
    processed,
    total,
    issueCount: state.issueCount,
  });
}

function addIssue(
  state: AuditState,
  issue: LibraryIntegrityIssue,
): void {
  state.issueCount += 1;
  if (issue.severity === 'error') state.errorCount += 1;
  else state.warningCount += 1;
  state.issueCounts[issue.code] = (state.issueCounts[issue.code] ?? 0) + 1;

  if (state.issues.length < MAX_RECORDED_ISSUES) {
    state.issues.push(issue);
  } else {
    state.issuesTruncated = true;
  }
}

function assertCountBudget(
  label: string,
  count: number,
  maximum: number,
): void {
  if (count > maximum) {
    throw new LibraryIntegrityBudgetError(
      `The integrity check supports at most ${maximum.toLocaleString()} ${label}; this library contains ${count.toLocaleString()}. Export a backup and inspect the library with a dedicated offline tool.`,
    );
  }
}

function createInitialState(): AuditState {
  return {
    issues: [],
    issueCounts: {},
    issueCount: 0,
    errorCount: 0,
    warningCount: 0,
    issuesTruncated: false,
    scanned: {
      classes: 0,
      decks: 0,
      cards: 0,
      reviews: 0,
      media: 0,
      verifiedMediaBytes: 0,
      registryReferences: 0,
    },
    unreferencedMedia: {
      objects: 0,
      bytes: 0,
    },
  };
}

function finishResult(
  state: AuditState,
  complete: boolean,
  stopped: boolean,
): LibraryIntegrityResult {
  return {
    capturedAt: new Date().toISOString(),
    complete,
    stopped,
    healthy: complete && state.errorCount === 0,
    errorCount: state.errorCount,
    warningCount: state.warningCount,
    issueCount: state.issueCount,
    issuesTruncated: state.issuesTruncated,
    issues: Object.freeze([...state.issues]),
    issueCounts: Object.freeze({ ...state.issueCounts }),
    scanned: { ...state.scanned },
    unreferencedMedia: { ...state.unreferencedMedia },
  };
}

function validateClass(
  value: Class,
  state: AuditState,
): void {
  const row = value as unknown;
  const record = isRecord(row) ? row : {};
  if (
    !isPositiveInteger(record.id) ||
    typeof record.name !== 'string' ||
    typeof record.description !== 'string' ||
    !isValidDate(record.createdAt)
  ) {
    addIssue(state, {
      code: 'invalid-class',
      severity: 'error',
      entity: 'class',
      entityId: entityId(record.id),
      message: 'Class metadata is malformed or missing a valid identifier/date.',
    });
  }
}

function validateDeck(
  value: Deck,
  classIds: ReadonlySet<number>,
  state: AuditState,
): void {
  const row = value as unknown;
  const record = isRecord(row) ? row : {};
  const id = entityId(record.id);
  if (
    !isPositiveInteger(record.id) ||
    !isPositiveInteger(record.classId) ||
    typeof record.name !== 'string' ||
    typeof record.description !== 'string' ||
    (record.notes !== undefined && typeof record.notes !== 'string') ||
    !isValidDate(record.createdAt)
  ) {
    addIssue(state, {
      code: 'invalid-deck',
      severity: 'error',
      entity: 'deck',
      entityId: id,
      message: 'Deck metadata is malformed or missing a valid identifier/date.',
    });
  }
  if (
    isPositiveInteger(record.classId) &&
    !classIds.has(record.classId)
  ) {
    addIssue(state, {
      code: 'orphan-deck',
      severity: 'error',
      entity: 'deck',
      entityId: id,
      message: `Deck references missing class ${record.classId}.`,
    });
  }
}

function validateCardShape(value: Card): boolean {
  const row = value as unknown;
  if (!isRecord(row)) return false;
  return (
    isPositiveInteger(row.id) &&
    isPositiveInteger(row.classId) &&
    isPositiveInteger(row.deckId) &&
    typeof row.front === 'string' &&
    typeof row.back === 'string' &&
    (row.cardType === 'standard' || row.cardType === 'cloze') &&
    isValidDate(row.createdAt) &&
    Number.isInteger(row.state) &&
    Number(row.state) >= 0 &&
    Number(row.state) <= 3 &&
    isFiniteNonNegative(row.stability) &&
    isFiniteNonNegative(row.difficulty) &&
    isFiniteNonNegative(row.elapsedDays) &&
    isFiniteNonNegative(row.scheduledDays) &&
    isValidDate(row.due) &&
    isOptionalValidDate(row.lastReviewed) &&
    isOptionalRating(row.lastRating)
  );
}

function validateReviewShape(value: ReviewLog): boolean {
  const row = value as unknown;
  if (!isRecord(row)) return false;
  return (
    isPositiveInteger(row.id) &&
    isPositiveInteger(row.cardId) &&
    isPositiveInteger(row.classId) &&
    isPositiveInteger(row.deckId) &&
    isValidDate(row.reviewedAt) &&
    Number.isInteger(row.rating) &&
    Number(row.rating) >= 1 &&
    Number(row.rating) <= 5 &&
    isFiniteNonNegative(row.stability) &&
    isFiniteNonNegative(row.difficulty) &&
    isFiniteNonNegative(row.elapsedDays) &&
    isFiniteNonNegative(row.scheduledDays)
  );
}

function scanTextReferences(
  text: unknown,
  entity: 'deck' | 'card',
  id: string | null,
  field: string,
  referencedHashes: Set<string>,
  state: AuditState,
  textBudget: { characters: number },
): void {
  if (typeof text !== 'string') return;
  textBudget.characters += text.length;
  if (textBudget.characters > MAX_TOTAL_TEXT_CHARACTERS) {
    throw new LibraryIntegrityBudgetError(
      `The library contains more than ${MAX_TOTAL_TEXT_CHARACTERS.toLocaleString()} text characters, exceeding the bounded integrity-check budget.`,
    );
  }

  let matches;
  try {
    matches = findRuntimeRegistryReferences(text);
  } catch {
    addIssue(state, {
      code: 'malformed-media-reference',
      severity: 'error',
      entity,
      entityId: id,
      message: `${field} contains a malformed Denki media reference.`,
    });
    return;
  }

  if (matches.length > MAX_REFERENCES_PER_FIELD) {
    addIssue(state, {
      code: 'too-many-media-references',
      severity: 'error',
      entity,
      entityId: id,
      message: `${field} contains ${matches.length.toLocaleString()} media references; the supported per-field maximum is ${MAX_REFERENCES_PER_FIELD}.`,
    });
  }

  for (const match of matches.slice(0, MAX_REFERENCES_PER_FIELD)) {
    referencedHashes.add(match.hash);
    state.scanned.registryReferences += 1;
  }
  if (referencedHashes.size > MAX_MEDIA_OBJECTS) {
    throw new LibraryIntegrityBudgetError(
      `The library references more than ${MAX_MEDIA_OBJECTS.toLocaleString()} unique media objects.`,
    );
  }
}

async function runAudit(
  options: AuditRuntimeOptions,
): Promise<LibraryIntegrityResult> {
  const state = createInitialState();
  const signal = options.signal ?? new AbortController().signal;
  const classIds = new Set<number>();
  const deckClassById = new Map<number, number>();
  const cardOwnerById = new Map<number, { classId: number; deckId: number }>();
  const referencedHashes = new Set<string>();
  const textBudget = { characters: 0 };

  try {
    throwIfAborted(signal);
    await options.assertOwned();
    const totals = {
      classes: await db.classes.count(),
      decks: await db.decks.count(),
      cards: await db.cards.count(),
      reviews: await db.reviews.count(),
      media: await db.media.count(),
    };
    assertCountBudget('classes', totals.classes, MAX_CLASSES);
    assertCountBudget('decks', totals.decks, MAX_DECKS);
    assertCountBudget('cards', totals.cards, MAX_CARDS);
    assertCountBudget('reviews', totals.reviews, MAX_REVIEWS);
    assertCountBudget('media objects', totals.media, MAX_MEDIA_OBJECTS);
    emitProgress(state, options, 'preflight', 1, 1, true);

    await db.classes.toCollection().each((studyClass) => {
      throwIfAborted(signal);
      validateClass(studyClass, state);
      if (isPositiveInteger(studyClass.id)) classIds.add(studyClass.id);
      state.scanned.classes += 1;
      emitProgress(
        state,
        options,
        'classes',
        state.scanned.classes,
        totals.classes,
      );
    });
    emitProgress(state, options, 'classes', totals.classes, totals.classes, true);
    await options.assertOwned();

    await db.decks.toCollection().each((deck) => {
      throwIfAborted(signal);
      validateDeck(deck, classIds, state);
      if (isPositiveInteger(deck.id) && isPositiveInteger(deck.classId)) {
        deckClassById.set(deck.id, deck.classId);
      }
      scanTextReferences(
        deck.notes ?? '',
        'deck',
        entityId(deck.id),
        'Deck notes',
        referencedHashes,
        state,
        textBudget,
      );
      state.scanned.decks += 1;
      emitProgress(
        state,
        options,
        'decks',
        state.scanned.decks,
        totals.decks,
      );
    });
    emitProgress(state, options, 'decks', totals.decks, totals.decks, true);
    await options.assertOwned();

    await db.cards.toCollection().each((card) => {
      throwIfAborted(signal);
      const id = entityId(card.id);
      if (!validateCardShape(card)) {
        addIssue(state, {
          code: 'invalid-card',
          severity: 'error',
          entity: 'card',
          entityId: id,
          message: 'Card fields contain invalid identifiers, dates, state, or scheduling values.',
        });
      }
      if (!isValidSchedulerVersion(card.schedulerVersion)) {
        addIssue(state, {
          code: 'invalid-card-provenance',
          severity: 'error',
          entity: 'card',
          entityId: id,
          message: 'Card scheduler provenance is missing or malformed.',
        });
      }

      const deckClass = isPositiveInteger(card.deckId)
        ? deckClassById.get(card.deckId)
        : undefined;
      if (
        !isPositiveInteger(card.classId) ||
        !classIds.has(card.classId) ||
        deckClass === undefined
      ) {
        addIssue(state, {
          code: 'orphan-card',
          severity: 'error',
          entity: 'card',
          entityId: id,
          message: 'Card references a missing class or deck.',
        });
      } else if (deckClass !== card.classId) {
        addIssue(state, {
          code: 'card-owner-mismatch',
          severity: 'error',
          entity: 'card',
          entityId: id,
          message: `Card class ${card.classId} does not match deck class ${deckClass}.`,
        });
      }

      if (
        isPositiveInteger(card.id) &&
        isPositiveInteger(card.classId) &&
        isPositiveInteger(card.deckId)
      ) {
        cardOwnerById.set(card.id, {
          classId: card.classId,
          deckId: card.deckId,
        });
      }
      scanTextReferences(
        card.front,
        'card',
        id,
        'Card front',
        referencedHashes,
        state,
        textBudget,
      );
      scanTextReferences(
        card.back,
        'card',
        id,
        'Card back',
        referencedHashes,
        state,
        textBudget,
      );
      state.scanned.cards += 1;
      emitProgress(
        state,
        options,
        'cards',
        state.scanned.cards,
        totals.cards,
      );
    });
    emitProgress(state, options, 'cards', totals.cards, totals.cards, true);
    await options.assertOwned();

    await db.reviews.toCollection().each((review) => {
      throwIfAborted(signal);
      const id = entityId(review.id);
      if (!validateReviewShape(review)) {
        addIssue(state, {
          code: 'invalid-review',
          severity: 'error',
          entity: 'review',
          entityId: id,
          message: 'Review log contains invalid identifiers, dates, rating, or scheduling values.',
        });
      }
      if (!isValidSchedulerVersion(review.schedulerVersion)) {
        addIssue(state, {
          code: 'invalid-review-provenance',
          severity: 'error',
          entity: 'review',
          entityId: id,
          message: 'Review scheduler provenance is missing or malformed.',
        });
      }

      const owner = isPositiveInteger(review.cardId)
        ? cardOwnerById.get(review.cardId)
        : undefined;
      if (!owner) {
        addIssue(state, {
          code: 'orphan-review',
          severity: 'error',
          entity: 'review',
          entityId: id,
          message: `Review references missing card ${String(review.cardId)}.`,
        });
      } else if (
        owner.classId !== review.classId ||
        owner.deckId !== review.deckId
      ) {
        addIssue(state, {
          code: 'review-owner-mismatch',
          severity: 'error',
          entity: 'review',
          entityId: id,
          message: 'Review class/deck ownership does not match its card.',
        });
      }

      state.scanned.reviews += 1;
      emitProgress(
        state,
        options,
        'reviews',
        state.scanned.reviews,
        totals.reviews,
      );
    });
    emitProgress(state, options, 'reviews', totals.reviews, totals.reviews, true);
    await options.assertOwned();

    let declaredMediaBytes = 0;
    await db.media.orderBy('byteLength').eachKey((key) => {
      if (typeof key === 'number' && Number.isSafeInteger(key) && key > 0) {
        declaredMediaBytes += key;
      }
    });
    if (declaredMediaBytes > MAX_DEEP_MEDIA_BYTES) {
      throw new LibraryIntegrityBudgetError(
        `Deep media verification is limited to ${MAX_DEEP_MEDIA_BYTES / MEBIBYTE} MiB per run; indexed media metadata totals ${(declaredMediaBytes / MEBIBYTE).toFixed(1)} MiB.`,
      );
    }

    const rawMediaKeys = await db.media.toCollection().primaryKeys();
    const mediaHashes = new Set<string>();
    for (const key of rawMediaKeys) {
      if (typeof key === 'string') mediaHashes.add(key);
      else {
        addIssue(state, {
          code: 'corrupt-media',
          severity: 'error',
          entity: 'media',
          entityId: String(key),
          message: 'Media registry contains a non-string primary key.',
        });
      }
    }

    for (const hash of referencedHashes) {
      if (!mediaHashes.has(hash)) {
        addIssue(state, {
          code: 'missing-media',
          severity: 'error',
          entity: 'media',
          entityId: hash,
          message: `Library content references missing registry media ${hash}.`,
        });
      }
    }

    let mediaIndex = 0;
    for (const hash of mediaHashes) {
      throwIfAborted(signal);
      if (mediaIndex % MEDIA_PROGRESS_INTERVAL === 0) {
        await options.assertOwned();
      }

      try {
        const resolved = await resolveMediaAsset(createMediaReference(hash));
        if (!resolved) {
          throw new Error('Registry row disappeared during the integrity check.');
        }
        state.scanned.verifiedMediaBytes += resolved.byteLength;
        if (!referencedHashes.has(hash)) {
          state.unreferencedMedia.objects += 1;
          state.unreferencedMedia.bytes += resolved.byteLength;
        }
      } catch (error) {
        addIssue(state, {
          code: 'corrupt-media',
          severity: 'error',
          entity: 'media',
          entityId: hash,
          message:
            error instanceof Error
              ? error.message
              : `Media ${hash} failed its integrity check.`,
        });
      }

      mediaIndex += 1;
      state.scanned.media = mediaIndex;
      emitProgress(state, options, 'media', mediaIndex, totals.media, true);
    }

    if (state.unreferencedMedia.objects > 0) {
      addIssue(state, {
        code: 'unreferenced-media',
        severity: 'warning',
        entity: 'library',
        entityId: null,
        message: `${state.unreferencedMedia.objects.toLocaleString()} verified media object(s) are not referenced by current cards or deck notes (${(state.unreferencedMedia.bytes / MEBIBYTE).toFixed(1)} MiB).`,
      });
    }

    emitProgress(state, options, 'complete', 1, 1, true);
    return finishResult(state, true, false);
  } catch (error) {
    if (isUserAbort(error, signal)) {
      return finishResult(state, false, true);
    }
    throw error;
  }
}

/**
 * Run a bounded, read-only, full-library audit under the same origin-wide lease
 * used by destructive maintenance. The lease makes the multi-table scan stable
 * while every foreign Denki tab is temporarily fenced from writes.
 */
export async function auditLibraryIntegrityExclusively(
  options: LibraryIntegrityAuditOptions = {},
): Promise<LibraryIntegrityResult> {
  return withExclusiveMaintenanceLock(
    {
      operation: 'library-integrity-audit',
      label: 'Library integrity check',
      signal: options.signal,
    },
    ({ signal, assertOwned }) =>
      runAudit({
        ...options,
        signal,
        assertOwned,
      }),
  );
}
