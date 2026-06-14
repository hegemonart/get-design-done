'use strict';
// Phase 40 — lock-policy.cjs — PURE, dep-free advisory-lock policy for hone-state multi-writer mode (SC#6).
//
// Phase 20's sdk/state/lockfile.ts already implements PID+timestamp advisory locks with retry
// (staleMs / maxWaitMs / pollMs). "Multi-writer mode" is a POLICY layered on top: when a project
// enables team mode (`.design/config.json#collab.multi_writer_enabled`), the state write path should
// wait LONGER and poll on a backoff before giving up, because a teammate's write may be in flight.
// This module derives the acquire-options object from config; the MCP write path passes it to acquire().
//
// No `require` — pure. Deterministic.

// sdk/state/lockfile.ts defaults (single-process baseline).
const SINGLE = Object.freeze({ staleMs: 60000, maxWaitMs: 5000, pollMs: 50 });
// Team mode: a stuck teammate write is rare but a normal queued one is not — wait up to 30s,
// poll slower (100ms) to reduce contention, and treat a lock older than 2min as stale.
const TEAM = Object.freeze({ staleMs: 120000, maxWaitMs: 30000, pollMs: 100 });

/** True when team multi-writer mode is enabled in config. */
function isMultiWriter(config) {
  return !!(config && config.collab && config.collab.multi_writer_enabled === true);
}

/**
 * Resolve the acquire() options for the current config. A numeric `collab.lock_timeout_ms`
 * overrides the team-mode maxWaitMs. Returns a fresh object (never the frozen constants).
 */
function acquireOpts(config) {
  const base = isMultiWriter(config) ? TEAM : SINGLE;
  const out = { staleMs: base.staleMs, maxWaitMs: base.maxWaitMs, pollMs: base.pollMs };
  if (isMultiWriter(config)) {
    const t = Number(config.collab.lock_timeout_ms);
    if (Number.isFinite(t) && t > 0) out.maxWaitMs = t;
  }
  return out;
}

module.exports = { isMultiWriter, acquireOpts, SINGLE, TEAM };
