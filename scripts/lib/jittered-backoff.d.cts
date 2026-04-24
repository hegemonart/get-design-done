// scripts/lib/jittered-backoff.d.cts — types for jittered-backoff.cjs.
//
// Paired ambient declaration for TS consumers that `require()` the .cjs
// module. `.d.cts` suffix matches the `.cjs` runtime file so TS's Node16
// resolver picks it up for CommonJS require calls from .ts files.

export interface BackoffOptions {
  /** Initial delay before any jitter. Default 100ms. */
  baseMs?: number;
  /** Maximum un-jittered base. Default 30_000ms. */
  maxMs?: number;
  /** Per-attempt multiplier. Default 2. */
  factor?: number;
  /** Symmetric jitter fraction in [0, 1). Default 0.2. */
  jitter?: number;
}

/** Default backoff parameters (frozen). */
export const DEFAULTS: Readonly<Required<BackoffOptions>>;

/**
 * Compute the jittered delay in milliseconds for a given attempt number.
 *
 * @param attempt zero-based attempt counter (0 = first retry)
 * @param opts optional overrides for the four backoff parameters
 * @returns delay in ms. Never negative. May exceed `maxMs` by up to
 *   `jitter * maxMs` on the high side.
 */
export function delayMs(attempt: number, opts?: BackoffOptions): number;

/**
 * Sleep for a jittered backoff interval.
 *
 * @param attempt zero-based attempt counter
 * @param opts see {@link BackoffOptions}
 * @returns the actual delay that was applied
 */
export function sleep(attempt: number, opts?: BackoffOptions): Promise<number>;
