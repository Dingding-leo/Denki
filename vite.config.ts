import { readFileSync } from 'node:fs'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { denkiBackupPlugin } from './vite-plugin-backup.ts'
import { denkiPrecachePlugin } from './vite-plugin-precache.ts'

const base = process.env.GITHUB_ACTIONS ? '/Denki/' : '/'
const { version: appVersion } = JSON.parse(
  readFileSync(new URL('./version.json', import.meta.url), 'utf8'),
) as { version: string }

// A changing service-worker script URL guarantees that every production build
// re-evaluates its generated precache manifest instead of keeping an old static
// cache forever. CI uses the immutable commit SHA; local production builds fall
// back to a build-time identifier.
const buildId = process.env.GITHUB_SHA?.slice(0, 12) ?? String(Date.now())

export default defineConfig({
  base,
  define: {
    __DENKI_BUILD_ID__: JSON.stringify(buildId),
    __DENKI_VERSION__: JSON.stringify(appVersion),
  },
  plugins: [
    react(),
    denkiBackupPlugin(),
    denkiPrecachePlugin({ version: appVersion, buildId }),
  ],
})
