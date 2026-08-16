import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "../../../db";
import type { Card, Deck } from "../../../db/schema";
import { useFlashcardStore } from "../../useFlashcardStore";

interface Deferred<T> {
  promise: Promise<T>;
  resolve: (value: T) => void;
}

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((complete) => {
    resolve = complete;
  });
  return { promise, resolve };
}

function card(id: number, deckId: number, classId: number): Card {
  return {
    id,
    classId,
    deckId,
    front: `Question ${id}`,
    back: `Answer ${id}`,
    cardType: "standard",
    createdAt: new Date(),
    state: 0,
    stability: 0,
    difficulty: 0,
    elapsedDays: 0,
    scheduledDays: 0,
    due: new Date(),
  };
}

function deck(id: number, classId: number): Deck {
  return {
    id,
    classId,
    name: `Deck ${id}`,
    description: "",
    createdAt: new Date(),
  };
}

describe("library loader request integrity", () => {
  beforeEach(async () => {
    await Promise.all([
      db.reviews.clear(),
      db.cards.clear(),
      db.decks.clear(),
      db.classes.clear(),
    ]);
    useFlashcardStore.setState({
      cards: [],
      decks: [],
      activeDeckId: null,
      deckStats: {},
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("keeps the newest card scope when IndexedDB requests resolve out of order", async () => {
    const first = deferred<Card[]>();
    const second = deferred<Card[]>();
    const whereSpy = vi.spyOn(db.cards, "where") as unknown as {
      mockImplementation: (implementation: (index: string) => unknown) => void;
    };
    whereSpy.mockImplementation((index) => {
      expect(index).toBe("deckId");
      return {
        equals: (deckId: number) => ({
          toArray: () => (deckId === 1 ? first.promise : second.promise),
        }),
      };
    });

    const firstLoad = useFlashcardStore.getState().loadCards(1);
    const secondLoad = useFlashcardStore.getState().loadCards(2);

    second.resolve([card(2, 2, 1)]);
    await secondLoad;
    first.resolve([card(1, 1, 1)]);
    await firstLoad;

    expect(useFlashcardStore.getState().activeDeckId).toBe(2);
    expect(
      useFlashcardStore.getState().cards.map((item) => item.deckId),
    ).toEqual([2]);
  });

  it("does not repopulate cards after their consumer clears the active scope", async () => {
    const pending = deferred<Card[]>();
    const whereSpy = vi.spyOn(db.cards, "where") as unknown as {
      mockImplementation: (implementation: (index: string) => unknown) => void;
    };
    whereSpy.mockImplementation(() => ({
      equals: () => ({ toArray: () => pending.promise }),
    }));

    const load = useFlashcardStore.getState().loadCards(1);
    useFlashcardStore.setState({ activeDeckId: null, cards: [] });
    pending.resolve([card(1, 1, 1)]);
    await load;

    expect(useFlashcardStore.getState().activeDeckId).toBeNull();
    expect(useFlashcardStore.getState().cards).toEqual([]);
  });

  it("keeps the latest class deck list when route loads finish out of order", async () => {
    const first = deferred<Deck[]>();
    const second = deferred<Deck[]>();
    const whereSpy = vi.spyOn(db.decks, "where") as unknown as {
      mockImplementation: (implementation: (index: string) => unknown) => void;
    };
    whereSpy.mockImplementation((index) => {
      expect(index).toBe("classId");
      return {
        equals: (classId: number) => ({
          toArray: () => (classId === 1 ? first.promise : second.promise),
        }),
      };
    });

    const firstLoad = useFlashcardStore.getState().loadDecks(1);
    const secondLoad = useFlashcardStore.getState().loadDecks(2);

    second.resolve([deck(2, 2)]);
    await secondLoad;
    first.resolve([deck(1, 1)]);
    await firstLoad;

    expect(
      useFlashcardStore.getState().decks.map((item) => item.classId),
    ).toEqual([2]);
  });
});
