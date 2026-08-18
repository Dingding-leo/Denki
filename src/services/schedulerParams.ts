import { DEFAULT_PARAMS, type SchedulerParams } from './scheduler';

export const RETENTION_KEY = 'denki-fsrs-retention';

/** Retired pre-canonical overrides. Kept only so old installations can be cleaned. */
export const EASY_BONUS_KEY = 'denki-fsrs-easy-bonus';
export const HARD_MULTIPLIER_KEY = 'denki-fsrs-hard-multiplier';

export const SCHEDULER_SETTING_RANGES = {
  retention: { min: 0.7, max: 0.95 },
} as const;

const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value));

const finiteOr = (value: number, fallback: number): number =>
  Number.isFinite(value) ? value : fallback;

export function normalizeSchedulerParams(
  values: Pick<SchedulerParams, 'requestRetention'>,
): SchedulerParams {
  return {
    requestRetention: clamp(
      finiteOr(values.requestRetention, DEFAULT_PARAMS.requestRetention),
      SCHEDULER_SETTING_RANGES.retention.min,
      SCHEDULER_SETTING_RANGES.retention.max,
    ),
    maxInterval: DEFAULT_PARAMS.maxInterval,
    enableFuzz: false,
  };
}

function readNumber(key: string, fallback: number): number {
  try {
    if (typeof localStorage === 'undefined') return fallback;
    const raw = localStorage.getItem(key);
    if (raw === null) return fallback;
    return finiteOr(Number.parseFloat(raw), fallback);
  } catch {
    return fallback;
  }
}

/** Remove settings that made Denki's old scheduler diverge from FSRS-4.5. */
export function clearLegacySchedulerOverrides(): void {
  try {
    if (typeof localStorage === 'undefined') return;
    localStorage.removeItem(EASY_BONUS_KEY);
    localStorage.removeItem(HARD_MULTIPLIER_KEY);
  } catch {
    // Storage can be unavailable in restricted webviews.
  }
}

/**
 * Load the only user-tunable canonical FSRS-4.5 parameter. The 17 model
 * weights and Hard/Easy coefficients remain fixed to the reference algorithm.
 */
export function loadSchedulerParams(): SchedulerParams {
  clearLegacySchedulerOverrides();
  return normalizeSchedulerParams({
    requestRetention: readNumber(
      RETENTION_KEY,
      DEFAULT_PARAMS.requestRetention,
    ),
  });
}
