import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { denkiBackupPlugin } from './vite-plugin-backup'

// The GitHub Pages deploy serves the app from the /Denki/ subpath, so assets
// must be base-prefixed there. Local dev, `vite preview`, and the Docker image
// (nginx at root) all serve from '/'. GITHUB_ACTIONS is set only in CI.
const base = process.env.GITHUB_ACTIONS ? '/Denki/' : '/'

export default defineConfig({
  base,
  plugins: [react(), denkiBackupPlugin()],
})
