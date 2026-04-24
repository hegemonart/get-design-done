// scripts/lib/lockfile.d.cts — types for lockfile.cjs.

export interface AcquireOptions {
  /** ms after which an existing lock is considered stale. Default 60_000. */
  staleMs?: number;
  /** total ms to wait before throwing LockAcquisitionError. Default 5_000. */
  maxWaitMs?: number;
  /** ms between retry attempts. Default 50. */
  pollMs?: number;
}

/** Release function returned by `acquire()`. Idempotent. */
export type LockRelease = () => Promise<void>;

/**
 * Acquire an advisory lock at `${path}.lock`. Returns a release function.
 *
 * @throws Error with `name === 'LockAcquisitionError'` when `maxWaitMs`
 *   elapses without acquiring.
 */
export function acquire(path: string, opts?: AcquireOptions): Promise<LockRelease>;
