// scripts/lib/tier-resolver-openrouter.cjs
//
// Plan 33.6-02 — OpenRouter tier-resolver adapter.
//
// `resolve(tier, opts?) → openrouter-model-id | null`
//
// Maps GDD's tier vocabulary (`opus` / `sonnet` / `haiku` — the same
// VALID_TIERS the Phase-26 tier-resolver.cjs enforces, D-04) onto a concrete
// model id from OpenRouter's DYNAMIC aggregator catalog. Two inputs decide the
// answer, in this precedence (FIRST hit wins):
//
//   1. An explicit user override (`.design/config.json#openrouter_tier_overrides`,
//      or `opts.overrides` injected for tests). A non-empty override string for
//      the tier is returned VERBATIM and wins over the heuristic — even when that
//      id is not present in the catalog (the user's explicit choice). (D-03)
//   2. Otherwise the deterministic heuristic over the catalog `models[]`:
//        opus   = top-tier CLOSED model (priciest closed-vendor id),
//        sonnet = mid / top-OPEN (the closed model below opus, else the strongest
//                 open model — always distinct from the opus pick),
//        haiku  = cheap OPEN model (the cheapest open-vendor id).
//      Deterministic for a fixed catalog (stable sort; no Date, no randomness) so
//      the 33.6-04 golden baseline is stable.
//   3. Otherwise (no catalog / empty models / no candidate, and no override) →
//      null, so the CALLER falls back to the native provider via the existing
//      scripts/lib/tier-resolver.cjs fallback chain. (D-08)
//
// The catalog comes from `opts.catalog` (alias `opts.models`) when injected
// (tests — hermetic, D-07), otherwise from the 33.6-01 cache via
// `scripts/lib/openrouter/catalog-fetcher.cjs#readCatalog`, required defensively
// so a missing sibling module degrades to null rather than crashing import.
//
// NEVER throws (D-08): an unknown tier, a missing/corrupt config, a corrupt
// cache, or garbage opts all degrade to null (or to an override when one
// applies). Zero npm dependencies — node builtins only (D-10). `.cjs` to match
// the Phase-26 sibling and stay require-able from .ts hooks under
// --experimental-strip-types.
//
// PATTERN: mirrors scripts/lib/tier-resolver.cjs discipline (VALID_TIERS,
// opts.models injection, never-throws, null-is-valid). This adapter has one
// upstream (OpenRouter) and no runtime argument, so its signature is
// `resolve(tier, opts)` rather than `resolve(runtime, tier, opts)`.
//
// SCOPE (D-12): OpenRouter is represented ONLY in this tier-resolution layer —
// NOT in the install registry (scripts/lib/install/runtimes.cjs) and NOT as a
// reference/runtime-models.md row. This adapter is the catalog's canonical
// consumer; the router/budget-enforcer consultation + cost-tag wiring lives in
// plan 33.6-03.

'use strict';

const fs = require('node:fs');
const path = require('node:path');

/**
 * GDD's public tier vocabulary — the same set tier-resolver.cjs enforces
 * (D-04). `resolve` returns null for anything outside this set (no throw).
 */
const VALID_TIERS = Object.freeze(['opus', 'sonnet', 'haiku']);

/**
 * Vendor-namespace classification. The id prefix before the first `/` names
 * the vendor; CLOSED = frontier/premium, OPEN = commodity/cheap. The
 * closed-vs-open split is the heuristic's primary axis (D-03).
 */
const CLOSED_VENDORS = Object.freeze(['anthropic', 'openai', 'google']);
const OPEN_VENDORS = Object.freeze(['meta-llama', 'qwen', 'mistralai', 'deepseek']);

/**
 * The internal capability buckets the heuristic computes, and their one-to-one
 * map onto the public tiers (D-04). Exported for tests + documentation parity
 * with reference/openrouter-tier-mapping.md.
 */
const TIER_BUCKETS = Object.freeze({
  opus: 'high', // top-tier closed
  sonnet: 'medium', // mid / top-open
  haiku: 'low', // cheap open
});

const DEFAULT_CONFIG_PATH = path.join('.design', 'config.json');

/**
 * Best-effort read of `.design/config.json#openrouter_tier_overrides`. Returns
 * a plain object (possibly empty); a missing file, missing key, or corrupt JSON
 * degrades to `{}`. NEVER throws. `opts.configPath` overrides the location for
 * tests; otherwise the path is resolved relative to `cwd` (default
 * `process.cwd()`).
 *
 * @param {object} [opts]
 * @param {string} [opts.configPath]
 * @param {string} [opts.cwd]
 * @returns {{ opus?: string, sonnet?: string, haiku?: string }}
 */
function readOpenrouterOverrides(opts) {
  try {
    const o = opts || {};
    const configPath =
      typeof o.configPath === 'string' && o.configPath.length > 0
        ? o.configPath
        : path.join(o.cwd || process.cwd(), DEFAULT_CONFIG_PATH);
    if (!fs.existsSync(configPath)) return {};
    const parsed = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    if (!parsed || typeof parsed !== 'object') return {};
    const ov = parsed.openrouter_tier_overrides;
    if (!ov || typeof ov !== 'object') return {};
    return ov;
  } catch {
    // Missing/corrupt config must never break resolution — degrade to no
    // overrides so the heuristic (or null) takes over.
    return {};
  }
}

/**
 * Defensive lazy read of the 33.6-01 catalog cache. Requires the sibling
 * fetcher in a try/catch so a missing module (Wave-A ordering) degrades to
 * null rather than crashing this module's import. Returns `Array<model>|null`.
 *
 * @param {string} [cachePath]
 * @returns {Array<object>|null}
 */
function readCatalogDefensive(cachePath) {
  try {
    const fetcher = require('./openrouter/catalog-fetcher.cjs');
    if (!fetcher || typeof fetcher.readCatalog !== 'function') return null;
    const models = fetcher.readCatalog(
      typeof cachePath === 'string' && cachePath.length > 0 ? { cachePath } : undefined,
    );
    return Array.isArray(models) ? models : null;
  } catch {
    return null;
  }
}

/**
 * The vendor namespace of a model id (the segment before the first `/`),
 * lower-cased. Returns '' for a malformed id.
 */
function vendorOf(id) {
  if (typeof id !== 'string') return '';
  const slash = id.indexOf('/');
  if (slash <= 0) return '';
  return id.slice(0, slash).toLowerCase();
}

function isClosed(id) {
  return CLOSED_VENDORS.indexOf(vendorOf(id)) >= 0;
}

function isOpen(id) {
  return OPEN_VENDORS.indexOf(vendorOf(id)) >= 0;
}

/**
 * Parse a pricing string ("0.000075") to a finite Number, or null when absent
 * / unparseable. The completion price is the heuristic's ranking key.
 */
function completionPrice(model) {
  if (!model || typeof model !== 'object' || !model.pricing || typeof model.pricing !== 'object') {
    return null;
  }
  const raw = model.pricing.completion;
  const n = typeof raw === 'number' ? raw : Number.parseFloat(raw);
  return Number.isFinite(n) ? n : null;
}

function contextLengthOf(model) {
  const n = model && typeof model.context_length === 'number' ? model.context_length : 0;
  return Number.isFinite(n) ? n : 0;
}

/**
 * Keep only well-formed catalog rows: objects with a non-empty string `id`.
 * Drops `null`, numbers, and shapeless entries so the ranking never touches a
 * bad row.
 */
function sanitize(models) {
  if (!Array.isArray(models)) return [];
  return models.filter(
    m => m && typeof m === 'object' && typeof m.id === 'string' && m.id.length > 0,
  );
}

/**
 * Stable comparator factory. `dir` = -1 sorts completion price DESCENDING
 * (priciest first, for opus); `dir` = +1 sorts ASCENDING (cheapest first, for
 * haiku). Models with no parseable price sort LAST regardless of direction.
 * Ties break by context_length (more capable first for desc, less for asc),
 * then by id ascending so the order is fully deterministic for a fixed catalog.
 */
function byCompletionPrice(dir) {
  return (a, b) => {
    const pa = completionPrice(a);
    const pb = completionPrice(b);
    const aMissing = pa === null;
    const bMissing = pb === null;
    if (aMissing && bMissing) return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
    if (aMissing) return 1; // a sorts last
    if (bMissing) return -1; // b sorts last
    if (pa !== pb) return dir < 0 ? pb - pa : pa - pb;
    const ca = contextLengthOf(a);
    const cb = contextLengthOf(b);
    if (ca !== cb) return dir < 0 ? cb - ca : ca - cb;
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  };
}

/**
 * Compute the heuristic pick for `tier` over a sanitized catalog. Returns a
 * model id or null when no suitable candidate exists.
 *
 *   opus   → priciest CLOSED model (fallback: priciest model overall).
 *   haiku  → cheapest OPEN model   (fallback: cheapest model overall).
 *   sonnet → the next CLOSED model below the opus pick, else the strongest
 *            (priciest) OPEN model; always distinct from the opus pick when the
 *            catalog has >1 usable model.
 */
function heuristicPick(tier, clean) {
  if (clean.length === 0) return null;

  const closed = clean.filter(m => isClosed(m.id));
  const open = clean.filter(m => isOpen(m.id));

  if (tier === 'opus') {
    const pool = closed.length > 0 ? closed : clean;
    const ranked = pool.slice().sort(byCompletionPrice(-1));
    return ranked.length > 0 ? ranked[0].id : null;
  }

  if (tier === 'haiku') {
    const pool = open.length > 0 ? open : clean;
    const ranked = pool.slice().sort(byCompletionPrice(1));
    return ranked.length > 0 ? ranked[0].id : null;
  }

  // sonnet = MEDIUM (mid / top-open). Prefer the closed model directly below
  // the opus pick; otherwise the strongest open model. Never collapse onto the
  // opus pick when an alternative exists.
  const opusPick = heuristicPick('opus', clean);

  const closedDesc = closed.slice().sort(byCompletionPrice(-1));
  // The first closed model that is NOT the opus pick (i.e. the second-priciest
  // closed, the natural "mid closed" slot).
  const midClosed = closedDesc.find(m => m.id !== opusPick);
  if (midClosed) return midClosed.id;

  // No second closed model — take the strongest (priciest) OPEN model.
  const openDesc = open.slice().sort(byCompletionPrice(-1));
  const topOpen = openDesc.find(m => m.id !== opusPick);
  if (topOpen) return topOpen.id;

  // Degenerate single-model catalog: fall back to any non-opus candidate, else
  // the opus pick itself (better a valid id than null for a tier the caller
  // asked for).
  const anyOther = clean.find(m => m.id !== opusPick);
  if (anyOther) return anyOther.id;
  return opusPick;
}

/**
 * Resolve a GDD tier to an OpenRouter catalog model id, or null.
 *
 * @param {string | null | undefined} tier
 *   One of `opus` / `sonnet` / `haiku` (D-04). Anything else → null (no throw).
 * @param {object} [opts]
 * @param {Array<object>} [opts.catalog]
 *   Injected catalog `models[]` (tests, hermetic — D-07). Takes precedence over
 *   the on-disk cache. `opts.models` is accepted as an interop alias.
 * @param {Array<object>} [opts.models]
 *   Interop alias for `opts.catalog` (mirrors tier-resolver.cjs naming).
 * @param {{opus?:string,sonnet?:string,haiku?:string}} [opts.overrides]
 *   Injected override map (tests). When absent, read from
 *   `.design/config.json#openrouter_tier_overrides` (best-effort; missing/
 *   corrupt → {}).
 * @param {string} [opts.cachePath]
 *   Passed through to readCatalog when no catalog is injected (tests).
 * @param {string} [opts.configPath]
 *   Override the .design/config.json location (tests).
 * @param {string} [opts.cwd]
 *   Base dir for the default config path (tests).
 * @returns {string | null} an OpenRouter model id, or null (caller falls back
 *   to the native provider — D-08).
 */
function resolve(tier, opts) {
  try {
    // Validate the tier FIRST — an unknown tier is null regardless of overrides
    // or catalog (the override map is keyed by the valid tiers only).
    if (typeof tier !== 'string' || VALID_TIERS.indexOf(tier) < 0) return null;

    const o = opts && typeof opts === 'object' ? opts : {};

    // 1. Override wins (D-03). Read injected map, else best-effort config.
    const overrides =
      o.overrides && typeof o.overrides === 'object'
        ? o.overrides
        : readOpenrouterOverrides({ configPath: o.configPath, cwd: o.cwd });
    const override = overrides ? overrides[tier] : undefined;
    if (typeof override === 'string' && override.length > 0) {
      return override; // verbatim — wins over the heuristic, catalog-membership irrelevant
    }

    // 2. Heuristic over the catalog. Injected catalog/models take precedence;
    //    otherwise read the cache defensively. An explicit `catalog: null`
    //    (or `models: null`) is honored as "no catalog" and does NOT fall
    //    through to the on-disk read — keeps injected tests hermetic.
    let models;
    if ('catalog' in o) {
      models = o.catalog;
    } else if ('models' in o) {
      models = o.models;
    } else {
      models = readCatalogDefensive(o.cachePath);
    }

    const clean = sanitize(models);
    if (clean.length === 0) return null; // 3. no catalog + no override → null (D-08)

    const pick = heuristicPick(tier, clean);
    return typeof pick === 'string' && pick.length > 0 ? pick : null;
  } catch {
    // Absolute backstop — resolve NEVER throws (D-08).
    return null;
  }
}

module.exports = {
  resolve,
  readOpenrouterOverrides,
  VALID_TIERS,
  TIER_BUCKETS,
  CLOSED_VENDORS,
  OPEN_VENDORS,
  // internals surfaced for tests only — stable API = `resolve` +
  // `readOpenrouterOverrides`.
  _internal: {
    vendorOf,
    isClosed,
    isOpen,
    completionPrice,
    heuristicPick,
    sanitize,
    readCatalogDefensive,
  },
};
