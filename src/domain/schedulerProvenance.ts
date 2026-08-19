export const CURRENT_SCHEDULER_VERSION = '4.5' as const;
export const LEGACY_SCHEDULER_VERSION = 'legacy-unversioned' as const;

const SCHEDULER_VERSION_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._+-]{0,63}$/;

export function isValidSchedulerVersion(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    SCHEDULER_VERSION_PATTERN.test(value)
  );
}

export interface LegacyCardSchedulingState {
  schedulerVersion?: unknown;
  state?: unknown;
  stability?: unknown;
  difficulty?: unknown;
  scheduledDays?: unknown;
  lastReviewed?: unknown;
}

/**
 * Existing reviewed cards predate reliable per-row provenance. Preserve that
 * uncertainty instead of retroactively claiming they were scheduled by the
 * current model. A pristine New card has no model-derived memory state and can
 * safely enter the current scheduler lineage.
 */
export function inferLegacyCardSchedulerVersion(
  card: LegacyCardSchedulingState,
): string {
  if (isValidSchedulerVersion(card.schedulerVersion)) {
    return card.schedulerVersion;
  }

  const pristineNewCard =
    card.state === 0 &&
    card.stability === 0 &&
    card.difficulty === 0 &&
    card.scheduledDays === 0 &&
    (card.lastReviewed === undefined || card.lastReviewed === null);

  return pristineNewCard
    ? CURRENT_SCHEDULER_VERSION
    : LEGACY_SCHEDULER_VERSION;
}

export function inferLegacyReviewSchedulerVersion(
  schedulerVersion: unknown,
): string {
  return isValidSchedulerVersion(schedulerVersion)
    ? schedulerVersion
    : LEGACY_SCHEDULER_VERSION;
}
