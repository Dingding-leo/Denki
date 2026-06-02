import { create } from 'zustand';
import { createClassSlice } from './slices/classSlice';
import { createDeckSlice } from './slices/deckSlice';
import { createCardSlice } from './slices/cardSlice';
import { createStudySlice } from './slices/studySlice';
import { createStatsSlice } from './slices/statsSlice';
import type { FlashcardState } from './types';

export const useFlashcardStore = create<FlashcardState>((...a) => ({
  ...createClassSlice(...a),
  ...createDeckSlice(...a),
  ...createCardSlice(...a),
  ...createStudySlice(...a),
  ...createStatsSlice(...a),
}));
