import React, { useEffect, useRef, useState } from 'react';
import { HardDrive, Loader2 } from 'lucide-react';
import { scheduleApplicationReload } from '../../services/appReload';
import {
  getForeignMaintenanceActivity,
  subscribeForeignMaintenanceActivity,
  type MaintenanceActivity,
} from '../../services/maintenanceLock';
import { useUIStore } from '../../store/uiStore';

/**
 * A foreign maintenance lease makes this tab read-only. The synchronous
 * database hooks are the durable fence; this full-screen surface prevents the
 * user from starting work that would be rejected and reloads once the owner
 * publishes completion.
 */
export const MaintenanceBlocker: React.FC = () => {
  const [activity, setActivity] = useState<MaintenanceActivity | null>(
    getForeignMaintenanceActivity,
  );
  const previousActivity = useRef<MaintenanceActivity | null>(activity);
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(
    () =>
      subscribeForeignMaintenanceActivity((nextActivity) => {
        const previous = previousActivity.current;
        previousActivity.current = nextActivity;
        setActivity(nextActivity);

        if (nextActivity) {
          const ui = useUIStore.getState();
          ui.resolveConfirm(false);
          ui.setPaletteOpen(false);
          ui.setShortcutsOpen(false);
        } else if (previous) {
          scheduleApplicationReload(100);
        }
      }),
    [],
  );

  useEffect(() => {
    if (!activity) return;
    dialogRef.current?.focus();

    const stopInteraction = (event: KeyboardEvent) => {
      event.preventDefault();
      event.stopImmediatePropagation();
    };
    window.addEventListener('keydown', stopInteraction, true);
    return () => window.removeEventListener('keydown', stopInteraction, true);
  }, [activity]);

  if (!activity) return null;

  return (
    <div
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="maintenance-blocker-title"
      aria-describedby="maintenance-blocker-description"
      ref={dialogRef}
      tabIndex={-1}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 5000,
        display: 'grid',
        placeItems: 'center',
        padding: '24px',
        background: 'rgba(4, 10, 7, 0.92)',
        backdropFilter: 'blur(12px)',
      }}
    >
      <section
        className="glass-panel"
        style={{
          width: 'min(520px, 100%)',
          textAlign: 'center',
          padding: '28px',
        }}
      >
        <div
          aria-hidden="true"
          style={{
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            gap: '10px',
            marginBottom: '14px',
          }}
        >
          <HardDrive size={22} />
          <Loader2 size={20} className="spin" />
        </div>
        <h2
          id="maintenance-blocker-title"
          style={{ marginBottom: '10px', color: 'var(--text-primary)' }}
        >
          Another Denki tab is updating the library
        </h2>
        <p
          id="maintenance-blocker-description"
          style={{
            color: 'var(--text-secondary)',
            lineHeight: 1.6,
            margin: 0,
          }}
        >
          “{activity.label}” has exclusive write access. This tab is temporarily
          read-only and will reload automatically when the operation finishes or
          its crash-recovery lease expires.
        </p>
      </section>
    </div>
  );
};
