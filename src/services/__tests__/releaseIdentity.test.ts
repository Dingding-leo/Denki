import { describe, expect, it } from 'vitest';
import {
  RELEASE_BUILD_ID,
  RELEASE_IDENTITY_LABEL,
  RELEASE_VERSION,
  RELEASE_VERSION_LABEL,
} from '../releaseIdentity';

describe('release identity', () => {
  it('exposes the semantic source version injected by the production config', () => {
    expect(RELEASE_VERSION).toMatch(/^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/);
    expect(RELEASE_VERSION).not.toBe('unknown');
    expect(RELEASE_VERSION_LABEL).toBe(`v${RELEASE_VERSION}`);
  });

  it('exposes a safe build identifier and a complete support label', () => {
    expect(RELEASE_BUILD_ID).toMatch(/^[A-Za-z0-9._-]{1,128}$/);
    expect(RELEASE_BUILD_ID).not.toBe('unknown');
    expect(RELEASE_IDENTITY_LABEL).toBe(
      `Denki v${RELEASE_VERSION} · build ${RELEASE_BUILD_ID}`,
    );
  });
});
