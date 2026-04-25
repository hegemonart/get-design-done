/**
 * audit-aggregator/index.cjs — dedup + score + rank findings from N
 * audit-agents (Plan 23-04).
 *
 * Replaces the prompt-only "trust the agent's score" pattern with a
 * deterministic scoring + dedup function that downstream tooling
 * (`/gdd:audit`, `/gdd:reflect`) can rely on.
 *
 * Dedup key: `${lowercased(normalizePath(file))}::${line ?? 0}::${rule_id}`.
 * Survivor selection on collision:
 *   1. higher confidence wins
 *   2. tie → higher severity (P0 > P1 > P2 > P3)
 *   3. tie → lexicographically earliest agent
 *   4. tie → first-seen
 *
 * Score = severityWeight(severity) * confidence.
 *
 * No external deps. CommonJS to match the rest of scripts/lib/.
 */

'use strict';

const SEVERITY_RANK = { P0: 4, P1: 3, P2: 2, P3: 1 };
const DEFAULT_WEIGHTS = Object.freeze({ P0: 8, P1: 4, P2: 2, P3: 1 });

/**
 * @typedef {Object} Finding
 * @property {string} file
 * @property {number} [line]
 * @property {string} rule_id
 * @property {'P0'|'P1'|'P2'|'P3'} severity
 * @property {string} summary
 * @property {string} [evidence]
 * @property {string} [agent]
 * @property {number} [confidence]
 * @property {string[]} [merged_from]
 */

/**
 * @typedef {Object} AggregateResult
 * @property {Finding[]} findings
 * @property {Object<string, number>} byRule
 * @property {Object<string, number>} bySeverity
 * @property {Object<string, number>} byFile
 * @property {number} total
 * @property {number} duplicates
 */

/**
 * @typedef {Object} AggregateOptions
 * @property {number} [topN]
 * @property {Object<string, number>} [severityWeights]
 * @property {(a: Finding, b: Finding) => Finding} [merge]
 */

function normalizePath(p) {
  return String(p).replace(/\\/g, '/').toLowerCase();
}

let _confidenceWarningEmitted = false;

function clampConfidence(c) {
  if (c === undefined || c === null) return 1;
  if (typeof c !== 'number' || Number.isNaN(c)) return 1;
  if (c < 0) {
    if (!_confidenceWarningEmitted) {
      process.emitWarning('audit-aggregator: confidence < 0 clamped to 0', 'AuditAggregator');
      _confidenceWarningEmitted = true;
    }
    return 0;
  }
  if (c > 1) {
    if (!_confidenceWarningEmitted) {
      process.emitWarning('audit-aggregator: confidence > 1 clamped to 1', 'AuditAggregator');
      _confidenceWarningEmitted = true;
    }
    return 1;
  }
  return c;
}

/**
 * Compute score for a finding.
 *
 * @param {Finding} f
 * @param {Object<string, number>} weights
 * @returns {number}
 */
function score(f, weights) {
  const w = (weights && weights[f.severity]) ?? DEFAULT_WEIGHTS[f.severity] ?? 0;
  return w * clampConfidence(f.confidence);
}

function validateFinding(f, idx) {
  if (!f || typeof f !== 'object') {
    throw new TypeError(`audit-aggregator: input[${idx}] is not an object`);
  }
  if (typeof f.file !== 'string' || f.file.length === 0) {
    throw new TypeError(`audit-aggregator: input[${idx}].file is required (non-empty string)`);
  }
  if (typeof f.rule_id !== 'string' || f.rule_id.length === 0) {
    throw new TypeError(`audit-aggregator: input[${idx}].rule_id is required (non-empty string)`);
  }
  if (!(f.severity in SEVERITY_RANK)) {
    throw new TypeError(
      `audit-aggregator: input[${idx}].severity must be P0|P1|P2|P3 (got ${JSON.stringify(f.severity)})`,
    );
  }
}

function dedupKey(f) {
  return `${normalizePath(f.file)}::${f.line ?? 0}::${f.rule_id}`;
}

function defaultMerge(a, b) {
  // Higher confidence wins.
  const ca = clampConfidence(a.confidence);
  const cb = clampConfidence(b.confidence);
  if (ca !== cb) return ca > cb ? a : b;
  // Higher severity wins.
  const ra = SEVERITY_RANK[a.severity];
  const rb = SEVERITY_RANK[b.severity];
  if (ra !== rb) return ra > rb ? a : b;
  // Lexicographic agent.
  const aa = a.agent ?? '';
  const ab = b.agent ?? '';
  if (aa !== ab) return aa < ab ? a : b;
  // First-seen wins (a is by convention the existing entry).
  return a;
}

/**
 * Aggregate findings.
 *
 * @param {Finding[]} input
 * @param {AggregateOptions} [opts]
 * @returns {AggregateResult}
 */
function aggregate(input, opts = {}) {
  if (!Array.isArray(input)) {
    throw new TypeError('audit-aggregator: input must be an array');
  }
  // Reset the once-per-call warning flag so a second call can warn again.
  _confidenceWarningEmitted = false;
  const merge = typeof opts.merge === 'function' ? opts.merge : defaultMerge;
  const weights = { ...DEFAULT_WEIGHTS, ...(opts.severityWeights || {}) };

  /** @type {Map<string, Finding>} */
  const byKey = new Map();
  let duplicates = 0;
  for (let i = 0; i < input.length; i++) {
    validateFinding(input[i], i);
    const f = { ...input[i] };
    const key = dedupKey(f);
    if (byKey.has(key)) {
      duplicates += 1;
      const existing = byKey.get(key);
      const winner = merge(existing, f);
      const loser = winner === existing ? f : existing;
      const mergedFrom = new Set(winner.merged_from || []);
      if (existing.agent && existing !== winner) mergedFrom.add(existing.agent);
      if (loser.agent && loser !== winner) mergedFrom.add(loser.agent);
      // Combine prior merged_from too.
      for (const a of (loser.merged_from || [])) mergedFrom.add(a);
      winner.merged_from = Array.from(mergedFrom);
      byKey.set(key, winner);
    } else {
      byKey.set(key, f);
    }
  }

  const findings = Array.from(byKey.values()).map((f) => ({ ...f, _score: score(f, weights) }));
  findings.sort((a, b) => {
    if (a._score !== b._score) return b._score - a._score;
    const ra = SEVERITY_RANK[a.severity];
    const rb = SEVERITY_RANK[b.severity];
    if (ra !== rb) return rb - ra;
    if (a.file !== b.file) return a.file < b.file ? -1 : 1;
    return (a.line ?? 0) - (b.line ?? 0);
  });
  // Strip the internal _score field before returning.
  for (const f of findings) delete f._score;

  const truncated = typeof opts.topN === 'number' && opts.topN >= 0
    ? findings.slice(0, opts.topN)
    : findings;

  /** @type {Record<string, number>} */
  const byRule = {};
  /** @type {Record<string, number>} */
  const bySeverity = { P0: 0, P1: 0, P2: 0, P3: 0 };
  /** @type {Record<string, number>} */
  const byFile = {};
  for (const f of truncated) {
    byRule[f.rule_id] = (byRule[f.rule_id] ?? 0) + 1;
    bySeverity[f.severity] += 1;
    const k = normalizePath(f.file);
    byFile[k] = (byFile[k] ?? 0) + 1;
  }

  return {
    findings: truncated,
    byRule,
    bySeverity,
    byFile,
    total: truncated.length,
    duplicates,
  };
}

module.exports = {
  aggregate,
  score,
  normalizePath,
  dedupKey,
  defaultMerge,
  DEFAULT_WEIGHTS,
  SEVERITY_RANK,
};
