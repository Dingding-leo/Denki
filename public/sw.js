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

async function fetchAndCache(request) {
  try {
    const response = await fetch(request);
    return await cacheSuccessfulResponse(request, response);
  } catch {
    return Response.error();
  }
}

async function matchReleaseResource(request) {
  // Static hosts commonly attach `Vary: Origin` to module responses. Cache.add()
  // and a later browser module request can then differ only by request headers
  // even though the immutable, same-origin URL and release identity are exact.
  // The cache namespace is already versioned, so ignoring Vary here cannot mix
  // releases or origins and prevents a fully installed chunk from appearing
  // absent during offline navigation.
  return caches.match(request, { ignoreVary: true });
}

async function serveReleaseResource(request, isNavigate) {
  // The active worker owns one complete, versioned release. Navigations and
  // immutable code assets must come from that release first; network-first can
  // return a browser-generated offline error response without rejecting, which
  // bypasses a `.catch()` fallback and produces a blank offline reload.
  const cached = await matchReleaseResource(request);
  if (cached) return cached;

  if (isNavigate) {
    const shell =
      (await matchReleaseResource(BASE_URL)) ||
      (await matchReleaseResource(`${BASE_URL}index.html`));
    if (shell) return shell;
  }

  return fetchAndCache(request);
}

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;

  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;

  const isNavigate = event.request.mode === 'navigate';
  const isCodeAsset = /\.(?:js|css|mjs|wasm)$/.test(url.pathname);

  if (isNavigate || isCodeAsset) {
    event.respondWith(serveReleaseResource(event.request, isNavigate));
    return;
  }

  event.respondWith(
    matchReleaseResource(event.request).then((cachedResponse) =>
      cachedResponse || fetchAndCache(event.request)),
  );
});
