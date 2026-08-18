import { beforeEach, describe, expect, it } from 'vitest';
import {
  EASY_BONUS_KEY,
  HARD_MULTIPLIER_KEY,
  RETENTION_KEY,
  loadSchedulerParams,
  normalizeSchedulerParams,
} from '../schedulerParams';

describe('canonical scheduler parameter normalization', () => {
  beforeEach(() => localStorage.clear());

  it('clamps target retention and fixes every other model parameter', () => {
    expect(normalizeSchedulerParams({ requestRetention: 9 })).toEqual({
      requestRetention: 0.95,
      maxInterval: 36500,
      enableFuzz: false,
    });

    expect(
      normalizeSchedulerParams({ requestRetention: Number.NaN }),
    ).toEqual({
      requestRetention: 0.9,
      maxInterval: 36500,
      enableFuzz: false,
    });
  });

  it('treats localStorage as untrusted input', () => {
    localStorage.setItem(RETENTION_KEY, '0.1');
    expect(loadSchedulerParams()).toEqual({
      requestRetention: 0.7,
      maxInterval: 36500,
      enableFuzz: false,
    });
  });

  it('preserves a valid target-retention value', () => {
    localStorage.setItem(RETENTION_KEY, '0.88');
    expect(loadSchedulerParams()).toEqual({
      requestRetention: 0.88,
      maxInterval: 36500,
      enableFuzz: false,
    });
  });

  it('removes retired Hard/Easy overrides so they cannot alter FSRS-4.5', () => {
    localStorage.setItem(EASY_BONUS_KEY, '2');
    localStorage.setItem(HARD_MULTIPLIER_KEY, '1.5');

    loadSchedulerParams();

    expect(localStorage.getItem(EASY_BONUS_KEY)).toBeNull();
    expect(localStorage.getItem(HARD_MULTIPLIER_KEY)).toBeNull();
  });
});
