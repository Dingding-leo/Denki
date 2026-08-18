import { readFileSync } from 'node:fs';

const fail = (message) => {
  throw new Error(`[security-config] ${message}`);
};

const requireToken = (directive, tokens, token, source) => {
  if (!tokens.includes(token)) {
    fail(`${source} ${directive} must include ${token}.`);
  }
};

const parsePolicy = (policy, source) => {
  if (typeof policy !== 'string' || !policy.trim()) {
    fail(`${source} policy is missing.`);
  }

  const directives = new Map();
  for (const part of policy.split(';')) {
    const trimmed = part.trim();
    if (!trimmed) continue;
    const [name, ...tokens] = trimmed.split(/\s+/);
    if (directives.has(name)) fail(`${source} repeats ${name}.`);
    directives.set(name, tokens);
  }
  return directives;
};

const validatePolicy = (directives, source) => {
  const required = [
    'default-src',
    'base-uri',
    'object-src',
    'script-src',
    'style-src',
    'img-src',
    'media-src',
    'font-src',
    'connect-src',
    'worker-src',
    'frame-src',
    'form-action',
  ];
  for (const directive of required) {
    if (!directives.has(directive)) fail(`${source} is missing ${directive}.`);
  }

  requireToken('default-src', directives.get('default-src'), "'self'", source);
  requireToken('object-src', directives.get('object-src'), "'none'", source);
  requireToken('script-src', directives.get('script-src'), "'self'", source);
  requireToken(
    'script-src',
    directives.get('script-src'),
    "'wasm-unsafe-eval'",
    source,
  );
  requireToken('frame-src', directives.get('frame-src'), "'none'", source);
  requireToken('form-action', directives.get('form-action'), "'self'", source);

  const scriptTokens = directives.get('script-src');
  for (const forbidden of [
    '*',
    'http:',
    'https:',
    "'unsafe-inline'",
    "'unsafe-eval'",
  ]) {
    if (scriptTokens.includes(forbidden)) {
      fail(`${source} script-src must not include ${forbidden}.`);
    }
  }

  if (directives.get('connect-src').includes('*')) {
    fail(`${source} connect-src must not contain an unrestricted wildcard.`);
  }
};

const validateTauriSchemeCompatibility = (directives, source) => {
  requireToken('default-src', directives.get('default-src'), 'asset:', source);
  requireToken('img-src', directives.get('img-src'), 'asset:', source);
  requireToken(
    'img-src',
    directives.get('img-src'),
    'http://asset.localhost',
    source,
  );
  requireToken('media-src', directives.get('media-src'), 'asset:', source);
  requireToken(
    'media-src',
    directives.get('media-src'),
    'http://asset.localhost',
    source,
  );
  requireToken('connect-src', directives.get('connect-src'), 'ipc:', source);
  requireToken(
    'connect-src',
    directives.get('connect-src'),
    'http://ipc.localhost',
    source,
  );
};

const indexHtml = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const metaMatch = indexHtml.match(
  /http-equiv="Content-Security-Policy"[\s\S]*?content="([^"]+)"/i,
);
if (!metaMatch) fail('index.html does not declare a CSP meta policy.');
const webPolicy = parsePolicy(metaMatch[1], 'Web CSP');
validatePolicy(webPolicy, 'Web CSP');
// Tauri injects an additional CSP into the same document. Both policies are
// enforced, so the shared HTML policy must not accidentally block Tauri IPC or
// the asset protocol even though those schemes are inert in a normal browser.
validateTauriSchemeCompatibility(webPolicy, 'Web CSP');

const tauriConfig = JSON.parse(
  readFileSync(new URL('../src-tauri/tauri.conf.json', import.meta.url), 'utf8'),
);
const tauriCsp = tauriConfig?.app?.security?.csp;
if (!tauriCsp || typeof tauriCsp !== 'object' || Array.isArray(tauriCsp)) {
  fail('Tauri CSP must be a directive object, not null or a permissive string.');
}
const tauriPolicyString = Object.entries(tauriCsp)
  .map(
    ([directive, value]) =>
      `${directive} ${Array.isArray(value) ? value.join(' ') : value}`,
  )
  .join('; ');
const tauriPolicy = parsePolicy(tauriPolicyString, 'Tauri CSP');
validatePolicy(tauriPolicy, 'Tauri CSP');
validateTauriSchemeCompatibility(tauriPolicy, 'Tauri CSP');

const capabilities = JSON.parse(
  readFileSync(
    new URL('../src-tauri/capabilities/default.json', import.meta.url),
    'utf8',
  ),
);
if (
  !Array.isArray(capabilities.permissions) ||
  capabilities.permissions.some((permission) => typeof permission !== 'string')
) {
  fail('Tauri capabilities must declare an explicit permission list.');
}
const dangerousPermissions = capabilities.permissions.filter((permission) =>
  /(?:shell|process|fs):(?:allow|default)/.test(permission),
);
if (dangerousPermissions.length > 0) {
  fail(
    `Tauri capabilities expose privileged APIs: ${dangerousPermissions.join(', ')}.`,
  );
}

console.log('Security configuration validated.');
