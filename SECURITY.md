# Security policy

## Supported version

Denki is pre-1.0. Security fixes are applied to the latest commit on `main`; older commits and retained branch names are not supported release lines.

## Reporting a vulnerability

Please do not disclose exploitable details in a public issue.

1. Use **Security → Report a vulnerability** in this repository when private vulnerability reporting is available.
2. Include the affected commit, browser or Tauri platform, reproduction steps, impact, and any proof-of-concept data that is safe to share.
3. Avoid submitting real patient information, API keys, private study content, or other third-party data.
4. If private reporting is unavailable, open a public issue containing only a request for a private contact channel. Do not include the vulnerability details there.

## High-priority areas

Reports are especially useful when they concern:

- cross-site scripting or unsafe Markdown/Anki rendering;
- backup import validation or destructive data loss;
- IndexedDB transaction integrity;
- service-worker cache poisoning or mixed-version execution;
- Tauri capability or CSP bypasses;
- API-key exposure;
- decompression bombs or resource exhaustion in `.apkg` imports;
- scheduler changes that violate the pinned FSRS 4.5 reference vectors.

## Disclosure

Please allow the maintainer to reproduce, patch, test, and release a fix before public disclosure. Confirmed fixes should include regression coverage whenever practical.
