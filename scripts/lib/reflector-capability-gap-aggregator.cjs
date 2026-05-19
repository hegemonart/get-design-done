/**
 * reflector-capability-gap-aggregator.cjs — Plan 29-03.
 *
 * Aggregates `capability_gap` events (emitted by Plans 29-01 + 29-02) into
 * per-cycle cluster rollups and evaluates the Stage-0 → Stage-1 gate (D-01).
 *
 * Three exports:
 *
 *   aggregateCapabilityGaps(eventsOrPath, opts?)
 *     - Accepts an iterable of events OR a path string to a JSONL chain file.
 *     - Returns { clusters: Cluster[] } where each Cluster is:
 *         { id: string,                // first 12 chars of context_hash
 *           size: number,
 *           sources: { fast, router, reflector_pattern },
 *           examples: string[]         // up to 3 evidence_ref strings
 *         }
 *     - Filters to records where (record.type === 'capability_gap'
 *       OR record.outcome === 'capability_gap') AND payload.context_hash is
 *       a non-empty string. Other rows are ignored silently.
 *     - Clusters are ordered: size DESC, id ASC tie-break.
 *
 *   renderGapsSection(clusters)
 *     - Returns a markdown string. Empty list → '' (no section emitted).
 *     - Non-empty → '## Capability gaps observed' header + table.
 *
 *   evaluateStageGate(history, config)
 *     - history: [{ cycle_slug, clusters }] — at least 1 cycle.
 *     - config: { K, M, stddev_threshold }. Defaults: K=3, M=10, threshold=0.05.
 *     - Returns { crossed, stable_cluster_ids, cycles_observed }.
 *     - A cluster is "stable" iff: appears in ≥ M consecutive cycles AND
 *       posterior `stddev(Beta(α, β)) < threshold`, where
 *       α = appearances + 1, β = (cycles_observed - appearances) + 1
 *       (Laplace prior; matches Phase 23.5 posterior store).
 *     - D-01 honored: this function EMITS A DECISION ONLY. The caller
 *       prompts the user. No auto-stage-flip path exists in this module.
 *
 * D-11 compliance: this module is a pure reader. All tests use synthetic
 * fixtures (tests/reflector-capability-gap-aggregation.test.cjs).
 */

'use strict';

const { readFileSync, existsSync } = require('node:fs');

const DEFAULT_GATE_CONFIG = Object.freeze({
  K: 3,
  M: 10,
  stddev_threshold: 0.05,
});

const ALLOWED_SOURCES = ['fast', 'router', 'reflector_pattern'];

// ---------------------------------------------------------------------------
// Internal helpers

/**
 * Return a fresh source-count bucket.
 */
function emptySources() {
  return { fast: 0, router: 0, reflector_pattern: 0 };
}

/**
 * Iterate events from either an in-memory iterable or a JSONL path string.
 * Yields parsed records; invalid JSON lines are skipped silently (matches
 * `event-chain.cjs.readChain` and `event-stream/reader.ts.readEvents`).
 */
function* iterateRecords(eventsOrPath) {
  if (eventsOrPath == null) return;
  if (typeof eventsOrPath === 'string') {
    if (!existsSync(eventsOrPath)) return;
    const raw = readFileSync(eventsOrPath, 'utf8');
    for (const line of raw.split('\n')) {
      const trimmed = line.trim();
      if (trimmed === '') continue;
      try {
        yield JSON.parse(trimmed);
      } catch (_err) {
        // Malformed JSON — skip (matches existing readers' tolerance).
      }
    }
    return;
  }
  if (typeof eventsOrPath[Symbol.iterator] === 'function' ||
      typeof eventsOrPath[Symbol.asyncIterator] === 'function') {
    for (const rec of eventsOrPath) {
      if (rec != null) yield rec;
    }
    return;
  }
  // Unsupported input shape — yield nothing.
}

/**
 * Test whether a parsed record is a capability_gap event with a usable
 * context_hash. Either the envelope `type` OR the chain-level `outcome`
 * may carry the marker — `appendChainEvent` writes both.
 */
function isCapabilityGap(rec) {
  if (rec == null || typeof rec !== 'object') return false;
  const typeMatch = rec.type === 'capability_gap';
  const outcomeMatch = rec.outcome === 'capability_gap';
  if (!typeMatch && !outcomeMatch) return false;
  const ctxHash = rec.payload && rec.payload.context_hash;
  return typeof ctxHash === 'string' && ctxHash.length > 0;
}

/**
 * Stringify an evidence_ref entry for the markdown example column. If it's
 * already a string, return it; otherwise prefer `trajectory_path` and fall
 * back to a JSON.stringify so the test can still match.
 */
function refToExample(ref) {
  if (typeof ref === 'string') return ref;
  if (ref && typeof ref === 'object') {
    if (typeof ref.trajectory_path === 'string') return ref.trajectory_path;
    try { return JSON.stringify(ref); } catch (_e) { return '[ref]'; }
  }
  return String(ref);
}

/**
 * Closed-form posterior stddev of Beta(α, β):
 *   stddev = sqrt(αβ / ((α+β)^2 * (α+β+1)))
 * No external math dependency. α + β > 0 (Laplace prior guarantees this).
 */
function betaStddev(alpha, beta) {
  const sum = alpha + beta;
  if (sum <= 0) return Infinity;
  const variance = (alpha * beta) / (sum * sum * (sum + 1));
  return Math.sqrt(variance);
}

/**
 * Sanitize config — coerce to defaults if missing / invalid. Mirrors
 * the trust-boundary mitigation in 29-03-PLAN.md threat T-29.03-02.
 */
function normalizeConfig(input) {
  const out = { ...DEFAULT_GATE_CONFIG };
  if (!input || typeof input !== 'object') return out;
  if (Number.isInteger(input.K) && input.K > 0) out.K = input.K;
  if (Number.isInteger(input.M) && input.M > 0) out.M = input.M;
  if (typeof input.stddev_threshold === 'number'
      && Number.isFinite(input.stddev_threshold)
      && input.stddev_threshold > 0
      && input.stddev_threshold <= 1) {
    out.stddev_threshold = input.stddev_threshold;
  }
  return out;
}

// ---------------------------------------------------------------------------
// Public API

/**
 * Aggregate capability_gap events into per-context_hash clusters.
 *
 * @param {Iterable<object> | string} eventsOrPath
 * @param {{ exampleLimit?: number }} [opts]
 * @returns {{ clusters: Array<{ id: string, size: number, sources: {fast:number,router:number,reflector_pattern:number}, examples: string[] }> }}
 */
function aggregateCapabilityGaps(eventsOrPath, opts = {}) {
  const exampleLimit = Number.isInteger(opts.exampleLimit) && opts.exampleLimit > 0
    ? opts.exampleLimit : 3;

  /** @type {Map<string, { id: string, size: number, sources: object, examples: string[], _hash: string }>} */
  const byHash = new Map();

  for (const rec of iterateRecords(eventsOrPath)) {
    if (!isCapabilityGap(rec)) continue;
    const payload = rec.payload;
    const fullHash = payload.context_hash;
    const id = fullHash.slice(0, 12);
    let cluster = byHash.get(fullHash);
    if (!cluster) {
      cluster = { id, size: 0, sources: emptySources(), examples: [], _hash: fullHash };
      byHash.set(fullHash, cluster);
    }
    cluster.size += 1;
    const src = payload.source;
    if (ALLOWED_SOURCES.includes(src)) {
      cluster.sources[src] += 1;
    }
    if (Array.isArray(payload.evidence_refs)) {
      for (const ref of payload.evidence_refs) {
        if (cluster.examples.length >= exampleLimit) break;
        cluster.examples.push(refToExample(ref));
      }
    }
  }

  const clusters = Array.from(byHash.values());
  clusters.sort((a, b) => {
    if (b.size !== a.size) return b.size - a.size;
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });
  // Strip internal full-hash field from output (not part of public Cluster shape).
  for (const c of clusters) delete c._hash;
  return { clusters };
}

/**
 * Render the markdown section appended to a reflector cycle file.
 * Returns '' when clusters is empty — caller appends unconditionally.
 *
 * @param {Array} clusters
 * @returns {string}
 */
function renderGapsSection(clusters) {
  if (!Array.isArray(clusters) || clusters.length === 0) return '';
  const lines = [];
  lines.push('## Capability gaps observed');
  lines.push('');
  lines.push('| Cluster | Size | fast | router | reflector_pattern | Example evidence |');
  lines.push('|---|---|---|---|---|---|');
  for (const c of clusters) {
    const examples = (c.examples || [])
      .slice(0, 3)
      .map((e) => '`' + e + '`')
      .join(', ');
    lines.push(
      `| \`${c.id}\` | ${c.size} | ${c.sources.fast || 0} | ${c.sources.router || 0} | ${c.sources.reflector_pattern || 0} | ${examples} |`,
    );
  }
  lines.push('');
  return lines.join('\n');
}

/**
 * Evaluate the Stage-0 → Stage-1 gate per D-01 + D-03.
 *
 * @param {Array<{ cycle_slug: string, clusters: Array }>} history
 * @param {{ K?: number, M?: number, stddev_threshold?: number }} [config]
 * @returns {{ crossed: boolean, stable_cluster_ids: string[], cycles_observed: number }}
 */
function evaluateStageGate(history, config) {
  const cfg = normalizeConfig(config);
  if (!Array.isArray(history)) {
    return { crossed: false, stable_cluster_ids: [], cycles_observed: 0 };
  }

  const cycles_observed = history.length;

  // Need at least M cycles observed before we can evaluate stability.
  if (cycles_observed < cfg.M) {
    return { crossed: false, stable_cluster_ids: [], cycles_observed };
  }

  // Stability checks per D-03:
  //   1. Consecutive-presence: cluster appears in M consecutive cycles
  //      (the most recent run is the most reliable signal of "still here").
  //   2. Posterior stddev: Beta(α, β) with α = appearances + 1,
  //      β = (cycles_observed - appearances) + 1 — Laplace prior matches
  //      Phase 23.5's bandit-router posterior store.
  //
  // Appearance counts use the FULL history (cycles_observed = history.length)
  // so a cluster that has been present for many cycles accumulates evidence,
  // even if it occasionally missed a cycle. The consecutive-presence check
  // uses only the most recent run length (must be ≥ M).

  /** @type {Map<string, number>} appearances across full history */
  const appearances = new Map();
  /** @type {Map<string, number>} most recent consecutive-presence run */
  const currentRun = new Map();
  /** @type {Map<string, number>} longest consecutive-presence run seen */
  const maxConsecutive = new Map();

  for (const cycle of history) {
    const presentThisCycle = new Set();
    if (Array.isArray(cycle.clusters)) {
      for (const c of cycle.clusters) {
        if (c && typeof c.id === 'string') {
          presentThisCycle.add(c.id);
        }
      }
    }
    // Update appearance counts + consecutive runs for every id we've
    // seen so far OR seen this cycle.
    const allIds = new Set([...currentRun.keys(), ...presentThisCycle]);
    for (const id of allIds) {
      if (presentThisCycle.has(id)) {
        appearances.set(id, (appearances.get(id) || 0) + 1);
        const run = (currentRun.get(id) || 0) + 1;
        currentRun.set(id, run);
        if (run > (maxConsecutive.get(id) || 0)) {
          maxConsecutive.set(id, run);
        }
      } else {
        // Cluster missed this cycle — reset current run; max already captured.
        currentRun.set(id, 0);
      }
    }
  }

  const stable_cluster_ids = [];
  for (const [id, appCount] of appearances.entries()) {
    const maxRun = maxConsecutive.get(id) || 0;
    if (maxRun < cfg.M) continue; // must appear in M consecutive cycles
    // Laplace prior (Phase 23.5): α = appearances+1, β = (cycles-appearances)+1
    const alpha = appCount + 1;
    const beta = (cycles_observed - appCount) + 1;
    const sd = betaStddev(alpha, beta);
    if (sd < cfg.stddev_threshold) {
      stable_cluster_ids.push(id);
    }
  }

  stable_cluster_ids.sort();
  const crossed = stable_cluster_ids.length >= cfg.K;
  return { crossed, stable_cluster_ids, cycles_observed };
}

module.exports = {
  aggregateCapabilityGaps,
  renderGapsSection,
  evaluateStageGate,
  // Exported for testing / introspection only:
  _betaStddev: betaStddev,
  _DEFAULT_GATE_CONFIG: DEFAULT_GATE_CONFIG,
};
