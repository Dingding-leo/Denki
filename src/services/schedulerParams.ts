import { DEFAULT_PARAMS, type SchedulerParams } from './scheduler';

// localStorage keys for the user-tunable FSRS settings (written by SettingsModal).
export const RETENTION_KEY = 'denki-fsrs-retention';
export const EASY_BONUS_KEY = 'denki-fsrs-easy-bonus';
export const HARD_MULTIPLIER_KEY = 'denki-fsrs-hard-multiplier';

/**
 * Reads the user's saved FSRS parameters from localStorage, falling back to the
 * scheduler defaults. Shared by the study slice (actual scheduling) and the
 * study page (interval previews) so previews always match what rating a card
 * will really schedule. Defensive against environments where localStorage is
 * unavailable (SSR, tests, private-mode exceptions).
 */
export function loadSchedulerParams(): SchedulerParams {
  const readNumber = (key: string, fallback: number): number => {
    try {
      if (typeof localStorage === 'undefined') return fallback;
      const raw = localStorage.getItem(key);
      if (raw === null) return fallback;
      const parsed = parseFloat(raw);
      return Number.isFinite(parsed) ? parsed : fallback;
    } catch {
      return fallback;
    }
  };

  return {
    requestRetention: readNumber(RETENTION_KEY, DEFAULT_PARAMS.requestRetention),
    easyBonus: readNumber(EASY_BONUS_KEY, DEFAULT_PARAMS.easyBonus),
    hardIntervalMultiplier: readNumber(HARD_MULTIPLIER_KEY, DEFAULT_PARAMS.hardIntervalMultiplier),
  };
}
