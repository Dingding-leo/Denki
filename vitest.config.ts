import { readFileSync } from 'node:fs';
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

const { version: appVersion } = JSON.parse(
  readFileSync(new URL('./version.json', import.meta.url), 'utf8'),
) as { version: string };

// Standalone Vitest config (does NOT reuse vite.config.ts so the Denki backup
// filesystem plugin never runs during tests). It still imports the canonical
// release version so code under test observes the same immutable application
// identity as the production bundle.
export default defineConfig({
  define: {
    __DENKI_VERSION__: JSON.stringify(appVersion),
    __DENKI_BUILD_ID__: JSON.stringify('vitest'),
  },
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
  },
});
