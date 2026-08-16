import React, { lazy, Suspense, useEffect, useState } from 'react';
import { HashRouter, Route, Routes } from 'react-router-dom';
import { ErrorBoundary } from './components/ErrorBoundary';
import { MainLayout } from './components/layout/MainLayout';
import { GlobalUI } from './components/ui/GlobalUI';
import { restoreFromBackupIfNeeded } from './services/backup';
import { maybeNudgeBackup, requestPersistentStorage } from './services/dataSafety';
import { useFlashcardStore } from './store/useFlashcardStore';

const DashboardPage = lazy(() =>
  import('./pages/DashboardPage').then((module) => ({ default: module.DashboardPage })));
const ClassViewPage = lazy(() =>
  import('./pages/ClassViewPage').then((module) => ({ default: module.ClassViewPage })));
const StudySessionPage = lazy(() =>
  import('./pages/StudySessionPage').then((module) => ({ default: module.StudySessionPage })));
const AIGeneratePage = lazy(() => import('./pages/AIGeneratePage'));

const FullPageStatus: React.FC<{ title: string; message?: string; error?: boolean }> = ({
  title,
  message,
  error = false,
}) => (
  <div style={{
    display: 'flex',
    minHeight: '100vh',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '12px',
    padding: '24px',
    textAlign: 'center',
    background: '#0d1511',
    color: '#d6ddcf',
  }}>
    <h2 style={{ margin: 0, fontSize: '20px' }}>{title}</h2>
    {message && (
      <p style={{ margin: 0, maxWidth: '480px', color: error ? '#d69a8f' : '#98a399', lineHeight: 1.5 }}>
        {message}
      </p>
    )}
    {error && (
      <button
        type="button"
        onClick={() => window.location.reload()}
        style={{
          marginTop: '4px',
          padding: '9px 16px',
          border: '1px solid #819282',
          background: '#1a2a21',
          color: '#d6ddcf',
          cursor: 'pointer',
          fontWeight: 700,
        }}
      >
        Reload Denki
      </button>
    )}
  </div>
);

const PageFallback = () => <FullPageStatus title="Opening the archive…" />;

const App: React.FC = () => {
  const [isInitializing, setIsInitializing] = useState(true);
  const [initializationError, setInitializationError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    const initialize = async () => {
      try {
        await restoreFromBackupIfNeeded();
        await Promise.all([
          useFlashcardStore.getState().loadClasses(),
          useFlashcardStore.getState().loadDecks(),
        ]);

        // Run safety checks only after the current/restored library is loaded so
        // the backup reminder sees the correct card count.
        await requestPersistentStorage();
        await maybeNudgeBackup();
      } catch (error) {
        console.error('Failed to initialize Denki:', error);
        if (!cancelled) {
          setInitializationError(
            error instanceof Error ? error.message : 'The local database could not be opened.',
          );
        }
      } finally {
        if (!cancelled) setIsInitializing(false);
      }
    };

    void initialize();
    return () => {
      cancelled = true;
    };
  }, []);

  if (isInitializing) {
    return <FullPageStatus title="Opening Denki…" message="Checking your local study archive." />;
  }

  if (initializationError) {
    return (
      <FullPageStatus
        title="Denki could not open the local archive"
        message={initializationError}
        error
      />
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

            <Route path="/study/all" element={<ErrorBoundary><StudySessionPage /></ErrorBoundary>} />
            <Route path="/study/class/:classId" element={<ErrorBoundary><StudySessionPage /></ErrorBoundary>} />
            <Route path="/study/deck/:deckId" element={<ErrorBoundary><StudySessionPage /></ErrorBoundary>} />
            <Route path="/study/deck/:deckId/drill" element={<ErrorBoundary><StudySessionPage /></ErrorBoundary>} />
          </Routes>
        </Suspense>
      </HashRouter>
    </ErrorBoundary>
  );
};

export default App;
