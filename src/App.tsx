import React, { useEffect, useState, lazy, Suspense } from 'react';
import { HashRouter, Routes, Route } from 'react-router-dom';
import { useFlashcardStore } from './store/useFlashcardStore';

// Layout (eager — it's the app shell)
import { MainLayout } from './components/layout/MainLayout';
import { ErrorBoundary } from './components/ErrorBoundary';
import { GlobalUI } from './components/ui/GlobalUI';
import { requestPersistentStorage, maybeNudgeBackup } from './services/dataSafety';
import { restoreFromBackupIfNeeded } from './services/backup';

// Pages are route-split so heavy leaves (AI generator, importers, analytics,
// prism/marked) don't inflate the initial bundle.
const DashboardPage = lazy(() => import('./pages/DashboardPage').then(m => ({ default: m.DashboardPage })));
const ClassViewPage = lazy(() => import('./pages/ClassViewPage').then(m => ({ default: m.ClassViewPage })));
const StudySessionPage = lazy(() => import('./pages/StudySessionPage').then(m => ({ default: m.StudySessionPage })));
const AIGeneratePage = lazy(() => import('./pages/AIGeneratePage'));

const PageFallback = () => (
  <div style={{ display: 'flex', minHeight: '100vh', alignItems: 'center', justifyContent: 'center', background: '#09090b', color: '#a1a1aa' }}>
    Loading…
  </div>
);

const App: React.FC = () => {
  const store = useFlashcardStore();
  const [isInitializing, setIsInitializing] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        // If IndexedDB is empty (first run, eviction, "clear site data"),
        // restore the dev/filesystem backup before anything else loads.
        await restoreFromBackupIfNeeded();
        await Promise.all([
          store.loadClasses(),
          store.loadDecks(),
        ]);
      } catch (err) {
        console.error('Failed to initialize Denki:', err);
      } finally {
        setIsInitializing(false);
      }
    })();

    // Data safety: shield IndexedDB from eviction and remind about stale backups
    requestPersistentStorage();
    maybeNudgeBackup();
  }, []);

  if (isInitializing) {
    return (
      <div style={{ display: 'flex', minHeight: '100vh', alignItems: 'center', justifyContent: 'center', background: '#09090b', color: '#f3f4f6' }}>
        <h2>Initializing Denki...</h2>
      </div>
    );
  }

  return (
    <ErrorBoundary>
      <HashRouter>
        <GlobalUI />
        <Suspense fallback={<PageFallback />}>
          <Routes>
            <Route path="/" element={<MainLayout />}>
              <Route index element={<DashboardPage />} />
              <Route path="class/:classId" element={<ClassViewPage />} />
              <Route path="ai-generate" element={<AIGeneratePage />} />
            </Route>

            {/* Immersion Study Session routes (No sidebar) */}
            <Route path="/study/class/:classId" element={<StudySessionPage />} />
            <Route path="/study/deck/:deckId" element={<StudySessionPage />} />
          </Routes>
        </Suspense>
      </HashRouter>
    </ErrorBoundary>
  );
};

export default App;
