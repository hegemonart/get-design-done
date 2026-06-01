'use strict';
// Phase 40 — sync-backend.cjs — PURE, dep-free cross-machine sync backend selector (SC#9).
//
// `.design/` syncs between teammates over git by DEFAULT (existing behavior). Orgs whose git
// push/pull cadence is too slow can opt into an `s3` or `git-lfs` backend. This module is the
// SELECTOR + contract: it resolves which backend a config asks for and whether sync is opted in.
// A live S3/LFS client is explicitly out of scope this phase — the selector ships, the backend is
// pluggable. Defaulting to `git` means single-operator + most-team projects are unaffected.
//
// No `require` — pure. Deterministic.

const BACKENDS = Object.freeze(['git', 's3', 'git-lfs']);
const DEFAULT_BACKEND = 'git';

/** True when the project opted into a non-git sync backend. */
function isOptIn(config) {
  const b = config && config.collab && config.collab.sync_backend;
  return !!b && b !== 'git' && BACKENDS.includes(b);
}

/**
 * Resolve the sync backend. Unknown/missing → 'git' (the safe default).
 * @returns {{backend, optIn, supported}}  supported=false for opt-in backends whose live client
 *   is not bundled this phase (the caller falls back to git + warns).
 */
function resolveBackend(config) {
  const raw = config && config.collab && config.collab.sync_backend;
  const backend = BACKENDS.includes(raw) ? raw : DEFAULT_BACKEND;
  const optIn = backend !== DEFAULT_BACKEND;
  // Phase 40 ships the selector only; no live S3/LFS client → opt-in backends are "declared but not
  // yet executable". git is always supported (it's the existing push/pull path).
  const supported = backend === DEFAULT_BACKEND;
  return { backend, optIn, supported };
}

module.exports = { BACKENDS, DEFAULT_BACKEND, isOptIn, resolveBackend };
