#!/usr/bin/env node
'use strict';
/**
 * scripts/validate-no-internal-refs.cjs
 *
 * CI gate that prevents NEW Phase NN / Plan NN-MM / .planning/ /
 * D-NN references from leaking into shipped surfaces.
 *
 * Why: the v1.27→v1.57 phase wave accreted 866 internal-ref leaks
 * across skills/ agents/ reference/ connections/ docs/ hooks/. The
 * Batch F sweep cleaned the high-impact ones (registry.json, schemas,
 * 7 skill descriptions, design-verifier H2s, 41 agent files) but the
 * rest live in body prose where context-driven cleanup must happen
 * file-by-file. Rather than block the polish wave on a full sweep,
 * we lock the current footprint as a baseline and gate REGRESSION.
 *
 * Behavior:
 *   - Walks shipped surfaces (skills/ source/skills/ agents/
 *     reference/ connections/ docs/ hooks/) for *.md / *.json files.
 *   - Counts hits per file matching:
 *       /\bPhase \d+(\.\d+)?\b/g
 *       /\bPlan \d+-\d+\b/g
 *       /\.planning\/[a-z]/g                    (path-form only)
 *       /\bD-\d+\b/g                            (decision refs)
 *       /\bCONTEXT D-\d+\b/g
 *   - Compares to test/fixtures/baselines/internal-refs.json.
 *   - Fails if any file exceeds its baseline OR if a file not in the
 *     baseline has a non-zero count.
 *   - --rebaseline: writes the current counts as the new baseline.
 *     Use after an intentional cleanup commit.
 *
 * The baseline is the "ratchet": it goes down as authors clean files;
 * the gate only enforces "no regression."
 */

const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const BASELINE_PATH = path.join(ROOT, 'test', 'fixtures', 'baselines', 'internal-refs.json');

const ROOTS = [
  'skills',
  'source/skills',
  'agents',
  'reference',
  'connections',
  'docs',
  'hooks',
];

// Files explicitly exempted from the gate. These are surfaces where
// internal-phase vocabulary is legitimate (release chronicle, NOTICE,
// the audit reports themselves).
const EXEMPT = new Set([
  'CHANGELOG.md',
  'NOTICE',
]);

const PATTERNS = [
  /\bPhase \d+(\.\d+)?\b/g,
  /\bPlan \d+-\d+\b/g,
  /\.planning\/[a-z]/g,
  /(?<!\$)\bD-\d+\b/g, // not "$D-12" style env-var-ish
  /\bCONTEXT D-\d+\b/g,
];

function walk(dir, acc = []) {
  if (!fs.existsSync(dir)) return acc;
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, ent.name);
    if (ent.isDirectory()) walk(full, acc);
    else if (ent.isFile() && /\.(md|json)$/.test(ent.name)) acc.push(full);
  }
  return acc;
}

function countHits(filePath) {
  let body;
  try { body = fs.readFileSync(filePath, 'utf8'); } catch { return 0; }
  let total = 0;
  for (const re of PATTERNS) {
    const matches = body.match(re);
    if (matches) total += matches.length;
  }
  return total;
}

function buildCurrent() {
  const files = ROOTS.flatMap((r) => walk(path.join(ROOT, r)));
  const out = {};
  for (const f of files) {
    const rel = path.relative(ROOT, f).replace(/\\/g, '/');
    if (EXEMPT.has(path.basename(rel))) continue;
    const n = countHits(f);
    if (n > 0) out[rel] = n;
  }
  return out;
}

function loadBaseline() {
  if (!fs.existsSync(BASELINE_PATH)) return { counts: {}, generated_at: null };
  try { return JSON.parse(fs.readFileSync(BASELINE_PATH, 'utf8')); }
  catch { return { counts: {}, generated_at: null }; }
}

function writeBaseline(counts) {
  fs.mkdirSync(path.dirname(BASELINE_PATH), { recursive: true });
  const body = JSON.stringify(
    { generated_at: new Date().toISOString(), counts },
    null,
    2,
  ) + '\n';
  fs.writeFileSync(BASELINE_PATH, body, 'utf8');
}

const REBASELINE = process.argv.includes('--rebaseline');

const current = buildCurrent();
const totalCurrent = Object.values(current).reduce((a, b) => a + b, 0);

if (REBASELINE) {
  writeBaseline(current);
  const files = Object.keys(current).length;
  console.log(`validate-no-internal-refs: REBASELINED to ${totalCurrent} hits across ${files} file(s)`);
  process.exit(0);
}

const baseline = loadBaseline().counts || {};

const regressions = [];
for (const [file, n] of Object.entries(current)) {
  const baselineN = baseline[file] || 0;
  if (n > baselineN) {
    regressions.push({ file, baseline: baselineN, current: n, delta: n - baselineN });
  }
}

if (regressions.length === 0) {
  const totalBaseline = Object.values(baseline).reduce((a, b) => a + b, 0);
  const cleaned = totalBaseline - totalCurrent;
  if (cleaned > 0) {
    console.log(`validate-no-internal-refs: OK (${totalCurrent} hits; ${cleaned} cleaned vs baseline — rerun with --rebaseline to ratchet)`);
  } else {
    console.log(`validate-no-internal-refs: OK (${totalCurrent} hits ≤ ${totalBaseline} baseline)`);
  }
  process.exit(0);
}

console.error('validate-no-internal-refs: REGRESSION DETECTED');
console.error('');
console.error('The following files now have MORE Phase NN / Plan NN-MM / .planning/ /');
console.error('D-NN references than their baseline count permits. Either clean the');
console.error('regression (preferred) or — if the additions are intentional — rerun');
console.error('this gate with --rebaseline and commit the new baseline file.');
console.error('');
for (const r of regressions) {
  console.error(`  ${r.file}: baseline=${r.baseline}, current=${r.current} (+${r.delta})`);
}
console.error('');
console.error(`Total regression: +${regressions.reduce((a, r) => a + r.delta, 0)} hit(s).`);
process.exit(1);
