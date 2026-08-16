import { beforeEach, describe, expect, it } from 'vitest';
import {
  EASY_BONUS_KEY,
  HARD_MULTIPLIER_KEY,
  RETENTION_KEY,
  loadSchedulerParams,
  normalizeSchedulerParams,
} from '../schedulerParams';

describe('scheduler parameter normalization', () => {
  beforeEach(() => localStorage.clear());

  it('clamps direct values to the supported settings ranges', () => {
    expect(normalizeSchedulerParams({
      requestRetention: 9,
      easyBonus: -3,
      hardIntervalMultiplier: Number.NaN,
    })).toMatchObject({
      requestRetention: 0.95,
      easyBonus: 1,
      hardIntervalMultiplier: 1.2,
    });
  });

  it('treats localStorage as untrusted input', () => {
    localStorage.setItem(RETENTION_KEY, '0.1');
    localStorage.setItem(EASY_BONUS_KEY, '999');
    localStorage.setItem(HARD_MULTIPLIER_KEY, 'not-a-number');

    expect(loadSchedulerParams()).toMatchObject({
      requestRetention: 0.7,
      easyBonus: 2,
      hardIntervalMultiplier: 1.2,
    });
  });

  it('preserves valid saved values', () => {
    localStorage.setItem(RETENTION_KEY, '0.88');
    localStorage.setItem(EASY_BONUS_KEY, '1.6');
    localStorage.setItem(HARD_MULTIPLIER_KEY, '1.35');

    expect(loadSchedulerParams()).toMatchObject({
      requestRetention: 0.88,
      easyBonus: 1.6,
      hardIntervalMultiplier: 1.35,
    });
  });
});
