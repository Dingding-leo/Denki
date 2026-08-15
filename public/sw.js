const CACHE_NAME = 'denki-cache-v8';
const BASE_URL = new URL('./', self.location.href).pathname;
const SHELL = [
  BASE_URL,
  `${BASE_URL}index.html`,
  `${BASE_URL}manifest.webmanifest`,
  `${BASE_URL}denki_logo.png`,
];

// 1. Install Event: Precache the app shell and every hashed JS/CSS/WASM asset.
//    The asset list is emitted by the build (vite-plugin-precache) as
//    sw-assets.json, so lazy features remain available on the first offline use.
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then(async (cache) => {
        await cache.addAll(SHELL);
        // Best-effort: if one asset disappears during a deploy, do not reject
        // the entire service-worker install. Runtime caching can recover it.
        try {
          const res = await fetch(`${BASE_URL}sw-assets.json`);
          if (res.ok) {
            const manifest = await res.json();
            const assets = (manifest.assets || []).map((asset) => `${BASE_URL}${asset}`);
            if (assets.length) await cache.addAll(assets);
          }
        } catch {
          /* manifest unavailable — assets will be cached on first use */
        }
      })
      .then(() => self.skipWaiting())
  );
});

// 2. Activate Event: Clean up only Denki's old caches and take control immediately.
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((cacheNames) =>
        Promise.all(
          cacheNames.map((cache) => {
            if (cache.startsWith('denki-cache-') && cache !== CACHE_NAME) {
              return caches.delete(cache);
            }
          })
        )
      )
      .then(() => self.clients.claim())
  );
});

// 3. Fetch Event: Network-first for HTML/JS/CSS, cache-first for immutable
//    static assets such as images, fonts, and hashed WebAssembly binaries.
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;

  const url = new URL(event.request.url);
  // Only handle same-origin requests (never cache third-party APIs).
  if (url.origin !== self.location.origin) return;

  const isNavigate = event.request.mode === 'navigate';
  const isCodeAsset = url.pathname.endsWith('.js') || url.pathname.endsWith('.css') || url.pathname.endsWith('.mjs');

  // Network-first for page navigations and code assets (always get latest).
  if (isNavigate || isCodeAsset) {
    event.respondWith(
      fetch(event.request)
        .then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200) {
            const responseToCache = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(event.request, responseToCache);
            });
          }
          return networkResponse;
        })
        .catch(() =>
          caches.match(event.request).then((cached) => {
            if (cached) return cached;
            if (isNavigate) return caches.match(BASE_URL);
          })
        )
    );
    return;
  }

  // Cache-first for static assets. Hashed filenames make this safe across builds.
  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      if (cachedResponse) return cachedResponse;

      return fetch(event.request).then((networkResponse) => {
        if (!networkResponse || networkResponse.status !== 200 || networkResponse.type !== 'basic') {
          return networkResponse;
        }
        const responseToCache = networkResponse.clone();
        caches.open(CACHE_NAME).then((cache) => {
          cache.put(event.request, responseToCache);
        });
        return networkResponse;
      }).catch(() => {
        if (event.request.mode === 'navigate') {
          return caches.match(BASE_URL);
        }
      });
    })
  );
});
