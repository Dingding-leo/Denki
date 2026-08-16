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

export const useFlashcardStore = create<FlashcardState>((...args) => ({
  ...createClassSlice(...args),
  ...createDeckSlice(...args),
  ...createCardSlice(...args),
  ...createStudySlice(...args),
  ...createStatsSlice(...args),
}));

let lastSession = useFlashcardStore.getState().session;
useFlashcardStore.subscribe((state) => {
  if (state.session === lastSession) return;
  lastSession = state.session;
  if (state.session) persistStudySession(state.session);
  else clearPersistedStudySession();
});

const startDeckSession = useFlashcardStore.getState().startStudySession;
const startClassSession = useFlashcardStore.getState().startClassStudySession;
const startGlobalSession = useFlashcardStore.getState().startGlobalStudySession;
const startDeckDrill = useFlashcardStore.getState().startDrillSession;

useFlashcardStore.setState({
  startStudySession: async (deckId, forceCram = false) => {
    if (!forceCram) {
      const current = useFlashcardStore.getState().session;
      if (current?.deckId === deckId && !current.isDrill) return;
      const restored = await restorePersistedStudySession({ deckId, isDrill: false });
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
      if (current?.classId === classId && !current.isDrill) return;
      const restored = await restorePersistedStudySession({ classId, isDrill: false });
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
      if (current?.isGlobal && !current.isDrill) return;
      const restored = await restorePersistedStudySession({ isGlobal: true, isDrill: false });
      if (restored) {
        await useFlashcardStore.getState().loadDecks();
        useFlashcardStore.setState({ session: restored });
        toast('Resumed your previous mixed review', 'info');
        return;
      }
    }
    await startGlobalSession(forceCram);
  },
  startDrillSession: async (deckId, buckets) => {
    if (buckets !== undefined) {
      await startDeckDrill(deckId, buckets);
      return;
    }

    const current = useFlashcardStore.getState().session;
    if (current?.deckId === deckId && current.isDrill) return;
    const restored = await restorePersistedStudySession({ deckId, isDrill: true });
    if (restored) {
      useFlashcardStore.setState({ session: restored });
      toast('Resumed your previous drill', 'info');
      return;
    }
    await startDeckDrill(deckId, buckets);
  },
});
