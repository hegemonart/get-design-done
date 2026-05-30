// tests/capability-gap-events.test.cjs — Plan 29-01: capability_gap event schema + emitters
'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { mkdtempSync, rmSync, readFileSync, existsSync, appendFileSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { join, resolve } = require('node:path');
const { randomUUID, createHash } = require('node:crypto');

const { appendChainEvent, readChain } = require('../../scripts/lib/event-chain.cjs');

let Ajv;
try {
  Ajv = require('ajv');
} catch (err) {
  throw new Error('ajv missing — scripts/validate-schemas.ts already imports it; run `npm install`.');
}

const SCHEMA_PATH = resolve(__dirname, '../..', 'reference', 'schemas', 'events.schema.json');
const SCHEMA = JSON.parse(readFileSync(SCHEMA_PATH, 'utf8'));

function makeValidator() {
  // strict: false — the schema uses `if/then` + `definitions`, both of which trigger
  // strict-mode warnings in Ajv 8.x but are valid Draft-07.
  // allErrors: true — surface every violation so test failures are diagnosable.
  const ajv = new Ajv({ allErrors: true, strict: false });
  return ajv.compile(SCHEMA);
}

function mkTmpdir() {
  return mkdtempSync(join(tmpdir(), 'cap-gap-test-'));
}

function rmTmpdir(dir) {
  rmSync(dir, { recursive: true, force: true });
}

/**
 * Build a valid 7-field capability_gap event envelope. `overrides.payload`
 * spreads AFTER the 7 valid fields so tests can inject extra fields (for
 * additionalProperties checks) or replace fields (for enum / pattern / length checks).
 */
function makeCapabilityGapEvent(source = 'fast', overrides = {}) {
  const intent = overrides.intent_summary || 'fake intent for test';
  const basePayload = {
    event_id: randomUUID(),
    parent_event_id: null,
    source,
    context_hash: createHash('sha256').update(intent).digest('hex'),
    intent_summary: intent,
    suggested_kind: source === 'fast' ? 'skill' : 'agent',
    evidence_refs: [],
  };
  return {
    type: 'capability_gap',
    timestamp: new Date().toISOString(),
    sessionId: 'test-session-' + randomUUID().slice(0, 8),
    payload: { ...basePayload, ...(overrides.payload || {}) },
    ...(overrides.envelope || {}),
  };
}

// ---------------------------------------------------------------------------
// Schema validation — positive cases

test('29-01: capability_gap event validates with full 7-field payload (fast shape)', () => {
  const validator = makeValidator();
  const ev = makeCapabilityGapEvent('fast');
  const ok = validator(ev);
  if (!ok) {
    console.error('Validation errors:', JSON.stringify(validator.errors, null, 2));
  }
  assert.equal(ok, true, 'expected event to validate');
});

test('29-01: capability_gap event validates with router shape (source=router, suggested_kind=agent)', () => {
  const validator = makeValidator();
  const ev = makeCapabilityGapEvent('router');
  const ok = validator(ev);
  if (!ok) console.error('errs:', JSON.stringify(validator.errors, null, 2));
  assert.equal(ok, true, 'expected router-shape event to validate');
  assert.equal(ev.payload.source, 'router');
  assert.equal(ev.payload.suggested_kind, 'agent');
});

test('29-01: capability_gap event validates with reflector_pattern shape (Plan 29-02 forward-compat)', () => {
  const validator = makeValidator();
  const ev = makeCapabilityGapEvent('reflector_pattern', {
    payload: { suggested_kind: 'agent' },
  });
  const ok = validator(ev);
  if (!ok) console.error('errs:', JSON.stringify(validator.errors, null, 2));
  assert.equal(ok, true, 'expected reflector_pattern-shape event to validate');
  assert.equal(ev.payload.source, 'reflector_pattern');
});

test('29-01: schema accepts parent_event_id as null (type union ["string", "null"])', () => {
  const validator = makeValidator();
  const ev = makeCapabilityGapEvent('fast', { payload: { parent_event_id: null } });
  assert.equal(validator(ev), true);
});

test('29-01: schema accepts parent_event_id as a valid UUIDv4-pattern string', () => {
  const validator = makeValidator();
  const parent = '11111111-2222-3333-4444-555555555555';
  const ev = makeCapabilityGapEvent('fast', { payload: { parent_event_id: parent } });
  const ok = validator(ev);
  if (!ok) console.error('errs:', JSON.stringify(validator.errors, null, 2));
  assert.equal(ok, true);
});

// ---------------------------------------------------------------------------
// Schema validation — negative cases (rejection)

test('29-01: schema rejects capability_gap event missing event_id (required violation)', () => {
  const validator = makeValidator();
  const ev = makeCapabilityGapEvent('fast');
  delete ev.payload.event_id;
  const ok = validator(ev);
  assert.equal(ok, false, 'expected validation to reject missing event_id');
  const hasRequiredErr = (validator.errors || []).some(
    (e) => e.keyword === 'required' && (e.params || {}).missingProperty === 'event_id',
  );
  assert.equal(hasRequiredErr, true, 'expected required error for event_id');
});

test('29-01: schema rejects extra payload field (additionalProperties: false)', () => {
  const validator = makeValidator();
  const ev = makeCapabilityGapEvent('fast', { payload: { foo: 'bar' } });
  const ok = validator(ev);
  assert.equal(ok, false, 'expected validation to reject extra payload field');
  const hasAdditionalErr = (validator.errors || []).some(
    (e) => e.keyword === 'additionalProperties' && (e.params || {}).additionalProperty === 'foo',
  );
  assert.equal(hasAdditionalErr, true, 'expected additionalProperties error for "foo"');
});

test('29-01: schema rejects source enum violation (source: "invalid")', () => {
  const validator = makeValidator();
  const ev = makeCapabilityGapEvent('fast', { payload: { source: 'invalid' } });
  const ok = validator(ev);
  assert.equal(ok, false, 'expected validation to reject invalid source');
  const hasEnumErr = (validator.errors || []).some((e) => e.keyword === 'enum');
  assert.equal(hasEnumErr, true, 'expected enum error');
});

test('29-01: schema rejects suggested_kind enum violation (suggested_kind: "runtime")', () => {
  const validator = makeValidator();
  const ev = makeCapabilityGapEvent('fast', { payload: { suggested_kind: 'runtime' } });
  const ok = validator(ev);
  assert.equal(ok, false, 'expected validation to reject invalid suggested_kind');
  const hasEnumErr = (validator.errors || []).some((e) => e.keyword === 'enum');
  assert.equal(hasEnumErr, true, 'expected enum error');
});

test('29-01: schema rejects intent_summary longer than 256 chars (maxLength: 256)', () => {
  const validator = makeValidator();
  const longIntent = 'x'.repeat(257);
  const ev = makeCapabilityGapEvent('fast', { payload: { intent_summary: longIntent } });
  const ok = validator(ev);
  assert.equal(ok, false, 'expected validation to reject overlong intent_summary');
  const hasMaxLenErr = (validator.errors || []).some((e) => e.keyword === 'maxLength');
  assert.equal(hasMaxLenErr, true, 'expected maxLength error');
});

test('29-01: schema rejects event_id with non-UUIDv4 pattern', () => {
  const validator = makeValidator();
  const ev = makeCapabilityGapEvent('fast', { payload: { event_id: 'not-a-uuid' } });
  const ok = validator(ev);
  assert.equal(ok, false, 'expected validation to reject non-UUIDv4 event_id');
  const hasPatternErr = (validator.errors || []).some((e) => e.keyword === 'pattern');
  assert.equal(hasPatternErr, true, 'expected pattern error for event_id');
});

test('29-01: schema rejects evidence_refs item with malformed content_hash (pattern violation)', () => {
  const validator = makeValidator();
  const malformedRef = {
    trajectory_path: '.design/trajectories/sess/step.jsonl',
    byte_start: 0,
    byte_end: 4096,
    content_hash: 'not-a-sha256-hash', // must match ^sha256:[0-9a-f]{64}$
  };
  const ev = makeCapabilityGapEvent('fast', { payload: { evidence_refs: [malformedRef] } });
  const ok = validator(ev);
  assert.equal(ok, false, 'expected validation to reject malformed content_hash');
  const hasPatternErr = (validator.errors || []).some((e) => e.keyword === 'pattern');
  assert.equal(hasPatternErr, true, 'expected pattern error for content_hash');
});

test('29-01: schema accepts well-formed evidence_refs item (positive TrajectoryRef case)', () => {
  const validator = makeValidator();
  const goodHash = 'sha256:' + 'a'.repeat(64);
  const ref = {
    trajectory_path: '.design/trajectories/sess/step.jsonl',
    byte_start: 0,
    byte_end: 4096,
    content_hash: goodHash,
  };
  const ev = makeCapabilityGapEvent('reflector_pattern', {
    payload: { suggested_kind: 'agent', evidence_refs: [ref] },
  });
  const ok = validator(ev);
  if (!ok) console.error('errs:', JSON.stringify(validator.errors, null, 2));
  assert.equal(ok, true, 'expected well-formed evidence_refs item to pass');
});

// ---------------------------------------------------------------------------
// Regression — pre-existing event types still validate (additive extension claim)

test('29-01: regression — state.mutation events still validate (additive extension)', () => {
  const validator = makeValidator();
  const ev = {
    type: 'state.mutation',
    timestamp: new Date().toISOString(),
    sessionId: 'regression-test',
    payload: { tool: 'gdd_state__update_progress', diff: { foo: 1 } },
  };
  const ok = validator(ev);
  if (!ok) console.error('errs:', JSON.stringify(validator.errors, null, 2));
  assert.equal(ok, true, 'expected state.mutation event to still validate');
});

test('29-01: regression — stage.entered events still validate (additive extension)', () => {
  const validator = makeValidator();
  const ev = {
    type: 'stage.entered',
    timestamp: new Date().toISOString(),
    sessionId: 'regression-test',
    stage: 'plan',
    payload: { cycle: 'cycle-1' },
  };
  const ok = validator(ev);
  if (!ok) console.error('errs:', JSON.stringify(validator.errors, null, 2));
  assert.equal(ok, true, 'expected stage.entered event to still validate');
});

test('29-01: regression — error events still validate (additive extension)', () => {
  const validator = makeValidator();
  const ev = {
    type: 'error',
    timestamp: new Date().toISOString(),
    sessionId: 'regression-test',
    payload: { code: 'E_BUDGET', message: 'per-task cap exceeded' },
  };
  const ok = validator(ev);
  if (!ok) console.error('errs:', JSON.stringify(validator.errors, null, 2));
  assert.equal(ok, true, 'expected error event to still validate');
});

// ---------------------------------------------------------------------------
// Chain emit + round-trip (tmpdir isolation per D-11)

test('29-01: appendChainEvent writes capability_gap to tmpdir path only', () => {
  const dir = mkTmpdir();
  const chainPath = join(dir, 'chain.jsonl');
  try {
    const ev = makeCapabilityGapEvent('fast');
    appendChainEvent({
      path: chainPath,
      agent: 'fast',
      outcome: 'capability_gap',
      ...ev,
    });
    assert.equal(existsSync(chainPath), true, 'chain file should exist at tmpdir path');
    const lines = readFileSync(chainPath, 'utf8').trim().split('\n');
    assert.equal(lines.length, 1, 'one JSONL line written');
    const record = JSON.parse(lines[0]);
    // All 7 payload fields preserved verbatim through opaque-extras pattern.
    assert.equal(record.type, 'capability_gap');
    assert.equal(record.payload.source, 'fast');
    assert.equal(record.payload.suggested_kind, 'skill');
    assert.equal(Array.isArray(record.payload.evidence_refs), true);
    assert.equal(typeof record.payload.event_id, 'string');
    assert.equal(record.payload.parent_event_id, null);
    assert.equal(typeof record.payload.context_hash, 'string');
    assert.equal(typeof record.payload.intent_summary, 'string');
    // Chain-level fields present.
    assert.equal(record.agent, 'fast');
    assert.equal(record.outcome, 'capability_gap');
  } finally {
    rmTmpdir(dir);
  }
});

test('29-01: chain record projects back to a schema-valid event envelope', () => {
  const dir = mkTmpdir();
  const chainPath = join(dir, 'chain.jsonl');
  try {
    const ev = makeCapabilityGapEvent('router');
    appendChainEvent({
      path: chainPath,
      agent: 'router',
      outcome: 'capability_gap',
      ...ev,
    });
    const records = Array.from(readChain({ path: chainPath }));
    assert.equal(records.length, 1);
    // Project the chain record back to the envelope shape.
    const projected = {
      type: records[0].type,
      timestamp: records[0].timestamp,
      sessionId: records[0].sessionId,
      payload: records[0].payload,
    };
    const validator = makeValidator();
    const ok = validator(projected);
    if (!ok) console.error('errs:', JSON.stringify(validator.errors, null, 2));
    assert.equal(ok, true, 'projected chain record validates against events.schema.json');
  } finally {
    rmTmpdir(dir);
  }
});

test('29-01: chain writes go to tmpdir only — default .design/gep path is NOT touched (D-11)', () => {
  const dir = mkTmpdir();
  const chainPath = join(dir, 'chain.jsonl');
  // Snapshot whether the repo's default chain path exists BEFORE the test, so
  // we can prove our test write did not touch it.
  const defaultPath = resolve(process.cwd(), '.design', 'gep', 'events.jsonl');
  const existedBefore = existsSync(defaultPath);
  const sizeBefore = existedBefore ? readFileSync(defaultPath, 'utf8').length : 0;
  try {
    const ev = makeCapabilityGapEvent('fast');
    appendChainEvent({
      path: chainPath,
      agent: 'fast',
      outcome: 'capability_gap',
      ...ev,
    });
    assert.equal(existsSync(chainPath), true, 'tmpdir chain file written');
    // Default chain path: either still does not exist, or has unchanged size.
    if (existedBefore) {
      const sizeAfter = readFileSync(defaultPath, 'utf8').length;
      assert.equal(sizeAfter, sizeBefore, 'default .design/gep/events.jsonl untouched');
    } else {
      assert.equal(
        existsSync(defaultPath),
        false,
        'default .design/gep/events.jsonl not created by tests',
      );
    }
  } finally {
    rmTmpdir(dir);
  }
});
