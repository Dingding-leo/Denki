# Releasing Denki

Denki has one application release version, stored in `version.json`. The private npm workspace intentionally remains at `0.0.0`; it is not a published package and is not the product-version source.

## Version contract

The following files must agree:

- `version.json`
- `src-tauri/tauri.conf.json`
- `src-tauri/Cargo.toml`
- the `denki` package entry in `src-tauri/Cargo.lock`

CI enforces this with:

```bash
npm run test:version
```

The production build emits `dist/version.json` containing:

- the semantic application version;
- an immutable build ID derived from the GitHub commit SHA in CI.

`npm run test:artifact` verifies that the emitted identity matches both the source version and the exact CI commit. The service worker precaches this file so an installed offline release retains its own inspectable identity.

## Preparing a version

From a clean branch based on current `main`:

```bash
npm ci
npm run version:set -- 0.2.0
npm run test:version
```

Review every changed file. `version:set` updates only the canonical version document and Tauri/Cargo release metadata; it does not create a Git tag, release notes, or publish an artifact.

Use semantic versioning:

- patch: compatible defect, security, performance, or reliability fix;
- minor: backward-compatible learner-facing capability;
- major: intentionally incompatible data, import, API, or product-contract change.

Pre-release identifiers such as `0.2.0-beta.1` are permitted, but the same value must appear in every versioned runtime file.

## Required validation

Run the complete release checks against the final head:

```bash
npm ci
npm run audit:prod
npx tsc --noEmit
npm run test:security
npm run test:version
npm run test:scheduler
npm run lint
npm run test:run
npm run build
npm run test:artifact
```

GitHub CodeQL must also complete successfully.

Do not tag a commit that has not passed every gate. Do not edit generated `dist/version.json`; it is rebuilt from source and commit identity.

## Release procedure

1. Create a focused release branch from current `main`.
2. Run `npm run version:set -- <version>`.
3. Update release notes and any changed compatibility or migration guidance.
4. Run the complete validation sequence.
5. Open a pull request and require Release checks plus CodeQL on the exact final head.
6. Merge the validated change through the normal protected-branch path.
7. Confirm the merge commit itself passes CI and Pages deploys that exact SHA.
8. Smoke-test the deployed web/PWA build in a clean profile, including offline reload and backup restore.
9. Create an annotated `v<version>` tag on that validated merge commit.
10. Publish a GitHub release only after the tag, deployed `dist/version.json`, and intended commit agree.

Desktop artifacts require their own platform build and smoke test. A successful web deployment is not evidence that an unsigned or untested desktop bundle is ready for distribution.

## Rollback

A rollback is a new validated release, not a force-push or replacement of an existing tag.

- identify the last known-good commit;
- create a new patch version containing the revert or corrective change;
- run every release gate;
- deploy and tag the new version;
- document any data or backup compatibility consequences.

Never rewrite a published version tag to point to different code.
