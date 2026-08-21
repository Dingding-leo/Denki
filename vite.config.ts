import { readFileSync } from 'node:fs'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { denkiBackupPlugin } from './vite-plugin-backup.ts'
import { denkiPrecachePlugin } from './vite-plugin-precache.ts'

const isTauriBuild = Boolean(process.env.TAURI_ENV_PLATFORM)
const base = isTauriBuild
  ? './'
  : process.env.GITHUB_ACTIONS
    ? '/Denki/'
    : '/'
const { version: appVersion } = JSON.parse(
  readFileSync(new URL('./version.json', import.meta.url), 'utf8'),
) as { version: string }

// Every release artifact receives an immutable build identity. Pull-request and
// push workflows use GitHub's commit SHA; workflow_run deployments pass the
// validated source SHA explicitly through DENKI_BUILD_ID.
const requestedBuildId = process.env.DENKI_BUILD_ID?.trim()
const buildId = requestedBuildId
  ? requestedBuildId.slice(0, 12)
  : process.env.GITHUB_SHA?.slice(0, 12) ?? String(Date.now())

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
  // Tauri exposes these variables to its hook commands. Keeping the prefix
  // explicit makes future frontend code able to inspect target platform values
  // without opening every environment variable to the client bundle.
  envPrefix: ['VITE_', 'TAURI_ENV_*'],
  build: isTauriBuild
    ? {
        target:
          process.env.TAURI_ENV_PLATFORM === 'windows'
            ? 'chrome105'
            : 'safari13',
        minify: process.env.TAURI_ENV_DEBUG === 'true' ? false : 'esbuild',
        sourcemap: process.env.TAURI_ENV_DEBUG === 'true',
      }
    : undefined,
})
