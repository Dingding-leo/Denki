import Dexie, { type Table, type Transaction } from 'dexie';
import {
  inferLegacyCardSchedulerVersion,
  inferLegacyReviewSchedulerVersion,
} from '../domain/schedulerProvenance';
import type {
  Card,
  Class,
  Deck,
  MediaAsset,
  ReviewLog,
} from './schema';

/** Historical v3-v5 stores. Do not retroactively add tables to old versions. */
export const DENKI_STORES = {
  classes: '++id, name, createdAt',
  decks: '++id, classId, name, createdAt',
  cards: '++id, classId, deckId, state, due, lastReviewed, cardType, lastRating, [classId+due], [deckId+due], [classId+state], [deckId+state]',
  reviews: '++id, cardId, deckId, classId, reviewedAt, rating, [classId+reviewedAt]',
} as const;

export const DENKI_STORES_V6 = {
  ...DENKI_STORES,
  media: '&hash, mimeType, byteLength, createdAt',
} as const;

export function deriveLatestRatings(
  reviews: readonly ReviewLog[],
): Map<number, number> {
  const latestByCard = new Map<number, { rating: number; reviewedAt: number }>();

  for (const review of reviews) {
    const reviewedAt = new Date(review.reviewedAt).getTime();
    if (!Number.isFinite(reviewedAt)) continue;

    const current = latestByCard.get(review.cardId);
    if (!current || reviewedAt > current.reviewedAt) {
      latestByCard.set(review.cardId, {
        rating: review.rating,
        reviewedAt,
      });
    }
  }

  return new Map(
    [...latestByCard.entries()].map(([cardId, value]) => [cardId, value.rating]),
  );
}

/**
 * Database-v5 provenance upgrade, exported so migration tests execute the same
 * callback used by the production Dexie schema rather than duplicating it.
 */
export async function migrateSchedulerProvenance(
  transaction: Transaction,
): Promise<void> {
  const cards = transaction.table<Card, number>('cards');
  const reviews = transaction.table<ReviewLog, number>('reviews');

  await cards.toCollection().modify((card) => {
    card.schedulerVersion = inferLegacyCardSchedulerVersion(card);
  });
  await reviews.toCollection().modify((review) => {
    review.schedulerVersion = inferLegacyReviewSchedulerVersion(
      review.schedulerVersion,
    );
  });
}

class DenkiDatabase extends Dexie {
  classes!: Table<Class, number>;
  decks!: Table<Deck, number>;
  cards!: Table<Card, number>;
  reviews!: Table<ReviewLog, number>;
  media!: Table<MediaAsset, string>;

  constructor() {
    super('DenkiDatabase');

    // Version 3 adds compound indices for optimized stats calculations and FSRS queue queries.
    this.version(3).stores(DENKI_STORES);

    // Version 4 migrates the legacy last-rating backfill out of every app load.
    // Large libraries now pay this cost once, during the database upgrade, rather
    // than scanning cards and reviews whenever classes are refreshed.
    this.version(4)
      .stores(DENKI_STORES)
      .upgrade(async (transaction) => {
        const cards = transaction.table<Card, number>('cards');
        const reviews = transaction.table<ReviewLog, number>('reviews');
        const legacyCards = await cards
          .filter((card) => card.lastReviewed !== undefined && card.lastRating === undefined)
          .toArray();
        const cardIds = legacyCards
          .map((card) => card.id)
          .filter((id): id is number => id !== undefined);
        if (cardIds.length === 0) return;

        const latestRatings = deriveLatestRatings(
          await reviews.where('cardId').anyOf(cardIds).toArray(),
        );
        for (const cardId of cardIds) {
          const rating = latestRatings.get(cardId);
          if (rating !== undefined) await cards.update(cardId, { lastRating: rating });
        }
      });

    // Version 5 establishes per-row scheduler provenance. Existing reviewed
    // memory states cannot be proven canonical retroactively, so they remain
    // explicitly legacy until their next current-scheduler transition. Pristine
    // New cards contain no model-derived state and can safely join FSRS 4.5.
    this.version(5)
      .stores(DENKI_STORES)
      .upgrade(migrateSchedulerProvenance);

    // Version 6 adds an empty content-addressed media registry. It deliberately
    // performs no card rewrite: legacy data URLs remain readable until a later,
    // separately gated migration introduces explicit denki-media references.
    this.version(6).stores(DENKI_STORES_V6);

    // Database-level hooks protect direct import and test-fixture writes in
    // addition to the explicit scheduler helpers used by production features.
    this.cards.hook('creating', (_primaryKey, card) => {
      card.schedulerVersion = inferLegacyCardSchedulerVersion(card);
    });
    this.reviews.hook('creating', (_primaryKey, review) => {
      review.schedulerVersion = inferLegacyReviewSchedulerVersion(
        review.schedulerVersion,
      );
    });
  }
}

export const db = new DenkiDatabase();
