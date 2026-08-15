import React, { useMemo, useState } from 'react';
import { NavLink, useNavigate, useParams } from 'react-router-dom';
import { BookOpen, ChevronLeft, ChevronRight, Home, Plus, Search, Settings } from 'lucide-react';
import { useFlashcardStore } from '../../store/useFlashcardStore';
import { useUIStore } from '../../store/uiStore';
import { CreateClassModal } from '../modals/CreateClassModal';
import { SettingsModal } from '../modals/SettingsModal';

const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform);

export const Sidebar: React.FC = () => {
  const classes = useFlashcardStore((state) => state.classes);
  const classStats = useFlashcardStore((state) => state.classStats);
  const currentStreak = useFlashcardStore((state) => state.currentStreak);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [showClassModal, setShowClassModal] = useState(false);
  const [showSettingsModal, setShowSettingsModal] = useState(false);

  const navigate = useNavigate();
  const { classId: routeClassId } = useParams();
  const activeClassId = routeClassId ? Number.parseInt(routeClassId, 10) : null;

  const classesWithMastery = useMemo(() => {
    return classes.map((studyClass) => {
      const stats = classStats[studyClass.id ?? 0] ?? {
        total: 0,
        dueCount: 0,
        masteryPct: 0,
        decksCount: 0,
      };

      return {
        ...studyClass,
        total: stats.total,
        dueCount: stats.dueCount,
        masteryPct: stats.masteryPct,
        decksCount: stats.decksCount,
      };
    });
  }, [classes, classStats]);

  return (
    <>
      <aside className={`zine-sidebar ${sidebarCollapsed ? 'is-collapsed' : ''}`}>
        <button
          type="button"
          onClick={() => setSidebarCollapsed((collapsed) => !collapsed)}
          className="zine-sidebar-toggle"
          aria-label={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          aria-expanded={!sidebarCollapsed}
          title={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          {sidebarCollapsed ? <ChevronRight size={14} /> : <ChevronLeft size={14} />}
        </button>

        <header className="zine-brand">
          <div className="zine-brand-mark" aria-hidden="true">D/01</div>
          <div className="zine-brand-copy">
            <span className="zine-brand-title">DENKI</span>
            <span className="zine-brand-subtitle">Study Press · Local Edition</span>
            {currentStreak > 0 && (
              <span className="zine-brand-streak">Day {currentStreak} · Still printing</span>
            )}
          </div>
        </header>

        <nav className="zine-sidebar-primary" aria-label="Primary navigation">
          <button
            type="button"
            onClick={() => useUIStore.getState().setPaletteOpen(true)}
            className="zine-search"
            aria-label="Search classes, decks and cards"
            title={`Search (${isMac ? '⌘' : 'Ctrl+'}K)`}
          >
            <Search size={15} aria-hidden="true" />
            <span className="zine-nav-copy">Search the archive</span>
            <span className="zine-shortcut">{isMac ? '⌘K' : '^K'}</span>
          </button>

          <NavLink
            to="/"
            end
            className={({ isActive }) => `zine-nav-link ${isActive ? 'is-active' : ''}`}
            title={sidebarCollapsed ? 'Study desk' : undefined}
          >
            <Home size={16} aria-hidden="true" />
            <span className="zine-nav-copy">Study desk</span>
          </NavLink>

          <NavLink
            to="/ai-generate"
            className={({ isActive }) => `zine-nav-link ${isActive ? 'is-active' : ''}`}
            title={sidebarCollapsed ? 'Card lab' : undefined}
          >
            <BookOpen size={16} aria-hidden="true" />
            <span className="zine-nav-copy">Card lab</span>
          </NavLink>
        </nav>

        <section className="zine-library" aria-labelledby="library-index-heading">
          <div className="zine-library-heading">
            <span id="library-index-heading">Library index / {String(classesWithMastery.length).padStart(2, '0')}</span>
            <button
              type="button"
              onClick={() => setShowClassModal(true)}
              className="zine-add-class"
              aria-label="Create new class"
              title="Create new class"
            >
              <Plus size={14} />
            </button>
          </div>

          <div className="zine-class-list">
            {classesWithMastery.map((studyClass, index) => {
              if (studyClass.id === undefined) return null;
              const isSelected = activeClassId === studyClass.id;
              const classNumber = String(index + 1).padStart(2, '0');

              return (
                <NavLink
                  key={studyClass.id}
                  to={`/class/${studyClass.id}`}
                  className={`zine-class-link ${isSelected ? 'is-active' : ''}`}
                  title={sidebarCollapsed ? `${studyClass.name} · ${studyClass.total} cards` : undefined}
                >
                  <span className="zine-class-index" aria-label={`${studyClass.masteryPct}% mastered`}>
                    {sidebarCollapsed ? classNumber : `${studyClass.masteryPct}%`}
                  </span>
                  <span className="zine-class-copy">
                    <span className="zine-class-name">{classNumber}. {studyClass.name}</span>
                    <span className="zine-class-meta">
                      {studyClass.decksCount} decks / {studyClass.total} cards
                    </span>
                  </span>
                  {studyClass.dueCount > 0 && (
                    <span className="zine-due-stamp" title={`${studyClass.dueCount} cards due`}>
                      {studyClass.dueCount} due
                    </span>
                  )}
                </NavLink>
              );
            })}
          </div>
        </section>

        <footer className="zine-sidebar-footer">
          <button
            type="button"
            onClick={() => setShowSettingsModal(true)}
            className="zine-settings-button"
            aria-label="Open settings"
            title="App settings"
          >
            <Settings size={16} />
            <span className="zine-settings-copy">Press settings</span>
          </button>
        </footer>
      </aside>

      {showClassModal && (
        <CreateClassModal
          onClose={() => setShowClassModal(false)}
          onClassCreated={(classId) => {
            setShowClassModal(false);
            navigate(`/class/${classId}`);
          }}
        />
      )}

      {showSettingsModal && (
        <SettingsModal onClose={() => setShowSettingsModal(false)} />
      )}
    </>
  );
};
