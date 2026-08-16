import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { denkiBackupPlugin } from './vite-plugin-backup'
import { denkiPrecachePlugin } from './vite-plugin-precache'

const base = process.env.GITHUB_ACTIONS ? '/Denki/' : '/'
// A changing service-worker script URL guarantees that every production build
// re-evaluates its generated precache manifest instead of keeping an old static
// `denki-cache-v8` forever. CI uses the immutable commit SHA; local production
// builds fall back to a build-time identifier.
const buildId = process.env.GITHUB_SHA?.slice(0, 12) ?? String(Date.now())

export default defineConfig({
  base,
  define: {
    __DENKI_BUILD_ID__: JSON.stringify(buildId),
  },
  plugins: [react(), denkiBackupPlugin(), denkiPrecachePlugin()],
})
