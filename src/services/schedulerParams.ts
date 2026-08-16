import { DEFAULT_PARAMS, type SchedulerParams } from './scheduler';

export const RETENTION_KEY = 'denki-fsrs-retention';
export const EASY_BONUS_KEY = 'denki-fsrs-easy-bonus';
export const HARD_MULTIPLIER_KEY = 'denki-fsrs-hard-multiplier';

export const SCHEDULER_SETTING_RANGES = {
  retention: { min: 0.7, max: 0.95 },
  easyBonus: { min: 1, max: 2 },
  hardMultiplier: { min: 1, max: 1.5 },
} as const;

const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value));

const finiteOr = (value: number, fallback: number): number =>
  Number.isFinite(value) ? value : fallback;

export function normalizeSchedulerParams(
  values: Pick<SchedulerParams, 'requestRetention' | 'easyBonus' | 'hardIntervalMultiplier'>,
): SchedulerParams {
  return {
    requestRetention: clamp(
      finiteOr(values.requestRetention, DEFAULT_PARAMS.requestRetention),
      SCHEDULER_SETTING_RANGES.retention.min,
      SCHEDULER_SETTING_RANGES.retention.max,
    ),
    easyBonus: clamp(
      finiteOr(values.easyBonus, DEFAULT_PARAMS.easyBonus),
      SCHEDULER_SETTING_RANGES.easyBonus.min,
      SCHEDULER_SETTING_RANGES.easyBonus.max,
    ),
    hardIntervalMultiplier: clamp(
      finiteOr(values.hardIntervalMultiplier, DEFAULT_PARAMS.hardIntervalMultiplier),
      SCHEDULER_SETTING_RANGES.hardMultiplier.min,
      SCHEDULER_SETTING_RANGES.hardMultiplier.max,
    ),
    maxInterval: DEFAULT_PARAMS.maxInterval,
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

/**
 * Read and normalize the user-tunable FSRS settings. Local storage is treated as
 * untrusted input: manually edited, stale, NaN, or out-of-range values are
 * clamped before they reach either actual scheduling or interval previews.
 */
export function loadSchedulerParams(): SchedulerParams {
  return normalizeSchedulerParams({
    requestRetention: readNumber(RETENTION_KEY, DEFAULT_PARAMS.requestRetention),
    easyBonus: readNumber(EASY_BONUS_KEY, DEFAULT_PARAMS.easyBonus),
    hardIntervalMultiplier: readNumber(
      HARD_MULTIPLIER_KEY,
      DEFAULT_PARAMS.hardIntervalMultiplier,
    ),
  });
}
