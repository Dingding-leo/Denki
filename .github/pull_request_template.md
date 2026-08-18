## User impact

Describe the learner-visible problem and the exact behaviour after this change.

## Scope and risk

- [ ] The branch started from current `main`.
- [ ] The change is focused; unrelated refactors were excluded.
- [ ] Failure and rollback behaviour were considered.
- [ ] Local-first privacy expectations remain true.

## Data and compatibility

- [ ] No IndexedDB schema or backup-format change.
- [ ] Schema/backup changes include migration, downgrade, and rollback coverage.
- [ ] Destructive operations remain transactional.
- [ ] Existing study-session snapshots are preserved or explicitly invalidated.

## Scheduler gate

- [ ] No scheduler behaviour changed.
- [ ] Scheduler behaviour changed and includes externally derived FSRS reference vectors.
- [ ] `npm run test:scheduler` passes without weakening existing vectors or invariants.

## Security and untrusted input

- [ ] Imported, restored, rendered, or network-derived data is validated at its boundary.
- [ ] Resource limits and cancellation/failure paths were considered.
- [ ] CSP, Tauri capabilities, and credential handling remain least-privilege.

## Validation

- [ ] `npm ci`
- [ ] `npm run audit:prod`
- [ ] `npx tsc --noEmit`
- [ ] `npm run test:security`
- [ ] `npm run test:scheduler`
- [ ] `npm run lint`
- [ ] `npm run test:run`
- [ ] `npm run build`

## Evidence

List relevant tests, screenshots, fixtures, or reproduction steps. Do not state that a check passed unless it ran against the exact PR head.
