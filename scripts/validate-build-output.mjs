import { access, readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

const ROOT_DIR = process.cwd();
const DIST_DIR = path.resolve(ROOT_DIR, 'dist');
const REQUIRED_FILES = [
  'index.html',
  '404.html',
  'manifest.webmanifest',
  'sw.js',
  'sw-assets.json',
  'version.json',
  'denki_logo.png',
];
const PRECACHE_EXTENSIONS = /\.(?:js|mjs|css|wasm)$/;
const SEMVER_PATTERN = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/;
const BUILD_ID_PATTERN = /^[A-Za-z0-9._-]{1,128}$/;

const failures = [];

function check(condition, message) {
  if (!condition) failures.push(message);
}

function parseJson(text, source) {
  try {
    return JSON.parse(text);
  } catch (error) {
    failures.push(
      `${source} is not valid JSON: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
    return null;
  }
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
  const [
    indexHtml,
    rawPrecache,
    rawManifest,
    rawSourceVersion,
    rawBuiltVersion,
    serviceWorker,
    allFiles,
  ] = await Promise.all([
    readFile(path.join(DIST_DIR, 'index.html'), 'utf8'),
    readFile(path.join(DIST_DIR, 'sw-assets.json'), 'utf8'),
    readFile(path.join(DIST_DIR, 'manifest.webmanifest'), 'utf8'),
    readFile(path.join(ROOT_DIR, 'version.json'), 'utf8'),
    readFile(path.join(DIST_DIR, 'version.json'), 'utf8'),
    readFile(path.join(DIST_DIR, 'sw.js'), 'utf8'),
    listFiles(DIST_DIR),
  ]);

  const sourceVersion = parseJson(rawSourceVersion, 'version.json');
  const builtVersion = parseJson(rawBuiltVersion, 'dist/version.json');
  const canonicalVersion = sourceVersion?.version;
  const buildId = builtVersion?.buildId;
  const expectedBuildId = (
    process.env.DENKI_BUILD_ID?.trim() ||
    process.env.GITHUB_SHA?.trim() ||
    ''
  ).slice(0, 12);

  check(
    sourceVersion &&
      typeof sourceVersion === 'object' &&
      !Array.isArray(sourceVersion) &&
      Object.keys(sourceVersion).length === 1 &&
      Object.hasOwn(sourceVersion, 'version'),
    'version.json must contain only the canonical version field.',
  );
  check(
    typeof canonicalVersion === 'string' && SEMVER_PATTERN.test(canonicalVersion),
    `version.json contains an invalid semantic version: ${String(canonicalVersion)}`,
  );
  check(
    builtVersion &&
      typeof builtVersion === 'object' &&
      !Array.isArray(builtVersion) &&
      Object.keys(builtVersion).sort().join(',') === 'buildId,version',
    'dist/version.json must contain exactly version and buildId.',
  );
  check(
    builtVersion?.version === canonicalVersion,
    `Built version ${String(builtVersion?.version)} does not match source version ${String(canonicalVersion)}.`,
  );
  check(
    typeof buildId === 'string' && BUILD_ID_PATTERN.test(buildId),
    `Built release has an invalid build identifier: ${String(buildId)}`,
  );
  if (expectedBuildId) {
    check(
      buildId === expectedBuildId,
      `Built release identifies ${String(buildId)}, expected validated commit ${expectedBuildId}.`,
    );
  }

  check(
    !indexHtml.includes('/src/main.tsx'),
    'Production index still references the source entrypoint.',
  );
  check(
    !indexHtml.includes('%BASE_URL%'),
    'Production index contains an unresolved Vite base placeholder.',
  );

  const cspMatch = indexHtml.match(
    /<meta\s+[^>]*http-equiv=(['"])Content-Security-Policy\1[^>]*content=(['"])(.*?)\2[^>]*>/i,
  ) ?? indexHtml.match(
    /<meta\s+[^>]*content=(['"])(.*?)\1[^>]*http-equiv=(['"])Content-Security-Policy\3[^>]*>/i,
  );
  const csp = cspMatch?.[3] ?? cspMatch?.[2] ?? '';
  check(
    Boolean(csp),
    'Production index is missing its Content-Security-Policy meta tag.',
  );
  check(!csp.includes("'unsafe-eval'"), "Production CSP permits 'unsafe-eval'.");
  check(
    !/(?:^|[;\s])\*(?:[;\s]|$)/.test(csp),
    'Production CSP contains a wildcard source.',
  );
  check(
    csp.includes("object-src 'none'"),
    "Production CSP must contain object-src 'none'.",
  );
  check(
    csp.includes("base-uri 'none'"),
    "Production CSP must contain base-uri 'none'.",
  );

  const precache = parseJson(rawPrecache, 'sw-assets.json');
  const precacheAssets = Array.isArray(precache?.assets) ? precache.assets : [];
  check(
    Array.isArray(precache?.assets),
    'sw-assets.json must contain an assets array.',
  );
  check(precacheAssets.length > 0, 'sw-assets.json contains no generated assets.');
  check(
    new Set(precacheAssets).size === precacheAssets.length,
    'sw-assets.json contains duplicate entries.',
  );

  for (const asset of precacheAssets) {
    check(isSafeRelativeAsset(asset), `Unsafe precache asset path: ${String(asset)}`);
    check(
      PRECACHE_EXTENSIONS.test(asset),
      `Unexpected precache asset type: ${String(asset)}`,
    );
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

  const manifestHref = indexHtml.match(
    /<link\s+[^>]*rel=(['"])manifest\1[^>]*href=(['"])(.*?)\2/i,
  )?.[3] ?? indexHtml.match(
    /<link\s+[^>]*href=(['"])(.*?)\1[^>]*rel=(['"])manifest\3/i,
  )?.[2];
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
      check(
        await exists(relativePath),
        `Index reference does not exist in dist: ${reference}`,
      );
    }
  }

  const manifest = parseJson(rawManifest, 'manifest.webmanifest');
  check(manifest?.name === 'Denki', 'Web app manifest has an unexpected name.');
  check(
    manifest?.display === 'standalone',
    'Web app manifest must use standalone display mode.',
  );
  check(manifest?.start_url === './', "Web app manifest start_url must remain './'.");
  check(manifest?.scope === './', "Web app manifest scope must remain './'.");
  check(
    Array.isArray(manifest?.icons) && manifest.icons.length > 0,
    'Web app manifest has no icons.',
  );
  for (const icon of manifest?.icons ?? []) {
    check(isSafeRelativeAsset(icon?.src), `Unsafe manifest icon path: ${String(icon?.src)}`);
    if (isSafeRelativeAsset(icon?.src)) {
      check(await exists(icon.src), `Manifest icon does not exist in dist: ${icon.src}`);
    }
  }

  check(
    serviceWorker.includes('sw-assets.json'),
    'Service worker no longer consumes the generated precache manifest.',
  );
  check(
    serviceWorker.includes('version.json'),
    'Service worker no longer caches immutable release metadata.',
  );
  check(
    serviceWorker.includes('Promise.all(requiredUrls.map'),
    'Service worker no longer installs release assets atomically.',
  );
  check(
    !serviceWorker.includes('Promise.allSettled'),
    'Service worker allows partial release installation.',
  );
}

if (failures.length > 0) {
  console.error('\nRelease artifact validation failed:\n');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log('Release artifact validation passed.');
