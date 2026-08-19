# Denki Launch Readiness and Product Messaging

This file is an operational launch checklist, not a collection of aspirational claims. Public wording must describe the product that is actually shipped on the release commit.

## Launch target

The primary public launch target is the hosted web/PWA build at:

- Application: <https://dingding-leo.github.io/Denki/>
- Source: <https://github.com/Dingding-leo/Denki>

Docker and Tauri build paths may be documented, but they should not be promoted as fully supported distribution channels until their release artifacts are built and smoke-tested for the advertised platform.

## Accurate product promise

Denki is:

- a local-first flashcard workspace;
- an implementation of canonical FSRS 4.5 scheduling with configurable target retention;
- organised around classes and decks;
- capable of Standard and cloze cards with sanitised Markdown;
- able to run scheduled deck, class, and mixed-library review;
- able to run one-pass, confidence-filtered deck Drills;
- able to import CSV and bounded Anki fields for supported Basic and cloze-style material;
- able to generate editable card drafts through an optional learner-configured AI provider;
- able to export and restore versioned portable JSON backups;
- installable and offline-capable in browsers that support the required PWA and storage APIs.

## Claims that must not be made

Do not claim:

- complete Anki compatibility or lossless migration of arbitrary note models;
- support for Anki template logic, CSS, add-ons, scheduling history parity, or every `.apkg` file;
- cloud sync, accounts, collaborative decks, or automatic cross-device synchronization;
- that all data always remains local when optional AI generation sends source text to a provider;
- that FSRS `Review` state means a card is mastered;
- that Denki uses the same complete behaviour as a current Anki release merely because both use FSRS;
- production support for every browser, operating system, or desktop bundle;
- zero risk of browser-storage loss without explaining portable backups;
- medical, dental, or educational outcome guarantees.

## Current known limitations

Launch material should disclose material limitations rather than hiding them in issue comments:

1. **No built-in sync.** A learner moves data between installations using portable backups.
2. **Browser storage remains local.** Persistent-storage requests reduce eviction risk but do not replace backups.
3. **Anki support is field-based.** Complex templates are not rendered or guaranteed to round-trip.
4. **AI generation is bring-your-own-provider.** Availability, privacy, cost, and output quality depend on that provider.
5. **AI output requires review.** Generated drafts can be wrong and are editable before filing.
6. **No claim of mastery.** Progress views show scheduling states, due work, ratings, and history.
7. **Desktop distribution is optional.** A source build path is not equivalent to signed, notarised, supported releases.

## Automated release gates

A launch candidate is not releasable unless its exact commit passes:

- clean dependency installation;
- production dependency audit;
- canonical application-version consistency across `version.json`, Tauri, Cargo, and `Cargo.lock`;
- strict TypeScript;
- web and Tauri security-policy validation;
- canonical FSRS 4.5 golden vectors;
- zero-warning ESLint;
- the complete Vitest suite;
- production build;
- final `dist` artifact and immutable build-identity validation;
- CodeQL JavaScript and TypeScript analysis.

GitHub Pages must deploy only the exact successful `main` commit. Its rebuilt upload must identify that validated SHA and pass the same artifact validator.

## Manual release-candidate smoke test

Run this against a clean browser profile or isolated origin using the candidate commit.

### First-run and library

- [ ] Open Denki with an empty IndexedDB.
- [ ] Create a class and a deck.
- [ ] Add Standard and cloze cards.
- [ ] Edit and delete a card.
- [ ] Rename a class and deck.
- [ ] Confirm empty, loading, error, and destructive-confirmation states are readable.

### Review integrity

- [ ] Start deck review and verify Question → Answer → rating flow.
- [ ] Verify Again, Hard, Good, and Easy interval previews are ordered and plausible.
- [ ] Rate a card, reload, and confirm the session resumes at the correct cursor.
- [ ] Undo a rating and confirm both the card state and review log roll back.
- [ ] Confirm scheduled review, all-card practice, and Drill do not resume as one another.
- [ ] Complete a session and confirm the finished queue does not reopen after reload.

### Import and export

- [ ] Import valid quoted and multiline CSV.
- [ ] Reject malformed CSV without partial writes.
- [ ] Import the repository's supported Basic and cloze `.apkg` fixtures.
- [ ] Reject an oversized or structurally unsafe Anki package without partial decks.
- [ ] Export a deck to CSV and inspect formula-neutralisation behaviour.

### Backup and recovery

- [ ] Export a portable v2 backup.
- [ ] Confirm the file contains study data, target retention, and speech speed.
- [ ] Confirm the file does not contain the AI-provider key.
- [ ] Restore the backup into a clean profile.
- [ ] Import a legacy data-only backup and confirm current preferences remain unchanged.
- [ ] Test an invalid backup and confirm current data remains intact.

### Offline/PWA

- [ ] Load every lazy route once on the candidate release.
- [ ] Install or activate the PWA in a supported browser.
- [ ] Go offline and reload the dashboard, class page, study page, and local Anki importer.
- [ ] Confirm `version.json` remains available offline and matches the visible application version.
- [ ] Upgrade from the previous production release and confirm no mixed-version chunk failure.
- [ ] Confirm an incomplete cache installation does not replace the current working release.

### Optional AI

- [ ] Configure a non-production test key.
- [ ] Generate from non-sensitive sample text.
- [ ] Verify timeout, rate-limit, malformed response, and unsupported endpoint messages.
- [ ] Edit drafts before import and confirm destination validation.
- [ ] Remove the key and verify it is not present in an exported backup.

### Accessibility and responsive behaviour

- [ ] Complete core navigation using the keyboard only.
- [ ] Verify visible focus and modal focus containment.
- [ ] Verify Review Mode shortcuts do not fire while typing in an input or textarea.
- [ ] Test class/deck and study layouts at narrow width and increased browser zoom.
- [ ] Verify long card content scrolls rather than clipping.
- [ ] Check accessible names for icon-only controls and progress indicators.

## Release procedure

1. Confirm `main` rules require pull requests, `Release checks`, and CodeQL.
2. Set the intended application version with `npm run version:set -- <version>`.
3. Run `npm run test:version` and review every generated version-file change.
4. Update release notes with user impact, migrations, limitations, and rollback guidance.
5. Run the complete manual smoke test on the release candidate.
6. Merge only the validated release change.
7. Confirm the `main` CI run succeeds for the merge commit.
8. Confirm Pages deploys that exact SHA and its `version.json` reports the expected semantic version and build ID.
9. Open the production URL in a clean browser and repeat the critical path.
10. Tag the validated commit using the same semantic version.
11. Publish launch posts only after the deployed SHA, visible version, generated metadata, and tag agree.

The private npm workspace intentionally remains at `0.0.0`; it is not the Denki release version and must never be published.

## Suggested launch copy

### Short description

> Denki is an open-source, local-first flashcard workspace with canonical FSRS 4.5 scheduling, offline review, bounded CSV/Anki field import, portable backups, and optional bring-your-own-provider AI drafts.

### Longer introduction

> I built Denki as a focused study workspace for learners who want modern review tools without creating an account or handing their library to a hosted database. Cards and review history live in IndexedDB, scheduled reviews use a tested canonical FSRS 4.5 implementation, and portable JSON backups move study data plus non-secret preferences between installations. Denki supports Markdown, cloze cards, mixed review, deck Drills, CSV, and bounded Basic/cloze Anki field import. Optional AI generation uses a provider and key chosen by the learner, and every generated card remains editable before import.

### Feedback request

Ask for concrete workflow evidence rather than generic feature voting:

- Which import failed, and what note model created it?
- Which review action was confusing?
- Did a due count or interval disagree with expectation?
- What failed offline?
- What data-recovery step was unclear?
- Which keyboard or screen-reader interaction was blocked?

## Post-launch operations

During the first public feedback period:

- reproduce defects against the deployed commit SHA and visible version;
- distinguish data-loss risk from cosmetic issues;
- prioritise scheduler, persistence, backup, import, and offline regressions;
- request a minimal non-sensitive fixture for import defects;
- never ask a learner to publish patient data, credentials, or a private study archive;
- document known issues and workarounds openly;
- do not broaden product claims faster than validation coverage.

## Launch decision

Launch only when:

- every automated gate is green on the deployed commit;
- the manual critical path is complete;
- the public description matches supported behaviour;
- backup and recovery have been tested on a clean profile;
- semantic version, build identity, deployed SHA, and release tag agree;
- known limitations are acceptable and visible;
- an owner is available to triage scheduler, data, import, and offline reports.
