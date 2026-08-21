# Resumable Embedded-Media Migration

Denki can convert supported base64 data URLs in card fronts, card backs, and deck notes into verified `denki-media://sha256/<hash>` references. The migration is deliberately manual and resumable: rendering, portable backup v5, and self-contained CSV export already understand mixed libraries, so every committed batch remains recoverable.

## Batch contract

The migration scans cards first and deck notes second. Each batch contains at most 20 records by default and never more than 100.

For one batch Denki:

1. reads the next records after the durable cursor;
2. rejects reserved portable-backup tokens in runtime content;
3. identifies supported base64 image, audio, and video values through the existing backup-media parser;
4. decodes the canonical bytes;
5. sanitises SVG before hashing;
6. derives the runtime SHA-256 identity from canonical MIME plus stored bytes;
7. prepares content-addressed media rows and replacement text outside the transaction;
8. re-reads every source row inside one Dexie transaction;
9. verifies that no source text changed during preparation;
10. inserts or verifies media rows and updates the card/deck text in that same transaction.

A quota failure, conflicting existing object, concurrent edit, or row-write failure rolls back both the media rows and the text updates.

## Cursor and recovery

The progress cursor is stored under `denki-embedded-media-migration-v1` only **after** a batch transaction commits. Therefore:

- the cursor never skips an uncommitted batch;
- a browser-storage failure may leave the cursor behind, but re-running is safe and idempotent;
- stopping or closing Denki affects only the current uncommitted preparation; completed batches remain valid;
- a completed scan can be restarted to catch newly imported or edited data URLs.

The cursor records the phase, last processed ID, scanned rows, changed rows, created media objects, and canonical timestamps. Malformed cursor data is discarded because it is operational state, not learner data.

## Mixed-state guarantee

A portable backup can be exported at any batch boundary. Backup v5 preserves:

- cards already converted to runtime registry references;
- cards and notes that still contain embedded data URLs;
- the registry rows required by converted content;
- registry-only assets.

Deck CSV export reverses runtime references to verified data URLs, so migration does not reduce interchange portability.

## User interaction

The settings control runs batches sequentially while yielding to the browser between commits. A stop request takes effect between batches. The app reloads after completion, a user stop, or a partially committed error so the in-memory library cannot overwrite newly migrated database text.
