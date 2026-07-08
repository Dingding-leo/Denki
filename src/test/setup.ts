// Global test setup.
// - fake-indexeddb/auto installs an in-memory IndexedDB so Dexie works in jsdom.
// - jest-dom adds DOM matchers (toBeInTheDocument, etc.) to Vitest's expect.
import 'fake-indexeddb/auto';
import '@testing-library/jest-dom/vitest';
import { afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';

// Unmount React trees between tests so component tests don't leak into each other.
afterEach(() => {
  cleanup();
});
