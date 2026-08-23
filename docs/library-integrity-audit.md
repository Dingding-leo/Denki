# Library integrity audit

Denki's Storage health panel includes a manual, read-only **Run full check** action. The audit is designed to answer whether the current local library is internally consistent without changing any user data.

## Explicit user action

The audit never runs during application startup, review, import, export, or ordinary Settings refreshes. It starts only after the learner selects **Run full check**.

The learner can stop the audit. Cancellation takes effect at the next safe cursor boundary, returns a partial result, and releases the origin-wide maintenance lease. Closing the Settings panel also aborts the active check.

An error is classified as cancellation only when the audit's own `AbortSignal` is aborted. Cross-realm IndexedDB `AbortError` values are recognised by name, but an unrelated failure merely named `AbortError` remains a visible audit failure rather than being reported as though the learner pressed Stop.

## Stable read boundary

A complete audit spans several IndexedDB tables and cryptographic media reads. It therefore uses the same exclusive cross-tab maintenance lease as destructive maintenance:

- the current tab performs only reads;
- other Denki tabs are temporarily fenced from writes;
- the scan sees one stable library generation;
- lease ownership is rechecked between major phases and during media verification;
- completion, cancellation, or failure releases the lease in `finally`.

The audit does not repair, delete, normalize, or migrate records.

## Checks performed

### Classes and decks

- valid positive identifiers;
- valid names, descriptions, notes, and creation timestamps;
- every deck references an existing class.

### Cards

- valid class/deck identifiers and ownership;
- supported card type;
- valid dates, state, intervals, stability, difficulty, and ratings;
- non-empty, syntactically valid scheduler provenance;
- exact standalone runtime media references in front and back fields.

### Review logs

- valid identifiers, timestamp, rating, and scheduling values;
- non-empty, syntactically valid scheduler provenance;
- every review references an existing card;
- review class/deck ownership matches its card.

### Media registry

- every referenced media hash exists;
- stored hash key, MIME type, byte length, timestamp, and ArrayBuffer shape are valid;
- SHA-256 is recomputed from canonical MIME plus exact stored bytes;
- verified but currently unreferenced media is reported as a warning, not deleted.

## Resource budgets

The audit fails before unbounded work when the library exceeds:

| Resource | Maximum |
| --- | ---: |
| Classes | 10,000 |
| Decks | 50,000 |
| Cards | 250,000 |
| Reviews | 2,000,000 |
| Media objects | 5,000 |
| Scanned study text | 96 Mi characters |
| Deep media verification | 512 MiB of indexed byte-length metadata |
| Runtime media references in one field | 256 |

All findings are counted. Only the first 200 detailed findings are retained for display, which prevents a damaged library from creating an unbounded in-memory report.

## Result semantics

- **No integrity issues found** means the bounded audit completed and found no errors or warnings.
- **No integrity errors** with warnings means core relationships and verified media are intact, but non-destructive conditions such as unreferenced media were found.
- **Integrity errors found** means one or more records, relationships, provenance values, references, or media objects failed validation.
- **Stopped safely** is a partial result and must not be interpreted as a complete health result.
- A budget or runtime failure is reported separately and does not modify the library.

## Recovery boundary

The audit deliberately does not offer one-click repair. When errors are reported:

1. export a current portable backup if export still succeeds;
2. preserve the reported issue details;
3. avoid media cleanup or bulk migration until the cause is understood;
4. restore a previously validated backup only after comparing what data would be replaced.

Automatic repair would require issue-specific provenance, rollback, and conflict policies and is outside this feature's safety contract.
