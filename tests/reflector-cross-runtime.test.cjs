// tests/reflector-cross-runtime.test.cjs
//
// Plan 26-06 — reflector cross-runtime cost-arbitrage analysis (D-09).
//
// Two layers under test:
//
//   1. `scripts/lib/cost-arbitrage.cjs` — the pure analyze(events, opts)
//      → proposals[] helper that the reflector agent's "Cross-runtime
//      cost arbitrage" section drives. We exercise this directly with
//      synthetic event arrays so the assertions are deterministic.
//
//   2. `agents/design-reflector.md` — documents the rule (50% threshold,
//      structured proposal output, runtime-tagged data) so the agent
//      executing the skill knows to apply it. We assert that the
//      methodology is documented in the body.
//
// Per CONTEXT.md D-09:
//
//   * Surface "agent X tier Y in runtime A averaged $N/cycle, agent X
//     tier Y in runtime B averaged $M/cycle, |M-N|/min(M,N) > 0.5 →
//     arbitrage signal" as a STRUCTURED proposal.
//   * Mixed-runtime cycle history (some agent spawns ran in CC, others
//     in Codex within the same cycle) doesn't crash reflector or produce
//     per-runtime double-counts.
//   * 50% threshold is a starting heuristic — bandit-style learning
//     over arbitrage outcomes is Phase 23.5+ territory (NOT in this
//     plan's scope; we don't extend the bandit posterior here).

'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { REPO_ROOT } = require('./helpers.ts');

const {
  analyze,
  extractCostRow,
  aggregateByCycle,
  DEFAULT_WINDOW_CYCLES,
  DEFAULT_THRESHOLD_PCT,
} = require('../scripts/lib/cost-arbitrage.cjs');

const REFLECTOR_PATH = path.join(REPO_ROOT, 'agents/design-reflector.md');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Build a synthetic cost.update event that matches the Phase 22 envelope
 * shape expected by the analyzer. `runtime` is stamped on payload (the
 * site Plan 26-05 will populate).
 */
function costEvent({ cycle, agent, tier, runtime, usd, sessionId }) {
  return {
    type: 'cost.update',
    timestamp: '2026-04-29T00:00:00.000Z',
    sessionId: sessionId || 'test-session',
    cycle,
    payload: { agent, tier, runtime, usd, tokens_in: 0, tokens_out: 0 },
  };
}

// ---------------------------------------------------------------------------
// Layer 1: cost-arbitrage helper
// ---------------------------------------------------------------------------

test('26-06: defaults match D-09 (5 cycles, 50% threshold)', () => {
  assert.equal(DEFAULT_WINDOW_CYCLES, 5);
  assert.equal(DEFAULT_THRESHOLD_PCT, 0.5);
});

test('26-06: empty / non-array input returns []', () => {
  assert.deepEqual(analyze([]), []);
  // Garbage inputs never throw (consumer shouldn't have to wrap in try).
  assert.deepEqual(analyze(null), []);
  assert.deepEqual(analyze(undefined), []);
  assert.deepEqual(analyze('not-an-array'), []);
});

test('26-06: extractCostRow filters non-cost events and malformed envelopes', () => {
  // Wrong type
  assert.equal(extractCostRow({ type: 'wave.started', payload: {} }), null);
  // No payload
  assert.equal(extractCostRow({ type: 'cost.update' }), null);
  // Missing agent
  assert.equal(extractCostRow({
    type: 'cost.update',
    cycle: 'c1',
    payload: { tier: 'opus', runtime: 'claude', usd: 0.5 },
  }), null);
  // Missing tier
  assert.equal(extractCostRow({
    type: 'cost.update',
    cycle: 'c1',
    payload: { agent: 'a', runtime: 'claude', usd: 0.5 },
  }), null);
  // Missing runtime
  assert.equal(extractCostRow({
    type: 'cost.update',
    cycle: 'c1',
    payload: { agent: 'a', tier: 'opus', usd: 0.5 },
  }), null);
  // Missing cycle (per-cycle averaging needs it)
  assert.equal(extractCostRow({
    type: 'cost.update',
    payload: { agent: 'a', tier: 'opus', runtime: 'claude', usd: 0.5 },
  }), null);
  // Non-finite usd
  assert.equal(extractCostRow({
    type: 'cost.update',
    cycle: 'c1',
    payload: { agent: 'a', tier: 'opus', runtime: 'claude', usd: NaN },
  }), null);
  // Happy path
  const ok = extractCostRow({
    type: 'cost.update',
    cycle: 'c1',
    payload: { agent: 'a', tier: 'opus', runtime: 'claude', usd: 0.5 },
  });
  assert.deepEqual(ok, { agent: 'a', tier: 'opus', runtime: 'claude', cycle: 'c1', usd: 0.5 });
});

test('26-06 (a): emits arbitrage proposal when one runtime spends >50% more on (agent, tier) over last 5 cycles', () => {
  // 5 cycles, design-reflector tier=opus.
  // claude:  $0.40 / cycle (5 cycles → $0.40 avg)
  // codex:   $1.00 / cycle (5 cycles → $1.00 avg)
  // delta_pct = (1.00 - 0.40) / 0.40 = 1.5 → well above 0.5 threshold.
  const events = [];
  for (let i = 1; i <= 5; i++) {
    const cycle = `cycle-${i}`;
    events.push(costEvent({ cycle, agent: 'design-reflector', tier: 'opus', runtime: 'claude', usd: 0.40 }));
    events.push(costEvent({ cycle, agent: 'design-reflector', tier: 'opus', runtime: 'codex', usd: 1.00 }));
  }
  const proposals = analyze(events);

  assert.equal(proposals.length, 1, 'exactly one (agent, tier) pair should fire');
  const p = proposals[0];
  assert.equal(p.type, 'cost_arbitrage');
  assert.equal(p.agent, 'design-reflector');
  assert.equal(p.tier, 'opus');
  assert.equal(p.evidence_window, 'last_5_cycles');
  assert.equal(p.runtimes.claude.n_cycles, 5);
  assert.equal(p.runtimes.codex.n_cycles, 5);
  assert.ok(Math.abs(p.runtimes.claude.avg_cost_per_cycle - 0.40) < 1e-9);
  assert.ok(Math.abs(p.runtimes.codex.avg_cost_per_cycle - 1.00) < 1e-9);
  assert.equal(p.delta_pct, 1.5);
  // Direction: arbitrage from expensive (codex) → cheap (claude).
  assert.match(p.proposal, /from codex to claude/);
  assert.match(p.proposal, /design-reflector/);
  assert.match(p.proposal, /tier=opus/);
});

test('26-06: silent when delta below 50% threshold', () => {
  // claude $1.00, codex $1.30 → delta_pct 0.30 < 0.5.
  const events = [];
  for (let i = 1; i <= 5; i++) {
    const cycle = `cycle-${i}`;
    events.push(costEvent({ cycle, agent: 'design-reflector', tier: 'opus', runtime: 'claude', usd: 1.00 }));
    events.push(costEvent({ cycle, agent: 'design-reflector', tier: 'opus', runtime: 'codex', usd: 1.30 }));
  }
  assert.deepEqual(analyze(events), []);
});

test('26-06 (b): mixed-runtime cycle history does not crash and does not double-count', () => {
  // Single cycle had multiple agent spawns; some in claude, some in codex.
  // Per-cycle bucket sum first, then average across cycles. Without
  // sum-then-average, claude's avg would be skewed by spawn count.
  //
  // cycle-1: claude has 4 spawns @ $0.10 (sum = $0.40), codex has 1 spawn @ $1.00
  // cycle-2: claude has 2 spawns @ $0.20 (sum = $0.40), codex has 1 spawn @ $1.00
  // cycle-3: claude has 1 spawn @ $0.40 (sum = $0.40), codex has 1 spawn @ $1.00
  // cycle-4: claude has 1 spawn @ $0.40 (sum = $0.40), codex has 1 spawn @ $1.00
  // cycle-5: claude has 1 spawn @ $0.40 (sum = $0.40), codex has 1 spawn @ $1.00
  //
  // Correct claude avg = $0.40 across 5 cycles.
  // Correct codex avg  = $1.00 across 5 cycles.
  // delta_pct = 1.5.
  const events = [];
  // cycle-1 (4 claude spawns + 1 codex)
  for (let k = 0; k < 4; k++) {
    events.push(costEvent({ cycle: 'cycle-1', agent: 'design-reflector', tier: 'opus', runtime: 'claude', usd: 0.10 }));
  }
  events.push(costEvent({ cycle: 'cycle-1', agent: 'design-reflector', tier: 'opus', runtime: 'codex', usd: 1.00 }));
  // cycle-2 (2 claude spawns + 1 codex)
  events.push(costEvent({ cycle: 'cycle-2', agent: 'design-reflector', tier: 'opus', runtime: 'claude', usd: 0.20 }));
  events.push(costEvent({ cycle: 'cycle-2', agent: 'design-reflector', tier: 'opus', runtime: 'claude', usd: 0.20 }));
  events.push(costEvent({ cycle: 'cycle-2', agent: 'design-reflector', tier: 'opus', runtime: 'codex', usd: 1.00 }));
  // cycle-3..5 (1 spawn each in each runtime)
  for (const cycle of ['cycle-3', 'cycle-4', 'cycle-5']) {
    events.push(costEvent({ cycle, agent: 'design-reflector', tier: 'opus', runtime: 'claude', usd: 0.40 }));
    events.push(costEvent({ cycle, agent: 'design-reflector', tier: 'opus', runtime: 'codex', usd: 1.00 }));
  }

  // Should not throw, and should produce exactly one correctly-counted proposal.
  let proposals;
  assert.doesNotThrow(() => { proposals = analyze(events); }, 'analyze must tolerate mixed-runtime cycles');
  assert.equal(proposals.length, 1);
  const p = proposals[0];
  // Critical anti-double-count assertion: n_cycles is the number of
  // distinct cycles each runtime appeared in, NOT the number of spawns.
  assert.equal(p.runtimes.claude.n_cycles, 5, 'claude n_cycles should be 5 (cycles), not 9 (spawns)');
  assert.equal(p.runtimes.codex.n_cycles, 5, 'codex n_cycles should be 5');
  // Averages reflect per-cycle sums, not per-spawn:
  assert.ok(Math.abs(p.runtimes.claude.avg_cost_per_cycle - 0.40) < 1e-9,
    `claude avg should be 0.40 (per-cycle sum), got ${p.runtimes.claude.avg_cost_per_cycle}`);
  assert.ok(Math.abs(p.runtimes.codex.avg_cost_per_cycle - 1.00) < 1e-9);
  assert.equal(p.delta_pct, 1.5);
});

test('26-06 (c): single-runtime-only history is silent (no false-positive arbitrage)', () => {
  // Five cycles, all runs in claude only. Even though the per-cycle
  // costs vary wildly, there's no second runtime to arbitrage against.
  const events = [];
  const usds = [0.10, 0.50, 0.90, 1.30, 1.70];
  for (let i = 0; i < 5; i++) {
    events.push(costEvent({
      cycle: `cycle-${i + 1}`,
      agent: 'design-reflector',
      tier: 'opus',
      runtime: 'claude',
      usd: usds[i],
    }));
  }
  const proposals = analyze(events);
  assert.deepEqual(proposals, [], 'single-runtime history must produce no proposals');
});

test('26-06: only the most recent N cycles count (window respects D-09 default of 5)', () => {
  // Build 7 cycles. In cycles 1-2 codex looks expensive; in cycles 3-7
  // (the window of 5) codex matches claude exactly. The default 5-cycle
  // window should evict cycles 1-2, killing the arbitrage signal.
  const events = [];
  // Old cycles (should fall outside window):
  events.push(costEvent({ cycle: 'old-1', agent: 'a', tier: 'opus', runtime: 'claude', usd: 0.10 }));
  events.push(costEvent({ cycle: 'old-1', agent: 'a', tier: 'opus', runtime: 'codex', usd: 5.00 }));
  events.push(costEvent({ cycle: 'old-2', agent: 'a', tier: 'opus', runtime: 'claude', usd: 0.10 }));
  events.push(costEvent({ cycle: 'old-2', agent: 'a', tier: 'opus', runtime: 'codex', usd: 5.00 }));
  // Recent cycles (inside window) — equal cost, no arbitrage:
  for (let i = 1; i <= 5; i++) {
    const cycle = `recent-${i}`;
    events.push(costEvent({ cycle, agent: 'a', tier: 'opus', runtime: 'claude', usd: 0.50 }));
    events.push(costEvent({ cycle, agent: 'a', tier: 'opus', runtime: 'codex', usd: 0.50 }));
  }
  assert.deepEqual(analyze(events), [],
    'old expensive-codex cycles should fall outside the 5-cycle window and produce no signal');
});

test('26-06: explicit windowCycles option overrides the default', () => {
  // Same 7-cycle setup as above, but pass windowCycles=7 → old expensive
  // codex cycles re-enter the window and the signal fires.
  const events = [];
  events.push(costEvent({ cycle: 'old-1', agent: 'a', tier: 'opus', runtime: 'claude', usd: 0.10 }));
  events.push(costEvent({ cycle: 'old-1', agent: 'a', tier: 'opus', runtime: 'codex', usd: 5.00 }));
  events.push(costEvent({ cycle: 'old-2', agent: 'a', tier: 'opus', runtime: 'claude', usd: 0.10 }));
  events.push(costEvent({ cycle: 'old-2', agent: 'a', tier: 'opus', runtime: 'codex', usd: 5.00 }));
  for (let i = 1; i <= 5; i++) {
    const cycle = `recent-${i}`;
    events.push(costEvent({ cycle, agent: 'a', tier: 'opus', runtime: 'claude', usd: 0.50 }));
    events.push(costEvent({ cycle, agent: 'a', tier: 'opus', runtime: 'codex', usd: 0.50 }));
  }
  const proposals = analyze(events, { windowCycles: 7 });
  assert.equal(proposals.length, 1);
  assert.equal(proposals[0].runtimes.claude.n_cycles, 7);
  assert.equal(proposals[0].runtimes.codex.n_cycles, 7);
  assert.equal(proposals[0].evidence_window, 'last_7_cycles');
});

test('26-06: explicit thresholdPct option overrides the default', () => {
  // delta_pct = 0.30; default threshold 0.50 → silent.
  // With thresholdPct=0.20 → fires.
  const events = [];
  for (let i = 1; i <= 5; i++) {
    const cycle = `cycle-${i}`;
    events.push(costEvent({ cycle, agent: 'a', tier: 'opus', runtime: 'claude', usd: 1.00 }));
    events.push(costEvent({ cycle, agent: 'a', tier: 'opus', runtime: 'codex', usd: 1.30 }));
  }
  assert.deepEqual(analyze(events), []);
  const proposals = analyze(events, { thresholdPct: 0.20 });
  assert.equal(proposals.length, 1);
  assert.equal(proposals[0].delta_pct, 0.3);
});

test('26-06: zero-cost denominators are handled (no Infinity% proposals)', () => {
  // claude averaged $0 across the window, codex averaged $1. Without
  // the zero-guard this would emit `delta_pct: Infinity` which is
  // useless to /gdd:apply-reflections. Helper must skip silently.
  const events = [];
  for (let i = 1; i <= 5; i++) {
    const cycle = `cycle-${i}`;
    events.push(costEvent({ cycle, agent: 'a', tier: 'opus', runtime: 'claude', usd: 0 }));
    events.push(costEvent({ cycle, agent: 'a', tier: 'opus', runtime: 'codex', usd: 1.00 }));
  }
  assert.deepEqual(analyze(events), []);
});

test('26-06: per-(agent, tier) pairs are independently analyzed', () => {
  // Two different (agent, tier) pairs, only one breaches the threshold.
  const events = [];
  for (let i = 1; i <= 5; i++) {
    const cycle = `cycle-${i}`;
    // Pair A: design-reflector, opus → arbitrage signal (claude cheap).
    events.push(costEvent({ cycle, agent: 'design-reflector', tier: 'opus', runtime: 'claude', usd: 0.30 }));
    events.push(costEvent({ cycle, agent: 'design-reflector', tier: 'opus', runtime: 'codex', usd: 1.00 }));
    // Pair B: design-verifier, sonnet → near-equal, no signal.
    events.push(costEvent({ cycle, agent: 'design-verifier', tier: 'sonnet', runtime: 'claude', usd: 0.20 }));
    events.push(costEvent({ cycle, agent: 'design-verifier', tier: 'sonnet', runtime: 'codex', usd: 0.22 }));
  }
  const proposals = analyze(events);
  assert.equal(proposals.length, 1);
  assert.equal(proposals[0].agent, 'design-reflector');
  assert.equal(proposals[0].tier, 'opus');
});

test('26-06: non-cost events in the stream are ignored (mixed-stream tolerance)', () => {
  // Reflector reads events.jsonl which carries every event type. The
  // helper must skip non-cost rows without crashing.
  const events = [];
  for (let i = 1; i <= 5; i++) {
    const cycle = `cycle-${i}`;
    events.push({ type: 'wave.started', cycle, payload: { wave: 'A', plan_count: 3 } });
    events.push({ type: 'reflection.proposed', cycle, payload: { kind: 'x', target_file: 'y', summary: 'z' } });
    events.push(costEvent({ cycle, agent: 'a', tier: 'opus', runtime: 'claude', usd: 0.40 }));
    events.push(costEvent({ cycle, agent: 'a', tier: 'opus', runtime: 'codex', usd: 1.00 }));
    // Malformed lines (parser would normally skip these too):
    events.push(null);
    events.push({ /* no type */ });
  }
  let proposals;
  assert.doesNotThrow(() => { proposals = analyze(events); });
  assert.equal(proposals.length, 1);
});

test('26-06: aggregateByCycle preserves first-appearance cycle ordering', () => {
  // First-appearance ordering is what drives the recency window. Verify
  // it's stable even when events for the same cycle are interleaved.
  const events = [
    costEvent({ cycle: 'b', agent: 'a', tier: 'opus', runtime: 'claude', usd: 0.10 }),
    costEvent({ cycle: 'a', agent: 'a', tier: 'opus', runtime: 'claude', usd: 0.10 }),
    costEvent({ cycle: 'b', agent: 'a', tier: 'opus', runtime: 'codex', usd: 0.20 }),
    costEvent({ cycle: 'c', agent: 'a', tier: 'opus', runtime: 'claude', usd: 0.10 }),
    costEvent({ cycle: 'a', agent: 'a', tier: 'opus', runtime: 'codex', usd: 0.20 }),
  ];
  const { cycleOrder } = aggregateByCycle(events);
  assert.deepEqual(cycleOrder, ['b', 'a', 'c'],
    'first-appearance order must be preserved (b, a, c) — not sorted (a, b, c)');
});

// ---------------------------------------------------------------------------
// Layer 2: design-reflector.md documents the rule
// ---------------------------------------------------------------------------

test('26-06: design-reflector.md documents the cross-runtime cost-arbitrage rule', () => {
  const body = fs.readFileSync(REFLECTOR_PATH, 'utf8');
  // The methodology must be discoverable as a section/header.
  assert.match(body, /Cross-runtime cost arbitrage/i,
    'reflector body should declare a "Cross-runtime cost arbitrage" section');
  // The 50% threshold (D-09) must be cited so the executor agent
  // applies the rule consistently.
  assert.match(body, /50%|0\.5/,
    'reflector body should cite the 50% / 0.5 arbitrage threshold');
  // Last 5 cycles (D-09 default window).
  assert.match(body, /5\s*cycles/i,
    'reflector body should cite the 5-cycle evidence window');
  // events.jsonl is the data source (Phase 22 cost.update events tagged
  // with runtime by Plan 26-05).
  assert.match(body, /events\.jsonl/,
    'reflector body should reference events.jsonl as the data source');
  assert.match(body, /runtime/i,
    'reflector body should mention runtime tagging on cost rows');
});

test('26-06: design-reflector.md output proposal shape matches helper', () => {
  const body = fs.readFileSync(REFLECTOR_PATH, 'utf8');
  // Structured proposal type tag (consumed by /gdd:apply-reflections).
  assert.match(body, /cost_arbitrage/,
    'reflector body should declare the `cost_arbitrage` proposal type');
  // The helper module is discoverable so the executor agent knows how
  // to compute the signal without re-deriving it.
  assert.match(body, /cost-arbitrage\.cjs|scripts\/lib\/cost-arbitrage/,
    'reflector body should reference the cost-arbitrage helper module');
});
