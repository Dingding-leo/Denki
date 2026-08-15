import React, { useEffect } from 'react';
import { X, Keyboard } from 'lucide-react';
import { useUIStore } from '../../store/uiStore';

interface ShortcutGroup {
  title: string;
  shortcuts: { keys: string[]; label: string }[];
}

const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform);
const MOD = isMac ? '⌘' : 'Ctrl';

const GROUPS: ShortcutGroup[] = [
  {
    title: 'Global',
    shortcuts: [
      { keys: [MOD, 'K'], label: 'Open command palette (search everything)' },
      { keys: ['?'], label: 'Show this shortcut reference' },
      { keys: ['Esc'], label: 'Close dialogs and overlays' },
    ],
  },
  {
    title: 'Study Session (Review)',
    shortcuts: [
      { keys: ['Space'], label: 'Flip the current card' },
      { keys: ['1', '–', '4'], label: 'Rate recall (Again → Easy)' },
      { keys: ['Z'], label: 'Undo last rating' },
      { keys: ['Esc'], label: 'Exit the study session' },
    ],
  },
  {
    title: 'Learn Mode',
    shortcuts: [
      { keys: ['Space'], label: 'Reveal answer / continue' },
      { keys: ['1', '–', '4'], label: 'Rate your answer' },
      { keys: ['Esc'], label: 'Back to session overview' },
    ],
  },
  {
    title: 'Match Game',
    shortcuts: [
      { keys: ['Esc'], label: 'Exit the game' },
    ],
  },
];

export const ShortcutsModal: React.FC = () => {
  const open = useUIStore(s => s.shortcutsOpen);
  const setOpen = useUIStore(s => s.setShortcutsOpen);

  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        e.preventDefault();
        setOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [open, setOpen]);

  if (!open) return null;

  return (
    <div
      onClick={() => setOpen(false)}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0, 0, 0, 0.65)',
        backdropFilter: 'blur(8px)',
        WebkitBackdropFilter: 'blur(8px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 3000,
        padding: '20px',
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Keyboard shortcuts"
        onClick={e => e.stopPropagation()}
        className="glass-panel"
        style={{
          width: '100%',
          maxWidth: '520px',
          maxHeight: '85vh',
          overflowY: 'auto',
          background: 'rgba(24, 24, 27, 0.98)',
          border: '1px solid rgba(255, 255, 255, 0.12)',
          display: 'flex',
          flexDirection: 'column',
          gap: '18px',
          animation: 'slideUpFade 0.2s cubic-bezier(0.16, 1, 0.3, 1)',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid rgba(255,255,255,0.06)', paddingBottom: '12px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--accent-color)' }}>
            <Keyboard size={18} />
            <h3 style={{ fontSize: '17px', fontWeight: 800, color: 'var(--text-primary)' }}>Keyboard Shortcuts</h3>
          </div>
          <button
            onClick={() => setOpen(false)}
            aria-label="Close shortcuts"
            style={{ background: 'transparent', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', padding: '4px' }}
          >
            <X size={18} />
          </button>
        </div>

        {GROUPS.map(group => (
          <div key={group.title}>
            <h4 style={{
              fontSize: '11px',
              color: 'var(--text-muted)',
              textTransform: 'uppercase',
              letterSpacing: '0.8px',
              marginBottom: '10px',
              fontWeight: 700,
            }}>
              {group.title}
            </h4>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {group.shortcuts.map(sc => (
                <div key={sc.label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '16px' }}>
                  <span style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>{sc.label}</span>
                  <span style={{ display: 'flex', gap: '4px', alignItems: 'center', flexShrink: 0 }}>
                    {sc.keys.map((k, i) =>
                      k === '–' ? (
                        <span key={i} style={{ color: 'var(--text-muted)', fontSize: '11px' }}>–</span>
                      ) : (
                        <kbd key={i} className="keycap-badge" style={{ fontSize: '10px', padding: '3px 7px' }}>{k}</kbd>
                      ),
                    )}
                  </span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
