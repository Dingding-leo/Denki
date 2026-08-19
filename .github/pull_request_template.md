## User impact

<!-- Describe the learner-visible problem and exact behaviour after this change. -->

## Scope

<!-- Summarise the focused change. -->

## Non-goals

<!-- State what this pull request deliberately does not change. -->

## Architecture and invariants

<!-- Check every boundary touched and explain how its invariant is preserved. -->

- [ ] Release version, build identity, or distribution metadata
- [ ] Scheduler or review semantics
- [ ] IndexedDB schema, migration, or durable mutation
- [ ] Study-session creation, persistence, or restoration
- [ ] Untrusted input, rendering, import, backup, or provider response
- [ ] Offline cache, PWA, Tauri, CSP, or distribution
- [ ] Statistics definition or user-facing product claim
- [ ] None of the above

Details:

## Compatibility and failure behaviour

<!-- Existing libraries, legacy files/settings, quotas, network failures, parsing failures, transaction rollback, and partial-operation prevention. -->

## Validation

- [ ] `npm ci`
- [ ] `npm run audit:prod`
- [ ] `npm run test:version`
- [ ] `npx tsc --noEmit`
- [ ] `npm run test:security`
- [ ] `npm run test:scheduler`
- [ ] `npm run lint`
- [ ] `npm run test:run`
- [ ] `npm run build`
- [ ] `npm run test:artifact`
- [ ] CodeQL completed successfully

## Evidence

<!-- List added/updated tests, reference vectors, fixtures, screenshots, or manual checks. Do not claim checks that were not run against the exact final head. -->

## Documentation

- [ ] README/product copy remains accurate
- [ ] `ARCHITECTURE.md` remains accurate
- [ ] `LAUNCH_PLAN.md` remains accurate
- [ ] No documentation change is required
