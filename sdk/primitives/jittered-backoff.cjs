// scripts/lib/jittered-backoff.cjs
//
// Plan 20-14 — jittered exponential backoff primitive.
//
// Replaces fixed-interval retry sleeps across the codebase (update-check,
// watch-authorities, figma probes, connection probes, hook retry loops) with
// a deterministic, capped, jittered backoff curve.
//
// Formula:
//   base = min(maxMs, baseMs * factor^attempt)
//   delay = base * (1 + rand(-jitter, +jitter))
//   clamp to [0, maxMs * (1 + jitter)]
//
// The zero-based `attempt` counter gives `baseMs` on the first call, then
// multiplies by `factor` per attempt up to the cap. Jitter is full-width
// symmetric (not AWS-style equal/decorrelated) because our consumers are
// single-threaded retry loops — there's no thundering-herd problem to
// smooth; the jitter is cosmetic protection against synchronized retries
// between siblings like the watcher + update-check running at the same
// session boundary.
//
// Defaults (baseMs=100, maxMs=30_000, factor=2, jitter=0.2) yield:
//   attempt 0 → 80-120ms
//   attempt 1 → 160-240ms
//   attempt 2 → 320-480ms
//   ...
//   attempt 9 → ~24s-30s (capped)
//
// This module is `.cjs` (not `.ts`) per Plan 20-14 D-01 so it can be
// `require()`d from both the `.ts` runtime (hooks, MCP server) and future
// `.cjs` CLI invocations without needing `--experimental-strip-types` at
// every consumer site. Types live in the paired `jittered-backoff.d.cts`.
//
// No external dependencies; pure Math.random + setTimeout.

'use strict';

/**
 * Default backoff parameters — chosen to cover retry-after-Xms through
 * retry-after-30s with reasonable mid-range distribution.
 */
const DEFAULTS = Object.freeze({
  baseMs: 100,
  maxMs: 30_000,
  factor: 2,
  jitter: 0.2,
});

/**
 * Compute the jittered delay in milliseconds for a given attempt number.
 *
 * @param {number} attempt zero-based attempt counter (0 = first retry)
 * @param {object} [opts]
 * @param {number} [opts.baseMs]  initial delay before any jitter. Default 100.
 * @param {number} [opts.maxMs]   maximum un-jittered base. Default 30_000.
 * @param {number} [opts.factor]  per-attempt multiplier. Default 2.
 * @param {number} [opts.jitter]  symmetric jitter fraction in [0, 1). Default 0.2.
 * @returns {number} delay in ms. Never negative. May exceed `maxMs` by up
 *   to `jitter * maxMs` on the high side.
 *
 * Invariants:
 *  - `delayMs(n, opts) >= 0` for every non-negative `n`.
 *  - `delayMs(n, opts) <= maxMs * (1 + jitter)` for every non-negative `n`.
 *  - The distribution has nonzero stddev whenever `jitter > 0`.
 */
function delayMs(attempt, opts) {
  const baseMs = (opts && Number.isFinite(opts.baseMs)) ? opts.baseMs : DEFAULTS.baseMs;
  const maxMs = (opts && Number.isFinite(opts.maxMs)) ? opts.maxMs : DEFAULTS.maxMs;
  const factor = (opts && Number.isFinite(opts.factor)) ? opts.factor : DEFAULTS.factor;
  const jitter = (opts && Number.isFinite(opts.jitter)) ? opts.jitter : DEFAULTS.jitter;

  // Guard against nonsense inputs — callers that pass garbage shouldn't
  // cause NaN or Infinity to propagate into setTimeout.
  const a = Math.max(0, Number.isFinite(attempt) ? Math.floor(attempt) : 0);
  const safeBase = Math.max(0, baseMs);
  const safeMax = Math.max(safeBase, maxMs);
  const safeFactor = factor > 0 ? factor : DEFAULTS.factor;
  // Clamp jitter to [0, 1) — full-range (>=1) would allow negative values
  // after subtraction, which we want to forbid by invariant.
  const safeJitter = Math.min(0.999, Math.max(0, jitter));

  // Exponential growth capped at safeMax.
  // Math.pow with a huge attempt count can overflow to Infinity; the
  // Math.min picks up safeMax before Infinity escapes.
  const unjittered = Math.min(safeMax, safeBase * Math.pow(safeFactor, a));

  // Symmetric jitter in [-jitter, +jitter).
  // Math.random() returns [0, 1); 2r - 1 maps to [-1, 1); scale by jitter.
  const noise = (Math.random() * 2 - 1) * safeJitter;
  const delay = unjittered * (1 + noise);

  // Floor at zero (noise could in theory go slightly negative due to FP
  // precision even with safeJitter < 1, for very small unjittered values).
  return Math.max(0, delay);
}

/**
 * Sleep for a jittered backoff interval. Convenience wrapper around
 * `delayMs` + `setTimeout`.
 *
 * @param {number} attempt zero-based attempt counter
 * @param {object} [opts] see {@link delayMs}
 * @returns {Promise<number>} resolves to the actual delay that was applied
 */
function sleep(attempt, opts) {
  const ms = delayMs(attempt, opts);
  return new Promise((resolve) => {
    setTimeout(() => resolve(ms), ms);
  });
}

module.exports = { delayMs, sleep, DEFAULTS };
