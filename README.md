<div align="center">

<img src="./public/og-image.jpg" alt="Denki flashcards arranged along a spaced-repetition review timeline" width="840" />

# Denki

**A focused, local-first spaced-repetition studio for building knowledge that lasts.**

[Live app](https://dingding-leo.github.io/Denki/) · [Features](#features) · [Run locally](#run-locally) · [Contributing](#contributing)

</div>

## About

Denki helps learners create, import, organise, and review flashcards without an account or required cloud service. Its canonical FSRS 4.5 scheduler adapts review intervals to recall performance, while study tools such as a scratchpad, progress insights, and a matching game keep different kinds of practice in one place.

The product name is simply **Denki**. It is a general-purpose learning tool for every subject, with no language or cultural affiliation.

## Features

- **Canonical FSRS 4.5 scheduling** using the published 17-weight model and configurable target retention.
- **Per-record scheduler provenance** on card memory state and review logs, so future migrations can distinguish current FSRS 4.5 transitions from unversioned legacy history.
- **Local-first storage** through IndexedDB, with persistent-storage protection and offline-ready PWA support.
- **Content-addressed media registry** with verified SHA-256 identities and lifecycle-managed object URLs.
- **Mixed media rendering** that supports both existing embedded data URLs and verified `denki-media://sha256/...` references.
- **Classes and decks** for organising material across subjects.
- **Standard and cloze cards** with Markdown and syntax highlighting.
- **Unlimited new-card study** with no daily introduction cap.
- **Deck Drill Mode** for a fully random, one-pass sweep filtered by previous confidence level; ratings still update future scheduling.
- **One mixed review queue** that randomises all due cards across the library, plus focused deck and class sessions.
- **Focused study sessions** with progress checkpoints, resumable cursors, and review summaries.
- **Built-in scratchpad** for diagrams, equations, and working notes.
- **CSV import and bounded local Anki field import** for Basic and cloze-style `.apkg` material. Complex Anki card templates are not currently rendered or guaranteed to round-trip exactly.
- **Optional AI card generation** using a provider and API key chosen by the learner.
- **Progress insights** including review history, streaks, due-card statistics, and explicitly labelled scheduling states.
- **Portable JSON backup v5** that atomically preserves classes, decks, cards, reviews, portable preferences, scheduler lineage, and the complete runtime media registry. Repeated embedded and registry media is stored once by verified SHA-256 identity; provider credentials are deliberately excluded.

## Scheduler correctness

Denki treats scheduler correctness as a release gate. The implementation pins the FSRS 4.5 reference constants and behaviour:

- the published 17 default weights;
- `DECAY = -0.5` and `FACTOR = 19/81`;
- the FSRS 4.5 forgetting and target-retention interval equations;
- pre-review difficulty in stability updates;
- canonical New, Learning, Review, and Relearning transitions;
- strict `Hard < Good < Easy` Review intervals within the maximum interval;
- no custom Hard or Easy multipliers that alter the model.

Golden-vector tests run before the general test suite in CI. Existing libraries retain their stored stability and difficulty values; the database-v5 migration does not recalculate them. Pre-provenance reviewed states and review logs are conservatively labelled `legacy-unversioned`. A pristine New card can safely enter the current `4.5` lineage, and every future rating stamps both the resulting card state and its review log with the exact scheduler version.

## Security and data boundaries

Denki treats imported packages, restored backups, rendered card content, saved browser values, and AI-provider responses as untrusted input.

- Markdown, imported HTML, and SVG media are sanitised before display or storage.
- Anki archives are inspected before decompression. ZIP64, encrypted, multi-disk, duplicate-path, unsupported-compression, oversized, and excessive-output packages are rejected.
- Only media referenced by imported card fields is expanded; unused package assets are not decoded.
- Anki deck and card writes are committed in one IndexedDB transaction, so a failed import leaves no partial decks.
- Database v5 backfills scheduler provenance without changing intervals or memory parameters, and database create hooks provide a fallback for direct import paths.
- Database v6 adds an empty content-addressed media table without rewriting any existing card text.
- Runtime media is bounded, MIME-allowlisted, SVG-sanitised before hashing, stored as structured-clone-safe bytes, and reverified before Blob or object-URL creation.
- Registry references remain inert through Markdown parsing and DOMPurify. A verified blob URL is installed only after registry resolution; missing or corrupt media produces an accessible fallback.
- Backup envelope versions, application/database versions, dates, IDs, relationships, portable preferences, and scheduler provenance are validated before current data is cleared. Preference changes are rolled back if the database transaction fails.
- Backup v5 reads a consistent five-table snapshot and replaces all five tables in one transaction. It verifies canonical media shape, usage, timestamps, base64, byte length, MIME, SHA-256, reference completeness, and strict object/byte limits before replacement.
- Backup v1-v4 remains importable through conservative normalization. Legacy formats cannot smuggle future runtime-registry references and clear any pre-existing media registry during complete replacement.
- Old object URLs are revoked only after a successful durable restore; failed validation or rollback leaves the current renderer generation intact.
- Web and Tauri builds use explicit content security policies; Tauri capabilities remain limited to core application access.
- CI audits production dependencies, validates version, security, and release artifacts, runs the canonical scheduler gate, typecheck, lint, tests, and build. CodeQL adds interprocedural JavaScript and TypeScript data-flow analysis.

See [SECURITY.md](SECURITY.md) for private-first vulnerability reporting guidance.

## Privacy

Cards, decks, preferences, review history, and registry media are stored in the browser by default. Denki does not require an account, analytics tracker, or hosted database. Optional AI generation sends only the submitted source text to the configured provider. Avoid placing patient information, credentials, or other sensitive third-party data in AI generation prompts.

Backups contain classes, decks, cards, review history, target retention, speech speed, scheduler lineage, application/database metadata, embedded media, and the complete runtime media registry. They do **not** contain the optional AI provider key.

## Run locally

Denki requires Node.js 22 or later.

```bash
git clone https://github.com/Dingding-leo/Denki.git
cd Denki
npm ci
npm run dev
```

Open the local address printed by Vite.

For a containerised build:

```bash
docker compose up --build
```

### Desktop app (macOS)

Denki can also be built as a native macOS app with [Tauri](https://tauri.app) (requires Rust). This produces `Denki.app` and an installer `.dmg`:

```bash
npm run tauri:build
```

The app bundle is written to `src-tauri/target/release/bundle/macos/Denki.app`. To update a built app after pulling new changes:

```bash
./scripts/update-denki.sh            # pull, rebuild, relaunch
./scripts/update-denki.sh --force    # rebuild even with no new commits
```

## Release versioning

`version.json` is the canonical application version. The release contract requires it to match Tauri configuration, the Rust package, and the Denki entry in `Cargo.lock`. The private npm workspace intentionally remains `0.0.0` and is never published.

Update all release-bearing files with one command:

```bash
npm run version:set -- 0.2.0
npm run test:version
```

Production builds emit `dist/version.json` with the semantic version and immutable build identifier. GitHub Pages rebuilds the exact validated commit and verifies that identity before deployment. The running version is visible beside Settings in the application sidebar.

## Validation

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

Pull requests run the complete release checks and CodeQL in GitHub Actions. A push to `main` is deployed to [GitHub Pages](https://dingding-leo.github.io/Denki/) only after those checks succeed for that exact commit, and the rebuilt deployment artifact passes the same structural and identity validator.

## Technology

- React 19 and TypeScript
- Vite 8
- Zustand
- Dexie and IndexedDB
- React Router
- Vitest and Testing Library
- Tauri 2 (optional macOS desktop build)

## Project documentation

- [Architecture and engineering invariants](ARCHITECTURE.md)
- [Runtime media registry](docs/media-registry.md)
- [Contribution and review contract](CONTRIBUTING.md)
- [Security policy and reporting](SECURITY.md)
- [Launch readiness and accurate product messaging](LAUNCH_PLAN.md)

## Contributing

Start with [CONTRIBUTING.md](CONTRIBUTING.md) and [ARCHITECTURE.md](ARCHITECTURE.md). Pull requests must be focused, explain user and compatibility impact, include appropriate regression coverage, and pass every release gate on the exact final head.

## License

Denki is available under the [MIT License](LICENSE).
