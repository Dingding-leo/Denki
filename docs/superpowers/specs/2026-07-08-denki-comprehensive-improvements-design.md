# Denki Comprehensive Improvements — Design

**Date:** 2026-07-08
**Branch:** `feat/denki-overhaul`
**Status:** Approved — executing M1 → M4 sequentially (autonomous, report at milestone boundaries)

## Context

Denki is a local-first spaced-repetition flashcard studio (React 19 + TypeScript,
Vite 8, Zustand 5 sliced store, Dexie 4 / IndexedDB, a hand-rolled "FSRS 4.5"
scheduler). A parallel 7-dimension read-only audit surfaced ~55 evidence-backed
findings. Baseline before work: `tsc` clean, `vitest` 7/7 green, `vite build`
passes (580 KB bundle, no splitting), **`npm run lint` fails (56 errors + 7
warnings)**. A large in-progress Study-Session UI overhaul was committed as a
checkpoint (`088149b`) to give a clean base.

The headline finding: **the app's core promise is broken.** A card rated "Good"
(rating 3 — the most common rating) stays pinned at a 1-day interval forever, and
two of the three FSRS settings (Target Retention, Hard Multiplier) are dead code
the scheduler never reads. Spaced repetition does not actually space.

## Key Decisions

1. **Scope:** execute all four milestones (M1 → M4) in sequence, without a
   per-wave approval gate. Report at milestone boundaries. Verify + commit each
   coherent chunk.
2. **FSRS:** replace the bespoke heuristic with a **real FSRS implementation**
   (standard `w` weight vector, forgetting-curve stability update, difficulty
   mean-reversion, `requestRetention`-driven interval, max-interval clamp, fuzz).
   This matches the README's scientific claims and makes the three settings live.

## Execution Principles

- **TDD** per the project's own `AI_GUIDELINES.md`: write/extend tests first for
  every correctness change; pure logic is extracted so it is unit-testable.
- **Verification gate** before each commit: `npx tsc --noEmit`, `npx vitest run`,
  `npm run lint` (must trend to green), `npm run build`.
- **Small, labeled commits**, one coherent change each, on `feat/denki-overhaul`.
- **Data safety first**: no destructive change ships without a confirmation gate
  and (where it touches persisted data) a round-trip test.

---

## M1 — Core correctness & data safety

The app is "broken" without these. Each item ships with tests.

1. **Real FSRS scheduler.** Rewrite `services/scheduler.ts` to standard FSRS so
   intervals actually grow for Good, and `requestRetention` / `hardIntervalMultiplier`
   drive scheduling. Add max-interval clamp + review-interval fuzz. Tests assert:
   5 consecutive Good reviews strictly increase the interval; lower retention →
   shorter intervals; hard multiplier changes the Hard interval; Learning/Relearning
   graduation; interval respects the cap.
2. **Wire the backup safety net.** Call `restoreFromBackupIfNeeded()` on startup,
   register `forceSave()` on `beforeunload`/`visibilitychange`, add export/import
   UI (behind confirm). Fix `importDatabase` to revive Date fields (currently
   restored as strings → cards fall out of the Date-typed due indexes). Validate
   snapshot version against `db.verno`. Round-trip test.
3. **Confirm per-card progress reset.** Gate `manuallySetCardConfidence` reset
   (value 0 deletes all review logs) behind `window.confirm` per AI_GUIDELINES §3.
4. **Fix LearnMode hooks-order crash.** Move all `useRef`/`useEffect` above the
   `if (!session)` / `if (!currentCard)` early returns (clears 8 rules-of-hooks
   errors and a latent white-screen).
5. **Add a top-level ErrorBoundary** around the router (+ one around study routes)
   with a recoverable fallback.
6. **Fix stale-store reads in StudySessionPage.** Read `getState().session` after
   `await rateCard` so the completion confetti fires and the round checkpoint lands
   on multiples of 10; add an in-flight guard so fast repeat ratings cannot desync
   the queue/history from the DB.
7. **Test infrastructure.** Add `test`/`test:run` scripts, `vitest.config.ts`
   (jsdom), a setup file, and `fake-indexeddb` + `@testing-library/react` devDeps —
   unblocks store/DB/component tests. Add suites for studySlice rate/undo, the
   markdown/XSS renderer, stats streak/heatmap, and CSV parsing.

## M2 — Finish UI refactor + UX polish + a11y + responsive

- Finish the palette migration to a single-sourced accent (remove ~35 indigo +
  ~38 purple hardcoded colors); fix the dangling `--shadow-neon` var; drop the
  `!important` that overrides the Learn tab's green; load or revert the declared
  Inter/JetBrains fonts; update `theme-color`.
- **Clear all 56 lint errors** (many from the WIP): type the 10 `any`s, delete
  dead assignments, fix `useless-escape`, `exhaustive-deps`, static-components,
  purity/refs.
- **Unbreak the Scratchpad** (stopPropagation so drawing doesn't flip the card).
- Fix the next-card answer-flash on un-flip (`key={card.id}` / transitionend);
  stable progress denominator on requeue; real per-round average for the fatigue
  tracker (or relabel); interval previews use the user's saved params.
- Global `prefers-reduced-motion` + guard confetti; `aria-label` on icon buttons;
  raise failing contrast values.
- Mobile responsive rules for the study overlay / top-nav / rating dock.
- Quick wins: keyboard-shortcut help overlay (`?`), empty-deck "Add cards" CTA,
  Match-game Esc/restart.

## M3 — Architecture & code quality

- Route-level code splitting (`React.lazy`) + lazy-load heavy leaves; peel a
  vendor chunk — clears the 580 KB warning.
- Bundle JSZip + sql.js as local npm deps (drop the CDN `<script>` injection);
  make Anki import atomic (single transaction) and fix O(cards×media) blowup.
- Decompose `StudySessionPage` (622) and `ManageCardsModal` (662); extract a
  `useStudyKeyboard` hook; hoist the nested `FormatToolbar`.
- Consolidate on one markdown path (`marked` + DOMPurify everywhere); drop the
  unused `react-markdown` dep. Extract a single `refreshStats` helper (8 dup
  sites, run in parallel). Move the load-time migration into a Dexie `upgrade()`.

## M4 — Features

- Single-deck export/share (CSV + portable JSON), mirroring the import suite.
- Cmd/Ctrl-K command palette (jump to deck/class/card, start study).
- **FSRS parameter optimization** from the user's own review logs.
- Persist the active session across reload; standardize streak/forecast on one
  day-boundary/timezone convention (fold overdue into "Today").

---

## Success Criteria

- `npm run lint` → 0 errors; `tsc` clean; `vitest run` green with materially
  expanded coverage; `vite build` under the 500 KB warning.
- A card rated Good repeatedly produces a strictly increasing interval; the three
  FSRS settings measurably change scheduling.
- Every destructive action is confirmation-gated; a cleared IndexedDB restores
  from the auto-backup with dates intact.
- No known white-screen crash paths (LearnMode hooks, missing error boundary).
- The Study Session is usable and coherent on mobile, honors reduced-motion, and
  presents a single consistent accent color.

## Out of Scope

- Multi-device sync / accounts / a backend (the app is deliberately local-first).
- Rewriting the design system wholesale; M2 finishes the in-progress migration,
  it does not start a new one.
