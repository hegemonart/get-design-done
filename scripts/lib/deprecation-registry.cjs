'use strict';
// Phase 39.5 — deprecation-registry.cjs — PURE, dep-free reader for GDD's own path-migration registry.
//
// The canonical registry is the `## Path migrations (machine-readable)` table in
// reference/DEPRECATIONS.md. This module parses that table and derives each entry's status against a
// running plugin version, so /hone:migrate, the /hone:update advisory, and the completeness gate all
// share one version-logic core. It reads NO files itself (callers pass the markdown text) — so it is
// trivially unit-testable.
//
// No `require` — pure. Deterministic.

/**
 * Compare two dotted-numeric versions. Tolerant of decimals/patch (1.39, 1.39.2, 1.39.5).
 * Missing components are treated as 0. Non-numeric components compare as 0.
 * @returns -1 if a<b, 0 if equal, 1 if a>b
 */
function compareVersions(a, b) {
  const pa = String(a).split('.').map((x) => parseInt(x, 10) || 0);
  const pb = String(b).split('.').map((x) => parseInt(x, 10) || 0);
  const n = Math.max(pa.length, pb.length);
  for (let i = 0; i < n; i++) {
    const da = pa[i] || 0;
    const db = pb[i] || 0;
    if (da < db) return -1;
    if (da > db) return 1;
  }
  return 0;
}

/** Strip surrounding whitespace + a single pair of backticks from a table cell. */
function cell(s) {
  return String(s).trim().replace(/^`(.*)`$/, '$1').trim();
}

/**
 * Parse the path-migrations table out of reference/DEPRECATIONS.md text.
 * Finds the header row containing Since / Removed in / Old / New, skips the `|---|` separator, and
 * reads pipe-delimited data rows until a non-table line. Returns [] when the table is absent.
 * @returns {Array<{since, removedIn, old, new, hint}>}
 */
function parseDeprecations(mdText) {
  const lines = String(mdText).replace(/\r\n/g, '\n').split('\n');
  const entries = [];
  let inTable = false;
  for (const line of lines) {
    const isRow = /^\s*\|.*\|\s*$/.test(line);
    if (!inTable) {
      if (isRow && /\bSince\b/i.test(line) && /Removed in/i.test(line) && /\bOld\b/i.test(line) && /\bNew\b/i.test(line)) {
        inTable = true; // header found; the next line is the separator
      }
      continue;
    }
    if (!isRow) { inTable = false; continue; } // table ended
    const cells = line.split('|').slice(1, -1).map(cell);
    if (cells.length < 5) continue;
    if (/^-+$/.test(cells[0].replace(/\s/g, ''))) continue; // separator row
    if (/^since$/i.test(cells[0])) continue; // a repeated header, ignore
    entries.push({ since: cells[0], removedIn: cells[1], old: cells[2], new: cells[3], hint: cells[4] });
  }
  return entries;
}

/**
 * Status of an entry at `currentVersion`:
 *   pending    — current < since
 *   deprecated — since <= current < removedIn (or removedIn blank ⇒ never 'removed')
 *   removed    — current >= removedIn
 */
function classify(entry, currentVersion) {
  if (!entry || !entry.since) throw new Error('deprecation-registry: entry needs a `since` version');
  if (compareVersions(currentVersion, entry.since) < 0) return 'pending';
  if (entry.removedIn && String(entry.removedIn).trim() && compareVersions(currentVersion, entry.removedIn) >= 0) {
    return 'removed';
  }
  return 'deprecated';
}

/**
 * Look up a reference (an old path/name) against the registry at currentVersion.
 * @returns {{entry, status, message} | null}  null when `ref` is not a known deprecated path.
 */
function checkReference(entries, ref, currentVersion) {
  if (!Array.isArray(entries)) throw new Error('deprecation-registry: entries must be an array');
  const r = cell(ref);
  const entry = entries.find((e) => e.old === r);
  if (!entry) return null;
  const status = classify(entry, currentVersion);
  let message;
  if (status === 'removed') {
    message = `${entry.old} was removed in v${entry.removedIn}; use ${entry.new}. ${entry.hint}`;
  } else if (status === 'deprecated') {
    message = `${entry.old} is deprecated since v${entry.since} (removed in v${entry.removedIn}); use ${entry.new}. ${entry.hint}`;
  } else {
    message = `${entry.old} will be deprecated in v${entry.since}; the replacement is ${entry.new}.`;
  }
  return { entry, status, message };
}

module.exports = { compareVersions, parseDeprecations, classify, checkReference };
