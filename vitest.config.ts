import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

// Standalone Vitest config (does NOT reuse vite.config.ts so the denki backup
// filesystem plugin never runs during tests). jsdom + fake-indexeddb let us
// exercise the Zustand slices and Dexie data layer, not just pure functions.
export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
  },
});
