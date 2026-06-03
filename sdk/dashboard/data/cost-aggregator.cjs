'use strict';
/**
 * sdk/dashboard/data/cost-aggregator.cjs — Phase 55 (GDD Dashboard, dep-free).
 *
 * Pure roll-up of cost events into per-runtime / cumulative / per-cycle
 * buckets, plus a tolerant JSONL reader for `.design/telemetry/costs.jsonl`.
 *
 * Cost rows on disk have evolved across phases (Phase 10.1 -> 26 -> 27 -> 33.6),
 * so this aggregator is deliberately field-shape tolerant:
 *
 *   - cost field:    `est_cost_usd` (the on-disk tier-resolver/budget-enforcer
 *                    shape) OR `cost_usd` (the newer event-payload shape).
 *   - runtime key:   `runtime` (Phase 27+) -> else `tier` -> else `agent`
 *                    -> else "unknown". Grouping is best-effort: the dashboard
 *                    just needs a stable label per row.
 *   - cycle key:     `cycle` -> else "unknown".
 *   - tokens:        `tokens_in` / `tokens_out`, coerced via Number(... || 0).
 *
 * NEVER throws. Pure (no FS) except `readCosts()`, which reads one file and
 * tolerates malformed lines (skips them silently, like the event-stream reader).
 *
 * Public API:
 *   aggregateCosts(costEvents) -> { byRuntime, cumulative, byCycle }
 *   readCosts({ root?, path? }) -> cost row array (tolerant; [] when absent)
 *
 * Determinism: no Date.now()/Math.random(); output ordering follows input
 * ordering of first-seen keys (object insertion order).
 */

const fs = require('node:fs');
const path = require('node:path');

const DEFAULT_COSTS_PATH = '.design/telemetry/costs.jsonl';

/**
 * Coerce a possibly-missing numeric field to a finite number (0 on garbage).
 * @param {unknown} v
 * @returns {number}
 */
function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

/**
 * Read the per-runtime label for a cost row. Prefers the explicit `runtime`
 * tag (Phase 27+), then `tier`, then `agent`, then a literal "unknown".
 * @param {Record<string, unknown>} row
 * @returns {string}
 */
function runtimeKeyOf(row) {
  if (row && typeof row.runtime === 'string' && row.runtime.length) return row.runtime;
  if (row && typeof row.tier === 'string' && row.tier.length) return row.tier;
  if (row && typeof row.agent === 'string' && row.agent.length) return row.agent;
  return 'unknown';
}

/**
 * Read the USD cost for a row, tolerant of both on-disk shapes.
 * @param {Record<string, unknown>} row
 * @returns {number}
 */
function costUsdOf(row) {
  if (!row) return 0;
  if (typeof row.est_cost_usd !== 'undefined') return num(row.est_cost_usd);
  if (typeof row.cost_usd !== 'undefined') return num(row.cost_usd);
  if (typeof row.usd !== 'undefined') return num(row.usd);
  return 0;
}

/**
 * Read the cycle label for a row.
 * @param {Record<string, unknown>} row
 * @returns {string}
 */
function cycleKeyOf(row) {
  if (row && typeof row.cycle === 'string' && row.cycle.length) return row.cycle;
  if (row && typeof row.cycle === 'number') return String(row.cycle);
  return 'unknown';
}

/** Fresh zeroed accumulator bucket. */
function emptyBucket() {
  return { tokens_in: 0, tokens_out: 0, est_cost_usd: 0 };
}

/**
 * Add one row's measures into an accumulator bucket (mutates `bucket`).
 * @param {{tokens_in:number,tokens_out:number,est_cost_usd:number}} bucket
 * @param {Record<string, unknown>} row
 */
function addInto(bucket, row) {
  bucket.tokens_in += num(row.tokens_in);
  bucket.tokens_out += num(row.tokens_out);
  bucket.est_cost_usd += costUsdOf(row);
}

/**
 * Aggregate an array (or any iterable) of cost rows into per-runtime,
 * cumulative, and per-cycle roll-ups. Pure — never throws, never reads FS.
 *
 * Non-array / nullish input degrades to empty buckets.
 *
 * @param {Iterable<Record<string, unknown>> | null | undefined} costEvents
 * @returns {{
 *   byRuntime: Record<string, {tokens_in:number,tokens_out:number,est_cost_usd:number}>,
 *   cumulative: {tokens_in:number,tokens_out:number,est_cost_usd:number},
 *   byCycle: Record<string, {tokens_in:number,tokens_out:number,est_cost_usd:number}>,
 * }}
 */
function aggregateCosts(costEvents) {
  /** @type {Record<string, ReturnType<typeof emptyBucket>>} */
  const byRuntime = {};
  /** @type {Record<string, ReturnType<typeof emptyBucket>>} */
  const byCycle = {};
  const cumulative = emptyBucket();

  if (!costEvents || typeof costEvents[Symbol.iterator] !== 'function') {
    return { byRuntime, cumulative, byCycle };
  }

  for (const row of costEvents) {
    if (!row || typeof row !== 'object') continue;
    const rt = runtimeKeyOf(row);
    const cy = cycleKeyOf(row);
    if (!byRuntime[rt]) byRuntime[rt] = emptyBucket();
    if (!byCycle[cy]) byCycle[cy] = emptyBucket();
    addInto(byRuntime[rt], row);
    addInto(byCycle[cy], row);
    addInto(cumulative, row);
  }

  return { byRuntime, cumulative, byCycle };
}

/**
 * Resolve the costs.jsonl path: explicit `path` wins (absolute or relative to
 * cwd); else `<root>/.design/telemetry/costs.jsonl`; else cwd-relative default.
 * @param {{root?: string, path?: string}} [opts]
 * @returns {string}
 */
function costsPathFor(opts = {}) {
  if (opts.path) {
    return path.isAbsolute(opts.path) ? opts.path : path.resolve(process.cwd(), opts.path);
  }
  const root = opts.root || process.cwd();
  return path.join(root, DEFAULT_COSTS_PATH);
}

/**
 * Read + parse `.design/telemetry/costs.jsonl` into a cost-row array.
 *
 * Tolerant: a missing file returns []; malformed JSON lines are skipped
 * silently (the writer guarantees well-formed output, so a bad line is a
 * corruption signal that must not crash a read-only dashboard). NEVER throws.
 *
 * @param {{root?: string, path?: string}} [opts]
 * @returns {Array<Record<string, unknown>>}
 */
function readCosts(opts = {}) {
  const file = costsPathFor(opts);
  let raw;
  try {
    raw = fs.readFileSync(file, 'utf8');
  } catch {
    return []; // absent / unreadable -> graceful empty
  }
  const out = [];
  for (const line of raw.split('\n')) {
    const trimmed = line.trim();
    if (trimmed === '') continue;
    try {
      const parsed = JSON.parse(trimmed);
      if (parsed && typeof parsed === 'object') out.push(parsed);
    } catch {
      // tolerate a malformed line — skip it, keep reading
    }
  }
  return out;
}

module.exports = {
  aggregateCosts,
  readCosts,
  costsPathFor,
  DEFAULT_COSTS_PATH,
};
