import confetti from 'canvas-confetti';

type ConfettiOptions = Parameters<typeof confetti>[0];

/**
 * Fire a confetti burst, unless the user has asked for reduced motion
 * (WCAG 2.3.3 / 2.2.2). CSS animations are handled by the global
 * `prefers-reduced-motion` block in index.css; canvas confetti is JS, so it
 * must be gated here.
 */
export function celebrate(options?: ConfettiOptions): void {
  if (
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  ) {
    return;
  }
  confetti(options);
}
