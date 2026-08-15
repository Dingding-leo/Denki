import { create } from 'zustand';
import {
  clearPersistedStudySession,
  persistStudySession,
  restorePersistedStudySession,
} from '../services/studySessionPersistence';
import { createClassSlice } from './slices/classSlice';
import { createDeckSlice } from './slices/deckSlice';
import { createCardSlice } from './slices/cardSlice';
import { createStudySlice } from './slices/studySlice';
import { createStatsSlice } from './slices/statsSlice';
import type { FlashcardState } from './types';
import { toast } from './uiStore';

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

// StudySessionPage starts a session on mount, while ClassViewPage also starts it
// immediately before navigating. Wrap the two start actions once at store setup
// so the second call becomes a no-op. The same wrapper also restores a recent
// persisted session after a browser/PWA/Tauri reload. Explicit cram sessions
// always start fresh rather than reviving a normal review session.
const startDeckSession = useFlashcardStore.getState().startStudySession;
const startClassSession = useFlashcardStore.getState().startClassStudySession;
const startGlobalSession = useFlashcardStore.getState().startGlobalStudySession;

useFlashcardStore.setState({
  startStudySession: async (deckId, forceCram = false) => {
    if (!forceCram) {
      const current = useFlashcardStore.getState().session;
      if (current?.deckId === deckId) return;

      const restored = await restorePersistedStudySession({ deckId });
      if (restored) {
        useFlashcardStore.setState({ session: restored });
        toast('Resumed your previous study session', 'info');
        return;
      }
    }

    await startDeckSession(deckId, forceCram);
  },
  startClassStudySession: async (classId, forceCram = false) => {
    if (!forceCram) {
      const current = useFlashcardStore.getState().session;
      if (current?.classId === classId) return;

      const restored = await restorePersistedStudySession({ classId });
      if (restored) {
        useFlashcardStore.setState({ session: restored });
        toast('Resumed your previous study session', 'info');
        return;
      }
    }

    await startClassSession(classId, forceCram);
  },
  startGlobalStudySession: async (forceCram = false) => {
    if (!forceCram) {
      const current = useFlashcardStore.getState().session;
      if (current?.isGlobal) return;

      const restored = await restorePersistedStudySession({ isGlobal: true });
      if (restored) {
        await useFlashcardStore.getState().loadDecks();
        useFlashcardStore.setState({ session: restored });
        toast('Resumed your previous mixed review', 'info');
        return;
      }
    }

    await startGlobalSession(forceCram);
  },
});
