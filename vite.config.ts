import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { denkiBackupPlugin } from './vite-plugin-backup'

export default defineConfig({
  plugins: [react(), denkiBackupPlugin()],
})
