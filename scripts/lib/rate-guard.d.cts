// scripts/lib/rate-guard.d.cts — types for rate-guard.cjs.

export interface ProviderState {
  provider: string;
  remaining: number;
  resetAt: string;  // ISO-8601
  updatedAt: string; // ISO-8601
}

/** Headers shape accepted by {@link ingestHeaders}. */
export type HeadersLike =
  | Record<string, string | number | undefined>
  | Map<string, string>
  | Headers;

/**
 * Parse rate-limit headers for a provider, merge with any prior state
 * (most-restrictive precedence), and persist atomically to
 * `.design/rate-limits/<provider>.json`.
 *
 * Returns the persisted state, or `null` if no rate-limit signal was
 * present in the headers.
 */
export function ingestHeaders(provider: string, headers: HeadersLike): Promise<ProviderState | null>;

/**
 * Return the current state for a provider, or `null` when no state
 * exists, the file is corrupt, or the rate-limit window has already
 * reset. Callers treat `null` as "no constraint".
 */
export function remaining(provider: string): ProviderState | null;

/**
 * If the provider's current `remaining <= 0`, wait until `resetAt`
 * before resolving. Returns the number of ms actually waited (0 when
 * there was no constraint or the window was already expired).
 */
export function blockUntilReady(provider: string): Promise<number>;
