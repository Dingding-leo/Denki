const VERSION = new URL(self.location.href).searchParams.get('v') || 'unversioned';
const CACHE_NAME = `denki-cache-${VERSION.replace(/[^a-zA-Z0-9_-]/g, '')}`;
const BASE_URL = new URL('./', self.location.href).pathname;
const SHELL = [
  BASE_URL,
  `${BASE_URL}index.html`,
  `${BASE_URL}manifest.webmanifest`,
  `${BASE_URL}version.json`,
  `${BASE_URL}denki_logo.png`,
];

async function loadPrecacheAssets() {
  const response = await fetch(`${BASE_URL}sw-assets.json`, { cache: 'no-store' });
  if (!response.ok) {
    throw new Error(`Precache manifest request failed (${response.status}).`);
  }

  const manifest = await response.json();
  if (!manifest || !Array.isArray(manifest.assets)) {
    throw new Error('Precache manifest has an invalid shape.');
  }

  return manifest.assets
    .filter((asset) => typeof asset === 'string' && asset.length > 0)
    .map((asset) => `${BASE_URL}${asset}`);
}

async function installCompleteRelease() {
  const cache = await caches.open(CACHE_NAME);
  try {
    const generatedAssets = await loadPrecacheAssets();
    const requiredUrls = [...new Set([...SHELL, ...generatedAssets])];

    // A release is installable only when every shell, code, style, WASM, and
    // release-identity asset is available. Never activate a partial build.
    await Promise.all(requiredUrls.map((url) => cache.add(url)));
  } catch (error) {
    await caches.delete(CACHE_NAME);
    throw error;
  }
}

self.addEventListener('install', (event) => {
  // Do not call skipWaiting(). The current release remains active until all of
  // its clients close, so old pages can continue loading their old hashed chunks.
  event.waitUntil(installCompleteRelease());
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

async function cacheSuccessfulResponse(request, response) {
  if (!response.ok || response.type !== 'basic') return response;
  const cache = await caches.open(CACHE_NAME);
  await cache.put(request, response.clone());
  return response;
}

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;

  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;

  const isNavigate = event.request.mode === 'navigate';
  const isCodeAsset = /\.(?:js|css|mjs|wasm)$/.test(url.pathname);

  if (isNavigate || isCodeAsset) {
    event.respondWith(
      fetch(event.request)
        .then((response) => cacheSuccessfulResponse(event.request, response))
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
        const response = await fetch(event.request);
        return await cacheSuccessfulResponse(event.request, response);
      } catch {
        return Response.error();
      }
    }),
  );
});
