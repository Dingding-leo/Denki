import type { Plugin } from 'vite';
import path from 'path';

/**
 * Emit a `sw-assets.json` manifest listing every hashed JS/CSS asset emitted by
 * the build. The service worker (public/sw.js) fetches this on `install` and
 * precaches all of them, so the built app works fully offline and a stale shell
 * never references an uncached chunk after a deploy.
 *
 * Why not inline into sw.js: sw.js is a static file copied from public/ before
 * the build; inlining would need a token-replace step that breaks the file if a
 * user edits it directly. A separate manifest keeps the SW readable and the
 * asset list data-driven.
 */
export function denkiPrecachePlugin(): Plugin {
  return {
    name: 'denki-precache',
    apply: 'build',
    generateBundle(_opts, bundle) {
      const assets: string[] = [];
      for (const file of Object.values(bundle)) {
        if (file.type === 'asset' || file.type === 'chunk') {
          if (file.fileName.endsWith('.js') || file.fileName.endsWith('.css')) {
            assets.push(`assets/${path.basename(file.fileName)}`);
          }
        }
      }
      // Sort for deterministic output.
      assets.sort();
      this.emitFile({
        type: 'asset',
        fileName: 'sw-assets.json',
        source: JSON.stringify({ assets }, null, 2),
      });
    },
  };
}
