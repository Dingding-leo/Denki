import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  CheckCircle2,
  Loader2,
  SearchCheck,
  ShieldAlert,
  Square,
} from 'lucide-react';
import {
  auditLibraryIntegrityExclusively,
  type LibraryIntegrityPhase,
  type LibraryIntegrityProgress,
  type LibraryIntegrityResult,
} from '../../services/libraryIntegrity';

interface LibraryIntegrityPanelProps {
  disabled?: boolean;
  onRunningChange?: (running: boolean) => void;
}

const MEBIBYTE = 1024 * 1024;

function formatBytes(value: number): string {
  if (value < 1024) return `${value.toLocaleString()} B`;
  if (value < MEBIBYTE) return `${(value / 1024).toFixed(1)} KiB`;
  return `${(value / MEBIBYTE).toFixed(1)} MiB`;
}

function phaseLabel(phase: LibraryIntegrityPhase): string {
  switch (phase) {
    case 'preflight':
      return 'Checking scan budgets';
    case 'classes':
      return 'Checking classes';
    case 'decks':
      return 'Checking decks and notes';
    case 'cards':
      return 'Checking cards and media references';
    case 'reviews':
      return 'Checking review relationships';
    case 'media':
      return 'Verifying media hashes';
    case 'complete':
      return 'Check complete';
  }
}

function resultHeading(result: LibraryIntegrityResult): string {
  if (result.stopped) return 'Integrity check stopped safely';
  if (result.errorCount > 0) {
    return `${result.errorCount.toLocaleString()} integrity error(s) found`;
  }
  if (result.warningCount > 0) {
    return `No integrity errors · ${result.warningCount.toLocaleString()} warning(s)`;
  }
  return 'No integrity issues found';
}

function resultDescription(result: LibraryIntegrityResult): string {
  const scanned = result.scanned;
  return [
    `${scanned.classes.toLocaleString()} classes`,
    `${scanned.decks.toLocaleString()} decks`,
    `${scanned.cards.toLocaleString()} cards`,
    `${scanned.reviews.toLocaleString()} reviews`,
    `${scanned.media.toLocaleString()} media objects`,
  ].join(' · ');
}

export const LibraryIntegrityPanel: React.FC<
  LibraryIntegrityPanelProps
> = ({ disabled = false, onRunningChange }) => {
  const [running, setRunning] = useState(false);
  const [stopping, setStopping] = useState(false);
  const [progress, setProgress] = useState<LibraryIntegrityProgress | null>(
    null,
  );
  const [result, setResult] = useState<LibraryIntegrityResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const controllerRef = useRef<AbortController | null>(null);
  const mountedRef = useRef(true);

  useEffect(
    () => () => {
      mountedRef.current = false;
      controllerRef.current?.abort();
    },
    [],
  );

  const runCheck = useCallback(() => {
    if (disabled || running) return;

    const controller = new AbortController();
    controllerRef.current = controller;
    setRunning(true);
    setStopping(false);
    setProgress({
      phase: 'preflight',
      processed: 0,
      total: 1,
      issueCount: 0,
    });
    setError(null);
    setResult(null);
    onRunningChange?.(true);

    void auditLibraryIntegrityExclusively({
      signal: controller.signal,
      onProgress(next) {
        if (mountedRef.current) setProgress(next);
      },
    })
      .then((next) => {
        if (mountedRef.current) setResult(next);
      })
      .catch((reason: unknown) => {
        if (!mountedRef.current) return;
        setError(
          reason instanceof Error
            ? reason.message
            : 'The library integrity check failed.',
        );
      })
      .finally(() => {
        controllerRef.current = null;
        if (!mountedRef.current) return;
        onRunningChange?.(false);
        setRunning(false);
        setStopping(false);
      });
  }, [disabled, onRunningChange, running]);

  const stopCheck = useCallback(() => {
    if (!running || stopping) return;
    setStopping(true);
    controllerRef.current?.abort();
  }, [running, stopping]);

  const progressPercent =
    progress && progress.total > 0
      ? Math.min(100, (progress.processed / progress.total) * 100)
      : 0;

  return (
    <section
      aria-labelledby="library-integrity-heading"
      style={{
        borderTop: '1px solid rgba(211, 220, 207, 0.12)',
        marginTop: '16px',
        paddingTop: '16px',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: 'space-between',
          gap: '12px',
        }}
      >
        <div>
          <h4
            id="library-integrity-heading"
            style={{
              margin: '0 0 4px',
              color: 'var(--text-muted)',
              fontSize: '11px',
              fontWeight: 800,
              letterSpacing: '0.9px',
              textTransform: 'uppercase',
            }}
          >
            Library integrity
          </h4>
          <p
            style={{
              margin: 0,
              color: 'var(--text-muted)',
              fontSize: '11px',
              lineHeight: 1.5,
            }}
          >
            Manually verify relationships, scheduler provenance, internal media
            references, and every stored media SHA-256. The check is read-only
            and never repairs or deletes data.
          </p>
        </div>
        <button
          type="button"
          onClick={running ? stopCheck : runCheck}
          disabled={disabled || (running && stopping)}
          className="btn-premium-secondary"
          aria-label={running ? 'Stop library integrity check' : 'Run library integrity check'}
          style={{ flex: '0 0 auto' }}
        >
          {running ? (
            stopping ? (
              <Loader2 size={13} className="spin" aria-hidden="true" />
            ) : (
              <Square size={12} aria-hidden="true" />
            )
          ) : (
            <SearchCheck size={14} aria-hidden="true" />
          )}
          {running
            ? stopping
              ? 'Stopping…'
              : 'Stop check'
            : 'Run full check'}
        </button>
      </div>

      {running && progress && (
        <div
          aria-live="polite"
          style={{
            display: 'grid',
            gap: '7px',
            marginTop: '12px',
            padding: '11px 12px',
            border: '1px solid var(--border)',
            background: 'rgba(127, 156, 134, 0.06)',
          }}
        >
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              gap: '12px',
              color: 'var(--text-secondary)',
              fontSize: '11px',
            }}
          >
            <span>{phaseLabel(progress.phase)}</span>
            <span>
              {progress.processed.toLocaleString()} /{' '}
              {progress.total.toLocaleString()}
            </span>
          </div>
          <div
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(progressPercent)}
            style={{
              height: '5px',
              overflow: 'hidden',
              background: 'rgba(255, 255, 255, 0.08)',
            }}
          >
            <span
              style={{
                display: 'block',
                width: `${progressPercent}%`,
                height: '100%',
                background: 'var(--accent-color)',
                transition: 'width 120ms linear',
              }}
            />
          </div>
          <span style={{ color: 'var(--text-muted)', fontSize: '10px' }}>
            {progress.issueCount.toLocaleString()} issue(s) recorded so far. Other
            Denki tabs remain temporarily read-only during this stable scan.
          </span>
        </div>
      )}

      {error && (
        <p
          role="alert"
          style={{
            display: 'flex',
            gap: '7px',
            alignItems: 'flex-start',
            margin: '12px 0 0',
            color: 'var(--danger)',
            fontSize: '11px',
            lineHeight: 1.5,
          }}
        >
          <ShieldAlert size={14} aria-hidden="true" style={{ flex: '0 0 auto' }} />
          {error}
        </p>
      )}

      {result && (
        <div
          aria-live="polite"
          style={{
            display: 'grid',
            gap: '9px',
            marginTop: '12px',
            padding: '12px',
            border: `1px solid ${
              result.errorCount > 0 ? 'var(--danger)' : 'var(--border)'
            }`,
            background:
              result.errorCount > 0
                ? 'rgba(190, 72, 72, 0.07)'
                : 'rgba(127, 156, 134, 0.06)',
          }}
        >
          <div style={{ display: 'flex', gap: '8px', alignItems: 'flex-start' }}>
            {result.errorCount > 0 ? (
              <ShieldAlert
                size={16}
                aria-hidden="true"
                style={{ color: 'var(--danger)', flex: '0 0 auto' }}
              />
            ) : (
              <CheckCircle2
                size={16}
                aria-hidden="true"
                style={{ color: 'var(--accent-color)', flex: '0 0 auto' }}
              />
            )}
            <div>
              <strong
                style={{
                  display: 'block',
                  color: 'var(--text-primary)',
                  fontSize: '12px',
                }}
              >
                {resultHeading(result)}
              </strong>
              <span style={{ color: 'var(--text-muted)', fontSize: '10px' }}>
                {resultDescription(result)} ·{' '}
                {formatBytes(result.scanned.verifiedMediaBytes)} verified media
              </span>
            </div>
          </div>

          {result.unreferencedMedia.objects > 0 && (
            <span style={{ color: 'var(--text-muted)', fontSize: '10px' }}>
              Unreferenced verified media:{' '}
              {result.unreferencedMedia.objects.toLocaleString()} object(s) ·{' '}
              {formatBytes(result.unreferencedMedia.bytes)}
            </span>
          )}

          {result.issues.length > 0 && (
            <ol
              style={{
                display: 'grid',
                gap: '6px',
                margin: 0,
                paddingLeft: '20px',
                maxHeight: '210px',
                overflowY: 'auto',
              }}
            >
              {result.issues.map((issue, index) => (
                <li
                  key={`${issue.code}-${issue.entity}-${issue.entityId ?? 'none'}-${index}`}
                  style={{
                    color:
                      issue.severity === 'error'
                        ? 'var(--danger)'
                        : 'var(--text-secondary)',
                    fontSize: '10px',
                    lineHeight: 1.45,
                  }}
                >
                  <strong>{issue.code}</strong>
                  {issue.entityId ? ` · ${issue.entity} ${issue.entityId}` : ''}
                  {` — ${issue.message}`}
                </li>
              ))}
            </ol>
          )}

          {result.issuesTruncated && (
            <span style={{ color: 'var(--text-muted)', fontSize: '10px' }}>
              Only the first 200 issue details are displayed; aggregate counts
              include all findings.
            </span>
          )}
        </div>
      )}
    </section>
  );
};
