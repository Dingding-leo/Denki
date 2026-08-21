import { importDatabase } from './backup';
import {
  migrateEmbeddedMediaToCompletion,
  type EmbeddedMediaMigrationRunResult,
} from './embeddedMediaMigration';
import { withExclusiveMaintenanceLock } from './maintenanceLock';

export type EmbeddedMediaMaintenanceOptions = NonNullable<
  Parameters<typeof migrateEmbeddedMediaToCompletion>[0]
>;

/**
 * Run the resumable media rewrite under the app-wide cross-tab maintenance
 * lease. The lock signal is forwarded to the existing batch loop, so lease
 * loss or a user stop takes effect before another batch starts.
 */
export async function migrateEmbeddedMediaExclusively(
  options: EmbeddedMediaMaintenanceOptions = {},
): Promise<EmbeddedMediaMigrationRunResult> {
  return withExclusiveMaintenanceLock(
    {
      operation: 'embedded-media-migration',
      label: 'Media storage optimization',
      signal: options.signal,
    },
    ({ signal }) =>
      migrateEmbeddedMediaToCompletion({
        ...options,
        signal,
      }),
  );
}

/**
 * Full-library restore is destructive and must be the only writer across all
 * Denki tabs. Main-database hooks allow this owner while fencing every foreign
 * tab until the replacement commits and the lease is released.
 */
export async function importDatabaseExclusively(
  snapshot: unknown,
): Promise<void> {
  return withExclusiveMaintenanceLock(
    {
      operation: 'backup-restore',
      label: 'Portable backup restore',
    },
    async ({ assertOwned }) => {
      await assertOwned();
      await importDatabase(snapshot);
    },
  );
}
