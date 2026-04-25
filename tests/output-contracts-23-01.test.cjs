// tests/output-contracts-23-01.test.cjs — Plan 23-01 planner + verifier contracts
'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const {
  parsePlannerDecision,
  parseVerifierDecision,
  validatePlannerDecision,
  validateVerifierDecision,
  VALID_VERIFIER_VERDICTS,
  VALID_GAP_SEVERITIES,
  VALID_VERIFIER_CONFIDENCE,
} = require('../scripts/lib/parse-contract.cjs');

const REPO_ROOT = path.join(__dirname, '..');

test('23-01: planner schema file is valid JSON Schema (Draft-07)', () => {
  const schema = JSON.parse(fs.readFileSync(
    path.join(REPO_ROOT, 'reference/output-contracts/planner-decision.schema.json'), 'utf8'));
  assert.equal(schema.$id, 'planner-decision.schema.json');
  assert.equal(schema.type, 'object');
  assert.deepEqual(schema.required.sort(), ['plan_id', 'schema_version', 'tasks', 'waves'].sort());
});

test('23-01: verifier schema file is valid JSON Schema (Draft-07)', () => {
  const schema = JSON.parse(fs.readFileSync(
    path.join(REPO_ROOT, 'reference/output-contracts/verifier-decision.schema.json'), 'utf8'));
  assert.equal(schema.$id, 'verifier-decision.schema.json');
  assert.deepEqual(
    schema.required.sort(),
    ['confidence', 'gaps', 'must_fix_before_ship', 'schema_version', 'verdict'].sort(),
  );
});

test('23-01: enum constants are exported correctly', () => {
  assert.deepEqual(VALID_VERIFIER_VERDICTS, ['pass', 'fail', 'gap']);
  assert.deepEqual(VALID_GAP_SEVERITIES, ['P0', 'P1', 'P2', 'P3']);
  assert.deepEqual(VALID_VERIFIER_CONFIDENCE, ['high', 'med', 'low']);
});

const validPlanner = {
  schema_version: '1.0.0',
  plan_id: '23-04',
  tasks: [
    {
      task_id: 'T-1',
      summary: 'Build aggregator',
      touches: ['scripts/lib/audit-aggregator/**'],
      dependencies: [],
      parallel_safe: true,
      estimated_minutes: 30,
    },
  ],
  waves: [{ wave: 'A', task_ids: ['T-1'] }],
};

test('23-01: validatePlannerDecision accepts well-formed input', () => {
  const r = validatePlannerDecision(validPlanner);
  assert.equal(r.ok, true);
});

test('23-01: validatePlannerDecision rejects bad schema_version', () => {
  const r = validatePlannerDecision({ ...validPlanner, schema_version: '2.0.0' });
  assert.equal(r.ok, false);
  assert.ok(r.errors.some((e) => /schema_version/.test(e)));
});

test('23-01: validatePlannerDecision rejects empty tasks', () => {
  const r = validatePlannerDecision({ ...validPlanner, tasks: [] });
  assert.equal(r.ok, false);
  assert.ok(r.errors.some((e) => /tasks must be a non-empty array/.test(e)));
});

test('23-01: validatePlannerDecision rejects task without touches', () => {
  const r = validatePlannerDecision({
    ...validPlanner,
    tasks: [{ task_id: 'T-1', summary: 'do thing' }],
  });
  assert.equal(r.ok, false);
  assert.ok(r.errors.some((e) => /touches must be an array of strings/.test(e)));
});

test('23-01: parsePlannerDecision extracts from fenced markdown', () => {
  const md = '# Plan output\n\n```json\n' + JSON.stringify(validPlanner) + '\n```\n\nrest of doc';
  const r = parsePlannerDecision(md);
  assert.equal(r.ok, true);
  assert.equal(r.data.plan_id, '23-04');
});

test('23-01: parsePlannerDecision returns error when no JSON block', () => {
  const r = parsePlannerDecision('# no json block here');
  assert.equal(r.ok, false);
  assert.match(r.error, /No.*json.*block/);
});

const validVerifier = {
  schema_version: '1.0.0',
  verdict: 'gap',
  gaps: [
    { id: 'G-01', severity: 'P1', area: 'a11y', summary: 'Missing alt text on icons' },
  ],
  must_fix_before_ship: ['G-01'],
  confidence: 'high',
};

test('23-01: validateVerifierDecision accepts well-formed input', () => {
  const r = validateVerifierDecision(validVerifier);
  assert.equal(r.ok, true);
});

test('23-01: validateVerifierDecision rejects unknown verdict', () => {
  const r = validateVerifierDecision({ ...validVerifier, verdict: 'maybe' });
  assert.equal(r.ok, false);
  assert.ok(r.errors.some((e) => /verdict must be/.test(e)));
});

test('23-01: validateVerifierDecision rejects unknown gap severity', () => {
  const r = validateVerifierDecision({
    ...validVerifier,
    gaps: [{ ...validVerifier.gaps[0], severity: 'P5' }],
  });
  assert.equal(r.ok, false);
  assert.ok(r.errors.some((e) => /severity must be/.test(e)));
});

test('23-01: parseVerifierDecision extracts from fenced markdown', () => {
  const md = '```json\n' + JSON.stringify(validVerifier) + '\n```';
  const r = parseVerifierDecision(md);
  assert.equal(r.ok, true);
  assert.equal(r.data.verdict, 'gap');
});

test('23-01: parseVerifierDecision rejects bad JSON with friendly error', () => {
  const md = '```json\n{not json\n```';
  const r = parseVerifierDecision(md);
  assert.equal(r.ok, false);
  assert.match(r.error, /JSON|json/);
});
