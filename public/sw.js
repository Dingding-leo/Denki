const CACHE_NAME = 'denki-cache-v7';
const BASE_URL = new URL('./', self.location.href).pathname;
const SHELL = [
  BASE_URL,
  `${BASE_URL}index.html`,
  `${BASE_URL}manifest.webmanifest`,
  `${BASE_URL}denki_logo.png`,
];

// 1. Install Event: Precache the app shell AND every hashed JS/CSS asset so the
//    app works fully offline and a deployed shell always has its chunks. The
//    asset list is emitted by the build (vite-plugin-precache) as sw-assets.json.
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then(async (cache) => {
        await cache.addAll(SHELL);
        // Best-effort: if the manifest exists, precache all hashed chunks. A
        // failure here (e.g. a chunk 404s mid-precache) must not fail install —
        // the network-first strategy below still recovers chunks on demand.
        try {
          const res = await fetch(`${BASE_URL}sw-assets.json`);
          if (res.ok) {
            const manifest = await res.json();
            const assets = (manifest.assets || []).map((a) => `${BASE_URL}${a}`);
            if (assets.length) await cache.addAll(assets);
          }
        } catch {
          /* manifest unavailable — chunks will be cached on first use */
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

// 3. Fetch Event: Network-first for HTML/JS/CSS, cache-first for static assets.
//    The precache makes offline work; network-first keeps deploys fresh.
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;

  const url = new URL(event.request.url);
  // Only handle same-origin requests (never cache cross-origin CDN/API calls).
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
          // Offline fallback: serve from cache.
          caches.match(event.request).then((cached) => {
            if (cached) return cached;
            if (isNavigate) return caches.match(BASE_URL);
          })
        )
    );
    return;
  }

  // Cache-first for static assets (images, fonts, manifest).
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
