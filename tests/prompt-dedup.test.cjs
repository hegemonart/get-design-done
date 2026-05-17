// tests/prompt-dedup.test.cjs — Plan 27.6-06
//
// Verifies the D-11 prompt-deduplication analyzer:
//   - 3-agent threshold (>= 3 distinct agents reading same ref in same cycle)
//   - cycle scoping (cross-cycle reads do not cumulate)
//   - same-agent multiple reads count as 1 (distinct-agent count, not read count)
//   - preamble markdown shape (ref path, agent list, opt-out hint)
//   - emit-event side effect tolerates unavailable event-stream (lazy require)
//   - duplicates sorted alphabetically by ref_path

'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
  detectDuplicateReferenceReads,
  buildPreambleInjection,
  emitDedupInjection,
  DEFAULT_THRESHOLD,
} = require('../scripts/lib/prompt-dedup/index.cjs');

function makeReadEvent(agent, ref_path, cycle, hash) {
  return {
    type: 'reference.read',
    timestamp: new Date().toISOString(),
    sessionId: 's1',
    cycle,
    payload: { agent, ref_path, content_hash: hash },
  };
}

test('27.6-06: DEFAULT_THRESHOLD is 3 (D-11 invariant)', () => {
  assert.equal(DEFAULT_THRESHOLD, 3);
});

test('27.6-06: detectDuplicateReferenceReads returns empty when below threshold (2 agents)', () => {
  const events = [
    makeReadEvent('design-verifier', 'reference/x.md', 'c1', 'h1'),
    makeReadEvent('design-planner', 'reference/x.md', 'c1', 'h1'),
  ];
  const r = detectDuplicateReferenceReads({ events });
  assert.equal(r.duplicates.length, 0, '2 distinct agents < threshold 3 → no duplicates');
});

test('27.6-06: detectDuplicateReferenceReads flags at exactly 3 agents (D-11 threshold)', () => {
  const events = [
    makeReadEvent('design-verifier', 'reference/x.md', 'c1', 'h1'),
    makeReadEvent('design-planner', 'reference/x.md', 'c1', 'h1'),
    makeReadEvent('design-executor', 'reference/x.md', 'c1', 'h1'),
  ];
  const r = detectDuplicateReferenceReads({ events });
  assert.equal(r.duplicates.length, 1, 'exactly 3 distinct agents on same ref → 1 duplicate');
  assert.equal(r.duplicates[0].ref_path, 'reference/x.md');
  assert.equal(r.duplicates[0].agents.length, 3);
  assert.equal(r.duplicates[0].hash, 'h1');
  assert.equal(r.duplicates[0].cycle, 'c1');
});

test('27.6-06: same agent reading 5 times counts as 1 agent (NOT a duplicate)', () => {
  const events = [
    makeReadEvent('design-verifier', 'reference/x.md', 'c1', 'h1'),
    makeReadEvent('design-verifier', 'reference/x.md', 'c1', 'h1'),
    makeReadEvent('design-verifier', 'reference/x.md', 'c1', 'h1'),
    makeReadEvent('design-verifier', 'reference/x.md', 'c1', 'h1'),
    makeReadEvent('design-verifier', 'reference/x.md', 'c1', 'h1'),
  ];
  const r = detectDuplicateReferenceReads({ events });
  assert.equal(r.duplicates.length, 0, '1 distinct agent × 5 reads → not a duplicate');
});

test('27.6-06: cycle filter scopes detection (cross-cycle reads do not cumulate)', () => {
  const events = [
    makeReadEvent('design-verifier', 'reference/x.md', 'c1', 'h1'),
    makeReadEvent('design-planner', 'reference/x.md', 'c1', 'h1'),
    makeReadEvent('design-executor', 'reference/x.md', 'c1', 'h1'),
    makeReadEvent('design-reflector', 'reference/x.md', 'c2', 'h1'),
    makeReadEvent('design-discussant', 'reference/x.md', 'c2', 'h1'),
  ];
  const c1Result = detectDuplicateReferenceReads({ events, cycle: 'c1' });
  assert.equal(c1Result.duplicates.length, 1, 'cycle c1 has 3 distinct agents');
  const c2Result = detectDuplicateReferenceReads({ events, cycle: 'c2' });
  assert.equal(c2Result.duplicates.length, 0, 'cycle c2 has only 2 distinct agents');
});

test('27.6-06: buildPreambleInjection returns empty string for empty duplicates', () => {
  assert.equal(buildPreambleInjection({ duplicates: [] }), '');
  assert.equal(buildPreambleInjection({}), '');
  assert.equal(buildPreambleInjection({ duplicates: undefined }), '');
});

test('27.6-06: buildPreambleInjection produces markdown with ref path + agents + opt-out hint', () => {
  const duplicates = [{
    ref_path: 'reference/x.md',
    agents: ['design-executor', 'design-planner', 'design-verifier'],
    hash: 'abc123',
    cycle: 'c1',
  }];
  const text = buildPreambleInjection({ duplicates });
  assert.ok(text.includes('## Shared Context'), 'header present');
  assert.ok(text.includes('reference/x.md'), 'ref path present');
  assert.ok(text.includes('design-executor, design-planner, design-verifier'), 'agent list present');
  assert.ok(text.includes('GDD_DEDUP_OPT_OUT'), 'opt-out hint present');
  assert.ok(text.includes('abc123'), 'hash present');
});

test('27.6-06: emitDedupInjection does not throw under unavailable event-stream', () => {
  assert.doesNotThrow(() => emitDedupInjection({
    duplicates: [{
      ref_path: 'reference/y.md',
      agents: ['design-verifier', 'design-planner', 'design-executor'],
      hash: 'h2',
      cycle: 'c1',
    }],
    sessionId: 'test-session',
  }));
});

test('27.6-06: emitDedupInjection with no duplicates is a no-op (does not throw)', () => {
  assert.doesNotThrow(() => emitDedupInjection({ duplicates: [] }));
  assert.doesNotThrow(() => emitDedupInjection({}));
});

test('27.6-06: multiple duplicates sorted alphabetically by ref_path', () => {
  const events = [
    // ref zeta — 3 agents in cycle c1
    makeReadEvent('a-agent', 'reference/zeta.md', 'c1', 'hz'),
    makeReadEvent('b-agent', 'reference/zeta.md', 'c1', 'hz'),
    makeReadEvent('c-agent', 'reference/zeta.md', 'c1', 'hz'),
    // ref alpha — 3 agents in cycle c1
    makeReadEvent('a-agent', 'reference/alpha.md', 'c1', 'ha'),
    makeReadEvent('b-agent', 'reference/alpha.md', 'c1', 'ha'),
    makeReadEvent('c-agent', 'reference/alpha.md', 'c1', 'ha'),
  ];
  const r = detectDuplicateReferenceReads({ events });
  assert.equal(r.duplicates.length, 2);
  assert.equal(r.duplicates[0].ref_path, 'reference/alpha.md', 'alpha < zeta');
  assert.equal(r.duplicates[1].ref_path, 'reference/zeta.md');
});

test('27.6-06: malformed events ignored (defensive filter)', () => {
  const events = [
    null,
    undefined,
    {},
    { type: 'something.else', payload: { agent: 'a', ref_path: 'r/x.md' } },
    { type: 'reference.read' },  // no payload
    { type: 'reference.read', payload: { agent: 'a' } },  // no ref_path
    { type: 'reference.read', payload: { ref_path: 'r/x.md' } },  // no agent
    // 3 valid reads to confirm filter ignores malformed
    makeReadEvent('a', 'r/x.md', 'c1', 'h'),
    makeReadEvent('b', 'r/x.md', 'c1', 'h'),
    makeReadEvent('c', 'r/x.md', 'c1', 'h'),
  ];
  const r = detectDuplicateReferenceReads({ events });
  assert.equal(r.duplicates.length, 1);
  assert.equal(r.duplicates[0].agents.length, 3);
});

test('27.6-06: custom threshold overrides DEFAULT_THRESHOLD', () => {
  const events = [
    makeReadEvent('a', 'r/x.md', 'c1', 'h'),
    makeReadEvent('b', 'r/x.md', 'c1', 'h'),
  ];
  // Default threshold = 3 → no duplicates
  assert.equal(detectDuplicateReferenceReads({ events }).duplicates.length, 0);
  // Custom threshold = 2 → 1 duplicate
  assert.equal(detectDuplicateReferenceReads({ events, threshold: 2 }).duplicates.length, 1);
});
