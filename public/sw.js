const VERSION = new URL(self.location.href).searchParams.get('v') || 'unversioned';
const CACHE_NAME = `denki-cache-${VERSION.replace(/[^a-zA-Z0-9_-]/g, '')}`;
const BASE_URL = new URL('./', self.location.href).pathname;
const SHELL = [
  BASE_URL,
  `${BASE_URL}index.html`,
  `${BASE_URL}manifest.webmanifest`,
  `${BASE_URL}denki_logo.png`,
];

async function cacheIndividually(cache, urls) {
  await Promise.allSettled(urls.map((url) => cache.add(url)));
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(async (cache) => {
      // One missing optional shell file must not invalidate the whole install.
      await cacheIndividually(cache, SHELL);

      try {
        const response = await fetch(`${BASE_URL}sw-assets.json`, { cache: 'no-store' });
        if (response.ok) {
          const manifest = await response.json();
          const assets = Array.isArray(manifest.assets)
            ? manifest.assets.map((asset) => `${BASE_URL}${asset}`)
            : [];
          await cacheIndividually(cache, assets);
        }
      } catch (error) {
        console.warn('[Denki SW] Precache manifest unavailable:', error);
      }
    }).then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((cacheNames) => Promise.all(
        cacheNames
          .filter((cacheName) => cacheName.startsWith('denki-cache-') && cacheName !== CACHE_NAME)
          .map((cacheName) => caches.delete(cacheName)),
      ))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;

  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;

  const isNavigate = event.request.mode === 'navigate';
  const isCodeAsset = /\.(?:js|css|mjs)$/.test(url.pathname);

  if (isNavigate || isCodeAsset) {
    event.respondWith(
      fetch(event.request)
        .then((networkResponse) => {
          if (networkResponse.ok && networkResponse.type === 'basic') {
            const copy = networkResponse.clone();
            event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy)));
          }
          return networkResponse;
        })
        .catch(async () => {
          const cached = await caches.match(event.request);
          if (cached) return cached;
          if (isNavigate) {
            return (await caches.match(BASE_URL)) || (await caches.match(`${BASE_URL}index.html`)) || Response.error();
          }
          return Response.error();
        }),
    );
    return;
  }

  event.respondWith(
    caches.match(event.request).then(async (cachedResponse) => {
      if (cachedResponse) return cachedResponse;

      try {
        const networkResponse = await fetch(event.request);
        if (networkResponse.ok && networkResponse.type === 'basic') {
          const copy = networkResponse.clone();
          event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy)));
        }
        return networkResponse;
      } catch {
        return Response.error();
      }
    }),
  );
});
