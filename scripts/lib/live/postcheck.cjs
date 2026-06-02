'use strict';
/**
 * scripts/lib/live/postcheck.cjs — Phase 47 (Live Mode) variant post-check.
 *
 * After /gdd:live generates a design variant, we run that variant's source through the
 * in-repo gdd-detect engine (Phase 41) and surface its anti-pattern findings on the
 * variant card. Per the Live Mode spec, an `error`-severity finding is FLAGGED but NOT
 * auto-rejected — the human still chooses; the detector is advisory at dev-time. So
 * `autoReject` is ALWAYS false; we only surface counts + a compact card summary.
 *
 * Pure, dependency-free CommonJS. We reuse the detect engine's `scanContent` +`RULES`
 * (NOT a CLI shell-out, NOT a temp-file write) so post-checking a generated variant is
 * fully in-memory and hermetically testable. The engine is the single source of truth
 * for the finding shape ({ruleId, category, name, severity, file, line, column, match,
 * references}); we never reimplement rule matching.
 *
 * Ships in the npm package (scripts/lib/** is in package.json `files`), so it requires
 * only the in-repo detect engine — no runtime dependency, no network, no optional dep.
 */

const path = require('node:path');
const { scanContent, run, RULES } = require('../detect/engine.cjs');

/**
 * Normalize the caller's `files`/`content` input into a list of
 * `{ path, content, ext }` units to scan in-memory.
 *
 * Accepts either:
 *   - `content`: a raw string (single anonymous unit), or
 *   - `files`: an array of `{ path, content }` (or `{ name, content }`) units, or
 *              an object map of `{ "<path>": "<content>" }`.
 *
 * @param {{files?: any, content?: string}} input
 * @returns {{path: string, content: string, ext: string}[]}
 */
function normalizeUnits(input) {
  const units = [];
  if (input && typeof input.content === 'string') {
    const p = input.path || input.file || 'variant';
    units.push({ path: p, content: input.content, ext: path.extname(p).toLowerCase() });
  }
  const files = input && input.files;
  if (Array.isArray(files)) {
    for (const f of files) {
      if (!f) continue;
      if (typeof f === 'string') continue; // a bare path with no content is not scannable in-memory
      const p = f.path || f.name || f.file || 'variant';
      const content = typeof f.content === 'string' ? f.content : '';
      units.push({ path: p, content, ext: path.extname(p).toLowerCase() });
    }
  } else if (files && typeof files === 'object') {
    for (const p of Object.keys(files)) {
      const content = typeof files[p] === 'string' ? files[p] : '';
      units.push({ path: p, content, ext: path.extname(p).toLowerCase() });
    }
  }
  return units;
}

/**
 * Post-check a generated variant against the gdd-detect anti-pattern rule set.
 *
 * Prefers an in-memory scan of the supplied variant source via the detect engine's
 * `scanContent`. When NO inline content is supplied but a `projectRoot` is given,
 * falls back to the documented programmatic engine form `run(projectRoot)` so the
 * caller can still post-check files already written to disk.
 *
 * @param {object} args
 * @param {string} [args.projectRoot]  Repo root — used for the on-disk fallback and as the
 *                                      `cwd` so finding `file` paths are repo-relative.
 * @param {Array|object} [args.files]  Variant files: `[{path, content}]` or `{ "<path>": "<content>" }`.
 * @param {string} [args.content]      A single raw variant source string.
 * @returns {{findings: object[], errorCount: number, warnCount: number, autoReject: boolean}}
 */
function postCheckVariant(args = {}) {
  const { projectRoot } = args;
  const units = normalizeUnits(args);

  let findings = [];
  if (units.length > 0) {
    const cwd = projectRoot || process.cwd();
    for (const u of units) {
      // Make the reported `file` repo-relative when projectRoot is known, mirroring the
      // engine's own relativization in run().
      let rel = u.path;
      if (projectRoot && path.isAbsolute(u.path)) {
        rel = path.relative(cwd, u.path).split(path.sep).join('/') || u.path;
      }
      const hits = scanContent(u.content, { path: rel, ext: u.ext }, RULES);
      findings.push(...hits);
    }
    // Match the engine's deterministic ordering (file, line, column, ruleId).
    findings.sort(
      (a, b) =>
        a.file.localeCompare(b.file) ||
        a.line - b.line ||
        a.column - b.column ||
        a.ruleId.localeCompare(b.ruleId),
    );
  } else if (projectRoot) {
    // No inline content — fall back to the documented programmatic engine form against
    // files already on disk under projectRoot.
    const result = run(projectRoot, { cwd: projectRoot });
    findings = result.findings;
  }

  let errorCount = 0;
  let warnCount = 0;
  for (const f of findings) {
    if (f.severity === 'error') errorCount += 1;
    else warnCount += 1;
  }

  // Spec D: error-severity is flagged, NOT auto-rejected. autoReject is always false.
  return { findings, errorCount, warnCount, autoReject: false };
}

/**
 * Compact, single-line summary of a findings array for a variant card.
 * Always returns a string (never null/undefined) so the skill can render it verbatim.
 *
 *   []                                  → "clean — no anti-patterns"
 *   [1 error, 2 warn]                   → "2 issue(s): 1 error, 2 warn — BAN-06, BAN-01, BAN-08"
 *
 * Rule ids are de-duplicated and listed in first-seen order, capped so the card stays compact.
 *
 * @param {object[]} findings
 * @returns {string}
 */
function summarizeForCard(findings) {
  const list = Array.isArray(findings) ? findings : [];
  if (list.length === 0) return 'clean — no anti-patterns';

  let errors = 0;
  let warns = 0;
  const ids = [];
  const seen = new Set();
  for (const f of list) {
    if (f && f.severity === 'error') errors += 1;
    else warns += 1;
    const id = f && f.ruleId;
    if (id && !seen.has(id)) {
      seen.add(id);
      ids.push(id);
    }
  }

  const MAX_IDS = 5;
  const shownIds = ids.slice(0, MAX_IDS);
  const idTail = ids.length > MAX_IDS ? `, +${ids.length - MAX_IDS} more` : '';
  const parts = [];
  if (errors) parts.push(`${errors} error`);
  if (warns) parts.push(`${warns} warn`);

  return `${list.length} issue(s): ${parts.join(', ')} — ${shownIds.join(', ')}${idTail}`;
}

module.exports = { postCheckVariant, summarizeForCard, normalizeUnits };
