import React, { useEffect, useRef } from 'react';
import { AlertTriangle, HelpCircle } from 'lucide-react';
import { useUIStore } from '../../store/uiStore';

/**
 * Renders the app-styled replacement for window.confirm(). Mounted once at the
 * app root; opened via confirmDialog() / useUIStore.confirm() which resolve a
 * promise with the user's choice.
 */
export const ConfirmDialogHost: React.FC = () => {
  const pending = useUIStore(s => s.pendingConfirm);
  const resolveConfirm = useUIStore(s => s.resolveConfirm);
  const confirmBtnRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!pending) return;
    confirmBtnRef.current?.focus();

    // Capture phase + stopPropagation: while the dialog is open it owns
    // Escape/Enter, so an underlying modal's own Escape handler doesn't also
    // fire and close itself.
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        e.preventDefault();
        resolveConfirm(false);
      } else if (e.key === 'Enter') {
        e.stopPropagation();
        e.preventDefault();
        resolveConfirm(true);
      }
    };
    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [pending, resolveConfirm]);

  if (!pending) return null;

  const danger = pending.danger ?? false;

  return (
    <div
      onClick={() => resolveConfirm(false)}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0, 0, 0, 0.7)',
        backdropFilter: 'blur(8px)',
        WebkitBackdropFilter: 'blur(8px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 3500,
        padding: '20px',
      }}
    >
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-dialog-title"
        aria-describedby="confirm-dialog-message"
        onClick={e => e.stopPropagation()}
        className="glass-panel"
        style={{
          width: '100%',
          maxWidth: '420px',
          background: 'rgba(24, 24, 27, 0.98)',
          border: '1px solid rgba(255, 255, 255, 0.12)',
          display: 'flex',
          flexDirection: 'column',
          gap: '14px',
          animation: 'slideUpFade 0.2s cubic-bezier(0.16, 1, 0.3, 1)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          {danger ? (
            <AlertTriangle size={20} style={{ color: 'var(--danger)', flexShrink: 0 }} />
          ) : (
            <HelpCircle size={20} style={{ color: 'var(--accent-color)', flexShrink: 0 }} />
          )}
          <h3 id="confirm-dialog-title" style={{ fontSize: '16px', fontWeight: 700, color: 'var(--text-primary)' }}>
            {pending.title}
          </h3>
        </div>

        <p id="confirm-dialog-message" style={{ fontSize: '13px', color: 'var(--text-secondary)', lineHeight: 1.55 }}>
          {pending.message}
        </p>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '4px' }}>
          <button
            onClick={() => resolveConfirm(false)}
            className="btn-premium-secondary"
            style={{ height: '36px', padding: '0 16px', fontSize: '13px' }}
          >
            {pending.cancelLabel ?? 'Cancel'}
          </button>
          <button
            ref={confirmBtnRef}
            onClick={() => resolveConfirm(true)}
            className={danger ? 'btn-premium-danger' : 'btn-premium-primary'}
            style={{ height: '36px', padding: '0 18px', fontSize: '13px' }}
          >
            {pending.confirmLabel ?? 'Confirm'}
          </button>
        </div>
      </div>
    </div>
  );
};
