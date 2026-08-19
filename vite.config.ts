import { readFileSync } from 'node:fs'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { denkiBackupPlugin } from './vite-plugin-backup.ts'
import { denkiPrecachePlugin } from './vite-plugin-precache.ts'

const base = process.env.GITHUB_ACTIONS ? '/Denki/' : '/'
const { version: appVersion } = JSON.parse(
  readFileSync(new URL('./version.json', import.meta.url), 'utf8'),
) as { version: string }

// Every release artifact receives an immutable build identity. Pull-request and
// push workflows use GitHub's commit SHA; workflow_run deployments pass the
// validated source SHA explicitly through DENKI_BUILD_ID.
const buildId =
  process.env.DENKI_BUILD_ID?.slice(0, 128) ??
  process.env.GITHUB_SHA?.slice(0, 12) ??
  String(Date.now())

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
