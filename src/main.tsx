import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { forceSave } from './services/backup'
import { initServiceWorker } from './services/sw'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

// Service worker: dev-unaware registration previously cached a stale dev shell
// whose lazy module URLs died when the dev server restarted ("Failed to fetch
// dynamically imported module"). Now: never registered in dev (and swept), and
// surfaced as an update toast in production.
initServiceWorker();

// Flush any pending debounced filesystem auto-save when the tab is closed or
// hidden. Without this, the last mutation inside the 2s debounce window is
// never written to the backup file.
if (import.meta.env.DEV) {
  window.addEventListener('pagehide', () => forceSave());
}
