import React, { useEffect, useState } from 'react';
import { HashRouter, Routes, Route } from 'react-router-dom';
import { useFlashcardStore } from './store/useFlashcardStore';

// Layout
import { MainLayout } from './components/layout/MainLayout';
import { ErrorBoundary } from './components/ErrorBoundary';

// Pages
import { DashboardPage } from './pages/DashboardPage';
import { ClassViewPage } from './pages/ClassViewPage';
import { StudySessionPage } from './pages/StudySessionPage';
import AIGeneratePage from './pages/AIGeneratePage';

const App: React.FC = () => {
  const store = useFlashcardStore();
  const [isInitializing, setIsInitializing] = useState(true);

  useEffect(() => {
    Promise.all([
      store.loadClasses(),
      store.loadDecks()
    ]).then(() => setIsInitializing(false));
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
      </HashRouter>
    </ErrorBoundary>
  );
};

export default App;
