import React, { useCallback, useEffect, useRef, useState } from 'react';
import { AlertTriangle, Database, RefreshCw, ShieldCheck } from 'lucide-react';
import {
  collectStorageHealth,
  type StorageHealthSnapshot,
} from '../../services/storageHealth';

interface StorageHealthPanelProps {
  disabled?: boolean;
}

const MEBIBYTE = 1024 * 1024;
const GIBIBYTE = 1024 * MEBIBYTE;

function formatBytes(value: number | null): string {
  if (value === null) return 'Unavailable';
  if (value < 1024) return `${value.toLocaleString()} B`;
  if (value < MEBIBYTE) return `${(value / 1024).toFixed(1)} KiB`;
  if (value < GIBIBYTE) return `${(value / MEBIBYTE).toFixed(1)} MiB`;
  return `${(value / GIBIBYTE).toFixed(2)} GiB`;
}

function formatBackupDate(value: string | null): string {
  if (!value) return 'No backup recorded';
  return new Date(value).toLocaleString();
}

function persistenceLabel(value: boolean | null): string {
  if (value === true) return 'Protected from routine eviction';
  if (value === false) return 'Best-effort browser storage';
  return 'Persistence status unavailable';
}

function metricStyle(): React.CSSProperties {
  return {
    display: 'grid',
    gap: '3px',
    minWidth: 0,
    padding: '10px 12px',
    border: '1px solid var(--border)',
    background: 'rgba(255, 255, 255, 0.025)',
  };
}

function errorMessage(reason: unknown): string {
  return reason instanceof Error
    ? reason.message
    : 'Storage diagnostics could not be loaded.';
}

export const StorageHealthPanel: React.FC<StorageHealthPanelProps> = ({
  disabled = false,
}) => {
  const [snapshot, setSnapshot] = useState<StorageHealthSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const requestId = useRef(0);

  const refresh = useCallback(() => {
    const currentRequest = ++requestId.current;
    setLoading(true);
    setError(null);

    void collectStorageHealth()
      .then((next) => {
        if (requestId.current === currentRequest) setSnapshot(next);
      })
      .catch((reason: unknown) => {
        if (requestId.current === currentRequest) {
          setError(errorMessage(reason));
        }
      })
      .finally(() => {
        if (requestId.current === currentRequest) setLoading(false);
      });
  }, []);

  useEffect(() => {
    const currentRequest = ++requestId.current;

    void collectStorageHealth()
      .then((next) => {
        if (requestId.current === currentRequest) {
          setSnapshot(next);
          setError(null);
        }
      })
      .catch((reason: unknown) => {
        if (requestId.current === currentRequest) {
          setError(errorMessage(reason));
        }
      })
      .finally(() => {
        if (requestId.current === currentRequest) setLoading(false);
      });

    return () => {
      requestId.current += 1;
    };
  }, []);

  const unavailableLabel = loading ? 'Loading…' : 'Unavailable';
  const browserUsage = snapshot
    ? `${formatBytes(snapshot.browser.usageBytes)} of ${formatBytes(snapshot.browser.quotaBytes)}`
    : unavailableLabel;
  const usagePercent = snapshot?.browser.usagePercent;

  return (
    <section
      aria-labelledby="storage-health-heading"
      style={{
        borderTop: '1px solid rgba(211, 220, 207, 0.12)',
        paddingTop: '16px',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '12px',
          marginBottom: '12px',
        }}
      >
        <div>
          <h4
            id="storage-health-heading"
            style={{
              fontSize: '11px',
              color: 'var(--text-muted)',
              textTransform: 'uppercase',
              letterSpacing: '0.9px',
              marginBottom: '4px',
              fontWeight: 800,
            }}
          >
            Storage health
          </h4>
          <p
            style={{
              margin: 0,
              color: 'var(--text-muted)',
              fontSize: '11px',
              lineHeight: 1.45,
            }}
          >
            Reported usage covers every browser store on this origin. Hosted
            deployments may share that origin with other apps.
          </p>
        </div>
        <button
          type="button"
          onClick={refresh}
          disabled={disabled || loading}
          className="btn-premium-secondary"
          aria-label="Refresh storage health"
          style={{ flex: '0 0 auto' }}
        >
          <RefreshCw
            size={13}
            aria-hidden="true"
            className={loading ? 'spin' : undefined}
          />
          {loading ? 'Checking…' : 'Refresh'}
        </button>
      </div>

      {error && (
        <p
          role="alert"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '7px',
            color: 'var(--danger)',
            fontSize: '12px',
            margin: '0 0 12px',
          }}
        >
          <AlertTriangle size={14} aria-hidden="true" />
          {error}
        </p>
      )}

      <div
        aria-live="polite"
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))',
          gap: '8px',
        }}
      >
        <div style={metricStyle()}>
          <span
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              color: 'var(--text-muted)',
              fontSize: '10px',
              fontWeight: 700,
              textTransform: 'uppercase',
              letterSpacing: '0.5px',
            }}
          >
            <Database size={12} aria-hidden="true" /> Reported origin usage
          </span>
          <strong style={{ color: 'var(--text-primary)', fontSize: '13px' }}>
            {browserUsage}
          </strong>
          <span style={{ color: 'var(--text-muted)', fontSize: '10px' }}>
            {!snapshot && loading
              ? 'Checking reported quota…'
              : usagePercent === null || usagePercent === undefined
                ? 'Percentage unavailable'
                : `${usagePercent.toFixed(1)}% of reported quota`}
          </span>
        </div>

        <div style={metricStyle()}>
          <span
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              color: 'var(--text-muted)',
              fontSize: '10px',
              fontWeight: 700,
              textTransform: 'uppercase',
              letterSpacing: '0.5px',
            }}
          >
            <ShieldCheck size={12} aria-hidden="true" /> Persistence
          </span>
          <strong style={{ color: 'var(--text-primary)', fontSize: '13px' }}>
            {snapshot
              ? persistenceLabel(snapshot.browser.persisted)
              : unavailableLabel}
          </strong>
          <span style={{ color: 'var(--text-muted)', fontSize: '10px' }}>
            Browser-controlled protection status
          </span>
        </div>

        <div style={metricStyle()}>
          <span
            style={{
              color: 'var(--text-muted)',
              fontSize: '10px',
              fontWeight: 700,
              textTransform: 'uppercase',
              letterSpacing: '0.5px',
            }}
          >
            Study library
          </span>
          <strong style={{ color: 'var(--text-primary)', fontSize: '13px' }}>
            {snapshot
              ? `${snapshot.library.cards.toLocaleString()} cards · ${snapshot.library.reviews.toLocaleString()} reviews`
              : unavailableLabel}
          </strong>
          <span style={{ color: 'var(--text-muted)', fontSize: '10px' }}>
            {snapshot
              ? `${snapshot.library.classes.toLocaleString()} classes · ${snapshot.library.decks.toLocaleString()} decks`
              : loading
                ? 'Reading a consistent database snapshot…'
                : 'Database snapshot unavailable'}
          </span>
        </div>

        <div style={metricStyle()}>
          <span
            style={{
              color: 'var(--text-muted)',
              fontSize: '10px',
              fontWeight: 700,
              textTransform: 'uppercase',
              letterSpacing: '0.5px',
            }}
          >
            Media registry
          </span>
          <strong style={{ color: 'var(--text-primary)', fontSize: '13px' }}>
            {snapshot
              ? `${snapshot.library.mediaObjects.toLocaleString()} objects · ${formatBytes(snapshot.library.mediaBytes)}`
              : unavailableLabel}
          </strong>
          <span
            style={{
              color:
                snapshot && snapshot.library.mediaMetadataWarnings > 0
                  ? 'var(--danger)'
                  : 'var(--text-muted)',
              fontSize: '10px',
            }}
          >
            {!snapshot
              ? loading
                ? 'Checking byte-length metadata…'
                : 'Registry metadata unavailable'
              : snapshot.library.mediaMetadataWarnings > 0
                ? `${snapshot.library.mediaMetadataWarnings} metadata warning(s)`
                : 'Byte-length metadata is present and valid'}
          </span>
        </div>
      </div>

      <p
        style={{
          margin: '10px 0 0',
          color: 'var(--text-muted)',
          fontSize: '10px',
          lineHeight: 1.45,
        }}
      >
        Last portable backup:{' '}
        {snapshot
          ? formatBackupDate(snapshot.lastBackupExportedAt)
          : unavailableLabel}
      </p>
    </section>
  );
};
