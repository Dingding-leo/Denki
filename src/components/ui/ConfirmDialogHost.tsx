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
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!pending) return;
    const previousFocus = document.activeElement as HTMLElement | null;
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
        // Native buttons must retain their own Enter semantics: Enter on Cancel
        // cancels, while Enter on Confirm confirms through the button click.
        // A bare Enter elsewhere in the dialog remains a confirm shortcut.
        const target = e.target as HTMLElement | null;
        if (
          target instanceof HTMLButtonElement ||
          (
            target &&
            (
              target.tagName === 'INPUT' ||
              target.tagName === 'TEXTAREA' ||
              target.tagName === 'SELECT' ||
              target.isContentEditable
            )
          )
        ) {
          return;
        }
        e.stopPropagation();
        e.preventDefault();
        resolveConfirm(true);
      } else if (e.key === 'Tab') {
        // Keep Tab cycling within the dialog's two buttons.
        const dialog = dialogRef.current;
        if (!dialog) return;
        const focusable = dialog.querySelectorAll<HTMLElement>('button');
        if (focusable.length === 0) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown, true);
    return () => {
      window.removeEventListener('keydown', handleKeyDown, true);
      previousFocus?.focus();
    };
  }, [pending, resolveConfirm]);

  if (!pending) return null;

  const danger = pending.danger ?? false;
  const descriptionIds = pending.details?.length
    ? 'confirm-dialog-message confirm-dialog-details'
    : 'confirm-dialog-message';

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
        ref={dialogRef}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-dialog-title"
        aria-describedby={descriptionIds}
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

        {pending.details && pending.details.length > 0 && (
          <dl
            id="confirm-dialog-details"
            style={{
              display: 'grid',
              gap: '8px',
              margin: 0,
              padding: '12px',
              border: '1px solid rgba(255, 255, 255, 0.1)',
              background: 'rgba(255, 255, 255, 0.035)',
            }}
          >
            {pending.details.map((detail, index) => (
              <div
                key={`${detail.label}-${index}`}
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'minmax(92px, 0.7fr) minmax(0, 1.3fr)',
                  gap: '12px',
                  alignItems: 'start',
                }}
              >
                <dt
                  style={{
                    color: 'var(--text-muted)',
                    fontSize: '11px',
                    fontWeight: 700,
                  }}
                >
                  {detail.label}
                </dt>
                <dd
                  style={{
                    margin: 0,
                    color: 'var(--text-primary)',
                    fontSize: '12px',
                    lineHeight: 1.45,
                    overflowWrap: 'anywhere',
                  }}
                >
                  {detail.value}
                </dd>
              </div>
            ))}
          </dl>
        )}

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
