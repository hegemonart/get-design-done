'use strict';
// Phase 41 — rule-engine units. Every rule validates against rule-schema.json (via the already-present
// ajv dep), fires on its positive fixture, stays silent on the negative fixture, and the subjective
// BAN-04/BAN-10 are matcher-exempt (not ported). Every test tagged `41-03:`.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Ajv = require('ajv');

const REPO_ROOT = path.resolve(__dirname, '../..');
const engine = require(path.join(REPO_ROOT, 'scripts/lib/detect/engine.cjs'));
const { RULES, EXEMPT } = require(path.join(REPO_ROOT, 'scripts/lib/detect/rules/index.cjs'));
const SCHEMA = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, 'scripts/lib/detect/rule-schema.json'), 'utf8'));

test('41-03: every rule validates against rule-schema.json', () => {
  const ajv = new Ajv({ strict: false });
  const validate = ajv.compile(SCHEMA);
  for (const r of RULES) {
    const serializable = { id: r.id, category: r.category, name: r.name, description: r.description, references: r.references, severity: r.severity, pattern: r.pattern };
    const ok = validate(serializable);
    assert.ok(ok, `${r.id} fails the rule schema: ${ajv.errorsText(validate.errors)}`);
    assert.equal(typeof r.matcher, 'function', `${r.id} has a matcher`);
  }
});

test('41-03: 11 detectable rules ported; BAN-04 + BAN-10 are matcher-exempt', () => {
  assert.equal(RULES.length, 11);
  assert.deepEqual(EXEMPT, ['BAN-04', 'BAN-10']);
  const ids = new Set(RULES.map((r) => r.id));
  for (const ex of EXEMPT) assert.ok(!ids.has(ex), `${ex} must NOT be ported (subjective)`);
  // ids are unique + well-formed
  assert.equal(ids.size, RULES.length, 'no duplicate rule ids');
  for (const r of RULES) assert.match(r.id, /^BAN-\d{2}$/);
});

test('41-03: every ported rule fires on the positive fixture', () => {
  const pos = engine.run(path.join(REPO_ROOT, 'test/fixtures/detect/positive'), { cwd: REPO_ROOT });
  const hit = new Set(pos.findings.map((f) => f.ruleId));
  const missing = RULES.map((r) => r.id).filter((id) => !hit.has(id));
  assert.deepEqual(missing, [], `rules that did not fire on the positive fixture: ${missing.join(', ')}`);
  // findings carry the reference link + line/column
  for (const f of pos.findings) {
    assert.match(f.references[0], /^reference\/anti-patterns\.md#BAN-\d{2}$/);
    assert.ok(f.line >= 1 && f.column >= 1);
  }
});

test('41-03: no rule fires on the negative (clean) fixture', () => {
  const neg = engine.run(path.join(REPO_ROOT, 'test/fixtures/detect/negative'), { cwd: REPO_ROOT });
  assert.deepEqual(neg.findings, [], `clean fixture produced findings: ${JSON.stringify(neg.findings)}`);
});

test('41-03: --rule narrows to a single rule', () => {
  const r = engine.run(path.join(REPO_ROOT, 'test/fixtures/detect/positive'), { ruleId: 'BAN-13', cwd: REPO_ROOT });
  assert.ok(r.findings.length >= 1);
  assert.ok(r.findings.every((f) => f.ruleId === 'BAN-13'));
  assert.equal(r.rules, 1);
});
