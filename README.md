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
- **Local-first storage** through IndexedDB, with persistent-storage protection and offline-ready PWA support.
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
- **Portable JSON backups** for study data, target retention, and speech speed. Provider credentials are deliberately excluded.

## Scheduler correctness

Denki treats scheduler correctness as a release gate. The implementation pins the FSRS 4.5 reference constants and behaviour:

- the published 17 default weights;
- `DECAY = -0.5` and `FACTOR = 19/81`;
- the FSRS 4.5 forgetting and target-retention interval equations;
- pre-review difficulty in stability updates;
- canonical New, Learning, Review, and Relearning transitions;
- strict `Hard < Good < Easy` Review intervals within the maximum interval;
- no custom Hard or Easy multipliers that alter the model.

Golden-vector tests run before the general test suite in CI. Existing libraries retain their stored stability and difficulty values; every future rating transitions those values under the canonical model.

## Security and data boundaries

Denki treats imported packages, restored backups, rendered card content, saved browser values, and AI-provider responses as untrusted input.

- Markdown, imported HTML, and SVG media are sanitised before display or storage.
- Anki archives are inspected before decompression. ZIP64, encrypted, multi-disk, duplicate-path, unsupported-compression, oversized, and excessive-output packages are rejected.
- Only media referenced by imported card fields is expanded; unused package assets are not decoded.
- Anki deck and card writes are committed in one IndexedDB transaction, so a failed import leaves no partial decks.
- Backup envelope versions, database versions, dates, IDs, relationships, and portable preferences are validated before current data is cleared. Preference changes are rolled back if the database transaction fails.
- Web and Tauri builds use explicit content security policies; Tauri capabilities remain limited to core application access.
- CI audits production dependencies, validates security and release artifacts, runs the canonical scheduler gate, typecheck, lint, tests, and build. CodeQL adds interprocedural JavaScript and TypeScript data-flow analysis.

See [SECURITY.md](SECURITY.md) for private-first vulnerability reporting guidance.

## Privacy

Cards, decks, preferences, and review history are stored in the browser by default. Denki does not require an account, analytics tracker, or hosted database. Optional AI generation sends only the submitted source text to the configured provider. Avoid placing patient information, credentials, or other sensitive third-party data in AI generation prompts.

Backups contain classes, decks, cards, review history, target retention, speech speed, and scheduler/database metadata. They do **not** contain the optional AI provider key.

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

## Validation

```bash
npm ci
npm run audit:prod
npx tsc --noEmit
npm run test:security
npm run test:scheduler
npm run lint
npm run test:run
npm run build
npm run test:artifact
```

Pull requests run the complete release checks and CodeQL in GitHub Actions. A push to `main` is deployed to [GitHub Pages](https://dingding-leo.github.io/Denki/) only after those checks succeed for that exact commit, and the rebuilt deployment artifact passes the same structural validator.

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
- [Contribution and review contract](CONTRIBUTING.md)
- [Security policy and reporting](SECURITY.md)
- [Launch readiness and accurate product messaging](LAUNCH_PLAN.md)

## Contributing

Start with [CONTRIBUTING.md](CONTRIBUTING.md) and [ARCHITECTURE.md](ARCHITECTURE.md). Pull requests must be focused, explain user and compatibility impact, include appropriate regression coverage, and pass every release gate on the exact final head.

## License

Denki is available under the [MIT License](LICENSE).
