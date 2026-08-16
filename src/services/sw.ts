import { toast } from '../store/uiStore';

const isTauri = (): boolean =>
  typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;

/**
 * Register the production service worker without letting browser HTTP caches or
 * a byte-identical script URL pin Denki to an old lazy-chunk manifest.
 */
export function initServiceWorker(): void {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;
  if (isTauri()) return;

  if (import.meta.env.DEV) {
    void navigator.serviceWorker.getRegistrations().then((registrations) =>
      Promise.all(registrations.map((registration) => registration.unregister())));
    if (typeof caches !== 'undefined') {
      void caches.keys().then((keys) =>
        Promise.all(
          keys
            .filter((key) => key.startsWith('denki-cache-'))
            .map((key) => caches.delete(key)),
        ));
    }
    return;
  }

  window.addEventListener('load', () => {
    const version = encodeURIComponent(__DENKI_BUILD_ID__);
    void navigator.serviceWorker
      .register(`${import.meta.env.BASE_URL}sw.js?v=${version}`, {
        updateViaCache: 'none',
      })
      .catch((error) => {
        console.error('Denki Service Worker registration failed:', error);
        toast('Offline cache could not be updated; Denki still works while online', 'error', 7000);
      });
  }, { once: true });

  navigator.serviceWorker.addEventListener('controllerchange', () => {
    window.setTimeout(() => {
      toast('Denki was updated — reload to use the latest cached version', 'info', 8000);
    }, 500);
  });
}
