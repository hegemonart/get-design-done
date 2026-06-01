'use strict';
/**
 * scripts/lib/ds-arms/design-arms-store.cjs — Phase 38 `design_arms` posterior class.
 *
 * A NEW arm class, DISTINCT from the routing bandit's `routing_arms`
 * (scripts/lib/bandit-router.cjs) — design_arms learn "which design pattern wins with USERS"
 * from external A/B + user-research outcomes, not internal lint/test/visual signals (D-01).
 * Isolated store: never touches the mature routing bandit. Keyed by
 * (component_type, variant_pattern_hash) with a conservative Beta(2, 8) prior (posterior mean
 * 0.2 — Phase 29 fairness-gate pattern: a pattern must EARN trust from real outcomes).
 *
 * No new dependency: an inline FNV-1a hash for the pattern key (no `crypto`, no egress). The
 * posterior math is pure; persistence is an atomic write to `.design/telemetry/design-arms.json`
 * (override `armsPath`/`baseDir` for hermetic tests).
 */

const fs = require('node:fs');
const path = require('node:path');

const SCHEMA_VERSION = '38.0';
const DEFAULT_ARMS_PATH = '.design/telemetry/design-arms.json';
// Conservative prior — Beta(2, 8), posterior mean 0.2. A design pattern is advisory until real
// user-outcome data shifts it (D-03 — advisory, never directive).
const DESIGN_ARM_PRIOR = Object.freeze({ alpha: 2, beta: 8 });

/** Inline FNV-1a (32-bit) hash → 8-char hex. Deterministic, dependency-free. */
function fnv1a(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}

/** variantKey(componentType, pattern) — a stable key for a design-arm. `pattern` may be a
 *  string ("primary-CTA-bold") or an object (canonicalized by sorted JSON). */
function variantKey(componentType, pattern) {
  const p = typeof pattern === 'string' ? pattern : JSON.stringify(pattern, Object.keys(pattern || {}).sort());
  return fnv1a(`${componentType}::${p}`);
}

function resolvePath(opts = {}) {
  const p = opts.armsPath || DEFAULT_ARMS_PATH;
  return path.isAbsolute(p) ? p : path.resolve(opts.baseDir || process.cwd(), p);
}

function load(opts = {}) {
  const p = resolvePath(opts);
  if (!fs.existsSync(p)) return { schema_version: SCHEMA_VERSION, generated_at: new Date().toISOString(), arms: [] };
  try {
    const data = JSON.parse(fs.readFileSync(p, 'utf8'));
    if (!Array.isArray(data.arms)) data.arms = [];
    return data;
  } catch (e) {
    return { schema_version: SCHEMA_VERSION, generated_at: new Date().toISOString(), arms: [] };
  }
}

function save(store, opts = {}) {
  const p = resolvePath(opts);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  store.schema_version = SCHEMA_VERSION;
  store.generated_at = new Date().toISOString();
  const tmp = p + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(store, null, 2));
  fs.renameSync(tmp, p);
}

const meanOf = (alpha, beta) => alpha / (alpha + beta);

/** pull(componentType, hash, opts) — the arm's posterior, or the conservative prior if unseen. */
function pull(componentType, hash, opts = {}) {
  const store = opts._store || load(opts);
  const arm = store.arms.find((a) => a.component_type === componentType && a.variant_pattern_hash === hash);
  if (!arm) {
    return { component_type: componentType, variant_pattern_hash: hash, alpha: DESIGN_ARM_PRIOR.alpha, beta: DESIGN_ARM_PRIOR.beta, count: 0, mean: meanOf(DESIGN_ARM_PRIOR.alpha, DESIGN_ARM_PRIOR.beta), seen: false };
  }
  return { ...arm, mean: meanOf(arm.alpha, arm.beta), seen: true };
}

/**
 * observe(componentType, hash, outcome, opts) — fold an external outcome into the arm.
 * outcome: { won:boolean, weight?:number=1, source?:'ab'|'research'|'dev_time', pattern?, label? }.
 * won → alpha += weight; lost → beta += weight. Persists (unless opts._store is supplied).
 */
function observe(componentType, hash, outcome = {}, opts = {}) {
  const store = opts._store || load(opts);
  const weight = typeof outcome.weight === 'number' && outcome.weight > 0 ? outcome.weight : 1;
  let arm = store.arms.find((a) => a.component_type === componentType && a.variant_pattern_hash === hash);
  if (!arm) {
    arm = {
      component_type: componentType,
      variant_pattern_hash: hash,
      label: outcome.label || null,
      alpha: DESIGN_ARM_PRIOR.alpha,
      beta: DESIGN_ARM_PRIOR.beta,
      count: 0,
      prior_class: 'design_arm',
      last_source: null,
      last_observed: null,
    };
    store.arms.push(arm);
  }
  if (outcome.won) arm.alpha += weight; else arm.beta += weight;
  arm.count += 1;
  arm.last_source = outcome.source || 'ab';
  arm.last_observed = new Date().toISOString();
  if (!opts._store) save(store, opts);
  return { ...arm, mean: meanOf(arm.alpha, arm.beta) };
}

/** all(opts) — every arm with its posterior mean, for design-stage ranking (advisory). */
function all(opts = {}) {
  const store = opts._store || load(opts);
  return store.arms.map((a) => ({ ...a, mean: meanOf(a.alpha, a.beta) }));
}

module.exports = { variantKey, pull, observe, all, load, save, fnv1a, DESIGN_ARM_PRIOR, SCHEMA_VERSION, DEFAULT_ARMS_PATH };
