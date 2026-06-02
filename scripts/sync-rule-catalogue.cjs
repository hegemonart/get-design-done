'use strict';
// Phase 41 — sync-rule-catalogue.cjs — bidirectional parity gate between the executable rule files
// (scripts/lib/detect/rules/*.cjs, the canonical executable) and reference/anti-patterns.md (the
// canonical prose). The markdown stays the source of prose; the rule files are the source of code;
// this gate fails CI when they drift.
//
// Contract (SC#3 + SC#4):
//   - every rule.id has a `### BAN-NN:` heading AND a `bdId: BAN-NN` marker in the catalogue;
//   - every catalogue `### BAN-NN:` that ships a `**Grep**` (statically detectable) AND is not in the
//     EXEMPT set has a rule file;
//   - no orphan rule (a rule whose id has no catalogue heading);
//   - EXEMPT ids (BAN-04, BAN-10 — subjective) have NO rule and that is expected.
//
// `node scripts/sync-rule-catalogue.cjs` prints the parity report; `--check` exits 1 on any mismatch.

const fs = require('node:fs');
const path = require('node:path');

const REPO_ROOT = path.resolve(__dirname, '..');
const CATALOGUE = path.join(REPO_ROOT, 'reference', 'anti-patterns.md');
const { RULES, EXEMPT } = require(path.join(REPO_ROOT, 'scripts', 'lib', 'detect', 'rules', 'index.cjs'));

/** Parse the catalogue → { headings:Set, markers:Set, grepful:Set } of BAN-NN ids. */
function parseCatalogue(md) {
  const text = String(md).replace(/\r\n/g, '\n');
  const headings = new Set();
  const markers = new Set();
  const grepful = new Set();
  // Split into BAN sections so we can tell which heading owns a **Grep**.
  const lines = text.split('\n');
  let current = null;
  for (const line of lines) {
    const h = line.match(/^###\s+(BAN-\d{2})\s*:/);
    if (h) { current = h[1]; headings.add(current); continue; }
    const mk = line.match(/^bdId:\s*(BAN-\d{2})\s*$/);
    if (mk) markers.add(mk[1]);
    if (current && /\*\*Grep/i.test(line)) grepful.add(current);
  }
  return { headings, markers, grepful };
}

function analyze() {
  const cat = parseCatalogue(fs.readFileSync(CATALOGUE, 'utf8'));
  const ruleIds = new Set(RULES.map((r) => r.id));
  const exempt = new Set(EXEMPT);
  const problems = [];

  for (const r of RULES) {
    if (!cat.headings.has(r.id)) problems.push(`orphan rule: ${r.id} has no "### ${r.id}:" heading in anti-patterns.md`);
    if (!cat.markers.has(r.id)) problems.push(`missing marker: ${r.id} has no "bdId: ${r.id}" marker in anti-patterns.md`);
    for (const ref of r.references) {
      const m = ref.match(/#(BAN-\d{2})$/);
      if (m && !cat.headings.has(m[1])) problems.push(`dead reference: ${r.id} -> ${ref} (no such heading)`);
    }
  }
  for (const id of cat.grepful) {
    if (exempt.has(id)) continue;
    if (!ruleIds.has(id)) problems.push(`un-ported rule: "### ${id}:" ships a **Grep** but has no rules/${id.toLowerCase()}.cjs`);
  }
  for (const id of exempt) {
    if (ruleIds.has(id)) problems.push(`exempt rule ported: ${id} is matcher-exempt (subjective) but a rule file exists`);
  }
  return { problems, ruleCount: RULES.length, headingCount: cat.headings.size, grepful: [...cat.grepful].sort(), exempt: [...exempt] };
}

function main(argv) {
  const res = analyze();
  const check = argv.includes('--check');
  process.stdout.write(
    `sync-rule-catalogue: ${res.ruleCount} rule files, ${res.headingCount} BAN headings, ` +
    `${res.grepful.length} detectable (grepful), ${res.exempt.length} exempt (${res.exempt.join(', ')}), ` +
    `${res.problems.length} problem(s)\n`,
  );
  for (const p of res.problems) process.stdout.write(`  FAIL ${p}\n`);
  if (check && res.problems.length) return 1;
  return 0;
}

if (require.main === module) process.exit(main(process.argv.slice(2)));
module.exports = { analyze, parseCatalogue };
