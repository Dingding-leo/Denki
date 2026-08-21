import { importDatabase } from './backup';
import { withExclusiveMaintenanceLock } from './maintenanceLock';

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
