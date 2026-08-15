import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, GraduationCap, Layers, FileText, LayoutDashboard, Sparkles, Keyboard, CornerDownLeft, Play } from 'lucide-react';
import { db } from '../db';
import type { Class, Deck, Card } from '../db/schema';
import { useUIStore } from '../store/uiStore';

interface PaletteItem {
  key: string;
  icon: React.ReactNode;
  title: string;
  subtitle?: string;
  section: string;
  action: () => void;
}

/** Strip markdown/cloze syntax so card previews read as plain text. */
const plainText = (s: string) =>
  s
    .replace(/\{\{c\d+::(.*?)(::.*?)?\}\}/g, '$1')
    .replace(/[#*`>_[\]]/g, '')
    .replace(/\s+/g, ' ')
    .trim();

/**
 * Mounted only while the palette is open, so every open starts from fresh
 * state without reset effects.
 */
const PaletteInner: React.FC<{ close: () => void }> = ({ close }) => {
  const setShortcutsOpen = useUIStore(s => s.setShortcutsOpen);
  const navigate = useNavigate();

  const [query, setQuery] = useState('');
  const [classes, setClasses] = useState<Class[]>([]);
  const [decks, setDecks] = useState<Deck[]>([]);
  const [cardHits, setCardHits] = useState<Card[]>([]);
  const [rawSelectedIndex, setRawSelectedIndex] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);

  // Load fresh classes/decks straight from Dexie — the store's deck list can
  // be filtered down to the active class.
  useEffect(() => {
    Promise.all([db.classes.toArray(), db.decks.toArray()]).then(([cls, dks]) => {
      setClasses(cls);
      setDecks(dks);
    });
  }, []);

  // Debounced full-text card search across every deck
  useEffect(() => {
    const q = query.trim().toLowerCase();
    const handle = window.setTimeout(() => {
      if (q.length < 2) {
        setCardHits([]);
        return;
      }
      db.cards
        .filter(c => c.front.toLowerCase().includes(q) || c.back.toLowerCase().includes(q))
        .limit(8)
        .toArray()
        .then(setCardHits);
    }, 120);
    return () => window.clearTimeout(handle);
  }, [query]);

  const items = useMemo<PaletteItem[]>(() => {
    const q = query.trim().toLowerCase();
    const result: PaletteItem[] = [];

    const actions: PaletteItem[] = [
      {
        key: 'action-dashboard',
        icon: <LayoutDashboard size={15} />,
        title: 'Go to Dashboard',
        section: 'Actions',
        action: () => { close(); navigate('/'); },
      },
      {
        key: 'action-today',
        icon: <Play size={15} />,
        title: "Review Today's Queue",
        subtitle: 'Mix every due card across your library',
        section: 'Actions',
        action: () => { close(); navigate('/study/all'); },
      },
      {
        key: 'action-ai',
        icon: <Sparkles size={15} />,
        title: 'AI Generate Cards',
        section: 'Actions',
        action: () => { close(); navigate('/ai-generate'); },
      },
      {
        key: 'action-shortcuts',
        icon: <Keyboard size={15} />,
        title: 'Keyboard Shortcuts',
        section: 'Actions',
        action: () => { close(); setShortcutsOpen(true); },
      },
    ];
    result.push(...(q ? actions.filter(a => a.title.toLowerCase().includes(q)) : actions));

    const classById = new Map(classes.map(c => [c.id, c]));

    const matchingClasses = q ? classes.filter(c => c.name.toLowerCase().includes(q)) : classes;
    result.push(
      ...matchingClasses.slice(0, 6).map(c => ({
        key: `class-${c.id}`,
        icon: <GraduationCap size={15} />,
        title: c.name,
        subtitle: c.description || undefined,
        section: 'Classes',
        action: () => { close(); navigate(`/class/${c.id}`); },
      })),
    );

    const matchingDecks = q ? decks.filter(d => d.name.toLowerCase().includes(q)) : [];
    result.push(
      ...matchingDecks.slice(0, 6).map(d => ({
        key: `deck-${d.id}`,
        icon: <Layers size={15} />,
        title: d.name,
        subtitle: classById.get(d.classId)?.name,
        section: 'Decks',
        action: () => { close(); navigate(`/class/${d.classId}`); },
      })),
    );

    const deckById = new Map(decks.map(d => [d.id, d]));
    result.push(
      ...cardHits.map(c => ({
        key: `card-${c.id}`,
        icon: <FileText size={15} />,
        title: plainText(c.front).slice(0, 80) || '(empty front)',
        subtitle: deckById.get(c.deckId)
          ? `${classById.get(c.classId)?.name ?? ''} › ${deckById.get(c.deckId)?.name ?? ''}`
          : undefined,
        section: 'Cards',
        action: () => { close(); navigate(`/class/${c.classId}`); },
      })),
    );

    return result;
  }, [query, classes, decks, cardHits, close, navigate, setShortcutsOpen]);

  // Clamp at render time instead of resetting state when the list shrinks
  const selectedIndex = Math.min(rawSelectedIndex, Math.max(0, items.length - 1));

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Legacy aliases (Down/Up/Return) cover pre-standard key names
      if (e.key === 'Escape') {
        e.stopPropagation();
        e.preventDefault();
        close();
      } else if (e.key === 'ArrowDown' || e.key === 'Down') {
        e.preventDefault();
        setRawSelectedIndex(Math.min(selectedIndex + 1, items.length - 1));
      } else if (e.key === 'ArrowUp' || e.key === 'Up') {
        e.preventDefault();
        setRawSelectedIndex(Math.max(selectedIndex - 1, 0));
      } else if (e.key === 'Enter' || e.key === 'Return') {
        e.preventDefault();
        items[selectedIndex]?.action();
      }
    };
    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [items, selectedIndex, close]);

  // Keep the highlighted row visible while arrowing through the list
  useEffect(() => {
    listRef.current
      ?.querySelector(`[data-index="${selectedIndex}"]`)
      ?.scrollIntoView({ block: 'nearest' });
  }, [selectedIndex]);

  let lastSection = '';

  return (
    <div
      onClick={close}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0, 0, 0, 0.6)',
        backdropFilter: 'blur(6px)',
        WebkitBackdropFilter: 'blur(6px)',
        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: 'center',
        paddingTop: 'min(18vh, 160px)',
        zIndex: 3000,
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Command palette"
        onClick={e => e.stopPropagation()}
        style={{
          width: 'min(560px, calc(100vw - 32px))',
          background: 'rgba(24, 24, 27, 0.98)',
          border: '1px solid rgba(255, 255, 255, 0.12)',
          borderRadius: '14px',
          boxShadow: '0 24px 80px rgba(0, 0, 0, 0.6)',
          overflow: 'hidden',
          animation: 'slideUpFade 0.2s cubic-bezier(0.16, 1, 0.3, 1)',
        }}
      >
        {/* Search input */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '14px 16px', borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
          <Search size={16} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
          <input
            autoFocus
            value={query}
            onChange={e => { setQuery(e.target.value); setRawSelectedIndex(0); }}
            placeholder="Search classes, decks, cards…"
            aria-label="Search classes, decks and cards"
            style={{
              flex: 1,
              background: 'transparent',
              border: 'none',
              outline: 'none',
              color: 'var(--text-primary)',
              fontSize: '15px',
              fontFamily: 'inherit',
            }}
          />
          <kbd className="keycap-badge" style={{ fontSize: '10px' }}>ESC</kbd>
        </div>

        {/* Results */}
        <div ref={listRef} style={{ maxHeight: 'min(50vh, 420px)', overflowY: 'auto', padding: '8px' }}>
          {items.length === 0 ? (
            <div style={{ padding: '28px 16px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '13px' }}>
              No results for “{query}”
            </div>
          ) : (
            items.map((item, idx) => {
              const showHeader = item.section !== lastSection;
              lastSection = item.section;
              const selected = idx === selectedIndex;
              return (
                <React.Fragment key={item.key}>
                  {showHeader && (
                    <div style={{
                      fontSize: '10px',
                      fontWeight: 700,
                      textTransform: 'uppercase',
                      letterSpacing: '0.8px',
                      color: 'var(--text-muted)',
                      padding: '8px 10px 4px',
                    }}>
                      {item.section}
                    </div>
                  )}
                  <div
                    data-index={idx}
                    role="button"
                    tabIndex={-1}
                    onClick={item.action}
                    onMouseMove={() => setRawSelectedIndex(idx)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '10px',
                      padding: '9px 10px',
                      borderRadius: '8px',
                      cursor: 'pointer',
                      background: selected ? 'rgba(37, 99, 235, 0.16)' : 'transparent',
                      border: selected ? '1px solid rgba(37, 99, 235, 0.35)' : '1px solid transparent',
                    }}
                  >
                    <span style={{ color: selected ? '#93c5fd' : 'var(--text-muted)', display: 'flex', flexShrink: 0 }}>
                      {item.icon}
                    </span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{
                        fontSize: '13px',
                        fontWeight: 500,
                        color: 'var(--text-primary)',
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                      }}>
                        {item.title}
                      </div>
                      {item.subtitle && (
                        <div style={{
                          fontSize: '11px',
                          color: 'var(--text-muted)',
                          whiteSpace: 'nowrap',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                        }}>
                          {item.subtitle}
                        </div>
                      )}
                    </div>
                    {selected && <CornerDownLeft size={13} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />}
                  </div>
                </React.Fragment>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
};

export const CommandPalette: React.FC = () => {
  const open = useUIStore(s => s.paletteOpen);
  const setOpen = useUIStore(s => s.setPaletteOpen);

  if (!open) return null;
  return <PaletteInner close={() => setOpen(false)} />;
};
