import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

const ROOT = process.cwd();
const VERSION_PATTERN = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/;
const nextVersion = process.argv[2];

if (!nextVersion || !VERSION_PATTERN.test(nextVersion)) {
  console.error('Usage: npm run version:set -- <semantic-version>');
  process.exit(1);
}

const readText = (relativePath) =>
  readFile(path.join(ROOT, relativePath), 'utf8');
const writeText = (relativePath, content) =>
  writeFile(path.join(ROOT, relativePath), content, 'utf8');

const [rawTauriConfig, cargoToml, cargoLock] = await Promise.all([
  readText('src-tauri/tauri.conf.json'),
  readText('src-tauri/Cargo.toml'),
  readText('src-tauri/Cargo.lock'),
]);

const tauriConfig = JSON.parse(rawTauriConfig);
tauriConfig.version = nextVersion;

const nextCargoToml = cargoToml.replace(
  /(\[package\][\s\S]*?\nversion\s*=\s*")[^"]+("\s*)/,
  `$1${nextVersion}$2`,
);
if (nextCargoToml === cargoToml) {
  throw new Error('Could not locate src-tauri/Cargo.toml [package] version.');
}

const nextCargoLock = cargoLock.replace(
  /(\[\[package\]\]\s*\nname\s*=\s*"denki"\s*\nversion\s*=\s*")[^"]+("\s*)/,
  `$1${nextVersion}$2`,
);
if (nextCargoLock === cargoLock) {
  throw new Error('Could not locate the denki package in src-tauri/Cargo.lock.');
}

await Promise.all([
  writeText('version.json', `${JSON.stringify({ version: nextVersion }, null, 2)}\n`),
  writeText(
    'src-tauri/tauri.conf.json',
    `${JSON.stringify(tauriConfig, null, 2)}\n`,
  ),
  writeText('src-tauri/Cargo.toml', nextCargoToml),
  writeText('src-tauri/Cargo.lock', nextCargoLock),
]);

console.log(`Updated Denki release version to ${nextVersion}.`);
console.log('Run npm run test:version, then review and commit all changed files.');
