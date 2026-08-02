/**
 * Service worker lifecycle manager.
 *
 * The SW is ONLY registered in production (built assets). In dev it is actively
 * unregistered and its caches cleared — a stale SW cached from a previous
 * session will otherwise serve a dead `index.html` whose hashed/lazy module URLs
 * no longer exist after the dev server restarts, producing the "Failed to fetch
 * dynamically imported module" crash.
 *
 * In production, `skipWaiting` + `clients.claim` (public/sw.js) means a newly
 * deployed SW takes over immediately. That alone can strand a user on a freshly
 * activated shell while old hashed chunks are still in flight, so we surface a
 * one-time "reload to update" prompt instead of silently reloading.
 */
import { toast } from '../store/uiStore';

export function initServiceWorker() {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;

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
