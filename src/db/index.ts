import Dexie, { type Table } from "dexie";
import type { Card, Class, Deck, ReviewLog } from "./schema";

const STORES = {
  classes: "++id, name, createdAt",
  decks: "++id, classId, name, createdAt",
  cards:
    "++id, classId, deckId, state, due, lastReviewed, cardType, lastRating, [classId+due], [deckId+due], [classId+state], [deckId+state]",
  reviews:
    "++id, cardId, deckId, classId, reviewedAt, rating, [classId+reviewedAt]",
} as const;

export function deriveLatestRatings(
  reviews: readonly ReviewLog[],
): Map<number, number> {
  const latestByCard = new Map<
    number,
    { rating: number; reviewedAt: number }
  >();

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
    [...latestByCard.entries()].map(([cardId, value]) => [
      cardId,
      value.rating,
    ]),
  );
}

class DenkiDatabase extends Dexie {
  classes!: Table<Class, number>;
  decks!: Table<Deck, number>;
  cards!: Table<Card, number>;
  reviews!: Table<ReviewLog, number>;

  constructor() {
    super("DenkiDatabase");

    // Version 3 adds compound indices for optimized stats calculations and FSRS queue queries.
    this.version(3).stores(STORES);

    // Version 4 migrates the legacy last-rating backfill out of every app load.
    // Large libraries now pay this cost once, during the database upgrade, rather
    // than scanning cards and reviews whenever classes are refreshed.
    this.version(4)
      .stores(STORES)
      .upgrade(async (transaction) => {
        const cards = transaction.table<Card, number>("cards");
        const reviews = transaction.table<ReviewLog, number>("reviews");
        const legacyCards = await cards
          .filter(
            (card) =>
              card.lastReviewed !== undefined && card.lastRating === undefined,
          )
          .toArray();
        const cardIds = legacyCards
          .map((card) => card.id)
          .filter((id): id is number => id !== undefined);
        if (cardIds.length === 0) return;

        const latestRatings = deriveLatestRatings(
          await reviews.where("cardId").anyOf(cardIds).toArray(),
        );
        for (const cardId of cardIds) {
          const rating = latestRatings.get(cardId);
          if (rating !== undefined)
            await cards.update(cardId, { lastRating: rating });
        }
      });
  }
}

export const db = new DenkiDatabase();
