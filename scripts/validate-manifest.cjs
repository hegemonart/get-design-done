'use strict';
// Phase 41.5 — validate-manifest.cjs — the SINGLE CI gate for the scripts/lib/manifest/ SoT root.
// Replaces the four per-file drift gates that Phase 43/44/45/47 would each have shipped: one ajv pass
// validates every manifest JSON against its schema in scripts/lib/manifest/schemas/.
//
//   node scripts/validate-manifest.cjs [--check]   # --check exits 1 on any failure
//
// ajv is already a runtime dependency. This script is maintainer/CI tooling (not shipped in the tarball,
// like scripts/lint-changelog.cjs) — the shipped loader (scripts/lib/manifest/loader.cjs) is dep-free.

const fs = require('node:fs');
const path = require('node:path');
const Ajv = require('ajv');

const REPO_ROOT = path.resolve(__dirname, '..');
const MANIFEST = path.join(REPO_ROOT, 'scripts', 'lib', 'manifest');
const SCHEMAS = path.join(MANIFEST, 'schemas');

// manifest base name -> schema base name
const PAIRS = [
  { data: 'harnesses', schema: 'harnesses' },
  { data: 'skills', schema: 'skills' },
  { data: 'prose-denylist', schema: 'prose-denylist' },
];

function validateAll() {
  const ajv = new Ajv({ strict: false, allErrors: true });
  const problems = [];
  let checked = 0;
  for (const { data, schema } of PAIRS) {
    const dataPath = path.join(MANIFEST, `${data}.json`);
    const schemaPath = path.join(SCHEMAS, `${schema}.schema.json`);
    if (!fs.existsSync(schemaPath)) { problems.push(`missing schema: schemas/${schema}.schema.json`); continue; }
    if (!fs.existsSync(dataPath)) { problems.push(`missing manifest: ${data}.json`); continue; }
    let doc, sch;
    try { sch = JSON.parse(fs.readFileSync(schemaPath, 'utf8')); } catch (e) { problems.push(`schema ${schema}: parse error (${e.message})`); continue; }
    try { doc = JSON.parse(fs.readFileSync(dataPath, 'utf8')); } catch (e) { problems.push(`manifest ${data}: parse error (${e.message})`); continue; }
    let validate;
    try { validate = ajv.compile(sch); } catch (e) { problems.push(`schema ${schema}: invalid JSON Schema (${e.message})`); continue; }
    checked++;
    if (!validate(doc)) problems.push(`${data}.json: ${ajv.errorsText(validate.errors)}`);
  }
  return { problems, checked, pairs: PAIRS.length };
}

function main(argv) {
  const res = validateAll();
  process.stdout.write(`validate-manifest: ${res.checked}/${res.pairs} manifest(s) validated, ${res.problems.length} problem(s)\n`);
  for (const p of res.problems) process.stdout.write(`  FAIL ${p}\n`);
  if (argv.includes('--check') && res.problems.length) return 1;
  return res.problems.length ? 1 : 0;
}

if (require.main === module) process.exit(main(process.argv.slice(2)));
module.exports = { validateAll };
