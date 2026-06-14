// test/suite/router-pick-event.test.cjs — Plan 32-08 (D-02): router_pick skill-discovery telemetry
// Validates the additive router_pick event branch in reference/schemas/events.schema.json
// (RouterPickPayload, 7 fields, NO PII — hash only) and the co-located emitter helper
// skills/router/router-pick-emitter.md (appendChainEvent emit surface).
'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
  mkdtempSync,
  rmSync,
  readFileSync,
  existsSync,
} = require('node:fs');
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
const EMITTER_PATH = resolve(__dirname, '../..', 'skills', 'router', 'router-pick-emitter.md');

function makeValidator() {
  // strict: false — the schema uses `if/then` + `definitions`, both of which trigger
  // strict-mode warnings in Ajv 8.x but are valid Draft-07. Mirrors capability-gap-events.test.cjs.
  // allErrors: true — surface every violation so test failures are diagnosable.
  const ajv = new Ajv({ allErrors: true, strict: false });
  return ajv.compile(SCHEMA);
}

function mkTmpdir() {
  return mkdtempSync(join(tmpdir(), 'router-pick-test-'));
}

function rmTmpdir(dir) {
  rmSync(dir, { recursive: true, force: true });
}

/**
 * Build a valid 7-field router_pick event envelope. `overrides.payload` spreads
 * AFTER the 7 valid fields so tests can inject extra fields (additionalProperties
 * checks) or replace fields (enum / pattern / required checks).
 *
 * NO PII: context_hash is sha256(intent) — the raw intent/prompt is NEVER stored.
 */
function makeRouterPickEvent(overrides = {}) {
  const intent = overrides.intent || 'run discover stage on greenfield project';
  const basePayload = {
    event_id: randomUUID(),
    source: 'router',
    picked_skill: 'hone-explorer',
    context_hash: createHash('sha256').update(intent).digest('hex'),
    rank: 0,
    alternatives: ['hone-planner', 'hone-mapper'],
    ts: new Date().toISOString(),
  };
  return {
    type: 'router_pick',
    timestamp: new Date().toISOString(),
    sessionId: 'test-session-' + randomUUID().slice(0, 8),
    payload: { ...basePayload, ...(overrides.payload || {}) },
    ...(overrides.envelope || {}),
  };
}

// ---------------------------------------------------------------------------
// (a) Well-formed router_pick validates

test('32-08: well-formed router_pick validates (7-field payload, source=router)', () => {
  const validator = makeValidator();
  const ev = makeRouterPickEvent();
  const ok = validator(ev);
  if (!ok) console.error('Validation errors:', JSON.stringify(validator.errors, null, 2));
  assert.equal(ok, true, 'expected well-formed router_pick event to validate');
  assert.equal(ev.payload.source, 'router');
  assert.equal(ev.payload.picked_skill, 'hone-explorer');
});

test('32-08: well-formed router_pick validates with empty alternatives array', () => {
  const validator = makeValidator();
  const ev = makeRouterPickEvent({ payload: { alternatives: [] } });
  const ok = validator(ev);
  if (!ok) console.error('errs:', JSON.stringify(validator.errors, null, 2));
  assert.equal(ok, true, 'expected router_pick with empty alternatives to validate');
});

// ---------------------------------------------------------------------------
// (b) Missing required field is REJECTED

test('32-08: router_pick missing required field fails (drop picked_skill)', () => {
  const validator = makeValidator();
  const ev = makeRouterPickEvent();
  delete ev.payload.picked_skill;
  const ok = validator(ev);
  assert.equal(ok, false, 'expected validation to reject missing picked_skill');
  const hasRequiredErr = (validator.errors || []).some(
    (e) => e.keyword === 'required' && (e.params || {}).missingProperty === 'picked_skill',
  );
  assert.equal(hasRequiredErr, true, 'expected required error for picked_skill');
});

test('32-08: router_pick missing context_hash fails (required violation)', () => {
  const validator = makeValidator();
  const ev = makeRouterPickEvent();
  delete ev.payload.context_hash;
  const ok = validator(ev);
  assert.equal(ok, false, 'expected validation to reject missing context_hash');
  const hasRequiredErr = (validator.errors || []).some(
    (e) => e.keyword === 'required' && (e.params || {}).missingProperty === 'context_hash',
  );
  assert.equal(hasRequiredErr, true, 'expected required error for context_hash');
});

// ---------------------------------------------------------------------------
// (b') Extra field is REJECTED (additionalProperties:false → proves no-PII discipline)

test('32-08: router_pick extra field fails (raw_prompt rejected → no-PII)', () => {
  const validator = makeValidator();
  const ev = makeRouterPickEvent({ payload: { raw_prompt: 'the actual user prompt text' } });
  const ok = validator(ev);
  assert.equal(ok, false, 'expected validation to reject extra raw_prompt field');
  const hasAdditionalErr = (validator.errors || []).some(
    (e) =>
      e.keyword === 'additionalProperties' && (e.params || {}).additionalProperty === 'raw_prompt',
  );
  assert.equal(hasAdditionalErr, true, 'expected additionalProperties error for raw_prompt (no PII)');
});

test('32-08: router_pick source enum violation fails (source must be const "router")', () => {
  const validator = makeValidator();
  const ev = makeRouterPickEvent({ payload: { source: 'fast' } });
  const ok = validator(ev);
  assert.equal(ok, false, 'expected validation to reject non-router source');
  const hasConstErr = (validator.errors || []).some(
    (e) => e.keyword === 'const' || e.keyword === 'enum',
  );
  assert.equal(hasConstErr, true, 'expected const/enum error for source');
});

test('32-08: router_pick rank below minimum fails (negative rank rejected)', () => {
  const validator = makeValidator();
  const ev = makeRouterPickEvent({ payload: { rank: -1 } });
  const ok = validator(ev);
  assert.equal(ok, false, 'expected validation to reject negative rank');
  const hasMinErr = (validator.errors || []).some((e) => e.keyword === 'minimum');
  assert.equal(hasMinErr, true, 'expected minimum error for rank');
});

// ---------------------------------------------------------------------------
// (c) Existing branches STILL validate — no regression to capability_gap / kfm-candidate

test('32-08: existing capability_gap still validates (no regression on allOf[0])', () => {
  const validator = makeValidator();
  const intent = 'unmatched intent example';
  const ev = {
    type: 'capability_gap',
    timestamp: new Date().toISOString(),
    sessionId: 'regression-cap-gap',
    payload: {
      event_id: randomUUID(),
      parent_event_id: null,
      source: 'router',
      context_hash: createHash('sha256').update(intent).digest('hex'),
      intent_summary: intent,
      suggested_kind: 'agent',
      evidence_refs: [],
    },
  };
  const ok = validator(ev);
  if (!ok) console.error('errs:', JSON.stringify(validator.errors, null, 2));
  assert.equal(ok, true, 'expected capability_gap event to still validate');
});

test('32-08: existing kfm-candidate still validates (no regression on allOf[1])', () => {
  const validator = makeValidator();
  const ev = {
    type: 'kfm-candidate',
    timestamp: new Date().toISOString(),
    sessionId: 'regression-kfm',
    payload: {
      event_id: randomUUID(),
      source: 'authority_watcher',
      article_url: 'https://example.com/article',
      article_title: 'Some KFM article',
      suggested_symptom: 'recurring symptom string',
      suggested_pattern_hint: '',
      raw_excerpt: 'an excerpt of the article body',
    },
  };
  const ok = validator(ev);
  if (!ok) console.error('errs:', JSON.stringify(validator.errors, null, 2));
  assert.equal(ok, true, 'expected kfm-candidate event to still validate');
});

// ---------------------------------------------------------------------------
// (d) Emit surface produces a schema-valid router_pick event.
// The router pick is prose-driven (deterministic skill, no code module), so the
// concrete surface is the documented emitter snippet in router-pick-emitter.md.
// We exercise the SAME appendChainEvent write path the emitter documents, against a
// TEMP chain file (D-11 isolation), then project the appended row back to the
// envelope and assert it validates as RouterPickPayload.

test('32-08: emit surface produces a schema-valid router_pick (appendChainEvent round-trip)', () => {
  const dir = mkTmpdir();
  const chainPath = join(dir, 'chain.jsonl');
  // Snapshot the default chain path so we can prove the test did not touch it (D-11).
  const defaultPath = resolve(process.cwd(), '.design', 'gep', 'events.jsonl');
  const existedBefore = existsSync(defaultPath);
  const sizeBefore = existedBefore ? readFileSync(defaultPath, 'utf8').length : 0;
  try {
    const intent = 'run discover stage on greenfield project';
    // Mirror the documented router-pick-emitter.md payload exactly: hash only, no raw prompt.
    const payload = {
      event_id: randomUUID(),
      source: 'router',
      picked_skill: 'hone-explorer',
      context_hash: createHash('sha256').update(intent).digest('hex'),
      rank: 0,
      alternatives: ['hone-planner', 'hone-mapper'],
      ts: new Date().toISOString(),
    };
    appendChainEvent({
      path: chainPath,
      agent: 'router',
      outcome: 'router_pick',
      payload,
      type: 'router_pick',
      timestamp: new Date().toISOString(),
      sessionId: 'router-cli',
    });

    const records = Array.from(readChain({ path: chainPath }));
    assert.equal(records.length, 1, 'one router_pick chain row written');

    // Project the chain record back to the events-schema envelope.
    const projected = {
      type: records[0].type,
      timestamp: records[0].timestamp,
      sessionId: records[0].sessionId,
      payload: records[0].payload,
    };
    const validator = makeValidator();
    const ok = validator(projected);
    if (!ok) console.error('errs:', JSON.stringify(validator.errors, null, 2));
    assert.equal(ok, true, 'projected emit-surface row validates as RouterPickPayload');

    // No PII: the payload carries a hash, never the raw intent.
    assert.equal(records[0].payload.context_hash.length, 64, 'context_hash is a sha256 hex digest');
    assert.notEqual(records[0].payload.context_hash, intent, 'raw intent is NOT stored — hash only');
    assert.equal('raw_prompt' in records[0].payload, false, 'no raw_prompt field (no PII)');

    // Default chain path untouched (D-11 isolation).
    if (existedBefore) {
      const sizeAfter = readFileSync(defaultPath, 'utf8').length;
      assert.equal(sizeAfter, sizeBefore, 'default .design/gep/events.jsonl untouched');
    } else {
      assert.equal(existsSync(defaultPath), false, 'default chain path not created by tests');
    }
  } finally {
    rmTmpdir(dir);
  }
});

test('32-08: router-pick-emitter.md documents the appendChainEvent emit surface', () => {
  assert.equal(existsSync(EMITTER_PATH), true, 'skills/router/router-pick-emitter.md must exist');
  const doc = readFileSync(EMITTER_PATH, 'utf8');
  assert.match(doc, /appendChainEvent/, 'emitter doc invokes appendChainEvent');
  assert.match(doc, /router_pick/, 'emitter doc references the router_pick event type');
  assert.match(doc, /createHash\(["']sha256["']\)/, 'emitter hashes the intent (no PII)');
});
