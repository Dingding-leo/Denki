import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '../../db';
import type { Card, ReviewLog } from '../../db/schema';
import { createMediaReference, registerMediaBytes } from '../mediaRegistry';
import {
  auditLibraryIntegrityExclusively,
  type LibraryIntegrityIssueCode,
} from '../libraryIntegrity';
import {
  resetMaintenanceLockForTests,
  withExclusiveMaintenanceLock,
} from '../maintenanceLock';

async function seedLibrary() {
  const classId = await db.classes.add({
    name: 'Integrity',
    description: '',
    createdAt: new Date(),
  });
  const deckId = await db.decks.add({
    classId,
    name: 'Checks',
    description: '',
    notes: '',
    createdAt: new Date(),
  });
  const cardId = await db.cards.add({
    classId,
    deckId,
    front: 'Question',
    back: 'Answer',
    cardType: 'standard',
    createdAt: new Date(),
    state: 0,
    stability: 0,
    difficulty: 0,
    elapsedDays: 0,
    scheduledDays: 0,
    due: new Date(),
  } as Card);
  const reviewId = await db.reviews.add({
    cardId,
    classId,
    deckId,
    reviewedAt: new Date(),
    rating: 3,
    stability: 0,
    difficulty: 0,
    elapsedDays: 0,
    scheduledDays: 1,
  });
  return { classId, deckId, cardId, reviewId };
}

function issueCodes(result: {
  issues: readonly { code: LibraryIntegrityIssueCode }[];
}): Set<LibraryIntegrityIssueCode> {
  return new Set(result.issues.map((issue) => issue.code));
}

describe('library integrity audit', () => {
  beforeEach(async () => {
    await resetMaintenanceLockForTests();
    localStorage.clear();
    await Promise.all([
      db.reviews.clear(),
      db.cards.clear(),
      db.decks.clear(),
      db.classes.clear(),
      db.media.clear(),
    ]);
  });

  it('verifies a healthy library including referenced media bytes', async () => {
    const { cardId } = await seedLibrary();
    const reference = await registerMediaBytes(
      'image/png',
      new Uint8Array([1, 2, 3, 4]),
    );
    await db.cards.update(cardId, {
      front: `Question\n\n![diagram](${reference})`,
    });

    const result = await auditLibraryIntegrityExclusively();

    expect(result).toMatchObject({
      complete: true,
      stopped: false,
      healthy: true,
      errorCount: 0,
      warningCount: 0,
      issueCount: 0,
    });
    expect(result.scanned).toMatchObject({
      classes: 1,
      decks: 1,
      cards: 1,
      reviews: 1,
      media: 1,
      verifiedMediaBytes: 4,
      registryReferences: 1,
    });
  });

  it('reports relationship, provenance, reference, and hash failures without mutating rows', async () => {
    const { classId, deckId, cardId, reviewId } = await seedLibrary();
    const secondClassId = await db.classes.add({
      name: 'Other',
      description: '',
      createdAt: new Date(),
    });
    const orphanDeckId = await db.decks.add({
      classId: 99_999,
      name: 'Orphan',
      description: '',
      notes: `broken denki-media://sha256/not-a-valid-hash`,
      createdAt: new Date(),
    });
    expect(orphanDeckId).toBeGreaterThan(0);

    const missingHash = 'b'.repeat(64);
    await db.cards.update(cardId, {
      classId: secondClassId,
      schedulerVersion: '',
      back: createMediaReference(missingHash),
    });
    await db.reviews.update(reviewId, {
      deckId: 99_999,
      schedulerVersion: '',
    });
    await db.media.put({
      hash: 'c'.repeat(64),
      mimeType: 'image/png',
      byteLength: 4,
      data: new Uint8Array([9, 8, 7, 6]).buffer,
      createdAt: new Date(),
    });

    const result = await auditLibraryIntegrityExclusively();
    const codes = issueCodes(result);

    expect(result.complete).toBe(true);
    expect(result.healthy).toBe(false);
    expect(codes.has('orphan-deck')).toBe(true);
    expect(codes.has('card-owner-mismatch')).toBe(true);
    expect(codes.has('invalid-card-provenance')).toBe(true);
    expect(codes.has('review-owner-mismatch')).toBe(true);
    expect(codes.has('invalid-review-provenance')).toBe(true);
    expect(codes.has('malformed-media-reference')).toBe(true);
    expect(codes.has('missing-media')).toBe(true);
    expect(codes.has('corrupt-media')).toBe(true);

    expect((await db.cards.get(cardId))?.classId).toBe(secondClassId);
    expect((await db.reviews.get(reviewId))?.deckId).toBe(99_999);
    expect((await db.decks.get(deckId))?.classId).toBe(classId);
  });

  it('reports verified but unreferenced media as a warning, not corruption', async () => {
    await seedLibrary();
    await registerMediaBytes(
      'image/png',
      new Uint8Array([4, 3, 2, 1]),
    );

    const result = await auditLibraryIntegrityExclusively();

    expect(result.complete).toBe(true);
    expect(result.healthy).toBe(true);
    expect(result.errorCount).toBe(0);
    expect(result.warningCount).toBe(1);
    expect(result.unreferencedMedia).toEqual({ objects: 1, bytes: 4 });
    expect(issueCodes(result).has('unreferenced-media')).toBe(true);
  });

  it('stops at a safe cursor boundary and releases the maintenance lease', async () => {
    const { classId, deckId, cardId } = await seedLibrary();
    const reviews: ReviewLog[] = Array.from({ length: 300 }, (_, index) => ({
      cardId,
      classId,
      deckId,
      reviewedAt: new Date(Date.now() + index),
      rating: 3,
      stability: 0,
      difficulty: 0,
      elapsedDays: 0,
      scheduledDays: 1,
    }));
    await db.reviews.bulkAdd(reviews);

    const controller = new AbortController();
    const result = await auditLibraryIntegrityExclusively({
      signal: controller.signal,
      onProgress(progress) {
        if (progress.phase === 'reviews' && progress.processed >= 250) {
          controller.abort();
        }
      },
    });

    expect(result.stopped).toBe(true);
    expect(result.complete).toBe(false);
    expect(result.scanned.reviews).toBeGreaterThanOrEqual(250);

    await expect(
      withExclusiveMaintenanceLock(
        {
          operation: 'after-audit',
          label: 'After audit',
        },
        async () => 'released',
      ),
    ).resolves.toBe('released');
  });

  it('does not misclassify an unrelated AbortError as user cancellation', async () => {
    await seedLibrary();

    await expect(
      auditLibraryIntegrityExclusively({
        onProgress(progress) {
          if (progress.phase === 'classes') {
            throw new DOMException(
              'IndexedDB aborted independently',
              'AbortError',
            );
          }
        },
      }),
    ).rejects.toThrow('IndexedDB aborted independently');
  });

});
