import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import './zine.css'
import './zine-components.css'
import './zine-compat.css'
import './eye-comfort.css'
import './review-session.css'
import './today-queue.css'
import './class-workspace.css'
import './deck-action-zone.css'
import App from './App.tsx'
import { forceSave } from './services/backup'
import { flushPersistedStudySession } from './services/studySessionPersistence'
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

// Persist the newest resumable-session cursor before the browser freezes or
// discards the page. Development also flushes its optional filesystem backup.
const flushTransientState = () => {
  flushPersistedStudySession();
  if (import.meta.env.DEV) forceSave();
};

window.addEventListener('pagehide', flushTransientState);
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') flushTransientState();
});
