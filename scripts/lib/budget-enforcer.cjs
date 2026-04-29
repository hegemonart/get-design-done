// scripts/lib/budget-enforcer.cjs
//
// Plan 26-05 — shared cost-computation backend for budget-enforcer.
//
// Pure module that takes a `(model_id, runtime_id, token_counts)` triple and
// returns a USD cost figure by reading the per-runtime price table at
// `reference/prices/<runtime>.md`. Used by both:
//
//   1. `hooks/budget-enforcer.ts` — the Claude Code PreToolUse hook, when
//      the router decision payload carries a `resolved_models[agent]`
//      entry. The hook calls `computeCost({ model_id, runtime, tokens_in,
//      tokens_out, cache_hit })` and writes the resulting figure into the
//      OPT-09 telemetry row.
//   2. Non-CC code-level mirrors of the budget-enforcer surface — runtime
//      adapters that wrap the same Phase 22 events.jsonl primitives. Same
//      backend means cost numbers are computed identically across runtime
//      hosts; downstream cost-aggregator (Phase 22) can roll up by
//      `runtime` tag with apples-to-apples figures.
//
// `.cjs` extension matches Phase 22 primitives. The .ts hook reaches it
// via `createRequire` — same scheme as `rate-guard.cjs` and
// `iteration-budget.cjs`.
//
// Per-runtime price tables (D-08):
//   - `reference/prices/claude.md`  — Anthropic models
//   - `reference/prices/codex.md`   — OpenAI Codex (gpt-5 family)
//   - `reference/prices/gemini.md`  — Google Gemini 2.5 family
//   - `reference/prices/qwen.md`    — Alibaba Qwen 3 family
//   - `reference/prices/<other>.md` — stub-only at v1.26.0; researcher
//     fills with provenance citation in a later cycle.
//
// Each price table has the same canonical row shape:
//   | Model | Tier | input_per_1m | output_per_1m | cached_input_per_1m |
//
// The parser extracts the markdown table by header signature, so future
// per-runtime authors can add columns at the right edge without breaking
// the consumer (forward-compatible).
//
// Fallback chain (mirrors tier-resolver D-04 spirit):
//   1. Runtime price table has the model row → use it.
//   2. Runtime price table missing OR model row missing → fall back to
//      claude.md and emit `cost_lookup_fallback` event (caller emits;
//      this module surfaces the fact via the return shape).
//   3. claude.md also missing the model → return null cost + reason.
//
// Pure module — no top-level side effects beyond the lazy cache. Never
// throws on missing/malformed price tables (returns null cost +
// diagnostic reason); throws ONLY on programmer errors (bad arg shapes).

'use strict';

const fs = require('node:fs');
const path = require('node:path');

const REPO_ROOT_GUESS = path.resolve(__dirname, '..', '..');
const DEFAULT_RUNTIME_ID = 'claude';
const VALID_TIERS = Object.freeze(['opus', 'sonnet', 'haiku']);

/**
 * Parsed price-row shape returned by `parsePriceTable`.
 * Numeric fields are USD per 1M tokens.
 *
 * @typedef {{
 *   model: string,
 *   tier: string,
 *   input_per_1m: number,
 *   output_per_1m: number,
 *   cached_input_per_1m: number,
 * }} PriceRow
 */

/**
 * In-memory cache of parsed price tables, keyed by runtime ID. `null`
 * means we tried and the file was missing/unparseable (so we don't
 * re-read the same broken file every spawn).
 */
const _cache = new Map();

/**
 * Reset the parsed-prices cache. Tests use this after writing fixture
 * price tables to a temp directory; production callers rarely need it.
 */
function reset() {
  _cache.clear();
}

/**
 * Compute the absolute path to `reference/prices/<runtime>.md`. Honors
 * the `cwd` option for test isolation — defaults to the repo root
 * derived from this module's filesystem location.
 *
 * @param {string} runtime
 * @param {{cwd?: string}} [opts]
 * @returns {string}
 */
function priceTablePath(runtime, opts) {
  const root = (opts && typeof opts.cwd === 'string' && opts.cwd.length > 0)
    ? opts.cwd
    : REPO_ROOT_GUESS;
  return path.join(root, 'reference', 'prices', `${runtime}.md`);
}

/**
 * Parse a markdown price table by locating the canonical header row and
 * scanning subsequent `|`-delimited rows until the table ends. The
 * header signature is the four required columns in order:
 *
 *   `| Model | Tier | input_per_1m | output_per_1m | cached_input_per_1m |`
 *
 * Extra columns at the right are ignored (forward-compatible). Rows
 * missing required columns or carrying placeholder TODO markers
 * (e.g. `<TODO>` in a numeric cell) are skipped silently — the caller
 * sees a null lookup for that model and falls back per the chain.
 *
 * @param {string} markdown
 * @returns {PriceRow[]}
 */
function parsePriceTable(markdown) {
  if (typeof markdown !== 'string' || markdown.length === 0) return [];

  const lines = markdown.split(/\r?\n/);
  const rows = [];

  // Locate header row by scanning for the canonical column signature.
  // We tolerate whitespace + casing variations on the header cells.
  const headerNeedles = ['model', 'tier', 'input_per_1m', 'output_per_1m', 'cached_input_per_1m'];
  let headerIdx = -1;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!/^\s*\|/.test(line)) continue;
    const cells = line.split('|').map((s) => s.trim().toLowerCase());
    let matched = 0;
    for (const needle of headerNeedles) {
      if (cells.includes(needle)) matched++;
    }
    if (matched === headerNeedles.length) {
      headerIdx = i;
      break;
    }
  }
  if (headerIdx < 0) return [];

  // Build the cell-index map from the header so column reorderings are
  // tolerated (a column-shuffle reorg is a docs PR not a logic break).
  const headerCells = lines[headerIdx].split('|').map((s) => s.trim().toLowerCase());
  const colIdx = {};
  for (const needle of headerNeedles) {
    colIdx[needle] = headerCells.indexOf(needle);
  }

  // Skip the separator row (e.g. `|---|---|...|`).
  let i = headerIdx + 1;
  if (i < lines.length && /^\s*\|[\s|:-]+\|\s*$/.test(lines[i])) i++;

  for (; i < lines.length; i++) {
    const line = lines[i];
    if (!/^\s*\|/.test(line)) break; // table ended
    const cells = line.split('|').map((s) => s.trim());
    // Pull required cells by header index.
    const model = cells[colIdx.model];
    const tier = cells[colIdx.tier];
    const input = Number(cells[colIdx.input_per_1m]);
    const output = Number(cells[colIdx.output_per_1m]);
    const cached = Number(cells[colIdx.cached_input_per_1m]);
    if (typeof model !== 'string' || model.length === 0) continue;
    // Skip TODO/placeholder rows where prices haven't been confirmed.
    if (
      !Number.isFinite(input) ||
      !Number.isFinite(output) ||
      !Number.isFinite(cached)
    ) {
      continue;
    }
    rows.push({
      model,
      tier: typeof tier === 'string' ? tier : 'unknown',
      input_per_1m: input,
      output_per_1m: output,
      cached_input_per_1m: cached,
    });
  }
  return rows;
}

/**
 * Load + cache the parsed price table for a runtime. Returns the empty
 * array (cached) if the file is missing or unparseable, so subsequent
 * calls don't re-read.
 *
 * @param {string} runtime
 * @param {{cwd?: string}} [opts]
 * @returns {PriceRow[]}
 */
function loadPriceTable(runtime, opts) {
  const key = `${runtime}:${(opts && opts.cwd) || ''}`;
  if (_cache.has(key)) return _cache.get(key);
  const fp = priceTablePath(runtime, opts);
  let rows = [];
  try {
    if (fs.existsSync(fp)) {
      const md = fs.readFileSync(fp, 'utf8');
      rows = parsePriceTable(md);
    }
  } catch {
    rows = [];
  }
  _cache.set(key, rows);
  return rows;
}

/**
 * Find a price row by model ID OR by tier name. Model-ID match takes
 * precedence (exact concrete-model lookup is the resolved_models path);
 * tier match is the back-compat fallback for callers that only know
 * the tier (legacy model_tier_overrides path).
 *
 * @param {PriceRow[]} rows
 * @param {{model_id?: string|null, tier?: string|null}} q
 * @returns {PriceRow | null}
 */
function findPriceRow(rows, q) {
  if (!Array.isArray(rows) || rows.length === 0) return null;
  const wantModel = q && typeof q.model_id === 'string' && q.model_id.length > 0
    ? q.model_id
    : null;
  const wantTier = q && typeof q.tier === 'string' && q.tier.length > 0
    ? q.tier
    : null;
  if (wantModel !== null) {
    for (const r of rows) {
      if (r.model === wantModel) return r;
    }
  }
  if (wantTier !== null) {
    for (const r of rows) {
      if (r.tier === wantTier) return r;
    }
  }
  return null;
}

/**
 * Apply the OPT-09 estimator formula to a price row + token counts.
 * Cache-hit input rows charge `cached_input_per_1m` instead of
 * `input_per_1m` (consistent with skills/router/SKILL.md D-08).
 *
 * @param {PriceRow} row
 * @param {{tokens_in: number, tokens_out: number, cache_hit?: boolean}} t
 * @returns {number} cost in USD
 */
function applyFormula(row, t) {
  const tokensIn = Math.max(0, Number(t.tokens_in || 0));
  const tokensOut = Math.max(0, Number(t.tokens_out || 0));
  const inputRate = t.cache_hit === true ? row.cached_input_per_1m : row.input_per_1m;
  return (
    (tokensIn / 1_000_000) * inputRate +
    (tokensOut / 1_000_000) * row.output_per_1m
  );
}

/**
 * Compute the USD cost for a spawn, given a concrete model identifier
 * (the resolved_models path) OR a tier name (the legacy fallback path)
 * plus token counts.
 *
 * Lookup order:
 *   1. The runtime's price table by model_id → use.
 *   2. The runtime's price table by tier → use.
 *   3. The claude price table by model_id → use (fallback).
 *   4. The claude price table by tier → use (fallback).
 *   5. Nothing matched → return { cost_usd: null, reason }.
 *
 * Never throws for missing files / missing rows. Returns `cost_usd: null`
 * + a diagnostic `reason` string the caller can emit on the event stream
 * (`cost_lookup_failed` event) or write into telemetry.
 *
 * @param {object} args
 * @param {string|null} [args.model_id]
 *   Concrete model name (e.g. 'gpt-5', 'claude-sonnet-4-7'). Preferred.
 * @param {string|null} [args.tier]
 *   Tier name ('opus'|'sonnet'|'haiku'). Used when model_id is absent.
 * @param {string} args.runtime
 *   Runtime ID ('claude', 'codex', 'gemini', …). Required.
 * @param {number} args.tokens_in
 * @param {number} args.tokens_out
 * @param {boolean} [args.cache_hit]
 * @param {object} [opts]
 * @param {string} [opts.cwd]
 *   Override repo root (tests).
 * @returns {{
 *   cost_usd: number|null,
 *   model: string|null,
 *   tier: string|null,
 *   runtime_used: string|null,
 *   fallback: boolean,
 *   reason: string|null,
 * }}
 */
function computeCost(args, opts) {
  if (!args || typeof args !== 'object') {
    return {
      cost_usd: null,
      model: null,
      tier: null,
      runtime_used: null,
      fallback: false,
      reason: 'invalid_args',
    };
  }
  const runtime = typeof args.runtime === 'string' && args.runtime.length > 0
    ? args.runtime
    : null;
  if (runtime === null) {
    return {
      cost_usd: null,
      model: null,
      tier: typeof args.tier === 'string' ? args.tier : null,
      runtime_used: null,
      fallback: false,
      reason: 'missing_runtime',
    };
  }

  const tokens = {
    tokens_in: Number(args.tokens_in || 0),
    tokens_out: Number(args.tokens_out || 0),
    cache_hit: args.cache_hit === true,
  };
  const q = {
    model_id: typeof args.model_id === 'string' && args.model_id.length > 0
      ? args.model_id
      : null,
    tier: typeof args.tier === 'string' && args.tier.length > 0
      ? args.tier
      : null,
  };

  // Branch 1+2: runtime price table.
  const rows = loadPriceTable(runtime, opts);
  const direct = findPriceRow(rows, q);
  if (direct !== null) {
    return {
      cost_usd: applyFormula(direct, tokens),
      model: direct.model,
      tier: direct.tier,
      runtime_used: runtime,
      fallback: false,
      reason: null,
    };
  }

  // Branch 3+4: claude fallback (only if not already querying claude).
  if (runtime !== DEFAULT_RUNTIME_ID) {
    const fallbackRows = loadPriceTable(DEFAULT_RUNTIME_ID, opts);
    const fb = findPriceRow(fallbackRows, q);
    if (fb !== null) {
      return {
        cost_usd: applyFormula(fb, tokens),
        model: fb.model,
        tier: fb.tier,
        runtime_used: DEFAULT_RUNTIME_ID,
        fallback: true,
        reason: rows.length === 0 ? 'runtime_table_missing' : 'model_not_in_runtime_table',
      };
    }
  }

  // Branch 5: nothing matched.
  return {
    cost_usd: null,
    model: null,
    tier: q.tier,
    runtime_used: null,
    fallback: false,
    reason: rows.length === 0 ? 'runtime_table_missing' : 'model_not_found',
  };
}

/**
 * Convenience: build a `cost_recorded` event payload (D-08 shape) from
 * a computeCost result + the spawn metadata. Returned object is the
 * `payload` field for `appendEvent({ type: 'cost_recorded', payload })`.
 * The .ts hook owns the actual `appendEvent()` call (it has the typed
 * event-stream import); .cjs callers (non-CC mirrors) compose this with
 * the JSONL line shape used in tier-resolver.cjs's `emitEvent()`.
 *
 * @param {object} args
 * @param {string} args.runtime
 * @param {string} args.agent
 * @param {string|null} args.model_id
 * @param {string|null} args.tier
 * @param {number} args.tokens_in
 * @param {number} args.tokens_out
 * @param {number|null} args.cost_usd
 * @returns {object}
 */
function buildCostEventPayload(args) {
  return {
    runtime: args.runtime,
    agent: args.agent,
    model_id: args.model_id,
    tier: args.tier,
    tokens_in: Number(args.tokens_in || 0),
    tokens_out: Number(args.tokens_out || 0),
    cost_usd: typeof args.cost_usd === 'number' && Number.isFinite(args.cost_usd)
      ? args.cost_usd
      : null,
  };
}

/**
 * Resolve a concrete model_id from the router's `resolved_models` map
 * for a given agent. Returns null when:
 *   - resolved_models is absent / not an object;
 *   - the agent key is missing;
 *   - the value is not a non-empty string.
 *
 * Hosts on the resolved_models consumer path (D-07): if this returns
 * non-null, the cost lookup goes through the per-runtime price table by
 * model_id; otherwise the caller falls back to the legacy
 * model_tier_overrides path.
 *
 * @param {unknown} resolvedModels
 * @param {string} agent
 * @returns {string|null}
 */
function modelFromResolved(resolvedModels, agent) {
  if (!resolvedModels || typeof resolvedModels !== 'object') return null;
  const v = resolvedModels[agent];
  if (typeof v === 'string' && v.length > 0) return v;
  return null;
}

module.exports = {
  computeCost,
  buildCostEventPayload,
  modelFromResolved,
  parsePriceTable,
  loadPriceTable,
  priceTablePath,
  reset,
  VALID_TIERS,
  DEFAULT_RUNTIME_ID,
  // surfaced for tests only — stable API = computeCost + modelFromResolved
  _internal: { findPriceRow, applyFormula },
};
