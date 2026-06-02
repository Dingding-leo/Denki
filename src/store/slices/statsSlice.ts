import type { StateCreator } from 'zustand';
import { db } from '../../db';
import type { FlashcardState, StatsSlice, ClassStats, DeckStats, GlobalStats } from '../types';

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
    
    // Count due cards: due <= now
    const dueCount = await db.cards
      .where('[classId+due]')
      .between([classId, new Date(0)], [classId, now])
      .count();

    // Count mastered cards: state = 2 (Review)
    const masteredCount = await db.cards
      .where('[classId+state]')
      .equals([classId, 2])
      .count();

    const decksCount = await db.decks.where('classId').equals(classId).count();
    
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

    for (const deck of classDecks) {
      if (deck.id === undefined) continue;

      const total = await db.cards.where('deckId').equals(deck.id).count();
      
      const dueCount = await db.cards
        .where('[deckId+due]')
        .between([deck.id, new Date(0)], [deck.id, now])
        .count();

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

    const reviewDates = new Set(
      reviews.map((r) => new Date(r.reviewedAt).toDateString())
    );

    // Current streak walk-back
    let currentStreak = 0;
    let checkDate = new Date(now);
    while (reviewDates.has(checkDate.toDateString())) {
      currentStreak++;
      checkDate.setDate(checkDate.getDate() - 1);
    }

    // Check if maintained yesterday if no study yet today
    if (currentStreak === 0) {
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      checkDate = new Date(yesterday);
      while (reviewDates.has(checkDate.toDateString())) {
        currentStreak++;
        checkDate.setDate(checkDate.getDate() - 1);
      }
    }

    // Longest streak
    let maxStreak = 0;
    const sortedDates = Array.from(reviewDates)
      .map((d) => new Date(d))
      .sort((a, b) => a.getTime() - b.getTime());

    if (sortedDates.length > 0) {
      maxStreak = 1;
      let tempStreak = 1;
      for (let i = 1; i < sortedDates.length; i++) {
        const diffTime = Math.abs(sortedDates[i].getTime() - sortedDates[i - 1].getTime());
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        if (diffDays === 1) {
          tempStreak++;
          maxStreak = Math.max(maxStreak, tempStreak);
        } else if (diffDays > 1) {
          tempStreak = 1;
        }
      }
      maxStreak = Math.max(maxStreak, currentStreak);
    }

    // Heatmap calendar grids
    const heatmapMap: Record<string, number> = {};
    reviews.forEach((r) => {
      const key = new Date(r.reviewedAt).toISOString().split('T')[0];
      heatmapMap[key] = (heatmapMap[key] || 0) + 1;
    });

    const heatmapData: { date: string; count: number }[][] = [];
    const heatmapStart = new Date(now);
    const startOffset = heatmapStart.getDay();
    heatmapStart.setDate(heatmapStart.getDate() - (52 * 7) - startOffset); // 53 weeks ago

    for (let w = 0; w < 53; w++) {
      const week: { date: string; count: number }[] = [];
      for (let d = 0; d < 7; d++) {
        const key = heatmapStart.toISOString().split('T')[0];
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
      
      let count = 0;
      if (classId) {
        count = await db.cards
          .where('[classId+due]')
          .between([classId, start], [classId, end])
          .count();
      } else {
        count = await db.cards
          .where('due')
          .between(start, end)
          .count();
      }

      const dayName = i === 0 ? 'Today' : i === 1 ? 'Tomorrow' : start.toLocaleDateString('en-US', { weekday: 'short' });
      workloadForecast.push({ dayName, count });
    }

    // 4. Card Mastery Breakdown
    let newCount = 0;
    let learningCount = 0;
    let reviewCount = 0;

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
