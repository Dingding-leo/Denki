import Dexie, { type Table } from 'dexie';

const COORDINATION_DATABASE_NAME = 'DenkiCoordination';
const GLOBAL_LEASE_NAME = 'exclusive-maintenance';
const WEB_LOCK_NAME = 'denki-exclusive-maintenance';
const PRESENCE_STORAGE_KEY = 'denki-maintenance-presence-v1';
const OWNER_STORAGE_KEY = 'denki-maintenance-owner-v1';
const BROADCAST_CHANNEL_NAME = 'denki-maintenance-events-v1';

const DEFAULT_LEASE_DURATION_MS = 60_000;
const DEFAULT_HEARTBEAT_MS = 10_000;
const MIN_LEASE_DURATION_MS = 5_000;
const MAX_LEASE_DURATION_MS = 10 * 60_000;
const ACTIVITY_POLL_MS = 2_000;
const MAX_OPERATION_LENGTH = 80;
const MAX_LABEL_LENGTH = 160;

interface CoordinationLease {
  name: string;
  ownerId: string;
  fence: number;
  operation: string;
  label: string;
  startedAt: number;
  updatedAt: number;
  expiresAt: number;
}

export interface MaintenanceActivity {
  version: 1;
  ownerId: string;
  fence: number;
  operation: string;
  label: string;
  startedAt: number;
  updatedAt: number;
  expiresAt: number;
}

export interface MaintenanceLockContext {
  signal: AbortSignal;
  assertOwned(): Promise<void>;
}

export interface MaintenanceLockOptions {
  operation: string;
  label: string;
  signal?: AbortSignal;
  leaseDurationMs?: number;
  heartbeatMs?: number;
}

interface LockManagerLike {
  request<T>(
    name: string,
    options: { mode: 'exclusive'; ifAvailable: true },
    callback: (lock: unknown | null) => Promise<T>,
  ): Promise<T>;
}

class CoordinationDatabase extends Dexie {
  leases!: Table<CoordinationLease, string>;

  constructor() {
    super(COORDINATION_DATABASE_NAME);
    this.version(1).stores({
      leases: '&name, ownerId, expiresAt',
    });
  }
}

const coordinationDb = new CoordinationDatabase();
let memoryOwnerId: string | null = null;
let activeLocalLease: CoordinationLease | null = null;

function randomToken(): string {
  const cryptoObject = globalThis.crypto;
  if (typeof cryptoObject?.randomUUID === 'function') {
    return cryptoObject.randomUUID();
  }
  const random = Math.random().toString(36).slice(2);
  return `${Date.now().toString(36)}-${random}`;
}

function getSessionStorage(): Storage | null {
  try {
    return globalThis.sessionStorage ?? null;
  } catch {
    return null;
  }
}

function getLocalStorage(): Storage | null {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

export function getMaintenanceOwnerId(): string {
  if (memoryOwnerId) return memoryOwnerId;

  const storage = getSessionStorage();
  if (storage) {
    const existing = storage.getItem(OWNER_STORAGE_KEY);
    if (existing) {
      memoryOwnerId = existing;
      return existing;
    }
  }

  memoryOwnerId = randomToken();
  try {
    storage?.setItem(OWNER_STORAGE_KEY, memoryOwnerId);
  } catch {
    // A memory-only owner still keeps same-tab coordination correct.
  }
  return memoryOwnerId;
}

function validateText(value: string, label: string, maxLength: number): string {
  const normalized = value.trim();
  if (!normalized || normalized.length > maxLength) {
    throw new Error(`${label} must contain 1 to ${maxLength} characters.`);
  }
  return normalized;
}

function validateTiming(options: MaintenanceLockOptions): {
  leaseDurationMs: number;
  heartbeatMs: number;
} {
  const leaseDurationMs =
    options.leaseDurationMs ?? DEFAULT_LEASE_DURATION_MS;
  const heartbeatMs = options.heartbeatMs ?? DEFAULT_HEARTBEAT_MS;

  if (
    !Number.isSafeInteger(leaseDurationMs) ||
    leaseDurationMs < MIN_LEASE_DURATION_MS ||
    leaseDurationMs > MAX_LEASE_DURATION_MS
  ) {
    throw new Error(
      `Maintenance lease duration must be an integer from ${MIN_LEASE_DURATION_MS} to ${MAX_LEASE_DURATION_MS} milliseconds.`,
    );
  }
  if (
    !Number.isSafeInteger(heartbeatMs) ||
    heartbeatMs < 500 ||
    heartbeatMs >= leaseDurationMs / 2
  ) {
    throw new Error(
      'Maintenance heartbeat must be at least 500 ms and less than half the lease duration.',
    );
  }

  return { leaseDurationMs, heartbeatMs };
}

function activityFromLease(lease: CoordinationLease): MaintenanceActivity {
  return {
    version: 1,
    ownerId: lease.ownerId,
    fence: lease.fence,
    operation: lease.operation,
    label: lease.label,
    startedAt: lease.startedAt,
    updatedAt: lease.updatedAt,
    expiresAt: lease.expiresAt,
  };
}

function isMaintenanceActivity(value: unknown): value is MaintenanceActivity {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const candidate = value as Record<string, unknown>;
  const now = Date.now();
  return (
    candidate.version === 1 &&
    typeof candidate.ownerId === 'string' &&
    candidate.ownerId.length > 0 &&
    typeof candidate.operation === 'string' &&
    candidate.operation.length > 0 &&
    candidate.operation.length <= MAX_OPERATION_LENGTH &&
    typeof candidate.label === 'string' &&
    candidate.label.length > 0 &&
    candidate.label.length <= MAX_LABEL_LENGTH &&
    Number.isSafeInteger(candidate.fence) &&
    Number(candidate.fence) > 0 &&
    Number.isSafeInteger(candidate.startedAt) &&
    Number.isSafeInteger(candidate.updatedAt) &&
    Number.isSafeInteger(candidate.expiresAt) &&
    Number(candidate.startedAt) <= Number(candidate.updatedAt) &&
    Number(candidate.updatedAt) <= Number(candidate.expiresAt) &&
    Number(candidate.expiresAt) > now &&
    Number(candidate.expiresAt) <= now + MAX_LEASE_DURATION_MS
  );
}

function readPresence(): MaintenanceActivity | null {
  const storage = getLocalStorage();
  if (!storage) return null;

  const raw = storage.getItem(PRESENCE_STORAGE_KEY);
  if (!raw) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (isMaintenanceActivity(parsed)) return parsed;
  } catch {
    // Invalid or stale presence is removed below.
  }

  try {
    storage.removeItem(PRESENCE_STORAGE_KEY);
  } catch {
    // A stale marker can only block until its declared expiry is ignored.
  }
  return null;
}

function writePresence(lease: CoordinationLease): void {
  const storage = getLocalStorage();
  if (!storage) {
    throw new Error(
      'Browser storage is unavailable, so Denki cannot coordinate maintenance across tabs.',
    );
  }

  const activity = activityFromLease(lease);
  storage.setItem(PRESENCE_STORAGE_KEY, JSON.stringify(activity));
  const persisted = readPresence();
  if (
    !persisted ||
    persisted.ownerId !== lease.ownerId ||
    persisted.fence !== lease.fence
  ) {
    throw new Error(
      'Denki could not publish the maintenance lease to other tabs.',
    );
  }
}

function clearPresence(lease: CoordinationLease): void {
  const storage = getLocalStorage();
  if (!storage) return;
  try {
    const current = readPresence();
    if (
      current?.ownerId === lease.ownerId &&
      current.fence === lease.fence
    ) {
      storage.removeItem(PRESENCE_STORAGE_KEY);
    }
  } catch {
    // The marker expires automatically; failed cleanup remains fail-safe.
  }
}

function broadcastChange(): void {
  if (typeof globalThis.BroadcastChannel !== 'function') return;
  try {
    const channel = new BroadcastChannel(BROADCAST_CHANNEL_NAME);
    channel.postMessage({ type: 'maintenance-change' });
    channel.close();
  } catch {
    // localStorage storage events and polling remain available.
  }
}

export class MaintenanceLockUnavailableError extends Error {
  readonly activity: MaintenanceActivity | null;

  constructor(activity: MaintenanceActivity | null = readPresence()) {
    super(
      activity
        ? `Another Denki tab is running “${activity.label}”. Wait for it to finish, then try again.`
        : 'Another Denki tab currently holds the maintenance lock. Try again shortly.',
    );
    this.name = 'MaintenanceLockUnavailableError';
    this.activity = activity;
  }
}

export class MaintenanceLockLostError extends Error {
  constructor() {
    super(
      'This tab lost the Denki maintenance lease. The current atomic batch was not allowed to continue.',
    );
    this.name = 'MaintenanceLockLostError';
  }
}

async function acquireLease(
  operation: string,
  label: string,
  leaseDurationMs: number,
): Promise<CoordinationLease> {
  const ownerId = getMaintenanceOwnerId();
  return coordinationDb.transaction('rw', coordinationDb.leases, async () => {
    const now = Date.now();
    const current = await coordinationDb.leases.get(GLOBAL_LEASE_NAME);
    if (current && current.expiresAt > now) {
      throw new MaintenanceLockUnavailableError(activityFromLease(current));
    }

    const lease: CoordinationLease = {
      name: GLOBAL_LEASE_NAME,
      ownerId,
      fence: (current?.fence ?? 0) + 1,
      operation,
      label,
      startedAt: now,
      updatedAt: now,
      expiresAt: now + leaseDurationMs,
    };
    await coordinationDb.leases.put(lease);
    return lease;
  });
}

async function renewLease(
  lease: CoordinationLease,
  leaseDurationMs: number,
): Promise<CoordinationLease> {
  const renewed = await coordinationDb.transaction(
    'rw',
    coordinationDb.leases,
    async () => {
      const current = await coordinationDb.leases.get(GLOBAL_LEASE_NAME);
      if (
        !current ||
        current.ownerId !== lease.ownerId ||
        current.fence !== lease.fence
      ) {
        throw new MaintenanceLockLostError();
      }

      const now = Date.now();
      const next: CoordinationLease = {
        ...current,
        updatedAt: now,
        expiresAt: now + leaseDurationMs,
      };
      await coordinationDb.leases.put(next);
      return next;
    },
  );
  writePresence(renewed);
  broadcastChange();
  return renewed;
}

async function releaseLease(lease: CoordinationLease): Promise<boolean> {
  return coordinationDb.transaction('rw', coordinationDb.leases, async () => {
    const current = await coordinationDb.leases.get(GLOBAL_LEASE_NAME);
    if (
      !current ||
      current.ownerId !== lease.ownerId ||
      current.fence !== lease.fence
    ) {
      return false;
    }
    await coordinationDb.leases.delete(GLOBAL_LEASE_NAME);
    return true;
  });
}

function getWebLocks(): LockManagerLike | null {
  const navigatorObject = globalThis.navigator as
    | (Navigator & { locks?: LockManagerLike })
    | undefined;
  return navigatorObject?.locks ?? null;
}

async function runWithDatabaseLease<T>(
  options: MaintenanceLockOptions,
  callback: (context: MaintenanceLockContext) => Promise<T>,
): Promise<T> {
  if (activeLocalLease) {
    throw new MaintenanceLockUnavailableError(activityFromLease(activeLocalLease));
  }

  const operation = validateText(
    options.operation,
    'Maintenance operation',
    MAX_OPERATION_LENGTH,
  );
  const label = validateText(
    options.label,
    'Maintenance label',
    MAX_LABEL_LENGTH,
  );
  const { leaseDurationMs, heartbeatMs } = validateTiming(options);
  const lease = await acquireLease(operation, label, leaseDurationMs);
  activeLocalLease = lease;

  try {
    writePresence(lease);
    broadcastChange();
  } catch (error) {
    await releaseLease(lease).catch(() => false);
    activeLocalLease = null;
    throw error;
  }

  const controller = new AbortController();
  const externalSignal = options.signal;
  const abortFromExternal = () => {
    controller.abort(externalSignal?.reason);
  };
  if (externalSignal?.aborted) abortFromExternal();
  else externalSignal?.addEventListener('abort', abortFromExternal, { once: true });

  let heartbeatRunning = false;
  let currentLease = lease;
  const heartbeat = globalThis.setInterval(() => {
    if (heartbeatRunning || controller.signal.aborted) return;
    heartbeatRunning = true;
    void renewLease(currentLease, leaseDurationMs)
      .then((renewed) => {
        currentLease = renewed;
        activeLocalLease = renewed;
      })
      .catch((error: unknown) => {
        controller.abort(
          error instanceof Error ? error : new MaintenanceLockLostError(),
        );
      })
      .finally(() => {
        heartbeatRunning = false;
      });
  }, heartbeatMs);

  const assertOwned = async () => {
    if (controller.signal.aborted) {
      throw controller.signal.reason instanceof Error
        ? controller.signal.reason
        : new MaintenanceLockLostError();
    }
    currentLease = await renewLease(currentLease, leaseDurationMs);
    activeLocalLease = currentLease;
  };

  try {
    if (controller.signal.aborted) {
      throw controller.signal.reason instanceof Error
        ? controller.signal.reason
        : new DOMException('The operation was aborted.', 'AbortError');
    }
    return await callback({ signal: controller.signal, assertOwned });
  } finally {
    globalThis.clearInterval(heartbeat);
    externalSignal?.removeEventListener('abort', abortFromExternal);

    let released = false;
    try {
      released = await releaseLease(currentLease);
    } catch (error) {
      console.warn('Unable to release the Denki maintenance lease:', error);
    }
    if (released) {
      clearPresence(currentLease);
      broadcastChange();
    }
    activeLocalLease = null;
  }
}

/**
 * Run one destructive or rewriting operation under a single cross-tab lease.
 * Web Locks are used when available; a fenced IndexedDB lease remains the
 * authoritative fallback and supplies crash recovery through expiry.
 */
export async function withExclusiveMaintenanceLock<T>(
  options: MaintenanceLockOptions,
  callback: (context: MaintenanceLockContext) => Promise<T>,
): Promise<T> {
  const webLocks = getWebLocks();
  if (!webLocks) return runWithDatabaseLease(options, callback);

  let callbackStarted = false;
  try {
    return await webLocks.request(
      WEB_LOCK_NAME,
      { mode: 'exclusive', ifAvailable: true },
      async (lock) => {
        callbackStarted = true;
        if (!lock) throw new MaintenanceLockUnavailableError();
        return runWithDatabaseLease(options, callback);
      },
    );
  } catch (error) {
    if (!callbackStarted) {
      console.warn(
        'Web Locks are unavailable; falling back to Denki’s IndexedDB lease.',
        error,
      );
      return runWithDatabaseLease(options, callback);
    }
    throw error;
  }
}

export function getForeignMaintenanceActivity(): MaintenanceActivity | null {
  const activity = readPresence();
  return activity?.ownerId === getMaintenanceOwnerId() ? null : activity;
}

/** Synchronous write fence used by every main-database table hook. */
export function assertMaintenanceWriteAllowed(): void {
  const activity = getForeignMaintenanceActivity();
  if (activity) throw new MaintenanceLockUnavailableError(activity);
}

export function subscribeForeignMaintenanceActivity(
  listener: (activity: MaintenanceActivity | null) => void,
): () => void {
  let previousKey: string | null = null;
  const emit = () => {
    const activity = getForeignMaintenanceActivity();
    const key = activity
      ? `${activity.ownerId}:${activity.fence}:${activity.expiresAt}`
      : '';
    if (key === previousKey) return;
    previousKey = key;
    listener(activity);
  };

  const handleStorage = (event: StorageEvent) => {
    if (event.key === PRESENCE_STORAGE_KEY) emit();
  };
  globalThis.addEventListener?.('storage', handleStorage);

  let channel: BroadcastChannel | null = null;
  if (typeof globalThis.BroadcastChannel === 'function') {
    try {
      channel = new BroadcastChannel(BROADCAST_CHANNEL_NAME);
      channel.addEventListener('message', emit);
    } catch {
      channel = null;
    }
  }

  const poll = globalThis.setInterval(emit, ACTIVITY_POLL_MS);
  queueMicrotask(emit);

  return () => {
    globalThis.removeEventListener?.('storage', handleStorage);
    globalThis.clearInterval(poll);
    channel?.removeEventListener('message', emit);
    channel?.close();
  };
}

/** Test-only cleanup; production callers should let the lease lifecycle finish. */
export async function resetMaintenanceLockForTests(): Promise<void> {
  activeLocalLease = null;
  await coordinationDb.leases.clear();
  try {
    getLocalStorage()?.removeItem(PRESENCE_STORAGE_KEY);
    getSessionStorage()?.removeItem(OWNER_STORAGE_KEY);
  } catch {
    // Ignore test-environment storage failures.
  }
  memoryOwnerId = null;
  broadcastChange();
}
