// scripts/lib/tier-resolver.cjs
//
// Plan 26-02 — tier→model resolver with fallback chain.
//
// `resolve(runtime, tier, opts?) → model-string | null`
//
// Translates the tier vocabulary frontmatter speaks (`opus`, `sonnet`,
// `haiku`) into the concrete model name a specific runtime understands
// (e.g. `gpt-5`, `gemini-2.5-pro`, `qwen3-max`). Source-of-truth for the
// mapping is `reference/runtime-models.md` (plan 26-01); this module
// reads the parsed form via 26-01's parser helper at
// `scripts/lib/install/parse-runtime-models.cjs`.
//
// Parsed-models shape (from 26-01):
//   {
//     schema_version: 1,
//     runtimes: [
//       { id: 'claude',
//         tier_to_model: { opus: { model: 'claude-opus-4-7' }, … },
//         reasoning_class_to_model: { high: { model: '…' }, … },
//         provenance: [...]
//       },
//       …
//     ]
//   }
//
// Fallback chain (D-04):
//   1. runtime-specific entry has the tier → use directly (no event).
//   2. runtime row missing OR tier missing on the row → fall back to the
//      `claude` row (Anthropic-default convention 26-01 baked into every
//      placeholder runtime), emit `tier_resolution_fallback`.
//   3. neither available (e.g. a parsed map with no claude row, or a
//      claude row missing the requested tier) → return null, emit
//      `tier_resolution_failed`.
//
// Never throws. null is a valid output the caller (router, budget-
// enforcer) must handle gracefully. Garbage input (undefined runtime,
// bogus tier, malformed models) returns null + failure event.
//
// `.cjs` to match Phase 22 primitives and let .ts hooks require it
// under --experimental-strip-types without ESM-interop friction.
//
// Pure module — no top-level side effects beyond reading the parsed
// runtime-models document on first call. The parsed form is cached per-
// process; callers that need a fresh read between cycles call `reset()`.
//
// Test-injection contract: callers may pass `opts.models` to bypass the
// on-disk lookup entirely. Used by `tests/tier-resolver.test.cjs` to
// exercise the fallback branches deterministically.

'use strict';

const fs = require('node:fs');
const path = require('node:path');

const VALID_TIERS = Object.freeze(['opus', 'sonnet', 'haiku']);

/**
 * Runtime-id whose row supplies the fallback for missing entries.
 * 26-01's runtime-models.md uses Anthropic models as the closest-
 * published-equivalent placeholder for every runtime that lacks a
 * confirmed tier-map; that convention makes `claude` the natural
 * D-04-branch-2 default. If 26-01 ever changes that convention,
 * update this constant in lockstep.
 */
const DEFAULT_RUNTIME_ID = 'claude';

const DEFAULT_EVENTS_PATH = path.join('.design', 'telemetry', 'events.jsonl');

/**
 * Cached parsed-models data. `null` until first lazy load (or after
 * `reset()`).
 */
let _cachedModels = null;

/**
 * Lazy soft-import of the 26-01 parser. Returns null if the parser
 * file is unreachable — the resolver then degrades to "always emit
 * failed" for on-disk callers, while test callers using `opts.models`
 * are unaffected.
 */
function loadParser() {
  try {
    const modPath = path.join(__dirname, 'install', 'parse-runtime-models.cjs');
    if (!fs.existsSync(modPath)) return null;
    return require(modPath);
  } catch {
    return null;
  }
}

/**
 * Lazy load + cache the parsed runtime-models map. Returns null when
 * the parser is unavailable or throws on the source markdown.
 */
function loadModels() {
  if (_cachedModels !== null) return _cachedModels;
  const parser = loadParser();
  if (parser === null) return null;
  try {
    const fn = typeof parser.parseRuntimeModels === 'function'
      ? parser.parseRuntimeModels
      : (typeof parser === 'function' ? parser : null);
    if (fn === null) return null;
    const out = fn();
    if (out && typeof out === 'object') {
      _cachedModels = out;
      return out;
    }
    return null;
  } catch {
    // Parser throws on schema validation failure — treat as
    // "no usable models" so the resolver fails open with events
    // rather than crashing the consumer.
    return null;
  }
}

/**
 * Reset the parsed-models cache. Tests use this after writing fixture
 * runtime-models.md to a temp cwd; production callers rarely need it.
 */
function reset() {
  _cachedModels = null;
}

/**
 * Append a single event line to the on-disk events.jsonl. Honors
 * `GDD_EVENTS_PATH` for test isolation (matches the TS EventWriter's
 * env-var contract). Never throws — diagnostic on stderr only.
 *
 * We don't `require` the .ts EventWriter from .cjs (would force every
 * consumer to run under --experimental-strip-types); instead we write
 * the same JSONL line shape directly. The envelope matches BaseEvent
 * so downstream consumers don't care which producer wrote the line.
 */
function emitEvent(type, payload) {
  const line = JSON.stringify({
    type,
    timestamp: new Date().toISOString(),
    sessionId: process.env.GDD_SESSION_ID || 'tier-resolver',
    payload,
    _meta: {
      pid: process.pid,
      host: 'tier-resolver',
      source: 'tier-resolver',
    },
  });
  const envPath = process.env.GDD_EVENTS_PATH;
  const target = envPath && envPath.length > 0
    ? envPath
    : path.join(process.cwd(), DEFAULT_EVENTS_PATH);
  try {
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.appendFileSync(target, line + '\n', { encoding: 'utf8' });
  } catch (err) {
    // Don't let event-emission failure cascade into resolver failure;
    // the resolver's job is to return a model (or null), not to
    // guarantee telemetry. The event-stream has its own resilience
    // story (Phase 20-14 / Phase 22).
    try {
      process.stderr.write(
        `[tier-resolver] event emit failed: ${err && err.message ? err.message : String(err)}\n`,
      );
    } catch {
      /* swallow */
    }
  }
}

/**
 * Find a runtime row by id. Accepts both the 26-01 array shape
 * (`runtimes: [{id, …}, …]`) and a plain-object map shape
 * (`runtimes: {id: {…}}`) used by some test fixtures. Returns the row
 * or null when not found / malformed.
 */
function findRuntimeRow(models, id) {
  if (!models || typeof models !== 'object') return null;
  const r = models.runtimes;
  if (Array.isArray(r)) {
    for (const row of r) {
      if (row && typeof row === 'object' && row.id === id) return row;
    }
    return null;
  }
  if (r && typeof r === 'object') {
    const row = r[id];
    return row && typeof row === 'object' ? row : null;
  }
  return null;
}

/**
 * Read the model string for `tier` from a runtime row. The 26-01
 * shape nests one level: `tier_to_model.opus = { model: '…' }`. A
 * flat shape (`tier_to_model.opus = '…'`) is also accepted to keep
 * test fixtures terse. Returns the model string or null when absent
 * or malformed.
 */
function lookupTier(row, tier) {
  if (!row || typeof row !== 'object') return null;
  const map = row.tier_to_model;
  if (!map || typeof map !== 'object') return null;
  const v = map[tier];
  if (typeof v === 'string' && v.length > 0) return v;
  if (v && typeof v === 'object' && typeof v.model === 'string' && v.model.length > 0) {
    return v.model;
  }
  return null;
}

/**
 * Resolve a `(runtime, tier)` pair to a concrete model string. Returns
 * null when neither the runtime-specific entry nor the runtime-default
 * fallback supplies a value for the tier; emits a structured event in
 * both the fallback and failure branches.
 *
 * @param {string | null | undefined} runtime
 *   Runtime ID (e.g. 'claude', 'codex'). Garbage input returns null +
 *   failure event.
 * @param {string | null | undefined} tier
 *   Tier name. Must be one of `opus`/`sonnet`/`haiku`. Anything else
 *   returns null + failure event.
 * @param {object} [opts]
 * @param {object} [opts.models]
 *   Pre-parsed models map. When supplied, bypasses the on-disk lookup
 *   entirely (tests use this).
 * @param {boolean} [opts.silent]
 *   When true, suppresses event emission on the fallback / failure
 *   paths. Used by callers that batch-resolve and prefer to roll up
 *   their own diagnostics. Default false.
 * @returns {string | null}
 */
function resolve(runtime, tier, opts) {
  const models = (opts && opts.models) || loadModels();
  const silent = !!(opts && opts.silent);

  // Validate inputs FIRST so the failure event payload carries the
  // garbage values verbatim — useful for telemetry diagnosis.
  const runtimeOk = typeof runtime === 'string' && runtime.length > 0;
  const tierOk = typeof tier === 'string' && VALID_TIERS.indexOf(tier) >= 0;

  if (!runtimeOk || !tierOk || !models || typeof models !== 'object') {
    if (!silent) {
      emitEvent('tier_resolution_failed', {
        runtime: runtimeOk ? runtime : (runtime === undefined ? null : runtime),
        tier: tierOk ? tier : (tier === undefined ? null : tier),
        reason: !runtimeOk
          ? 'invalid_runtime'
          : !tierOk
            ? 'invalid_tier'
            : 'models_unavailable',
      });
    }
    return null;
  }

  const row = findRuntimeRow(models, runtime);

  // Branch 1: runtime-specific hit.
  const direct = lookupTier(row, tier);
  if (direct !== null) return direct;

  // Branch 2: fall back to the default-runtime row. 26-01 inlines
  // Anthropic-default models on every placeholder runtime, so this
  // branch primarily catches "runtime id not in the 14-runtime map"
  // and "claude row itself missing the tier" — the latter being
  // structurally near-impossible if 26-01's schema validation is on,
  // but we still handle it.
  const defaultRow = findRuntimeRow(models, DEFAULT_RUNTIME_ID);
  // Don't double-fall-back if the runtime IS the default and we
  // already missed the tier — that's a true failure.
  const fallbackModel = runtime === DEFAULT_RUNTIME_ID
    ? null
    : lookupTier(defaultRow, tier);
  if (fallbackModel !== null) {
    if (!silent) {
      emitEvent('tier_resolution_fallback', {
        runtime,
        tier,
        model: fallbackModel,
        reason: row === null ? 'runtime_not_in_map' : 'tier_missing_for_runtime',
        fallback_runtime: DEFAULT_RUNTIME_ID,
      });
    }
    return fallbackModel;
  }

  // Branch 3: nothing usable.
  if (!silent) {
    emitEvent('tier_resolution_failed', {
      runtime,
      tier,
      reason: row === null
        ? 'runtime_not_in_map'
        : (runtime === DEFAULT_RUNTIME_ID
          ? 'tier_missing_on_default_runtime'
          : 'tier_missing_no_default'),
    });
  }
  return null;
}

module.exports = {
  resolve,
  reset,
  VALID_TIERS,
  DEFAULT_RUNTIME_ID,
  // internals surfaced for tests only — stable API = `resolve` + `reset`.
  _internal: { lookupTier, findRuntimeRow, emitEvent, loadParser, loadModels },
};
