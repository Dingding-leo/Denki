import type { StateCreator } from "zustand";
import { db } from "../../db";
import type {
  ClassStats,
  DeckStats,
  FlashcardState,
  GlobalStats,
  StatsSlice,
} from "../types";

const DAY_MS = 24 * 60 * 60 * 1000;
let latestStatsRequest = 0;

function localDateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function startOfLocalDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function addLocalDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

function dateKeyOrdinal(key: string): number {
  const [year, month, day] = key.split("-").map(Number);
  return Math.floor(Date.UTC(year, month - 1, day) / DAY_MS);
}

async function deckDueCount(deckId: number, now: Date): Promise<number> {
  return db.cards
    .where("[deckId+due]")
    .between([deckId, new Date(0)], [deckId, now])
    .count();
}

async function computeClassStats(
  classId: number,
  now: Date,
): Promise<ClassStats> {
  const [total, masteredCount, classDecks] = await Promise.all([
    db.cards.where("classId").equals(classId).count(),
    db.cards.where("[classId+state]").equals([classId, 2]).count(),
    db.decks.where("classId").equals(classId).toArray(),
  ]);

  const dueCounts = await Promise.all(
    classDecks
      .filter((deck) => deck.id !== undefined)
      .map((deck) => deckDueCount(deck.id!, now)),
  );

  return {
    total,
    dueCount: dueCounts.reduce((sum, count) => sum + count, 0),
    masteryPct: total > 0 ? Math.round((masteredCount / total) * 100) : 0,
    decksCount: classDecks.length,
  };
}

async function computeDeckStats(deckId: number, now: Date): Promise<DeckStats> {
  const [total, dueCount, masteredCount] = await Promise.all([
    db.cards.where("deckId").equals(deckId).count(),
    deckDueCount(deckId, now),
    db.cards.where("[deckId+state]").equals([deckId, 2]).count(),
  ]);

  return {
    total,
    dueCount,
    masteryPct: total > 0 ? Math.round((masteredCount / total) * 100) : 0,
  };
}

export const createStatsSlice: StateCreator<
  FlashcardState,
  [],
  [],
  StatsSlice
> = (set, get) => ({
  classStats: {},
  deckStats: {},
  globalStats: null,
  currentStreak: 0,
  maxStreak: 0,

  loadClassStats: async (classId) => {
    const stats = await computeClassStats(classId, new Date());
    set((state) => ({
      classStats: { ...state.classStats, [classId]: stats },
    }));
  },

  loadAllClassStats: async () => {
    const classIds = get()
      .classes.map((studyClass) => studyClass.id)
      .filter((id): id is number => id !== undefined);
    if (classIds.length === 0) {
      set({ classStats: {} });
      return;
    }

    const now = new Date();
    const entries = await Promise.all(
      classIds.map(
        async (classId) =>
          [classId, await computeClassStats(classId, now)] as const,
      ),
    );
    set({ classStats: Object.fromEntries(entries) });
  },

  loadDeckStats: async (classId) => {
    const classDecks = await db.decks
      .where("classId")
      .equals(classId)
      .toArray();
    const now = new Date();
    const entries = await Promise.all(
      classDecks
        .filter((deck) => deck.id !== undefined)
        .map(
          async (deck) =>
            [deck.id!, await computeDeckStats(deck.id!, now)] as const,
        ),
    );

    set((state) => ({
      deckStats: { ...state.deckStats, ...Object.fromEntries(entries) },
    }));
  },

  loadStats: async (classId) => {
    const requestId = ++latestStatsRequest;
    const now = new Date();
    const oneYearAgo = startOfLocalDay(now);
    oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);

    const reviews = classId
      ? await db.reviews
          .where("[classId+reviewedAt]")
          .between([classId, oneYearAgo], [classId, now])
          .toArray()
      : await db.reviews.where("reviewedAt").above(oneYearAgo).toArray();

    const totalReviews = reviews.length;
    const positiveReviews = reviews.reduce(
      (count, review) => count + (review.rating >= 3 ? 1 : 0),
      0,
    );
    const avgRecallRate =
      totalReviews > 0
        ? Math.round((positiveReviews / totalReviews) * 100)
        : 100;

    const reviewDates = new Set(
      reviews.map((review) => localDateKey(new Date(review.reviewedAt))),
    );

    let currentStreak = 0;
    let checkDate = new Date(now);
    while (reviewDates.has(localDateKey(checkDate))) {
      currentStreak += 1;
      checkDate.setDate(checkDate.getDate() - 1);
    }
    if (currentStreak === 0) {
      checkDate = addLocalDays(now, -1);
      while (reviewDates.has(localDateKey(checkDate))) {
        currentStreak += 1;
        checkDate.setDate(checkDate.getDate() - 1);
      }
    }

    let maxStreak = 0;
    const sortedOrdinals = [...reviewDates]
      .map(dateKeyOrdinal)
      .sort((a, b) => a - b);
    if (sortedOrdinals.length > 0) {
      maxStreak = 1;
      let run = 1;
      for (let index = 1; index < sortedOrdinals.length; index += 1) {
        if (sortedOrdinals[index] - sortedOrdinals[index - 1] === 1) {
          run += 1;
          maxStreak = Math.max(maxStreak, run);
        } else {
          run = 1;
        }
      }
      maxStreak = Math.max(maxStreak, currentStreak);
    }

    const heatmapCounts = new Map<string, number>();
    for (const review of reviews) {
      const key = localDateKey(new Date(review.reviewedAt));
      heatmapCounts.set(key, (heatmapCounts.get(key) ?? 0) + 1);
    }

    const heatmapData: { date: string; count: number }[][] = [];
    const heatmapCursor = startOfLocalDay(now);
    heatmapCursor.setDate(
      heatmapCursor.getDate() - 52 * 7 - heatmapCursor.getDay(),
    );
    for (let weekIndex = 0; weekIndex < 53; weekIndex += 1) {
      const week: { date: string; count: number }[] = [];
      for (let dayIndex = 0; dayIndex < 7; dayIndex += 1) {
        const key = localDateKey(heatmapCursor);
        week.push({ date: key, count: heatmapCounts.get(key) ?? 0 });
        heatmapCursor.setDate(heatmapCursor.getDate() + 1);
      }
      heatmapData.push(week);
    }

    const today = startOfLocalDay(now);
    const ranges = Array.from({ length: 7 }, (_, index) => {
      const start = addLocalDays(today, index);
      const nextStart = addLocalDays(start, 1);
      return {
        start,
        end: new Date(nextStart.getTime() - 1),
        lowerBound: index === 0 ? new Date(0) : start,
      };
    });

    const rawForecastCounts = await Promise.all(
      ranges.map(({ lowerBound, end }) =>
        classId
          ? db.cards
              .where("[classId+due]")
              .between([classId, lowerBound], [classId, end])
              .count()
          : db.cards.where("due").between(lowerBound, end).count(),
      ),
    );

    const workloadForecast = ranges.map(({ start }, index) => ({
      dayName:
        index === 0
          ? "Today"
          : index === 1
            ? "Tomorrow"
            : start.toLocaleDateString("en-US", { weekday: "short" }),
      count: rawForecastCounts[index],
    }));

    const stateCounts = classId
      ? await Promise.all([
          db.cards.where("[classId+state]").equals([classId, 0]).count(),
          db.cards.where("[classId+state]").equals([classId, 1]).count(),
          db.cards.where("[classId+state]").equals([classId, 3]).count(),
          db.cards.where("[classId+state]").equals([classId, 2]).count(),
        ])
      : await Promise.all([
          db.cards.where("state").equals(0).count(),
          db.cards.where("state").equals(1).count(),
          db.cards.where("state").equals(3).count(),
          db.cards.where("state").equals(2).count(),
        ]);
    const [newCount, learningCountRaw, relearningCount, reviewCount] =
      stateCounts;
    const learningCount = learningCountRaw + relearningCount;
    const totalCards = newCount + learningCount + reviewCount;
    const denominator = totalCards || 1;

    const globalStats: GlobalStats = {
      totalReviews,
      currentStreak,
      maxStreak,
      avgRecallRate,
      heatmapData,
      workloadForecast,
      cardStates: {
        newCount,
        learningCount,
        reviewCount,
        newPct: Math.round((newCount / denominator) * 100),
        learningPct: Math.round((learningCount / denominator) * 100),
        reviewPct: Math.round((reviewCount / denominator) * 100),
      },
    };

    // A slower request for a previously viewed class must not overwrite the
    // dashboard after the user has already switched scope.
    if (requestId !== latestStatsRequest) return;
    set({ globalStats, currentStreak, maxStreak });
  },
});
