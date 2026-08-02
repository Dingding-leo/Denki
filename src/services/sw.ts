/**
 * Service worker lifecycle manager.
 *
 * The SW is ONLY registered in production web deploys (built assets). It is
 * actively disabled in two cases:
 *   - Dev server (`vite dev`): a stale SW cached from a previous session would
 *     serve a dead `index.html` whose hashed/lazy module URLs no longer exist
 *     after the dev server restarts, producing the "Failed to fetch dynamically
 *     imported module" crash. We never register, and sweep stale registrations.
 *   - Tauri desktop: the app runs on a custom `tauri://` protocol where SWs are
 *     unsupported and offline caching is handled by the OS/bundled assets.
 *
 * In production web, `skipWaiting` + `clients.claim` (public/sw.js) means a newly
 * deployed SW takes over immediately. That alone can strand a user on a freshly
 * activated shell while old hashed chunks are still in flight, so we surface a
 * one-time "reload to update" prompt instead of silently reloading.
 */
import { toast } from '../store/uiStore';

/** True when running inside the Tauri desktop shell (custom protocol, no HTTP). */
const isTauri = (): boolean =>
  typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;

export function initServiceWorker() {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;

  // Inside the Tauri desktop shell there is no HTTP origin to cache — skip SW
  // entirely (the bundled app already works offline).
  if (isTauri()) return;

  if (import.meta.env.DEV) {
    // Dev: never register. Sweep any stale registration + caches left over from
    // a previous session so the app can't be served from a dead snapshot.
    navigator.serviceWorker.getRegistrations().then((regs) => {
      regs.forEach((reg) => reg.unregister());
    });
    if (typeof caches !== 'undefined') {
      caches.keys().then((keys) => {
        keys.filter((k) => k.startsWith('denki-cache-')).forEach((k) => caches.delete(k));
      });
    }
    return;
  }

  // Prod: register after load so the initial paint isn't delayed.
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register(`${import.meta.env.BASE_URL}sw.js`)
      .catch((err) => console.error('Denki Service Worker registration failed:', err));
  });

  // A controller change means a new SW (new deploy) activated. The SW's
  // skipWaiting+claim means this fires as soon as the new shell is ready.
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    console.log('[Denki] New service worker activated (new deploy available).');
    // Defer so the toast module is ready and the app is mounted.
    setTimeout(() => {
      toast('Denki was updated — reload to get the latest version', 'info', 8000);
    }, 500);
  });
}
