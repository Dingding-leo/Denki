/** Schedule a full application reload after user-visible status has rendered. */
export function scheduleApplicationReload(delayMs = 0): void {
  if (!Number.isSafeInteger(delayMs) || delayMs < 0 || delayMs > 10_000) {
    throw new Error('Application reload delay is invalid.');
  }
  window.setTimeout(() => window.location.reload(), delayMs);
}
