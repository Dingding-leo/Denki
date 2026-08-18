import type { Plugin } from 'vite';

interface ReleaseIdentity {
  version: string;
  buildId: string;
}

/**
 * Emit release metadata and a `sw-assets.json` manifest listing every hashed
 * code asset emitted by the build. The service worker fetches the manifest on
 * install and precaches JavaScript, CSS, and WebAssembly so lazy features work
 * on the first offline launch instead of only after their first network use.
 */
export function denkiPrecachePlugin(identity: ReleaseIdentity): Plugin {
  return {
    name: 'denki-precache',
    apply: 'build',
    generateBundle(_opts, bundle) {
      const assets: string[] = [];
      for (const file of Object.values(bundle)) {
        if (file.type !== 'asset' && file.type !== 'chunk') continue;
        if (/\.(?:js|css|wasm)$/.test(file.fileName)) {
          assets.push(file.fileName);
        }
      }

      assets.sort();
      this.emitFile({
        type: 'asset',
        fileName: 'sw-assets.json',
        source: JSON.stringify({ assets }, null, 2),
      });
      this.emitFile({
        type: 'asset',
        fileName: 'version.json',
        source: JSON.stringify(identity, null, 2),
      });
    },
  };
}
