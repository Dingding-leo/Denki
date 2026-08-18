import { access, readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

const DIST_DIR = path.resolve(process.cwd(), 'dist');
const REQUIRED_FILES = [
  'index.html',
  '404.html',
  'manifest.webmanifest',
  'sw.js',
  'sw-assets.json',
  'denki_logo.png',
];
const PRECACHE_EXTENSIONS = /\.(?:js|mjs|css|wasm)$/;

const failures = [];

function check(condition, message) {
  if (!condition) failures.push(message);
}

async function exists(relativePath) {
  try {
    await access(path.join(DIST_DIR, relativePath));
    return true;
  } catch {
    return false;
  }
}

async function listFiles(directory, prefix = '') {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const relativePath = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      files.push(...await listFiles(path.join(directory, entry.name), relativePath));
    } else if (entry.isFile()) {
      files.push(relativePath);
    }
  }

  return files.sort();
}

function isSafeRelativeAsset(value) {
  return (
    typeof value === 'string' &&
    value.length > 0 &&
    !value.startsWith('/') &&
    !value.includes('\\') &&
    !value.split('/').includes('..') &&
    !/^[a-z][a-z\d+.-]*:/i.test(value)
  );
}

function localDocumentReferences(html) {
  return [...html.matchAll(/\b(?:src|href)=(['"])(.*?)\1/gi)]
    .map((match) => match[2])
    .filter((reference) => (
      reference &&
      !reference.startsWith('#') &&
      !reference.startsWith('data:') &&
      !reference.startsWith('http://') &&
      !reference.startsWith('https://')
    ));
}

for (const requiredFile of REQUIRED_FILES) {
  check(await exists(requiredFile), `Missing required release file: dist/${requiredFile}`);
}

if (failures.length === 0) {
  const [indexHtml, rawPrecache, rawManifest, serviceWorker, allFiles] = await Promise.all([
    readFile(path.join(DIST_DIR, 'index.html'), 'utf8'),
    readFile(path.join(DIST_DIR, 'sw-assets.json'), 'utf8'),
    readFile(path.join(DIST_DIR, 'manifest.webmanifest'), 'utf8'),
    readFile(path.join(DIST_DIR, 'sw.js'), 'utf8'),
    listFiles(DIST_DIR),
  ]);

  check(!indexHtml.includes('/src/main.tsx'), 'Production index still references the source entrypoint.');
  check(!indexHtml.includes('%BASE_URL%'), 'Production index contains an unresolved Vite base placeholder.');

  const cspMatch = indexHtml.match(
    /<meta\s+[^>]*http-equiv=(['"])Content-Security-Policy\1[^>]*content=(['"])(.*?)\2[^>]*>/i,
  ) ?? indexHtml.match(
    /<meta\s+[^>]*content=(['"])(.*?)\1[^>]*http-equiv=(['"])Content-Security-Policy\3[^>]*>/i,
  );
  const csp = cspMatch?.[3] ?? cspMatch?.[2] ?? '';
  check(Boolean(csp), 'Production index is missing its Content-Security-Policy meta tag.');
  check(!csp.includes("'unsafe-eval'"), "Production CSP permits 'unsafe-eval'.");
  check(!/(?:^|[;\s])\*(?:[;\s]|$)/.test(csp), 'Production CSP contains a wildcard source.');
  check(csp.includes("object-src 'none'"), "Production CSP must contain object-src 'none'.");
  check(csp.includes("base-uri 'none'"), "Production CSP must contain base-uri 'none'.");

  let precache;
  try {
    precache = JSON.parse(rawPrecache);
  } catch (error) {
    failures.push(`sw-assets.json is not valid JSON: ${error instanceof Error ? error.message : String(error)}`);
  }

  const precacheAssets = Array.isArray(precache?.assets) ? precache.assets : [];
  check(Array.isArray(precache?.assets), 'sw-assets.json must contain an assets array.');
  check(precacheAssets.length > 0, 'sw-assets.json contains no generated assets.');
  check(new Set(precacheAssets).size === precacheAssets.length, 'sw-assets.json contains duplicate entries.');

  for (const asset of precacheAssets) {
    check(isSafeRelativeAsset(asset), `Unsafe precache asset path: ${String(asset)}`);
    check(PRECACHE_EXTENSIONS.test(asset), `Unexpected precache asset type: ${String(asset)}`);
    if (isSafeRelativeAsset(asset)) {
      check(await exists(asset), `Precache entry does not exist in dist: ${asset}`);
    }
  }

  const emittedCodeAssets = allFiles
    .filter((file) => file.startsWith('assets/') && PRECACHE_EXTENSIONS.test(file))
    .sort();
  const listedCodeAssets = [...precacheAssets]
    .filter((asset) => typeof asset === 'string')
    .sort();
  check(
    JSON.stringify(listedCodeAssets) === JSON.stringify(emittedCodeAssets),
    [
      'sw-assets.json does not exactly cover emitted JS/CSS/WASM assets.',
      `Listed: ${listedCodeAssets.join(', ') || '(none)'}`,
      `Emitted: ${emittedCodeAssets.join(', ') || '(none)'}`,
    ].join('\n'),
  );

  const manifestHref = indexHtml.match(/<link\s+[^>]*rel=(['"])manifest\1[^>]*href=(['"])(.*?)\2/i)?.[3]
    ?? indexHtml.match(/<link\s+[^>]*href=(['"])(.*?)\1[^>]*rel=(['"])manifest\3/i)?.[2];
  check(Boolean(manifestHref), 'Production index does not link the web app manifest.');
  const basePrefix = manifestHref?.slice(0, -'manifest.webmanifest'.length) ?? '/';

  for (const reference of localDocumentReferences(indexHtml)) {
    check(
      reference.startsWith(basePrefix),
      `Local index reference escapes the configured base path (${basePrefix}): ${reference}`,
    );
    if (!reference.startsWith(basePrefix)) continue;
    const relativePath = reference.slice(basePrefix.length).split(/[?#]/, 1)[0];
    if (relativePath) {
      check(await exists(relativePath), `Index reference does not exist in dist: ${reference}`);
    }
  }

  let manifest;
  try {
    manifest = JSON.parse(rawManifest);
  } catch (error) {
    failures.push(`manifest.webmanifest is not valid JSON: ${error instanceof Error ? error.message : String(error)}`);
  }

  check(manifest?.name === 'Denki', 'Web app manifest has an unexpected name.');
  check(manifest?.display === 'standalone', 'Web app manifest must use standalone display mode.');
  check(manifest?.start_url === './', "Web app manifest start_url must remain './'.");
  check(manifest?.scope === './', "Web app manifest scope must remain './'.");
  check(Array.isArray(manifest?.icons) && manifest.icons.length > 0, 'Web app manifest has no icons.');
  for (const icon of manifest?.icons ?? []) {
    check(isSafeRelativeAsset(icon?.src), `Unsafe manifest icon path: ${String(icon?.src)}`);
    if (isSafeRelativeAsset(icon?.src)) {
      check(await exists(icon.src), `Manifest icon does not exist in dist: ${icon.src}`);
    }
  }

  check(serviceWorker.includes('sw-assets.json'), 'Service worker no longer consumes the generated precache manifest.');
  check(serviceWorker.includes('Promise.all(requiredUrls.map'), 'Service worker no longer installs release assets atomically.');
  check(!serviceWorker.includes('Promise.allSettled'), 'Service worker allows partial release installation.');
}

if (failures.length > 0) {
  console.error('\nRelease artifact validation failed:\n');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log('Release artifact validation passed.');
