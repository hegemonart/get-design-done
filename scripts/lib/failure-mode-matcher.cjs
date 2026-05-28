/**
 * scripts/lib/failure-mode-matcher.cjs — Plan 30.5-02
 *
 * Fuzzy bag-of-words matcher for the known-failure-modes catalogue.
 * Additive sibling to Phase 30's exact-match `triage-matcher.cjs`
 * (D-04 — that file MUST remain byte-identical to its HEAD state and
 * is guarded by `tests/failure-mode-matcher.test.cjs` case 13).
 *
 *   match(errorContext, options) → [
 *     { modeId, confidence, symptom?, root_cause?, fix?, severity?,
 *       propose_report?, related_phases?, diagnosis?, remedy? },
 *     ...
 *   ]
 *
 * Inputs:
 *   - errorContext.message: string  (error.message)
 *   - errorContext.stack:   string  (optional)
 *   - options.topN:         number  (default 3, per D-08)
 *   - options.threshold:    number  (default 0.4, per D-07)
 *   - options.cataloguePath: string (override; default points at
 *                                    `reference/known-failure-modes.md`)
 *
 * Pipeline:
 *   1. Parse catalogue (yaml-in-markdown), skip entries that fail validation.
 *   2. Tokenize haystack (`message + stack`) and each entry's bag
 *      (`symptom + root_cause + un-regexed pattern`, with old-shape
 *       `diagnosis + remedy` fallback for backward-compat).
 *   3. Score with cosine similarity over term-frequency vectors.
 *   4. Drop entries below threshold; sort by [score DESC, modeId ASC];
 *      slice to topN.
 *   5. Apply top-1 dominance: if top1 − top2 ≥ 0.15, collapse to [top1].
 *
 * Determinism contract (D-07):
 *   - No Math.random, no Date.now, no I/O outside the cataloguePath read.
 *   - Object iteration is always over sorted keys.
 *   - Result ordering ties are broken by modeId ASC.
 *   - JSON.stringify(match(x, o)) is identical across invocations
 *     when (x, o, catalogue file bytes) are identical (test case 12).
 *
 * D-10: tests use synthetic fixtures under `tests/fixtures/failure-mode-matcher/`.
 *
 * Pure CommonJS, zero npm dependencies.
 */

'use strict';

const fs = require('node:fs');
const path = require('node:path');

// -------------------------------------------------------------------
// Constants
// -------------------------------------------------------------------

const DEFAULT_TOP_N = 3;            // D-08
const DEFAULT_THRESHOLD = 0.4;      // D-07
const DOMINANCE_DELTA = 0.15;       // D-08 collapse threshold
const MIN_TOKEN_LEN = 3;
const SEVERITIES = new Set(['low', 'medium', 'high', 'critical']);

// Inline stop-word set — kept small for determinism + audit reviewability.
const STOP_WORDS = new Set([
  'the', 'a', 'an', 'is', 'in', 'of', 'to', 'for', 'on', 'at',
  'by', 'with', 'and', 'or', 'but', 'as', 'if', 'it', 'its',
  'this', 'that', 'from', 'be', 'are',
]);

// Strips backslashes and regex operator characters so a pattern string
// reduces to a recoverable keyword bag.
const REGEX_OPERATORS = /[\\\[\]{}()|^$.*+?]/g;

// -------------------------------------------------------------------
// Path resolution
// -------------------------------------------------------------------

function findRepoRoot() {
  let dir = __dirname;
  for (let i = 0; i < 12; i++) {
    if (fs.existsSync(path.join(dir, 'package.json'))) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return path.resolve(__dirname, '..', '..');
}

const DEFAULT_CATALOGUE_PATH = path.join(
  findRepoRoot(),
  'reference',
  'known-failure-modes.md'
);

// -------------------------------------------------------------------
// Tokenizer
// -------------------------------------------------------------------

/**
 * Lowercase → split on non-word characters → drop stop-words → drop short tokens.
 * Pure-functional; never throws on non-string input (returns []).
 *
 * @param {string | undefined | null} s
 * @returns {string[]}
 */
function tokenize(s) {
  if (typeof s !== 'string' || s.length === 0) return [];
  const out = [];
  const parts = s.toLowerCase().split(/\W+/);
  for (const t of parts) {
    if (!t || t.length < MIN_TOKEN_LEN) continue;
    if (STOP_WORDS.has(t)) continue;
    out.push(t);
  }
  return out;
}

/**
 * Strip backslashes + regex operator chars to recover keywords from a pattern.
 * Returns a whitespace-normalised string suitable for tokenize().
 *
 * @param {string | undefined} pattern
 * @returns {string}
 */
function unregexPattern(pattern) {
  if (typeof pattern !== 'string' || pattern.length === 0) return '';
  return pattern.replace(REGEX_OPERATORS, ' ');
}

// -------------------------------------------------------------------
// Catalogue parser (yaml-in-markdown)
//
// Mirrors the shape used by triage-matcher.cjs but is intentionally a
// separate implementation — D-04 forbids modifying the Phase 30 parser
// or coupling this module to it.
// -------------------------------------------------------------------

/**
 * Extract fenced ```yaml blocks and parse each as a flat key:value map.
 * Entries that fail validation (regex compile, missing required fields)
 * are skipped with a one-line console.warn and never thrown.
 *
 * @param {string} markdown
 * @returns {Array<object>}
 */
function parseEntries(markdown) {
  const out = [];
  const blockRe = /```yaml\s*\n([\s\S]*?)\n```/g;
  let m;
  while ((m = blockRe.exec(markdown)) !== null) {
    const body = m[1];
    /** @type {Record<string,string>} */
    const fields = {};
    /** @type {Record<string,string[]>} */
    const arrayFields = {};

    for (const rawLine of body.split(/\r?\n/)) {
      const line = rawLine.replace(/\s+$/, '');
      if (!line) continue;
      // Array-shorthand `[a, b, c]`
      const arrMatch = line.match(
        /^\s*([A-Za-z_][\w-]*)\s*:\s*\[(.*)\]\s*$/
      );
      if (arrMatch) {
        const items = arrMatch[2]
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean)
          .map((s) => {
            if (
              (s.startsWith("'") && s.endsWith("'")) ||
              (s.startsWith('"') && s.endsWith('"'))
            ) {
              return s.slice(1, -1);
            }
            return s;
          });
        arrayFields[arrMatch[1]] = items;
        continue;
      }
      const kv = line.match(/^\s*([A-Za-z_][\w-]*)\s*:\s*(.*?)\s*$/);
      if (!kv) continue;
      let v = kv[2];
      if (
        (v.startsWith("'") && v.endsWith("'")) ||
        (v.startsWith('"') && v.endsWith('"'))
      ) {
        v = v.slice(1, -1);
        v = v.replace(/''/g, "'");
      }
      fields[kv[1]] = v;
    }

    // Minimum viable entry: id + pattern + (one of symptom|diagnosis).
    if (!fields.id || !fields.pattern) continue;
    const hasNewShape =
      fields.symptom || fields.root_cause || fields.fix;
    const hasOldShape = fields.diagnosis || fields.remedy;
    if (!hasNewShape && !hasOldShape) continue;

    // Validate regex (skip-on-error per D-04 parity with Phase 30 matcher).
    try {
      // We don't store the RegExp — the fuzzy matcher does NOT regex-test
      // the haystack; this compile is purely a sanity check so malformed
      // entries are filtered out before scoring.
      // eslint-disable-next-line no-new
      new RegExp(fields.pattern);
    } catch (e) {
      console.warn(
        `[failure-mode-matcher] skip ${fields.id}: invalid regex (${
          (e && e.message) || 'compile error'
        })`
      );
      continue;
    }

    if (fields.severity && !SEVERITIES.has(fields.severity)) {
      console.warn(
        `[failure-mode-matcher] skip ${fields.id}: invalid severity '${fields.severity}'`
      );
      continue;
    }

    const entry = {
      id: fields.id,
      pattern: fields.pattern,
    };
    if (fields.symptom) entry.symptom = fields.symptom;
    if (fields.root_cause) entry.root_cause = fields.root_cause;
    if (fields.fix) entry.fix = fields.fix;
    if (fields.diagnosis) entry.diagnosis = fields.diagnosis;
    if (fields.remedy) entry.remedy = fields.remedy;
    if (fields.severity) entry.severity = fields.severity;
    if (fields.propose_report !== undefined) {
      entry.propose_report = fields.propose_report === 'true';
    }
    if (fields.first_observed_cycle) {
      entry.first_observed_cycle = fields.first_observed_cycle;
    }
    if (arrayFields.related_phases) {
      entry.related_phases = arrayFields.related_phases;
    }
    out.push(entry);
  }
  return out;
}

/**
 * Load + parse a catalogue path. Never throws.
 *
 * @param {string} cataloguePath
 * @returns {Array<object>}
 */
function loadCatalogue(cataloguePath) {
  let md;
  try {
    md = fs.readFileSync(cataloguePath, 'utf8');
  } catch (e) {
    console.warn(
      `[failure-mode-matcher] catalogue unreadable at ${cataloguePath}: ${
        (e && e.message) || 'read error'
      }`
    );
    return [];
  }
  try {
    return parseEntries(md);
  } catch (e) {
    console.warn(
      `[failure-mode-matcher] catalogue parse failed at ${cataloguePath}: ${
        (e && e.message) || 'parse error'
      }`
    );
    return [];
  }
}

// -------------------------------------------------------------------
// Bag-of-words construction + cosine similarity
// -------------------------------------------------------------------

/**
 * Build the haystack token list from an errorContext.
 * @param {object | null | undefined} errorContext
 * @returns {string[]}
 */
function buildHaystack(errorContext) {
  if (!errorContext || typeof errorContext !== 'object') return [];
  const msg =
    typeof errorContext.message === 'string' ? errorContext.message : '';
  const stk =
    typeof errorContext.stack === 'string' ? errorContext.stack : '';
  return tokenize([msg, stk].filter(Boolean).join(' '));
}

/**
 * Build the entry's keyword bag.
 * - New shape: symptom + root_cause + un-regexed pattern.
 * - Old shape (backcompat): diagnosis + remedy + un-regexed pattern.
 * @param {object} entry
 * @returns {string[]}
 */
function buildEntryBag(entry) {
  const newPieces = [entry.symptom, entry.root_cause, entry.fix]
    .filter((x) => typeof x === 'string' && x.length > 0)
    .join(' ');
  const oldPieces = [entry.diagnosis, entry.remedy]
    .filter((x) => typeof x === 'string' && x.length > 0)
    .join(' ');
  const patternKeywords = unregexPattern(entry.pattern);
  const source =
    newPieces.length > 0
      ? `${newPieces} ${patternKeywords}`
      : `${oldPieces} ${patternKeywords}`;
  return tokenize(source);
}

/**
 * Term-frequency map for a token list.
 * @param {string[]} tokens
 * @returns {Map<string, number>}
 */
function termFrequency(tokens) {
  const tf = new Map();
  for (const t of tokens) {
    tf.set(t, (tf.get(t) || 0) + 1);
  }
  return tf;
}

/**
 * Cosine similarity over two TF maps. Returns 0 on either-side empty
 * vector (guards divide-by-zero).
 * @param {Map<string, number>} a
 * @param {Map<string, number>} b
 * @returns {number}
 */
function cosineSimilarity(a, b) {
  if (a.size === 0 || b.size === 0) return 0;
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (const v of a.values()) normA += v * v;
  for (const v of b.values()) normB += v * v;
  // Iterate the smaller map for the dot product.
  const [small, large] = a.size <= b.size ? [a, b] : [b, a];
  for (const [tok, count] of small) {
    const other = large.get(tok);
    if (other !== undefined) dot += count * other;
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  if (denom === 0) return 0;
  return dot / denom;
}

// -------------------------------------------------------------------
// Public API
// -------------------------------------------------------------------

/**
 * Match an error context against the failure-mode catalogue.
 *
 * @param {{message?: string, stack?: string} | null | undefined} errorContext
 * @param {{topN?: number, threshold?: number, cataloguePath?: string}} [options]
 * @returns {Array<object>}
 */
function match(errorContext, options) {
  const opts = options || {};
  const topN = Number.isFinite(opts.topN) && opts.topN > 0
    ? Math.floor(opts.topN)
    : DEFAULT_TOP_N;
  const threshold = Number.isFinite(opts.threshold)
    ? opts.threshold
    : DEFAULT_THRESHOLD;
  const cataloguePath = typeof opts.cataloguePath === 'string' && opts.cataloguePath.length > 0
    ? opts.cataloguePath
    : DEFAULT_CATALOGUE_PATH;

  const haystackTokens = buildHaystack(errorContext);
  if (haystackTokens.length === 0) return [];

  const entries = loadCatalogue(cataloguePath);
  if (!Array.isArray(entries) || entries.length === 0) return [];

  const haystackTf = termFrequency(haystackTokens);

  // Score every entry.
  const scored = [];
  for (const entry of entries) {
    const entryTokens = buildEntryBag(entry);
    if (entryTokens.length === 0) continue;
    const entryTf = termFrequency(entryTokens);
    const confidence = cosineSimilarity(haystackTf, entryTf);
    if (confidence < threshold) continue;
    scored.push({ entry, confidence });
  }

  // Sort: confidence DESC, modeId ASC for deterministic tie-break.
  scored.sort((a, b) => {
    if (b.confidence !== a.confidence) return b.confidence - a.confidence;
    if (a.entry.id < b.entry.id) return -1;
    if (a.entry.id > b.entry.id) return 1;
    return 0;
  });

  // Slice to topN.
  const sliced = scored.slice(0, topN);

  // Top-1 dominance — D-08.
  if (
    sliced.length >= 2 &&
    sliced[0].confidence - sliced[1].confidence >= DOMINANCE_DELTA
  ) {
    return [shapeResult(sliced[0].entry, sliced[0].confidence)];
  }

  return sliced.map((s) => shapeResult(s.entry, s.confidence));
}

/**
 * Shape a single candidate result. modeId + confidence are mandatory;
 * remaining catalogue fields ride along when present. Field order is
 * fixed for deterministic JSON serialisation.
 *
 * @param {object} entry
 * @param {number} confidence
 * @returns {object}
 */
function shapeResult(entry, confidence) {
  const out = {
    modeId: entry.id,
    confidence,
  };
  if (entry.symptom !== undefined) out.symptom = entry.symptom;
  if (entry.root_cause !== undefined) out.root_cause = entry.root_cause;
  if (entry.fix !== undefined) out.fix = entry.fix;
  if (entry.severity !== undefined) out.severity = entry.severity;
  if (entry.propose_report !== undefined) {
    out.propose_report = entry.propose_report;
  }
  if (entry.related_phases !== undefined) {
    out.related_phases = entry.related_phases;
  }
  if (entry.diagnosis !== undefined) out.diagnosis = entry.diagnosis;
  if (entry.remedy !== undefined) out.remedy = entry.remedy;
  if (entry.first_observed_cycle !== undefined) {
    out.first_observed_cycle = entry.first_observed_cycle;
  }
  return out;
}

module.exports = {
  match,
  // Exposed for higher-level consumers that may want catalogue
  // introspection without invoking the scorer. Internal use only.
  _tokenize: tokenize,
  _loadCatalogue: loadCatalogue,
  _parseEntries: parseEntries,
  _cosineSimilarity: cosineSimilarity,
  _DEFAULT_TOP_N: DEFAULT_TOP_N,
  _DEFAULT_THRESHOLD: DEFAULT_THRESHOLD,
  _DOMINANCE_DELTA: DOMINANCE_DELTA,
};
