const CACHE_NAME = 'denki-cache-v6';
const BASE_URL = new URL('./', self.location.href).pathname;
const ASSETS_TO_CACHE = [
  BASE_URL,
  `${BASE_URL}index.html`,
  `${BASE_URL}manifest.webmanifest`,
  `${BASE_URL}denki_logo.png`
];

// 1. Install Event: Cache critical shell assets and immediately activate
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS_TO_CACHE);
    }).then(() => self.skipWaiting())
  );
});

// 2. Activate Event: Clean up only Denki's old caches and take control immediately
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cache) => {
          if (cache.startsWith('denki-cache-') && cache !== CACHE_NAME) {
            return caches.delete(cache);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// 3. Fetch Event: Network-first for HTML/JS/CSS, cache-first for static assets
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;

  const url = new URL(event.request.url);
  const isNavigate = event.request.mode === 'navigate';
  const isCodeAsset = url.pathname.endsWith('.js') || url.pathname.endsWith('.css') || url.pathname.endsWith('.mjs');

  // Network-first for page navigations and code assets (always get latest)
  if (isNavigate || isCodeAsset) {
    event.respondWith(
      fetch(event.request).then((networkResponse) => {
        if (networkResponse && networkResponse.status === 200) {
          const responseToCache = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseToCache);
          });
        }
        return networkResponse;
      }).catch(() => {
        // Offline fallback: serve from cache
        return caches.match(event.request).then((cached) => {
          if (cached) return cached;
          if (isNavigate) return caches.match(BASE_URL);
        });
      })
    );
    return;
  }

  // Cache-first for static assets (images, fonts, manifest)
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
