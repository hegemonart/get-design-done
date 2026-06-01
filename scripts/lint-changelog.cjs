'use strict';
// Phase 39.5 — lint-changelog.cjs — CHANGELOG "Breaking changes" discipline gate.
//
// Every MINOR version bump (`## [x.y.0]`) at or after the floor must declare a Breaking-changes
// section ("### Breaking changes" or "## Breaking changes") — even if its body is just "None." —
// and any real breaking change must also be in reference/DEPRECATIONS.md. Historical minors below the
// floor are grandfathered (the project predates this rule; we do not rewrite history).
//
// The floor is 1.39.0 (Phase 39.5). No `## [x.y.0]` entry at/after the floor exists yet, so the gate
// passes today; the first to need a Breaking-changes section is 1.40.0 (Phase 40).
//
// Pure core `lintChangelog(md, opts)` + a `main()` CLI. No `require` of project code.
//
// Exit codes (CLI): 0 = clean · 1 = at least one violation · 2 = internal error.

const FLOOR_MINOR = '1.39.0';

/** -1 / 0 / 1 dotted-numeric version compare (missing parts = 0). */
function cmp(a, b) {
  const pa = String(a).split('.').map((x) => parseInt(x, 10) || 0);
  const pb = String(b).split('.').map((x) => parseInt(x, 10) || 0);
  const n = Math.max(pa.length, pb.length);
  for (let i = 0; i < n; i++) {
    const da = pa[i] || 0;
    const db = pb[i] || 0;
    if (da !== db) return da < db ? -1 : 1;
  }
  return 0;
}

/**
 * @param {string} mdText  CHANGELOG.md contents
 * @param {{floorMinor?: string}} [opts]
 * @returns {{ok, checked, grandfathered, violations:[{version,reason}]}}
 *   Checks only `## [x.y.0]` (patch === 0) entries at/after floorMinor; each must contain a
 *   "### Breaking changes" or "## Breaking changes" line before the next `## [` heading.
 */
function lintChangelog(mdText, opts) {
  const floor = (opts && opts.floorMinor) || FLOOR_MINOR;
  const lines = String(mdText).replace(/\r\n/g, '\n').split('\n');
  // Index the version headings.
  const heads = [];
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(/^##\s*\[(\d+\.\d+\.\d+)\]/);
    if (m) heads.push({ version: m[1], line: i });
  }
  const violations = [];
  let checked = 0;
  let grandfathered = 0;
  for (let h = 0; h < heads.length; h++) {
    const { version, line } = heads[h];
    const patch = parseInt(version.split('.')[2], 10) || 0;
    if (patch !== 0) continue; // only minor bumps x.y.0
    if (cmp(version, floor) < 0) { grandfathered++; continue; } // historical — grandfathered
    checked++;
    const end = h + 1 < heads.length ? heads[h + 1].line : lines.length;
    const block = lines.slice(line, end).join('\n');
    const hasBreaking = /^#{2,3}\s+Breaking changes\b/im.test(block);
    if (!hasBreaking) {
      violations.push({ version, reason: 'minor release missing a "### Breaking changes" section (use "None." if there are none)' });
    }
  }
  return { ok: violations.length === 0, checked, grandfathered, violations };
}

function main(argv) {
  const fs = require('node:fs');
  const path = require('node:path');
  const args = argv.slice(2);
  const file = args.find((a) => !a.startsWith('--')) || path.join(process.cwd(), 'CHANGELOG.md');
  let md;
  try {
    md = fs.readFileSync(file, 'utf8');
  } catch (e) {
    process.stderr.write(`lint-changelog: cannot read ${file}: ${e.message}\n`);
    return 2;
  }
  let res;
  try {
    res = lintChangelog(md);
  } catch (e) {
    process.stderr.write(`lint-changelog: ${e.message}\n`);
    return 2;
  }
  if (args.includes('--json')) {
    process.stdout.write(JSON.stringify(res) + '\n');
  } else {
    for (const v of res.violations) {
      process.stdout.write(`FAIL  [${v.version}]  ${v.reason}\n`);
    }
    process.stdout.write(
      `lint-changelog: ${res.checked} minor entr${res.checked === 1 ? 'y' : 'ies'} checked (floor ${FLOOR_MINOR}), ` +
      `${res.grandfathered} grandfathered, ${res.violations.length} violation(s)\n`,
    );
  }
  return res.ok ? 0 : 1;
}

if (require.main === module) {
  process.exit(main(process.argv));
}

module.exports = { lintChangelog, cmp, FLOOR_MINOR };
