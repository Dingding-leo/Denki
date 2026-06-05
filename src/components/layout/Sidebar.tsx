import React, { useState, useMemo } from 'react';
import { NavLink, useNavigate, useParams } from 'react-router-dom';
import { ChevronRight, ChevronLeft, Sparkles, LayoutDashboard, Plus, Settings } from 'lucide-react';
import { useFlashcardStore } from '../../store/useFlashcardStore';
import { CreateClassModal } from '../modals/CreateClassModal';
import { SettingsModal } from '../modals/SettingsModal';

export const Sidebar: React.FC = () => {
  const store = useFlashcardStore();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [showClassModal, setShowClassModal] = useState(false);
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  
  const navigate = useNavigate();
  const { classId: routeClassId } = useParams();
  const activeClassId = routeClassId ? parseInt(routeClassId, 10) : null;

  const currentStreak = store.currentStreak;
 
  const classesWithMastery = useMemo(() => {
    return store.classes.map(cls => {
      const stats = store.classStats[cls.id || 0] || {
        total: 0,
        dueCount: 0,
        masteryPct: 0,
        decksCount: 0,
      };
      return {
        ...cls,
        total: stats.total,
        dueCount: stats.dueCount,
        masteryPct: stats.masteryPct,
        decksCount: stats.decksCount,
      };
    });
  }, [store.classes, store.classStats]);

  return (
    <>
      <aside style={{
        width: sidebarCollapsed ? '72px' : '280px',
        background: 'rgba(28, 28, 30, 0.8)',
        backdropFilter: 'blur(20px)',
        WebkitBackdropFilter: 'blur(20px)',
        borderRight: '1px solid rgba(255, 255, 255, 0.08)',
        display: 'flex',
        flexDirection: 'column',
        zIndex: 10,
        transition: 'width 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
        position: 'relative',
        height: '100vh',
      }}>
        {/* Collapse Trigger Overlay */}
        <button
          onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
          style={{
            position: 'absolute',
            top: '24px',
            right: '-12px',
            width: '24px',
            height: '24px',
            borderRadius: '50%',
            background: '#2c2c2e',
            border: '1px solid rgba(255, 255, 255, 0.12)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#8e8e93',
            cursor: 'pointer',
            zIndex: 100,
            boxShadow: '0 2px 8px rgba(0, 0, 0, 0.4)',
          }}
          title={sidebarCollapsed ? "Expand Sidebar" : "Collapse Sidebar"}
        >
          {sidebarCollapsed ? <ChevronRight size={12} /> : <ChevronLeft size={12} />}
        </button>

        {/* Logo Brand Header */}
        <div style={{
          height: '70px',
          display: 'flex',
          alignItems: 'center',
          padding: sidebarCollapsed ? '0' : '0 20px',
          justifyContent: sidebarCollapsed ? 'center' : 'flex-start',
          borderBottom: '1px solid rgba(255,255,255,0.06)',
          gap: '12px',
        }}>
          <div style={{
            width: '32px',
            height: '32px',
            borderRadius: '8px',
            background: 'linear-gradient(135deg, #0a84ff, #5e5ce6)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'white',
            boxShadow: '0 0 12px rgba(10, 132, 255, 0.2)',
            flexShrink: 0,
          }}>
            <Sparkles size={16} />
          </div>
          {!sidebarCollapsed && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
              <span style={{ fontSize: '18px', fontWeight: 800, letterSpacing: '0.5px' }} className="gradient-text">
                DENKI
              </span>
              {currentStreak > 0 && (
                <span style={{ fontSize: '10px', color: '#ff9f0a', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '3px' }} title="Daily Study Streak!">
                  🔥 {currentStreak} day streak
                </span>
              )}
            </div>
          )}
        </div>

        {/* Home Link */}
        <div style={{ padding: sidebarCollapsed ? '12px 6px' : '16px 12px', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
          <NavLink
            to="/"
            style={({ isActive }) => ({
              display: 'flex',
              alignItems: 'center',
              gap: '12px',
              width: '100%',
              padding: '10px 12px',
              borderRadius: '8px',
              border: 'none',
              background: isActive && !activeClassId ? 'rgba(255, 255, 255, 0.08)' : 'transparent',
              color: isActive && !activeClassId ? '#ffffff' : '#8e8e93',
              fontSize: '13px',
              fontWeight: 600,
              cursor: 'pointer',
              transition: 'all 0.2s ease',
              justifyContent: sidebarCollapsed ? 'center' : 'flex-start',
              textDecoration: 'none'
            })}
            className="hover-glow"
          >
            {({ isActive }) => (
              <>
                <LayoutDashboard size={16} style={{ color: isActive && !activeClassId ? '#0a84ff' : '#8e8e93', flexShrink: 0 }} />
                {!sidebarCollapsed && <span>Dashboard Home</span>}
              </>
            )}
          </NavLink>
        </div>

        {/* MY CLASSES LIST */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            padding: sidebarCollapsed ? '12px 0' : '16px 16px 8px 16px',
            color: '#6b7280',
            fontSize: '11px',
            textTransform: 'uppercase',
            letterSpacing: '1px',
            fontWeight: 700,
            justifyContent: sidebarCollapsed ? 'center' : 'space-between',
          }}>
            {!sidebarCollapsed && <span>My Classes</span>}
            <button
              onClick={() => setShowClassModal(true)}
              style={{
                background: 'rgba(255,255,255,0.03)',
                border: '1px solid rgba(255,255,255,0.08)',
                borderRadius: '4px',
                width: '20px',
                height: '20px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
                color: '#9ca3af',
              }}
              title="Create New Class"
            >
              <Plus size={12} />
            </button>
          </div>

          {/* Scrollable Classes List */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '6px 8px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
            {classesWithMastery.map(cls => {
              const isSelected = activeClassId === cls.id;
              
              return (
                <NavLink
                  key={cls.id}
                  to={`/class/${cls.id}`}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '12px',
                    width: '100%',
                    padding: sidebarCollapsed ? '10px 0' : '10px 12px',
                    borderRadius: '8px',
                    border: 'none',
                    background: isSelected ? 'rgba(255,255,255,0.08)' : 'transparent',
                    color: isSelected ? '#ffffff' : '#8e8e93',
                    cursor: 'pointer',
                    transition: 'all 0.15s ease',
                    justifyContent: sidebarCollapsed ? 'center' : 'flex-start',
                    borderLeft: isSelected ? '3px solid #0a84ff' : '3px solid transparent',
                    textDecoration: 'none'
                  }}
                  className="hover-glow"
                  title={sidebarCollapsed ? `${cls.name} (${cls.total} cards)` : undefined}
                >
                  <div style={{ position: 'relative', width: '22px', height: '22px', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <svg width="22" height="22" viewBox="0 0 22 22">
                      <circle cx="11" cy="11" r="9" fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="2.5" />
                      <circle
                          cx="11" cy="11" r="9"
                          fill="none"
                          stroke={cls.total > 0 ? `url(#classMasterGrad-${cls.id})` : "rgba(255,255,255,0.1)"}
                          strokeWidth="2.5"
                          strokeDasharray={56.5}
                          strokeDashoffset={56.5 - (56.5 * cls.masteryPct) / 100}
                          strokeLinecap="round"
                          transform="rotate(-90 11 11)"
                      />
                      <defs>
                        <linearGradient id={`classMasterGrad-${cls.id}`} x1="0" y1="0" x2="1" y2="1">
                          <stop offset="0%" stopColor="#0a84ff" />
                          <stop offset="100%" stopColor="#30d158" />
                        </linearGradient>
                      </defs>
                    </svg>
                    {sidebarCollapsed ? null : (
                      <span style={{ position: 'absolute', fontSize: '7px', fontWeight: 700, color: '#f3f4f6' }}>
                        {cls.masteryPct}
                      </span>
                    )}
                  </div>
 
                  {!sidebarCollapsed && (
                    <div style={{ flex: 1, textAlign: 'left', overflow: 'hidden' }}>
                      <p style={{ fontSize: '13px', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {cls.name}
                      </p>
                      <p style={{ fontSize: '10px', color: '#636366' }}>{cls.decksCount} decks • {cls.total} cards</p>
                    </div>
                  )}
 
                  {!sidebarCollapsed && cls.dueCount > 0 && (
                    <span style={{
                      background: 'rgba(10, 132, 255, 0.15)',
                      border: '1px solid rgba(10, 132, 255, 0.3)',
                      color: '#0a84ff',
                      fontSize: '9px',
                      fontWeight: 700,
                      padding: '2px 6px',
                      borderRadius: '10px',
                    }}>
                      {cls.dueCount}
                    </span>
                  )}
                </NavLink>
              );
            })}
          </div>
        </div>

        {/* Sidebar Footer Settings Action */}
        <div style={{
          padding: '12px 16px',
          borderTop: '1px solid rgba(255,255,255,0.06)',
          display: 'flex',
          justifyContent: sidebarCollapsed ? 'center' : 'space-between',
          alignItems: 'center',
          gap: '12px',
        }}>
          <button
            onClick={() => setShowSettingsModal(true)}
            style={{
              background: 'transparent',
              border: 'none',
              color: '#8e8e93',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              fontSize: '13px',
              fontWeight: 600,
              padding: '6px 8px',
              borderRadius: '6px',
              width: sidebarCollapsed ? '32px' : 'auto',
              height: '32px',
              justifyContent: 'center',
              transition: 'all 0.2s',
            }}
            className="hover-lift"
            title="App Settings"
          >
            <Settings size={16} />
            {!sidebarCollapsed && <span>Settings</span>}
          </button>
        </div>
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
        <SettingsModal 
          onClose={() => setShowSettingsModal(false)}
        />
      )}
    </>
  );
};
