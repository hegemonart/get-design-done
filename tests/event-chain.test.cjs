// tests/event-chain.test.cjs — Plan 22-04 event-chain
'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { mkdtempSync, rmSync, readFileSync, existsSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { join } = require('node:path');

const {
  appendChainEvent,
  readChain,
  walkParents,
  chainPathFor,
  DEFAULT_CHAIN_PATH,
} = require('../scripts/lib/event-chain.cjs');

test('22-04: DEFAULT_CHAIN_PATH points at .design/gep/events.jsonl', () => {
  assert.equal(DEFAULT_CHAIN_PATH, '.design/gep/events.jsonl');
});

test('22-04: appendChainEvent generates UUID when not provided', () => {
  const dir = mkdtempSync(join(tmpdir(), 'gdd-gep-'));
  try {
    const id = appendChainEvent({
      path: join(dir, 'chain.jsonl'),
      agent: 'design-planner',
      outcome: 'pass',
    });
    assert.match(id, /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('22-04: appendChainEvent honours supplied event_id', () => {
  const dir = mkdtempSync(join(tmpdir(), 'gdd-gep-id-'));
  try {
    const path = join(dir, 'chain.jsonl');
    const myId = '00000000-1111-2222-3333-444444444444';
    const id = appendChainEvent({ path, event_id: myId, agent: 'a', outcome: 'pass' });
    assert.equal(id, myId);
    const parsed = JSON.parse(readFileSync(path, 'utf8').trim());
    assert.equal(parsed.event_id, myId);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('22-04: appendChainEvent throws on missing agent or outcome', () => {
  assert.throws(() => appendChainEvent({ outcome: 'pass' }), /agent/);
  assert.throws(() => appendChainEvent({ agent: 'a' }), /outcome/);
});

test('22-04: walkParents returns A→root chain for A→B→C', () => {
  const dir = mkdtempSync(join(tmpdir(), 'gdd-gep-walk-'));
  try {
    const path = join(dir, 'chain.jsonl');
    const a = appendChainEvent({ path, agent: 'design-planner', outcome: 'pass' });
    const b = appendChainEvent({
      path,
      parent_event_id: a,
      agent: 'design-executor',
      outcome: 'pass',
      decision_refs: ['D-13'],
    });
    const c = appendChainEvent({
      path,
      parent_event_id: b,
      agent: 'design-verifier',
      outcome: 'fail',
      rollback_reason: 'gap_count > 0',
    });
    const chain = walkParents(c, { path });
    assert.equal(chain.length, 3);
    assert.equal(chain[0].event_id, c);
    assert.equal(chain[1].event_id, b);
    assert.equal(chain[2].event_id, a);
    assert.equal(chain[0].rollback_reason, 'gap_count > 0');
    assert.deepEqual(chain[1].decision_refs, ['D-13']);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('22-04: readChain skips invalid lines but yields valid ones', () => {
  const dir = mkdtempSync(join(tmpdir(), 'gdd-gep-bad-'));
  try {
    const path = join(dir, 'chain.jsonl');
    appendChainEvent({ path, agent: 'a', outcome: 'pass' });
    // append invalid line
    require('node:fs').appendFileSync(path, '{"this is not json\n');
    appendChainEvent({ path, agent: 'b', outcome: 'pass' });
    const events = Array.from(readChain({ path }));
    assert.equal(events.length, 2);
    assert.equal(events[0].agent, 'a');
    assert.equal(events[1].agent, 'b');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('22-04: walkParents returns [] for unknown event_id', () => {
  const dir = mkdtempSync(join(tmpdir(), 'gdd-gep-unknown-'));
  try {
    const path = join(dir, 'chain.jsonl');
    appendChainEvent({ path, agent: 'a', outcome: 'pass' });
    const chain = walkParents('does-not-exist', { path });
    assert.equal(chain.length, 0);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('22-04: opaque extra fields preserved in record', () => {
  const dir = mkdtempSync(join(tmpdir(), 'gdd-gep-opaque-'));
  try {
    const path = join(dir, 'chain.jsonl');
    appendChainEvent({
      path,
      agent: 'a',
      outcome: 'pass',
      task_id: 'T-22-01',
      tier: 'opus',
    });
    const parsed = JSON.parse(readFileSync(path, 'utf8').trim());
    assert.equal(parsed.task_id, 'T-22-01');
    assert.equal(parsed.tier, 'opus');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('22-04: chainPathFor handles relative + absolute', () => {
  const abs = chainPathFor({ path: '/abs/path.jsonl' });
  assert.equal(abs, '/abs/path.jsonl');
  const rel = chainPathFor({ baseDir: '/proj', path: 'sub/x.jsonl' });
  assert.equal(rel, '/proj/sub/x.jsonl');
});

test('22-04: walkParents safe against self-cycle (defensive)', () => {
  const dir = mkdtempSync(join(tmpdir(), 'gdd-gep-cycle-'));
  try {
    const path = join(dir, 'chain.jsonl');
    const fixed = '11111111-1111-1111-1111-111111111111';
    // craft a self-cycle event by hand
    require('node:fs').appendFileSync(
      path,
      JSON.stringify({
        event_id: fixed,
        parent_event_id: fixed, // points at itself
        agent: 'a',
        outcome: 'pass',
        decision_refs: [],
        ts: '2026-04-25T00:00:00.000Z',
      }) + '\n',
    );
    const chain = walkParents(fixed, { path });
    // must not infinite-loop; chain length should be 1
    assert.equal(chain.length, 1);
    assert.equal(chain[0].event_id, fixed);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
