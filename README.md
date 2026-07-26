<div align="center">

<img src="./public/og-image.jpg" alt="Denki flashcards arranged along a spaced-repetition review timeline" width="840" />

# Denki

**A focused, local-first spaced-repetition studio for building knowledge that lasts.**

[Live app](https://dingding-leo.github.io/Denki/) · [Features](#features) · [Run locally](#run-locally) · [Contributing](#contributing)

</div>

## About

Denki helps learners create, import, organise, and review flashcards without an account or required cloud service. Its FSRS 4.5 scheduler adapts review intervals to recall performance, while study tools such as a scratchpad, progress insights, and a matching game keep different kinds of practice in one place.

The product name is simply **Denki**. It is a general-purpose learning tool for every subject, with no language or cultural affiliation.

## Features

- **FSRS 4.5 scheduling** with adjustable retention and review settings.
- **Local-first storage** through IndexedDB, with persistent-storage protection and offline-ready PWA support.
- **Classes and decks** for organising material across subjects.
- **Standard and cloze cards** with Markdown and syntax highlighting.
- **Focused study sessions** with progress checkpoints and review summaries.
- **Built-in scratchpad** for diagrams, equations, and working notes.
- **Anki and CSV imports** for bringing existing material across.
- **Optional AI card generation** using a provider and API key chosen by the learner.
- **Progress insights** including review history, streaks, and due-card statistics.
- **Portable backups** through JSON export and restore, with gentle weekly reminders.

## Privacy

Cards, decks, preferences, and review history are stored in the browser by default. Denki does not require an account, analytics tracker, or hosted database. Optional AI generation sends only the submitted source text to the provider selected by the learner.

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

## Validation

```bash
npm run lint
npm run test:run
npm run build
```

Pushes to `main` run the same checks in GitHub Actions and publish the production build to [GitHub Pages](https://dingding-leo.github.io/Denki/).

## Technology

- React 19 and TypeScript
- Vite 8
- Zustand
- Dexie and IndexedDB
- React Router
- Vitest and Testing Library

## Contributing

Issues and focused pull requests are welcome. Before opening a pull request:

1. Create a branch from `main`.
2. Keep the change scoped and include tests where appropriate.
3. Run the validation commands above.
4. Explain the user-facing impact in the pull request.

## License

Denki is available under the [MIT License](LICENSE).
