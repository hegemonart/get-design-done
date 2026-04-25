/**
 * touches-analyzer/index.cjs — parse `Touches:` lines from task markdown
 * and produce a pairwise parallelism verdict (Plan 23-03).
 *
 * Encodes the prompt-only heuristic from `reference/parallelism-rules.md`
 * into auditable code. Used by /gdd:plan and /gdd:execute to decide
 * which tasks can run concurrently in a wave.
 *
 * Verdict rules (first match wins):
 *   1. empty globs            → sequential, 'unknown-touches'
 *   2. literal glob equality  → sequential, 'shared-glob'
 *   3. shared component dir   → sequential, 'shared-component-dir'
 *   4. resolved-file overlap  → sequential, 'shared-file'
 *   5. otherwise              → parallel, 'disjoint'
 *
 * No external deps. Designed to be required from CommonJS callers.
 */

'use strict';

const { readFileSync } = require('node:fs');
const path = require('node:path');

const TOUCHES_RE = /^[ \t]{0,4}Touches:\s*(.+?)\s*$/gm;

/**
 * Normalise a glob/path: convert `\\` → `/`, lowercase for case-insensitive
 * comparison. Returned strings are used as map keys.
 *
 * @param {string} g
 * @returns {string}
 */
function normalize(g) {
  return g.replace(/\\/g, '/').toLowerCase();
}

/**
 * Extract `Touches:` lines from markdown.
 *
 * @param {string} markdown
 * @returns {string[]} globs in declaration order, deduped (case-insensitive)
 */
function parseTouches(markdown) {
  if (typeof markdown !== 'string' || markdown.length === 0) return [];
  const out = [];
  const seen = new Set();
  TOUCHES_RE.lastIndex = 0;
  let m;
  while ((m = TOUCHES_RE.exec(markdown)) !== null) {
    const body = m[1];
    for (const raw of body.split(',')) {
      const trimmed = raw.trim();
      if (trimmed.length === 0) continue;
      const key = normalize(trimmed);
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(trimmed);
    }
  }
  return out;
}

/**
 * Parse a task markdown file by path.
 *
 * @param {string} filePath
 * @returns {{taskId: string, globs: string[]}}
 */
function parseTouchesFile(filePath) {
  const md = readFileSync(filePath, 'utf8');
  const base = path.basename(filePath).replace(/\.md$/i, '');
  return { taskId: base, globs: parseTouches(md) };
}

/**
 * Compute the directory prefix for a glob at `componentDepth - 1` segments.
 * Returns null when the glob's first segment is `**` or contains `..` (no
 * meaningful prefix).
 *
 * @param {string} glob
 * @param {number} componentDepth
 * @returns {string|null}
 */
function componentDirPrefix(glob, componentDepth) {
  const norm = glob.replace(/\\/g, '/');
  if (norm.startsWith('..') || norm.startsWith('**')) return null;
  // Strip leading './'.
  const cleaned = norm.startsWith('./') ? norm.slice(2) : norm;
  const segments = cleaned.split('/');
  const wanted = Math.max(0, componentDepth - 1);
  if (segments.length < wanted) return null;
  const prefixSegs = segments.slice(0, wanted);
  // The prefix must contain at least one *literal* (no `**`) segment.
  const hasLiteral = prefixSegs.some((s) => s.length > 0 && s !== '**');
  if (!hasLiteral) return null;
  return prefixSegs.join('/').toLowerCase();
}

/**
 * @typedef {Object} TouchesEntry
 * @property {string} taskId
 * @property {string[]} globs
 * @property {string[]} [resolved]
 */

/**
 * @typedef {Object} Verdict
 * @property {'parallel'|'sequential'} verdict
 * @property {string} reason
 * @property {string[]} [evidence]
 */

/**
 * Pairwise verdict.
 *
 * @param {TouchesEntry} a
 * @param {TouchesEntry} b
 * @param {{componentDepth?: number}} [opts]
 * @returns {Verdict}
 */
function pairwiseVerdict(a, b, opts = {}) {
  const componentDepth = opts.componentDepth ?? 3;
  if (!a || !b || !Array.isArray(a.globs) || !Array.isArray(b.globs)) {
    return { verdict: 'sequential', reason: 'unknown-touches' };
  }
  if (a.globs.length === 0 || b.globs.length === 0) {
    return { verdict: 'sequential', reason: 'unknown-touches' };
  }
  // Rule 2: literal glob equality (case-insensitive).
  const aSet = new Set(a.globs.map(normalize));
  for (const bg of b.globs) {
    if (aSet.has(normalize(bg))) {
      return { verdict: 'sequential', reason: 'shared-glob', evidence: [bg] };
    }
  }
  // Rule 3: shared component directory.
  const aPrefixes = new Set(
    a.globs.map((g) => componentDirPrefix(g, componentDepth)).filter((p) => p !== null),
  );
  const sharedPrefixes = [];
  for (const bg of b.globs) {
    const pfx = componentDirPrefix(bg, componentDepth);
    if (pfx !== null && aPrefixes.has(pfx)) sharedPrefixes.push(pfx);
  }
  if (sharedPrefixes.length > 0) {
    return {
      verdict: 'sequential',
      reason: 'shared-component-dir',
      evidence: Array.from(new Set(sharedPrefixes)),
    };
  }
  // Rule 4: resolved file intersection.
  if (Array.isArray(a.resolved) && Array.isArray(b.resolved)) {
    const aFiles = new Set(a.resolved.map(normalize));
    const overlap = [];
    for (const bf of b.resolved) {
      if (aFiles.has(normalize(bf))) overlap.push(bf);
    }
    if (overlap.length > 0) {
      return { verdict: 'sequential', reason: 'shared-file', evidence: overlap };
    }
  }
  return { verdict: 'parallel', reason: 'disjoint' };
}

/**
 * Build the upper-triangular N×N verdict table.
 *
 * @param {TouchesEntry[]} entries
 * @param {{componentDepth?: number}} [opts]
 * @returns {Array<{a: string, b: string, verdict: string, reason: string, evidence?: string[]}>}
 */
function verdictMatrix(entries, opts = {}) {
  if (!Array.isArray(entries)) {
    throw new TypeError('verdictMatrix: entries must be an array');
  }
  const out = [];
  for (let i = 0; i < entries.length; i++) {
    for (let j = i + 1; j < entries.length; j++) {
      const v = pairwiseVerdict(entries[i], entries[j], opts);
      const row = {
        a: entries[i].taskId,
        b: entries[j].taskId,
        verdict: v.verdict,
        reason: v.reason,
      };
      if (v.evidence) row.evidence = v.evidence;
      out.push(row);
    }
  }
  return out;
}

module.exports = {
  parseTouches,
  parseTouchesFile,
  pairwiseVerdict,
  verdictMatrix,
  componentDirPrefix,
  normalize,
};
