import { readFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

const ROOT = process.cwd();
const VERSION_PATTERN = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/;
const BUILD_ID_PATTERN = /^[A-Za-z0-9._-]{1,128}$/;

const fail = (message) => {
  throw new Error(`[built-version] ${message}`);
};

const parseJsonFile = async (relativePath) => {
  let raw;
  try {
    raw = await readFile(path.join(ROOT, relativePath), 'utf8');
  } catch (error) {
    fail(`${relativePath} is missing: ${error instanceof Error ? error.message : String(error)}`);
  }

  try {
    return JSON.parse(raw);
  } catch (error) {
    fail(`${relativePath} is not valid JSON: ${error instanceof Error ? error.message : String(error)}`);
  }
};

const source = await parseJsonFile('version.json');
const built = await parseJsonFile('dist/version.json');

if (typeof source?.version !== 'string' || !VERSION_PATTERN.test(source.version)) {
  fail(`version.json contains an invalid version: ${String(source?.version)}.`);
}
if (typeof built?.version !== 'string' || !VERSION_PATTERN.test(built.version)) {
  fail(`dist/version.json contains an invalid version: ${String(built?.version)}.`);
}
if (built.version !== source.version) {
  fail(
    `dist/version.json reports ${built.version}, but source version.json reports ${source.version}.`,
  );
}
if (typeof built?.buildId !== 'string' || !BUILD_ID_PATTERN.test(built.buildId)) {
  fail(`dist/version.json contains an invalid buildId: ${String(built?.buildId)}.`);
}
if (
  !built ||
  typeof built !== 'object' ||
  Array.isArray(built) ||
  Object.keys(built).some((key) => key !== 'version' && key !== 'buildId')
) {
  fail('dist/version.json must contain only version and buildId.');
}

const expectedBuildId = process.env.GITHUB_SHA?.slice(0, 12);
if (expectedBuildId && built.buildId !== expectedBuildId) {
  fail(
    `dist buildId ${built.buildId} does not match GITHUB_SHA ${expectedBuildId}.`,
  );
}

console.log(`Built release identity validated: ${built.version} (${built.buildId})`);
