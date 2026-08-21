# Cross-tab maintenance coordination

Denki can open the same IndexedDB library in multiple browser tabs. Ordinary review and editing flows are short transactions, but maintenance operations such as embedded-media migration rewrite many records across multiple batches. They require a stronger coordination boundary so stale state in another tab cannot overwrite a completed batch.

## Exclusive lease

`src/services/maintenanceLock.ts` provides one app-wide exclusive maintenance lease.

When available, Denki first acquires the browser Web Locks name `denki-exclusive-maintenance`. A separate `DenkiCoordination` IndexedDB database remains the authoritative fallback and crash-recovery record. Its lease contains:

- a per-tab owner token;
- a monotonically increasing fencing number;
- the operation identifier and user-facing label;
- acquisition, heartbeat, and expiry timestamps.

The owner renews the lease every ten seconds. The default lease expires after sixty seconds, so a crashed or permanently closed tab cannot block the library forever. Before each media-migration commit, the owner renews and verifies its owner/fence pair. A tab that loses ownership must not begin another atomic batch.

## Synchronous write fence

The owner publishes the live lease to localStorage. Every `classes`, `decks`, `cards`, `reviews`, and `media` create/update/delete hook checks that marker synchronously.

- The owner tab is allowed to write.
- A foreign tab throws `MaintenanceLockUnavailableError` before a stale write reaches IndexedDB.
- Expired or malformed markers are ignored and removed.
- Maintenance acquisition fails closed if the marker cannot be published.

The coordination database and localStorage marker have different roles: IndexedDB serializes acquisition; localStorage gives every main-database hook a synchronous cross-tab fence.

## Foreign-tab UI

`MaintenanceBlocker` subscribes through storage events, BroadcastChannel where available, and a short expiry poll. A foreign lease:

- closes command, shortcut, and confirmation UI;
- places a modal, keyboard-blocking read-only surface above the application;
- keeps the current in-memory session untouched behind the blocker;
- reloads the tab after the lease is released or expires.

Reloading is required because the maintenance owner may have replaced card text or other durable state while this tab held older Zustand objects.

## Media migration

Both the one-batch API and the full resumable migration acquire the exclusive lease. The full run holds one lease across all batches and forwards its combined abort signal to the existing stop/resume loop.

Before a durable batch, Denki:

1. verifies and renews the lease;
2. plans decoding, SVG sanitisation, hashes, and replacement text outside the main database transaction;
3. verifies and renews the lease again;
4. re-reads source rows and commits media plus text atomically;
5. writes the resumable cursor only after the transaction commits.

A user stop, lease loss, write conflict, or quota failure never permits a second batch to start.

## Current scope

The lock protects the shipped embedded-media migration and fences all main-database writes from foreign tabs while it runs. `importDatabaseExclusively()` is available for destructive full-library restore integration. Read-only export does not need an exclusive lease.

The mechanism does not synchronize different browser profiles, different origins, or different devices; those environments do not share the same IndexedDB library.
