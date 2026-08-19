# Denki Launch Readiness and Product Messaging

This is an operational launch checklist. Public wording must describe the product that is actually shipped on the release commit.

## Launch target

Primary public target:

- Application: <https://dingding-leo.github.io/Denki/>
- Source: <https://github.com/Dingding-leo/Denki>

Docker and Tauri build paths may be documented, but must not be promoted as fully supported distribution channels until their artifacts are built and smoke-tested for the advertised platform.

## Accurate product promise

Denki is:

- a local-first flashcard workspace;
- an implementation of canonical FSRS 4.5 scheduling with configurable target retention;
- able to record the scheduler lineage that produced each card state and review transition;
- organised around classes and decks;
- capable of Standard and cloze cards with sanitised Markdown;
- able to render legacy embedded media and verified content-addressed registry media;
- able to run scheduled deck, class, and mixed-library review;
- able to run one-pass, confidence-filtered deck Drills;
- able to import CSV and bounded Anki fields for supported Basic and cloze-style material;
- able to generate editable card drafts through an optional learner-configured AI provider;
- able to export and atomically restore versioned portable JSON backups containing all five persistent tables;
- installable and offline-capable in browsers that support the required PWA and storage APIs.

## Claims that must not be made

Do not claim:

- complete Anki compatibility or lossless migration of arbitrary note models;
- support for Anki template logic, CSS, add-ons, scheduling-history parity, or every `.apkg` file;
- cloud sync, accounts, collaborative decks, or automatic cross-device synchronization;
- that all data always remains local when optional AI generation sends source text to a provider;
- that FSRS Review state means mastery;
- that unversioned historical scheduling can be proven canonical after the fact;
- that all existing card media has already been migrated into the runtime registry;
- that unused registry media is automatically garbage-collected;
- production support for every browser, operating system, or desktop bundle;
- zero risk of browser-storage loss without explaining backups;
- medical, dental, or educational outcome guarantees.

## Current known limitations

1. **No built-in sync.** Data moves between installations through portable backups.
2. **Browser storage remains local.** Persistent-storage requests reduce eviction risk but do not replace backups.
3. **Anki support is field-based.** Complex templates are not rendered or guaranteed to round-trip.
4. **AI generation is bring-your-own-provider.** Availability, privacy, cost, and quality depend on that provider.
5. **AI output requires review.** Drafts can be wrong and remain editable before filing.
6. **No claim of mastery.** Progress views show scheduling states, due work, ratings, and history.
7. **Historical provenance is conservative.** Unproven model-derived history is `legacy-unversioned`.
8. **Existing data URLs are not automatically migrated.** The mixed renderer supports them alongside registry references.
9. **Registry garbage collection is not automatic.** Registry-only assets are intentionally preserved by backup v5.
10. **Desktop distribution is optional.** A source build path is not a signed, notarised, supported release.

## Automated release gates

A candidate is not releasable unless its exact head passes:

- clean dependency installation;
- production dependency audit;
- canonical application-version agreement across `version.json`, Tauri, Cargo, and `Cargo.lock`;
- strict TypeScript;
- web and Tauri security-policy validation;
- canonical FSRS 4.5 golden vectors;
- scheduler-provenance migration and transition tests;
- database-v6 media migration and registry-integrity tests;
- mixed-renderer sanitisation and object-URL lifecycle tests;
- backup-v5 five-table recovery, reference-completeness, integrity, and rollback tests;
- zero-warning ESLint;
- the complete Vitest suite;
- production build;
- final artifact and immutable build-identity validation;
- CodeQL JavaScript and TypeScript analysis.

GitHub Pages must deploy only the exact successful `main` commit and rerun artifact validation on the rebuilt upload.

## Manual release-candidate smoke test

Run against a clean browser profile or isolated origin using the candidate commit.

### First run and library

- [ ] Open Denki with empty IndexedDB.
- [ ] Create a class and deck.
- [ ] Add Standard and cloze cards.
- [ ] Edit/delete a card and rename a class/deck.
- [ ] Confirm empty, loading, error, and destructive-confirmation states are readable.

### Review integrity

- [ ] Verify Question → Answer → Again/Hard/Good/Easy flow.
- [ ] Verify interval previews remain ordered and plausible.
- [ ] Rate, reload, and confirm the session resumes correctly.
- [ ] Confirm updated card and review log both record scheduler version `4.5`.
- [ ] Undo and confirm card state plus review log roll back.
- [ ] Confirm scheduled review, practice, and Drill never resume as each other.
- [ ] Complete a session and confirm it does not reopen after reload.

### Schema and provenance migration

- [ ] Open a pre-v5 library containing pristine New and reviewed cards.
- [ ] Confirm no interval, state, stability, difficulty, rating, due date, or history value changes.
- [ ] Confirm pristine New cards become `4.5` and prior model-derived rows become `legacy-unversioned`.
- [ ] Open a v5 database and confirm schema v6 adds an empty media table without rewriting card text.

### Import/export

- [ ] Import valid quoted/multiline CSV.
- [ ] Reject malformed CSV without partial writes.
- [ ] Import supported Basic and cloze APKG fixtures.
- [ ] Reject oversized/unsafe APKG input without partial decks.
- [ ] Confirm newly imported cards carry current scheduler provenance.
- [ ] Export a deck to CSV and inspect formula neutralisation.

### Media rendering

- [ ] Render a legacy data-URL image/audio asset.
- [ ] Render a valid registry image/audio/video reference.
- [ ] Remove the rendered node and confirm its final object-URL lease is revoked.
- [ ] Reparent a rendered node and confirm its media remains available.
- [ ] Test a missing and a hash-corrupt registry asset; confirm accessible fallback and no network request.
- [ ] Confirm malformed registry references and `srcset` are not activated.

### Backup and recovery

- [ ] Export a portable v5 backup.
- [ ] Confirm it contains application/database/scheduler metadata, per-row scheduler lineage, preferences, study data, and the complete media registry.
- [ ] Confirm repeated inline and registry-identical bytes produce one `both` media row.
- [ ] Confirm registry-only media is included.
- [ ] Confirm the AI-provider key is absent.
- [ ] Restore v5 into a clean profile and compare all five tables.
- [ ] Verify data-URL card/deck text is restored exactly and registry references resolve.
- [ ] Tamper with media base64/hash/length/timestamp/usage; confirm rejection leaves current data intact.
- [ ] Simulate a media-table write failure; confirm all five tables roll back.
- [ ] Import v1-v4 backups and confirm they restore no registry and reject future registry references.
- [ ] With an active media object URL, fail validation and confirm the URL remains; then complete a valid restore and confirm it is revoked.

### Offline/PWA

- [ ] Load every lazy route once.
- [ ] Install or activate the PWA.
- [ ] Go offline and reload dashboard, class, study, and local Anki importer routes.
- [ ] Confirm `version.json` remains available offline and matches the visible version.
- [ ] Upgrade from the prior production release without mixed-version chunk failure.
- [ ] Confirm an incomplete cache installation does not replace the working release.

### Optional AI

- [ ] Configure a non-production test key.
- [ ] Generate from non-sensitive sample text.
- [ ] Verify timeout, rate-limit, malformed-response, and unsupported-endpoint messages.
- [ ] Edit drafts before import and confirm destination validation.
- [ ] Confirm filed drafts start as current-lineage New cards.
- [ ] Remove the key and confirm it is not present in backup.

### Accessibility/responsive behaviour

- [ ] Complete core navigation by keyboard.
- [ ] Verify visible focus and modal focus containment.
- [ ] Confirm Review shortcuts do not fire while typing.
- [ ] Test narrow width and increased browser zoom.
- [ ] Confirm long card content scrolls rather than clipping.
- [ ] Check accessible names for icon-only controls, progress indicators, and unavailable-media fallbacks.

## Release procedure

1. Confirm `main` rules require pull requests and the intended status checks.
2. Set the application version with `npm run version:set -- <version>`.
3. Run `npm run test:version` and review every version-bearing file.
4. Update release notes with migrations, limitations, rollback, and recovery behaviour.
5. Run the complete manual smoke test.
6. Merge only the validated exact head.
7. Confirm the merge commit's CI and CodeQL runs succeed.
8. Confirm Pages deploys that exact SHA and reports the expected version/build ID.
9. Repeat the critical path against production in a clean profile.
10. Tag the validated commit with the same semantic version.
11. Publish launch messaging only after deployed SHA, visible version, metadata, and tag agree.

The private npm workspace remains `0.0.0`; it is not the Denki release version and must never be published.

## Suggested launch copy

> Denki is an open-source, local-first flashcard workspace with canonical FSRS 4.5 scheduling, versioned review history, verified content-addressed media, offline study, bounded CSV/Anki field import, atomic five-table portable backups, and optional bring-your-own-provider AI drafts.

## Post-launch operations

- reproduce defects against deployed SHA and visible version;
- preserve affected backup, scheduler provenance, and media hash when investigating;
- distinguish data-loss risk from cosmetic issues;
- prioritise scheduler, persistence, backup, media, import, and offline regressions;
- request only minimal non-sensitive fixtures;
- never ask users to publish patient data, credentials, or private study archives;
- document known issues and workarounds openly;
- do not broaden claims faster than validation coverage.

## Launch decision

Launch only when:

- every automated gate is green on the deployed commit;
- the manual critical path is complete;
- product wording matches supported behaviour;
- schema-v5/v6 migration and backup-v5 recovery have been tested on a clean profile;
- version, build identity, deployed SHA, and release tag agree;
- known limitations are visible and acceptable;
- an owner is available to triage scheduler, data, media, import, backup, and offline reports.
