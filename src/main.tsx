import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { forceSave } from './services/backup'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

// Flush any pending debounced filesystem auto-save when the tab is closed or
// hidden. Without this, the last mutation inside the 2s debounce window is
// never written to the backup file.
if (import.meta.env.DEV) {
  window.addEventListener('pagehide', () => forceSave());
}
