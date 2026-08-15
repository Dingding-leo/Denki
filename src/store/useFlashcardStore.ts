import { create } from 'zustand';
import { clearPersistedStudySession, persistStudySession } from '../services/studySessionPersistence';
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

// Keep a compact, resumable study-session snapshot in localStorage. Watching
// only the session reference means unrelated stats/deck/class updates do not
// touch storage, while every study mutation (rate, undo, next/previous, end)
// is captured automatically without persistence logic leaking into the slice.
let lastSession = useFlashcardStore.getState().session;
useFlashcardStore.subscribe((state) => {
  if (state.session === lastSession) return;
  lastSession = state.session;

  if (state.session) persistStudySession(state.session);
  else clearPersistedStudySession();
});
