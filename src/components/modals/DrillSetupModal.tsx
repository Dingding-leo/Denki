import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Check, Shuffle, X } from 'lucide-react';
import { db } from '../../db';
import type { Card } from '../../db/schema';
import {
  ALL_DRILL_BUCKETS,
  countDrillBuckets,
  filterDrillCards,
  type DrillBucket,
} from '../../services/drill';
import { REVIEW_RATINGS } from '../../services/reviewRatings';

interface DrillSetupModalProps {
  deckId: number;
  deckName: string;
  onClose: () => void;
  onStart: (buckets: readonly DrillBucket[]) => Promise<void>;
}

const bucketDefinitions: readonly {
  bucket: DrillBucket;
  label: string;
  description: string;
  color: string;
}[] = [
  {
    bucket: 'new',
    label: 'New / unrated',
    description: 'Cards without a previous confidence result',
    color: '#8c9584',
  },
  ...REVIEW_RATINGS.map((rating) => ({
    bucket: rating.rating as DrillBucket,
    label: `${rating.rating} · ${rating.label}`,
    description: rating.description,
    color: rating.color,
  })),
];

export const DrillSetupModal: React.FC<DrillSetupModalProps> = ({
  deckId,
  deckName,
  onClose,
  onStart,
}) => {
  const [cards, setCards] = useState<Card[]>([]);
  const [selected, setSelected] = useState<DrillBucket[]>(() => [...ALL_DRILL_BUCKETS]);
  const [loading, setLoading] = useState(true);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState('');
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError('');
    void db.cards.where('deckId').equals(deckId).toArray()
      .then((rows) => {
        if (!cancelled) setCards(rows);
      })
      .catch((caughtError: unknown) => {
        if (!cancelled) {
          setError(caughtError instanceof Error ? caughtError.message : 'The deck could not be read.');
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [deckId]);

  useEffect(() => {
    const previousFocus = document.activeElement as HTMLElement | null;
    closeButtonRef.current?.focus();

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key !== 'Tab') return;

      const focusable = dialogRef.current?.querySelectorAll<HTMLElement>(
        'button:not(:disabled), [href], input:not(:disabled), [tabindex]:not([tabindex="-1"])',
      );
      if (!focusable || focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    window.addEventListener('keydown', handleKeyDown, true);
    return () => {
      window.removeEventListener('keydown', handleKeyDown, true);
      previousFocus?.focus();
    };
  }, [onClose]);

  const counts = useMemo(() => countDrillBuckets(cards), [cards]);
  const selectedCount = useMemo(
    () => filterDrillCards(cards, selected).length,
    [cards, selected],
  );

  const toggleBucket = (bucket: DrillBucket) => {
    setSelected((current) => current.includes(bucket)
      ? current.filter((item) => item !== bucket)
      : [...current, bucket]);
  };

  const handleStart = async () => {
    if (starting || loading || selectedCount === 0) return;
    setStarting(true);
    setError('');
    try {
      await onStart(selected);
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : 'The drill could not start.');
      setStarting(false);
    }
  };

  return (
    <div
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !starting) onClose();
      }}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 2400,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '20px',
        background: 'rgba(4, 10, 7, 0.8)',
        backdropFilter: 'blur(8px)',
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="drill-setup-title"
        className="glass-panel"
        style={{
          width: 'min(620px, 100%)',
          maxHeight: 'calc(100vh - 40px)',
          overflowY: 'auto',
          display: 'flex',
          flexDirection: 'column',
          gap: '18px',
          borderTop: '6px solid var(--accent-color)',
        }}
      >
        <header style={{ display: 'flex', justifyContent: 'space-between', gap: '16px', borderBottom: '2px solid var(--border)', paddingBottom: '14px' }}>
          <div>
            <p className="zine-section-kicker">Prepare to drill / one pass</p>
            <h2 id="drill-setup-title" style={{ marginTop: '5px', fontSize: '24px' }}>{deckName}</h2>
            <p style={{ marginTop: '7px', color: 'var(--text-secondary)', fontSize: '13px', lineHeight: 1.5 }}>
              Randomize the selected cards, see each exactly once, and keep every rating for future spaced-review scheduling.
            </p>
          </div>
          <button
            ref={closeButtonRef}
            type="button"
            onClick={onClose}
            disabled={starting}
            className="btn-premium-secondary"
            aria-label="Close drill setup"
            style={{ width: '34px', height: '34px', padding: 0, flexShrink: 0 }}
          >
            <X size={16} />
          </button>
        </header>

        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto', gap: '16px', alignItems: 'end' }}>
          <div>
            <span className="zine-field-label">Cards selected</span>
            <div style={{ marginTop: '5px', fontFamily: 'var(--font-display)', fontSize: '48px', lineHeight: 0.9, color: 'var(--text-primary)' }}>
              {loading ? '—' : selectedCount}
            </div>
            <p style={{ marginTop: '7px', color: 'var(--text-muted)', fontSize: '11px', fontFamily: 'var(--font-mono)', textTransform: 'uppercase' }}>
              of {cards.length} cards · no repeats · no usage limit
            </p>
          </div>
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
            <button type="button" className="btn-premium-secondary" onClick={() => setSelected([...ALL_DRILL_BUCKETS])}>
              Select all
            </button>
            <button type="button" className="btn-premium-secondary" onClick={() => setSelected([1, 2])}>
              Again + Hard
            </button>
          </div>
        </div>

        <section>
          <div className="zine-section-heading" style={{ marginBottom: '10px' }}>
            <span className="zine-section-number">01</span>
            <h3>Previous level filter</h3>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: '9px' }}>
            {bucketDefinitions.map((definition) => {
              const active = selected.includes(definition.bucket);
              return (
                <button
                  key={definition.bucket}
                  type="button"
                  aria-pressed={active}
                  onClick={() => toggleBucket(definition.bucket)}
                  style={{
                    minHeight: '76px',
                    display: 'grid',
                    gridTemplateColumns: '26px minmax(0, 1fr) auto',
                    gap: '9px',
                    alignItems: 'start',
                    padding: '11px',
                    textAlign: 'left',
                    color: active ? 'var(--text-primary)' : 'var(--text-muted)',
                    background: active ? 'rgba(127, 156, 134, 0.12)' : 'rgba(255,255,255,0.015)',
                    border: `1px solid ${active ? definition.color : 'var(--border)'}`,
                    cursor: 'pointer',
                  }}
                >
                  <span style={{ width: '22px', height: '22px', display: 'grid', placeItems: 'center', border: `1px solid ${active ? definition.color : 'var(--border)'}`, background: active ? definition.color : 'transparent', color: '#0d1511' }}>
                    {active && <Check size={13} />}
                  </span>
                  <span>
                    <strong style={{ display: 'block', fontSize: '12px' }}>{definition.label}</strong>
                    <small style={{ display: 'block', marginTop: '4px', color: 'var(--text-muted)', fontSize: '10px', lineHeight: 1.35 }}>{definition.description}</small>
                  </span>
                  <strong style={{ fontFamily: 'var(--font-mono)', fontSize: '12px', color: definition.color }}>
                    {counts[definition.bucket]}
                  </strong>
                </button>
              );
            })}
          </div>
        </section>

        {error && (
          <div role="alert" style={{ padding: '10px 12px', border: '1px solid #a87869', color: '#d6a193', fontSize: '12px' }}>
            {error}
          </div>
        )}

        <footer style={{ display: 'flex', justifyContent: 'space-between', gap: '10px', alignItems: 'center', borderTop: '2px solid var(--border)', paddingTop: '14px' }}>
          <p style={{ color: 'var(--text-muted)', fontSize: '10px', fontFamily: 'var(--font-mono)', textTransform: 'uppercase', lineHeight: 1.45 }}>
            Low ratings will not repeat during this drill.<br />They will affect later Study sessions.
          </p>
          <div style={{ display: 'flex', gap: '9px' }}>
            <button type="button" className="btn-premium-secondary" onClick={onClose} disabled={starting}>Cancel</button>
            <button
              type="button"
              className="btn-premium-primary"
              onClick={() => void handleStart()}
              disabled={loading || starting || selectedCount === 0}
            >
              <Shuffle size={15} /> {starting ? 'Building drill…' : `Drill ${selectedCount} cards`}
            </button>
          </div>
        </footer>
      </div>
    </div>
  );
};
