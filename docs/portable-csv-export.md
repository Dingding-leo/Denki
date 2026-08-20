# Portable Deck CSV Export

Denki deck CSV export is a self-contained interchange format. A CSV file cannot carry the browser's IndexedDB media registry, so every verified `denki-media://sha256/<hash>` reference in exported card fronts and backs is converted back to a canonical base64 data URL before download.

## Export contract

`buildPortableDeckCsv()` performs the following steps before serialising rows:

1. scan card fronts and backs for exact, standalone runtime media references;
2. reject malformed custom-protocol values, including a valid 64-character hash followed by a suffix, query, path, or fragment;
3. deduplicate references by hash;
4. resolve each object through the runtime registry's MIME, byte-length, timestamp, and SHA-256 integrity checks;
5. enforce the same 5,000-object and 160 MiB decoded-media budgets used by portable backups;
6. convert verified bytes to canonical base64 data URLs;
7. replace every reference and then apply the existing RFC 4180 quoting and spreadsheet-formula neutralisation rules.

Existing data URLs remain unchanged. A repeated registry object is read once and embedded wherever it is referenced.

## Failure behaviour

Export fails before the browser download is started when:

- a reference is malformed;
- a registry object is missing;
- stored MIME, bytes, length, timestamp, or SHA-256 identity is invalid;
- the deck exceeds the object or decoded-byte budget.

Denki must not download a CSV that appears successful but contains unresolved internal registry URLs.

## Import compatibility

The existing CSV importer stores the resulting data URLs as card text, so the exported file can be imported into another Denki installation without access to the original IndexedDB registry. A later resumable migration may deduplicate those embedded values into the destination registry again.
