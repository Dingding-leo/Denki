import React from 'react';
import { CheckCircle2, AlertCircle, Info, X } from 'lucide-react';
import { useUIStore, type ToastType } from '../../store/uiStore';

const TOAST_STYLE: Record<ToastType, { color: string; border: string; Icon: typeof Info }> = {
  success: { color: '#6ee7b7', border: 'rgba(16, 185, 129, 0.35)', Icon: CheckCircle2 },
  error: { color: '#fca5a5', border: 'rgba(239, 68, 68, 0.35)', Icon: AlertCircle },
  info: { color: '#93c5fd', border: 'rgba(59, 130, 246, 0.35)', Icon: Info },
};

export const Toaster: React.FC = () => {
  const toasts = useUIStore(s => s.toasts);
  const dismissToast = useUIStore(s => s.dismissToast);

  return (
    <div
      aria-live="polite"
      style={{
        position: 'fixed',
        bottom: '24px',
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 4000,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: '8px',
        pointerEvents: 'none',
        maxWidth: 'calc(100vw - 32px)',
      }}
    >
      {toasts.map(t => {
        const { color, border, Icon } = TOAST_STYLE[t.type];
        return (
          <div
            key={t.id}
            role="status"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
              background: 'rgba(24, 24, 27, 0.95)',
              backdropFilter: 'blur(16px)',
              WebkitBackdropFilter: 'blur(16px)',
              border: `1px solid ${border}`,
              borderRadius: '10px',
              padding: '10px 14px',
              boxShadow: '0 8px 32px rgba(0, 0, 0, 0.5)',
              color: 'var(--text-primary)',
              fontSize: '13px',
              fontWeight: 500,
              pointerEvents: 'auto',
              animation: 'slideUpFade 0.25s cubic-bezier(0.16, 1, 0.3, 1)',
              maxWidth: '420px',
            }}
          >
            <Icon size={16} style={{ color, flexShrink: 0 }} />
            <span style={{ lineHeight: 1.4 }}>{t.message}</span>
            <button
              onClick={() => dismissToast(t.id)}
              aria-label="Dismiss notification"
              style={{
                background: 'transparent',
                border: 'none',
                color: 'var(--text-muted)',
                cursor: 'pointer',
                padding: '2px',
                display: 'flex',
                alignItems: 'center',
                flexShrink: 0,
              }}
            >
              <X size={13} />
            </button>
          </div>
        );
      })}
    </div>
  );
};
