// tests/event-types-registry.test.ts — Plan 22-01 registry expansion
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { KNOWN_EVENT_TYPES } from '../scripts/lib/event-stream/index.ts';

test('22-01: KNOWN_EVENT_TYPES has all 26 pre-registered subtypes (23 from Phase 20+22, +3 from Phase 27)', () => {
  // Phase 20 + 22 = 23 types. Phase 27 (Plan 27-08) added 3 peer-call types
  // (peer_call_started, peer_call_complete, peer_call_failed) for the
  // delegation event chain. New types are additive — no removals — so
  // this assertion grows monotonically across phases.
  assert.equal(KNOWN_EVENT_TYPES.length, 26);
});

test('22-01: each Phase 20 subtype is registered', () => {
  const required = [
    'state.mutation',
    'state.transition',
    'stage.entered',
    'stage.exited',
    'hook.fired',
    'error',
  ];
  for (const t of required) {
    assert.ok(KNOWN_EVENT_TYPES.includes(t), `missing Phase-20 type: ${t}`);
  }
});

test('22-01: each Phase 22 new subtype is registered', () => {
  const required = [
    'wave.started',
    'wave.completed',
    'blocker.added',
    'decision.added',
    'must_have.added',
    'parallelism.verdict',
    'cost.update',
    'rate_limit',
    'api.retry',
    'compact.boundary',
    'mcp.probe',
    'reflection.proposed',
    'connection.status_change',
    'tool_call.started',
    'tool_call.completed',
    'agent.spawn',
    'agent.outcome',
  ];
  for (const t of required) {
    assert.ok(KNOWN_EVENT_TYPES.includes(t), `missing Phase-22 type: ${t}`);
  }
});

test('22-01: no duplicate event types', () => {
  const set = new Set(KNOWN_EVENT_TYPES);
  assert.equal(set.size, KNOWN_EVENT_TYPES.length);
});
