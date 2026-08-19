# Contributing to Denki

Denki welcomes focused issues and pull requests. Because it stores learner data locally and controls future review schedules, correctness and recoverability take priority over implementation speed.

Read `ARCHITECTURE.md` before changing persistence, scheduling, imports, session behaviour, security policy, offline support, or distribution.

## Development setup

Requirements:

- Node.js 22;
- npm;
- a modern browser with IndexedDB;
- Rust only when developing or building the optional Tauri desktop wrapper.

```bash
git clone https://github.com/Dingding-leo/Denki.git
cd Denki
npm ci
npm run dev
```

Do not use `npm install` to update a dependency unintentionally. Keep `package.json` and `package-lock.json` consistent.

## Branch and pull-request workflow

1. Start from current `main`.
2. Create one focused branch.
3. Keep unrelated refactors out of the change.
4. Add regression coverage before declaring the change complete.
5. Run the complete local validation sequence.
6. Open a pull request that explains user impact, compatibility, failure behaviour, and non-goals.
7. Merge only after every required check passes on the exact final head.

Recommended branch prefixes:

- `fix/` for defects;
- `feat/` for user-visible capability;
- `refactor/` for behaviour-preserving structural work;
- `security/` for security controls;
- `ci/` for validation or distribution;
- `docs/` for documentation-only changes.

Prefer squash merging for a focused pull request. Delete or neutralise the branch after merge so obsolete code cannot appear unmerged later.

## Required validation

Run from a clean checkout:

```bash
npm ci
npm run audit:prod
npm run test:version
npx tsc --noEmit
npm run test:security
npm run test:scheduler
npm run lint
npm run test:run
npm run build
npm run test:artifact
```

`npm run test:artifact` requires a completed production build.

GitHub Actions additionally runs CodeQL for JavaScript and TypeScript data flow.

A passing build is not sufficient. Version identity, scheduler correctness, security, tests, and final artifact integrity are independent release gates.

## Pull-request description

Every non-trivial pull request should answer:

- What changes for a learner?
- What deliberately does not change?
- Which architecture boundary is touched?
- Is persisted data read, written, migrated, or deleted?
- Is any untrusted input accepted?
- What happens on quota, network, parsing, or transaction failure?
- How does the change behave for an existing library?
- Which tests prove the intended behaviour and the failure path?
- Does public documentation or product wording need to change?

Use the repository pull-request template rather than replacing it with a generic summary.

## Release version changes

`version.json` is the canonical application version. It must match:

- `src-tauri/tauri.conf.json`;
- the `[package]` version in `src-tauri/Cargo.toml`;
- the `denki` package entry in `src-tauri/Cargo.lock`.

The private npm workspace remains `0.0.0` and must not be published.

Use the release helper rather than editing version-bearing files independently:

```bash
npm run version:set -- 0.2.0
npm run test:version
```

A release pull request must include every file changed by the helper. Do not hand-edit `dist/version.json`; it is generated during the production build from the canonical version and immutable build ID.

## Scheduler changes

The scheduler is release-critical.

A scheduler pull request must:

1. state the exact FSRS version or intentional custom behaviour;
2. cite an authoritative reference implementation or algorithm source;
3. add externally derived golden vectors;
4. preserve or intentionally update New, Learning, Review, and Relearning transitions;
5. cover interval rounding and maximum-interval boundaries;
6. explain what happens to existing stability and difficulty values;
7. keep `npm run test:scheduler` as an explicit CI step.

Do not introduce user-adjustable model weights, Hard multipliers, Easy bonuses, or undocumented scheduling heuristics while retaining the "canonical FSRS 4.5" claim.

Manual confidence changes and Review Mode must use the same scheduling path.

## Database and migrations

Persistent schema changes require a new Dexie version in `src/db/index.ts`.

Migration requirements:

- preserve existing records unless deletion is the explicitly approved product behaviour;
- revive and validate Date fields correctly;
- avoid full-library work on every application startup when a one-time migration is possible;
- add migration tests using realistic pre-upgrade records;
- keep class/deck/card/review references consistent;
- invalidate persisted sessions when referenced cards can no longer be trusted.

Never clear current data before the complete replacement input has passed validation.

Use a Dexie transaction when multiple records or tables form one logical mutation.

## Untrusted input

The following are untrusted:

- Markdown and HTML;
- CSV files;
- Anki packages and media;
- JSON backups;
- AI-provider responses;
- localStorage values;
- route parameters;
- user-configured URLs.

For a new input path, document and test:

- accepted structure;
- size and count limits;
- unsupported formats;
- sanitisation;
- destination validation;
- atomicity;
- cancellation or timeout behaviour where applicable;
- what remains unchanged after failure.

Do not rely on file extensions, MIME labels, TypeScript types, or UI controls as security boundaries.

## React and state management

- Keep durable mutations in store actions or services.
- Use components for presentation and local interaction state.
- Do not bypass store validation with direct database writes from a component.
- Use `useShallow` or narrow selectors when selecting multiple Zustand fields.
- Clean up timers, browser listeners, object URLs, speech, and async consumers.
- Keep keyboard interactions safe around inputs, buttons, links, and content-editable elements.
- Preserve accessible names, focus behaviour, and modal focus containment.

Do not silence React hook or ESLint warnings to land a change. Fix the lifecycle or state model.

## Statistics and product language

A label is part of correctness.

- State exactly what a metric measures.
- Do not call FSRS Review state "mastery."
- Do not call Good-or-Easy percentage "recall" without qualification.
- Qualify time windows such as the last 12 months.
- Keep empty-data defaults explicit.

Changes to metric definitions require tests and visible-copy updates together.

## Offline and service-worker changes

A service-worker change must preserve:

- atomic release installation;
- exact precache coverage of emitted JS, CSS, and WASM;
- cached immutable release metadata;
- compatibility between active pages and their hashed chunks;
- cleanup of obsolete caches without breaking current clients;
- the `npm run test:artifact` gate.

Never replace required cache installation with `Promise.allSettled` or otherwise activate a partial release.

## Security policy changes

Web and Tauri CSPs are coupled. `npm run test:security` validates both.

Do not add:

- wildcard script sources;
- remote script execution;
- `'unsafe-eval'`;
- permissive Tauri filesystem, shell, or process capabilities;
- provider credentials to backups or logs.

A new external connection should be narrowly scoped and documented.

Report vulnerabilities through the process in `SECURITY.md`, not a public exploit issue.

## Dependency updates

Review dependency updates individually.

- Rebase the update onto current `main`.
- Inspect release notes for runtime or toolchain changes.
- Require the complete CI and CodeQL result.
- Avoid combining unrelated lockfile updates.
- Do not merge a major toolchain upgrade merely because it is automated.
- Close or defer an update when its ecosystem support is not ready.

Production vulnerabilities at or above the configured audit threshold block release.

## Documentation

README and launch wording must match shipped behaviour.

Do not claim:

- complete Anki compatibility when only field import is supported;
- cloud sync or cross-device synchronization;
- that all data stays local when optional AI generation sends a prompt;
- platform support that has not been built and smoke-tested;
- mastery when the metric is only a scheduling state.

Update `ARCHITECTURE.md` when a boundary or invariant changes. Update `LAUNCH_PLAN.md` when the supported product promise changes.
