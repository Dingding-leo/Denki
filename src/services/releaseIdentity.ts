const SAFE_VERSION = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/;
const SAFE_BUILD_ID = /^[A-Za-z0-9._-]{1,128}$/;

export const RELEASE_VERSION = SAFE_VERSION.test(__DENKI_VERSION__)
  ? __DENKI_VERSION__
  : 'unknown';

export const RELEASE_BUILD_ID = SAFE_BUILD_ID.test(__DENKI_BUILD_ID__)
  ? __DENKI_BUILD_ID__
  : 'unknown';

export const RELEASE_IDENTITY_LABEL = `Denki v${RELEASE_VERSION} · build ${RELEASE_BUILD_ID}`;

/** A compact label for persistent navigation; the full build remains in title/ARIA text. */
export const RELEASE_VERSION_LABEL = `v${RELEASE_VERSION}`;
