import type { StateCreator } from 'zustand';
import { db } from '../../db';
import { loadNewCardsPerDay, countNewIntroducedToday, newCardAllowance } from '../../services/studyLimits';
import type { FlashcardState, StatsSlice, ClassStats, DeckStats, GlobalStats } from '../types';

/**
 * Due count for one deck with the daily new-card limit applied, so badges
 * match what a study session will actually queue: all due reviews plus at
 * most today's remaining new-card allowance.
 */
async function cappedDeckDueCount(
  deckId: number,
  now: Date,
  introduced: Map<number, number>,
  limit: number,
): Promise<number> {
  const rawDue = await db.cards
    .where('[deckId+due]')
    .between([deckId, new Date(0)], [deckId, now])
    .count();
  if (limit <= 0) return rawDue;

  const newCount = await db.cards.where('[deckId+state]').equals([deckId, 0]).count();
  const dueReviews = Math.max(0, rawDue - newCount);
  const allowance = newCardAllowance(deckId, introduced, limit);
  return dueReviews + Math.min(newCount, allowance);
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
    const total = await db.cards.where('classId').equals(classId).count();
    const now = new Date();

    // Due count = sum of per-deck due counts with the daily new-card limit
    // applied, so the class badge agrees with the deck badges and the queue.
    const limit = loadNewCardsPerDay();
    const introduced = limit > 0 ? await countNewIntroducedToday() : new Map<number, number>();
    const classDecks = await db.decks.where('classId').equals(classId).toArray();
    let dueCount = 0;
    for (const deck of classDecks) {
      if (deck.id === undefined) continue;
      dueCount += await cappedDeckDueCount(deck.id, now, introduced, limit);
    }

    // Count mastered cards: state = 2 (Review)
    const masteredCount = await db.cards
      .where('[classId+state]')
      .equals([classId, 2])
      .count();

    const decksCount = classDecks.length;
    
    const masteryPct = total > 0 ? Math.round((masteredCount / total) * 100) : 0;

    const stats: ClassStats = {
      total,
      dueCount,
      masteryPct,
      decksCount,
    };

    set((state) => ({
      classStats: {
        ...state.classStats,
        [classId]: stats,
      },
    }));
  },

  loadAllClassStats: async () => {
    const classes = get().classes;
    for (const cls of classes) {
      if (cls.id !== undefined) {
        await get().loadClassStats(cls.id);
      }
    }
  },

  loadDeckStats: async (classId) => {
    const classDecks = await db.decks.where('classId').equals(classId).toArray();
    const now = new Date();
    const newDeckStats: Record<number, DeckStats> = { ...get().deckStats };
    const limit = loadNewCardsPerDay();
    const introduced = limit > 0 ? await countNewIntroducedToday() : new Map<number, number>();

    for (const deck of classDecks) {
      if (deck.id === undefined) continue;

      const total = await db.cards.where('deckId').equals(deck.id).count();

      const dueCount = await cappedDeckDueCount(deck.id, now, introduced, limit);

      const masteredCount = await db.cards
        .where('[deckId+state]')
        .equals([deck.id, 2])
        .count();

      const masteryPct = total > 0 ? Math.round((masteredCount / total) * 100) : 0;

      newDeckStats[deck.id] = {
        total,
        dueCount,
        masteryPct,
      };
    }

    set({ deckStats: newDeckStats });
  },

  loadStats: async (classId) => {
    const now = new Date();
    
    // 1. Calculate Core Metrics
    let totalReviews: number;
    let positiveReviewsCount: number;

    if (classId) {
      totalReviews = await db.reviews.where('classId').equals(classId).count();
      positiveReviewsCount = await db.reviews
        .where('classId')
        .equals(classId)
        .and((r) => r.rating >= 3)
        .count();
    } else {
      totalReviews = await db.reviews.count();
      positiveReviewsCount = await db.reviews
        .where('rating')
        .aboveOrEqual(3)
        .count();
    }

    const avgRecallRate = totalReviews > 0 ? Math.round((positiveReviewsCount / totalReviews) * 100) : 100;

    // 2. Fetch last 12 months reviews for Streak and Heatmap calculations
    const oneYearAgo = new Date();
    oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);
    oneYearAgo.setHours(0, 0, 0, 0);

    let reviews;
    if (classId) {
      reviews = await db.reviews
        .where('[classId+reviewedAt]')
        .between([classId, oneYearAgo], [classId, now])
        .toArray();
    } else {
      reviews = await db.reviews
        .where('reviewedAt')
        .above(oneYearAgo)
        .toArray();
    }

    // One local-time YYYY-MM-DD key used everywhere so the streak and heatmap
    // agree (previously the streak used local toDateString() while the heatmap
    // used UTC toISOString(), so they could disagree about "today").
    const localDateKey = (d: Date): string => {
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      return `${y}-${m}-${day}`;
    };

    const reviewDates = new Set(reviews.map((r) => localDateKey(new Date(r.reviewedAt))));

    // Current streak walk-back
    let currentStreak = 0;
    let checkDate = new Date(now);
    while (reviewDates.has(localDateKey(checkDate))) {
      currentStreak++;
      checkDate.setDate(checkDate.getDate() - 1);
    }

    // Still count the streak if today isn't studied yet but yesterday was
    if (currentStreak === 0) {
      checkDate = new Date(now);
      checkDate.setDate(checkDate.getDate() - 1);
      while (reviewDates.has(localDateKey(checkDate))) {
        currentStreak++;
        checkDate.setDate(checkDate.getDate() - 1);
      }
    }

    // Longest streak — whole-day gaps between studied days (Math.round tolerates
    // 23h/25h DST transitions that would otherwise break a run).
    let maxStreak = 0;
    const sortedDays = Array.from(reviewDates)
      .map((k) => new Date(k + 'T00:00:00'))
      .sort((a, b) => a.getTime() - b.getTime());

    if (sortedDays.length > 0) {
      maxStreak = 1;
      let tempStreak = 1;
      for (let i = 1; i < sortedDays.length; i++) {
        const diffDays = Math.round((sortedDays[i].getTime() - sortedDays[i - 1].getTime()) / (1000 * 60 * 60 * 24));
        if (diffDays === 1) {
          tempStreak++;
          maxStreak = Math.max(maxStreak, tempStreak);
        } else if (diffDays > 1) {
          tempStreak = 1;
        }
      }
      maxStreak = Math.max(maxStreak, currentStreak);
    }

    // Heatmap calendar grids (same local key basis as the streak)
    const heatmapMap: Record<string, number> = {};
    reviews.forEach((r) => {
      const key = localDateKey(new Date(r.reviewedAt));
      heatmapMap[key] = (heatmapMap[key] || 0) + 1;
    });

    const heatmapData: { date: string; count: number }[][] = [];
    const heatmapStart = new Date(now);
    const startOffset = heatmapStart.getDay();
    heatmapStart.setDate(heatmapStart.getDate() - (52 * 7) - startOffset); // 53 weeks ago

    for (let w = 0; w < 53; w++) {
      const week: { date: string; count: number }[] = [];
      for (let d = 0; d < 7; d++) {
        const key = localDateKey(heatmapStart);
        week.push({
          date: key,
          count: heatmapMap[key] || 0,
        });
        heatmapStart.setDate(heatmapStart.getDate() + 1);
      }
      heatmapData.push(week);
    }

    // 3. Workload Forecast (7-day counts)
    const workloadForecast: { dayName: string; count: number }[] = [];
    const forecastToday = new Date();
    forecastToday.setHours(0, 0, 0, 0);

    for (let i = 0; i < 7; i++) {
      const start = new Date(forecastToday.getTime() + i * 24 * 60 * 60 * 1000);
      const end = new Date(start.getTime() + 24 * 60 * 60 * 1000 - 1);
      // Fold any overdue backlog (due before today) into the "Today" bucket so
      // it isn't silently dropped from the forecast.
      const lowerBound = i === 0 ? new Date(0) : start;

      let count: number;
      if (classId) {
        count = await db.cards
          .where('[classId+due]')
          .between([classId, lowerBound], [classId, end])
          .count();
      } else {
        count = await db.cards
          .where('due')
          .between(lowerBound, end)
          .count();
      }

      const dayName = i === 0 ? 'Today' : i === 1 ? 'Tomorrow' : start.toLocaleDateString('en-US', { weekday: 'short' });
      workloadForecast.push({ dayName, count });
    }

    // 4. Card Mastery Breakdown
    let newCount: number;
    let learningCount: number;
    let reviewCount: number;

    if (classId) {
      newCount = await db.cards.where('[classId+state]').equals([classId, 0]).count();
      const learning1 = await db.cards.where('[classId+state]').equals([classId, 1]).count();
      const learning3 = await db.cards.where('[classId+state]').equals([classId, 3]).count();
      learningCount = learning1 + learning3;
      reviewCount = await db.cards.where('[classId+state]').equals([classId, 2]).count();
    } else {
      newCount = await db.cards.where('state').equals(0).count();
      const learning1 = await db.cards.where('state').equals(1).count();
      const learning3 = await db.cards.where('state').equals(3).count();
      learningCount = learning1 + learning3;
      reviewCount = await db.cards.where('state').equals(2).count();
    }

    const totalCards = newCount + learningCount + reviewCount;
    const totalDiv = totalCards || 1;

    const cardStates = {
      newCount,
      learningCount,
      reviewCount,
      newPct: Math.round((newCount / totalDiv) * 100),
      learningPct: Math.round((learningCount / totalDiv) * 100),
      reviewPct: Math.round((reviewCount / totalDiv) * 100),
    };

    const globalStats: GlobalStats = {
      totalReviews,
      currentStreak,
      maxStreak,
      avgRecallRate,
      heatmapData,
      workloadForecast,
      cardStates,
    };

    set({
      globalStats,
      currentStreak,
      maxStreak,
    });
  },

  getLatestCardRatings: async (deckId: number) => {
    // Only fetch review ratings for this specific deck's cards
    const deckReviews = await db.reviews.where('deckId').equals(deckId).toArray();
    const latestRating: Record<number, number> = {};
    deckReviews
      .sort((a, b) => new Date(a.reviewedAt).getTime() - new Date(b.reviewedAt).getTime())
      .forEach((r) => {
        latestRating[r.cardId] = r.rating;
      });
    return latestRating;
  },
});
