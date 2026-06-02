'use strict';
// Phase 41.5 — manifest seed data validates against its schemas (via the already-present ajv), and
// the seed is honest: 14 harnesses, a non-empty prose denylist, skills covering the live skills/ dirs.
// Every test tagged `41.5-02:`.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Ajv = require('ajv');

const REPO_ROOT = path.resolve(__dirname, '../..');
const M = path.join(REPO_ROOT, 'scripts/lib/manifest');
const readJ = (p) => JSON.parse(fs.readFileSync(p, 'utf8'));

function validate(dataName, schemaName) {
  const ajv = new Ajv({ strict: false, allErrors: true });
  const v = ajv.compile(readJ(path.join(M, 'schemas', `${schemaName}.schema.json`)));
  const ok = v(readJ(path.join(M, `${dataName}.json`)));
  return { ok, errors: ajv.errorsText(v.errors) };
}

test('41.5-02: harnesses.json validates + has the 14 canonical runtimes', () => {
  const r = validate('harnesses', 'harnesses');
  assert.ok(r.ok, `harnesses schema: ${r.errors}`);
  const h = readJ(path.join(M, 'harnesses.json'));
  assert.equal(h.harnesses.length, 14);
  const ids = h.harnesses.map((x) => x.id).sort();
  assert.deepEqual(ids, ['antigravity', 'augment', 'claude', 'cline', 'codebuddy', 'codex', 'copilot', 'cursor', 'gemini', 'kilo', 'opencode', 'qwen', 'trae', 'windsurf']);
  // the .cjs view re-exports the array
  const view = require(path.join(M, 'harnesses.cjs'));
  assert.equal(view.length, 14);
});

test('41.5-02: skills.json validates + covers every live skills/ dir', () => {
  const r = validate('skills', 'skills');
  assert.ok(r.ok, `skills schema: ${r.errors}`);
  const manifestNames = new Set(readJ(path.join(M, 'skills.json')).skills.map((s) => s.name));
  const liveDirs = fs.readdirSync(path.join(REPO_ROOT, 'skills'), { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => e.name);
  const missing = liveDirs.filter((d) => !manifestNames.has(d));
  assert.deepEqual(missing, [], `skills.json missing live dirs: ${missing.join(', ')}`);
});

test('41.5-02: prose-denylist.json validates + is a non-empty AI-tell list', () => {
  const r = validate('prose-denylist', 'prose-denylist');
  assert.ok(r.ok, `prose-denylist schema: ${r.errors}`);
  const tells = readJ(path.join(M, 'prose-denylist.json')).tells;
  assert.ok(tells.length >= 10, 'a substantive denylist');
  const patterns = tells.map((t) => t.pattern);
  assert.ok(patterns.includes('seamless') && patterns.includes('robust'), 'core AI-tells present');
  assert.ok(tells.some((t) => t.kind === 'token'), 'structural markers (em-dash / --) present');
});

test('41.5-02: validate-manifest.cjs reports 0 problems on the seed', () => {
  const { validateAll } = require(path.join(REPO_ROOT, 'scripts/validate-manifest.cjs'));
  const res = validateAll();
  assert.deepEqual(res.problems, [], `validate-manifest problems: ${res.problems.join('; ')}`);
  assert.equal(res.checked, 3);
});
