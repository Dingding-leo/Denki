import React, { useEffect, useState } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { useFlashcardStore } from './store/useFlashcardStore';

// Layout
import { MainLayout } from './components/layout/MainLayout';

// Pages
import { DashboardPage } from './pages/DashboardPage';
import { ClassViewPage } from './pages/ClassViewPage';
import { StudySessionPage } from './pages/StudySessionPage';

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
      <div style={{ display: 'flex', minHeight: '100vh', alignItems: 'center', justifyContent: 'center', background: '#0a0e17', color: '#f3f4f6' }}>
        <h2>Initializing Denki...</h2>
      </div>
    );
  }

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<MainLayout />}>
          <Route index element={<DashboardPage />} />
          <Route path="class/:classId" element={<ClassViewPage />} />
        </Route>
        
        {/* Immersion Study Session routes (No sidebar) */}
        <Route path="/study/class/:classId" element={<StudySessionPage />} />
        <Route path="/study/deck/:deckId" element={<StudySessionPage />} />
      </Routes>
    </BrowserRouter>
  );
};

export default App;
