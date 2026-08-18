import { readFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

const ROOT = process.cwd();
const VERSION_PATTERN = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/;

const fail = (message) => {
  throw new Error(`[version-contract] ${message}`);
};

const readText = (relativePath) =>
  readFile(path.join(ROOT, relativePath), 'utf8');

const parseJson = (text, source) => {
  try {
    return JSON.parse(text);
  } catch (error) {
    fail(`${source} is not valid JSON: ${error instanceof Error ? error.message : String(error)}`);
  }
};

const requireVersion = (value, source) => {
  if (typeof value !== 'string' || !VERSION_PATTERN.test(value)) {
    fail(`${source} must contain a valid semantic version; received ${String(value)}.`);
  }
  return value;
};

const [rawVersion, rawTauriConfig, cargoToml, cargoLock, rawPackage] =
  await Promise.all([
    readText('version.json'),
    readText('src-tauri/tauri.conf.json'),
    readText('src-tauri/Cargo.toml'),
    readText('src-tauri/Cargo.lock'),
    readText('package.json'),
  ]);

const versionDocument = parseJson(rawVersion, 'version.json');
const canonicalVersion = requireVersion(
  versionDocument?.version,
  'version.json',
);
if (
  !versionDocument ||
  typeof versionDocument !== 'object' ||
  Array.isArray(versionDocument) ||
  Object.keys(versionDocument).some((key) => key !== 'version')
) {
  fail('version.json must contain only the canonical version field.');
}

const tauriConfig = parseJson(rawTauriConfig, 'src-tauri/tauri.conf.json');
const tauriVersion = requireVersion(
  tauriConfig?.version,
  'src-tauri/tauri.conf.json',
);

const cargoTomlVersion = cargoToml.match(
  /\[package\][\s\S]*?\nversion\s*=\s*"([^"]+)"/,
)?.[1];
const cargoVersion = requireVersion(
  cargoTomlVersion,
  'src-tauri/Cargo.toml [package]',
);

const cargoLockVersion = cargoLock.match(
  /\[\[package\]\]\s*\nname\s*=\s*"denki"\s*\nversion\s*=\s*"([^"]+)"/,
)?.[1];
const lockedVersion = requireVersion(
  cargoLockVersion,
  'src-tauri/Cargo.lock denki package',
);

const packageJson = parseJson(rawPackage, 'package.json');
if (packageJson?.private !== true) {
  fail('package.json must remain private so workspace metadata cannot be published accidentally.');
}
if (packageJson?.version !== '0.0.0') {
  fail(
    'package.json version must remain 0.0.0; Denki release versions come from version.json, not the private npm workspace.',
  );
}

const versions = new Map([
  ['version.json', canonicalVersion],
  ['src-tauri/tauri.conf.json', tauriVersion],
  ['src-tauri/Cargo.toml', cargoVersion],
  ['src-tauri/Cargo.lock', lockedVersion],
]);

for (const [source, version] of versions) {
  if (version !== canonicalVersion) {
    fail(
      `${source} reports ${version}, but the canonical application version is ${canonicalVersion}. Run npm run version:set -- ${canonicalVersion}.`,
    );
  }
}

console.log(`Release version contract validated: ${canonicalVersion}`);
