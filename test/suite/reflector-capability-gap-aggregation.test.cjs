// tests/reflector-capability-gap-aggregation.test.cjs — Plan 29-03
//
// Tests for `scripts/lib/reflector-capability-gap-aggregator.cjs`:
//   - aggregateCapabilityGaps(events) — clusters by context_hash, returns
//     ordered {clusters: [...]} skipping non-capability_gap rows.
//   - renderGapsSection(clusters) — markdown emitter, empty list → ''.
//   - evaluateStageGate(history, config) — D-01/D-03 Stage-0 → Stage-1
//     gate evaluator. Closed-form Beta-stddev, no auto-flip.
//   - hone-events CLI `--type <typename>` flag (desugars to grep type=<n>).
//
// D-11: synthetic inline fixtures only — no live `.design/gep/events.jsonl`
// reads or writes. Each CLI test seeds its own tmpdir JSONL file.
'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { mkdtempSync, rmSync, writeFileSync, readFileSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { join } = require('node:path');
const { spawnSync } = require('node:child_process');
const { randomUUID } = require('node:crypto');

const {
  aggregateCapabilityGaps,
  renderGapsSection,
  evaluateStageGate,
} = require('../../scripts/lib/reflector-capability-gap-aggregator.cjs');

const CLI = join(__dirname, '../..', 'scripts', 'cli', 'hone-events.mjs');

// Node 24 on Windows crashes the child process (STATUS_STACK_BUFFER_OVERRUN
// 0xC0000409) when it imports our .mjs CLI which dynamic-imports type-stripped
// .ts modules. Skip CLI suite there until Node patches it. Same skip as
// tests/cli-events.test.cjs.
const SKIP_PLATFORM = (() => {
  if (process.platform !== 'win32') return false;
  const major = Number(process.versions.node.split('.')[0]);
  return major >= 24;
})();

function runCli(args, opts = {}) {
  const major = Number(process.versions.node.split('.')[0]);
  const flags = major < 23 ? ['--experimental-strip-types'] : [];
  return spawnSync(
    process.execPath,
    [...flags, CLI, ...args],
    { encoding: 'utf8', timeout: 5000, ...opts },
  );
}

function mkTmpdir() {
  return mkdtempSync(join(tmpdir(), 'reflector-capgap-test-'));
}

function rmTmpdir(dir) {
  rmSync(dir, { recursive: true, force: true });
}

/**
 * Build a chain-shaped capability_gap record per 29-01 schema, mirroring
 * `appendChainEvent` output. Returns the in-memory record.
 */
function makeChainRecord(opts = {}) {
  const source = opts.source || 'fast';
  const context_hash =
    opts.context_hash ||
    'a'.repeat(64); // 64-hex sha256-like default
  return {
    event_id: randomUUID(),
    parent_event_id: null,
    ts: '2026-05-19T22:00:00.000Z',
    agent: source,
    decision_refs: [],
    outcome: 'capability_gap',
    type: 'capability_gap',
    timestamp: '2026-05-19T22:00:00.000Z',
    sessionId: opts.sessionId || 'syn-' + randomUUID().slice(0, 8),
    payload: {
      event_id: randomUUID(),
      parent_event_id: null,
      source,
      context_hash,
      intent_summary: opts.intent || `intent for ${context_hash.slice(0, 8)}`,
      suggested_kind: source === 'fast' ? 'skill' : 'agent',
      evidence_refs: opts.evidence_refs || [],
    },
  };
}

// ---------------------------------------------------------------------------
// Test 1 — aggregation: 7 capability_gap events spanning 3 distinct
// context_hash values + 1 unrelated event type → 3 clusters, non-capgap
// events excluded.

test('29-03 T1: aggregateCapabilityGaps clusters by context_hash and excludes other types', () => {
  const HASH_A = 'a'.repeat(64);
  const HASH_B = 'b'.repeat(64);
  const HASH_C = 'c'.repeat(64);

  const events = [
    // HASH_A: 3 events (2 fast, 1 router)
    makeChainRecord({ context_hash: HASH_A, source: 'fast' }),
    makeChainRecord({
      context_hash: HASH_A,
      source: 'fast',
      evidence_refs: [
        { trajectory_path: 'tj/a1.jsonl', byte_start: 0, byte_end: 10, content_hash: 'sha256:' + 'a'.repeat(64) },
      ],
    }),
    makeChainRecord({
      context_hash: HASH_A,
      source: 'router',
      evidence_refs: [
        { trajectory_path: 'tj/a2.jsonl', byte_start: 0, byte_end: 10, content_hash: 'sha256:' + 'b'.repeat(64) },
      ],
    }),
    // HASH_B: 2 events (1 router, 1 reflector_pattern)
    makeChainRecord({ context_hash: HASH_B, source: 'router' }),
    makeChainRecord({ context_hash: HASH_B, source: 'reflector_pattern' }),
    // HASH_C: 2 events (1 fast, 1 reflector_pattern)
    makeChainRecord({ context_hash: HASH_C, source: 'fast' }),
    makeChainRecord({ context_hash: HASH_C, source: 'reflector_pattern' }),
    // unrelated event type — must be ignored
    { type: 'state.transition', timestamp: 'x', sessionId: 's', payload: { context_hash: HASH_A } },
    { type: 'hook.fired', timestamp: 'x', sessionId: 's', payload: {} },
  ];

  const { clusters } = aggregateCapabilityGaps(events);

  assert.equal(clusters.length, 3, 'expected exactly 3 clusters');

  // Ordered by size desc — HASH_A (3) > HASH_B (2) = HASH_C (2). Tie-break by id asc:
  // HASH_B starts with 'b' < HASH_C starts with 'c'.
  assert.equal(clusters[0].id, HASH_A.slice(0, 12));
  assert.equal(clusters[0].size, 3);
  assert.deepEqual(clusters[0].sources, { fast: 2, router: 1, reflector_pattern: 0 });
  assert.equal(clusters[0].examples.length, 2, 'two evidence_refs supplied for HASH_A');

  assert.equal(clusters[1].id, HASH_B.slice(0, 12));
  assert.equal(clusters[1].size, 2);
  assert.deepEqual(clusters[1].sources, { fast: 0, router: 1, reflector_pattern: 1 });

  assert.equal(clusters[2].id, HASH_C.slice(0, 12));
  assert.equal(clusters[2].size, 2);
  assert.deepEqual(clusters[2].sources, { fast: 1, router: 0, reflector_pattern: 1 });
});

test('29-03 T1b: examples are capped at 3 evidence_refs per cluster', () => {
  const HASH = 'd'.repeat(64);
  const events = [];
  for (let i = 0; i < 5; i++) {
    events.push(
      makeChainRecord({
        context_hash: HASH,
        source: 'fast',
        evidence_refs: [
          { trajectory_path: `tj/${i}.jsonl`, byte_start: 0, byte_end: 10, content_hash: 'sha256:' + String(i).padEnd(64, '0') },
        ],
      }),
    );
  }
  const { clusters } = aggregateCapabilityGaps(events);
  assert.equal(clusters.length, 1);
  assert.equal(clusters[0].size, 5);
  assert.ok(clusters[0].examples.length <= 3, 'examples capped at 3');
});

// ---------------------------------------------------------------------------
// Test 2 — render: empty cluster list → '', non-empty → header + table.

test('29-03 T2: renderGapsSection returns empty string when no clusters', () => {
  assert.equal(renderGapsSection([]), '');
});

test('29-03 T2b: renderGapsSection emits header and table rows for non-empty list', () => {
  const HASH_A = 'a'.repeat(64);
  const HASH_B = 'b'.repeat(64);
  const clusters = [
    {
      id: HASH_A.slice(0, 12),
      size: 4,
      sources: { fast: 2, router: 1, reflector_pattern: 1 },
      examples: ['tj/a1.jsonl', 'tj/a2.jsonl'],
    },
    {
      id: HASH_B.slice(0, 12),
      size: 2,
      sources: { fast: 0, router: 2, reflector_pattern: 0 },
      examples: [],
    },
  ];
  const md = renderGapsSection(clusters);
  assert.ok(md.includes('## Capability gaps observed'), 'header present');
  // Table header
  assert.ok(md.includes('| Cluster | Size | fast | router | reflector_pattern | Example evidence |'), 'table header row');
  // First row contains truncated id + size 4
  assert.ok(md.includes(`\`${HASH_A.slice(0, 12)}\``), 'cluster A truncated id rendered as code');
  assert.ok(md.includes('| 4 |'), 'cluster A size rendered');
  // Second cluster too
  assert.ok(md.includes(`\`${HASH_B.slice(0, 12)}\``), 'cluster B truncated id rendered');
});

// ---------------------------------------------------------------------------
// Test 3 — gate crossed: 3 clusters each appearing in M=10 consecutive cycles
// AND posterior stddev < 0.05. The M=10 floor is the cycle-coverage gate
// (consecutive-presence); the stddev gate further demands enough observations
// that Beta(α=appearances+1, β=(observed-appearances)+1) has narrow credible
// interval. For a 100%-present cluster, stddev < 0.05 first holds at ≥ 24
// cycles (α=25, β=1 → sd ≈ 0.039). The test below uses 30 cycles so all
// three clusters comfortably clear both gates with default K=3/M=10/sd<0.05.

test('29-03 T3: evaluateStageGate returns crossed=true when K=3 clusters appear in ≥M consecutive cycles with narrow posterior', () => {
  const HASH_A = 'a'.repeat(64);
  const HASH_B = 'b'.repeat(64);
  const HASH_C = 'c'.repeat(64);
  const history = [];
  const CYCLES = 30;
  for (let i = 0; i < CYCLES; i++) {
    history.push({
      cycle_slug: `cycle-${i}`,
      clusters: [
        { id: HASH_A.slice(0, 12), size: 5, sources: { fast: 5, router: 0, reflector_pattern: 0 }, examples: [] },
        { id: HASH_B.slice(0, 12), size: 4, sources: { fast: 0, router: 4, reflector_pattern: 0 }, examples: [] },
        { id: HASH_C.slice(0, 12), size: 3, sources: { fast: 1, router: 2, reflector_pattern: 0 }, examples: [] },
      ],
    });
  }
  const config = { K: 3, M: 10, stddev_threshold: 0.05 };
  const result = evaluateStageGate(history, config);
  assert.equal(result.crossed, true, 'gate should be crossed (3 stable clusters over 30 cycles)');
  assert.equal(result.stable_cluster_ids.length, 3, 'three stable clusters');
  assert.equal(result.cycles_observed, CYCLES);
  // All three must be reported (set membership)
  const ids = new Set(result.stable_cluster_ids);
  assert.ok(ids.has(HASH_A.slice(0, 12)));
  assert.ok(ids.has(HASH_B.slice(0, 12)));
  assert.ok(ids.has(HASH_C.slice(0, 12)));
});

test('29-03 T3b: evaluateStageGate does NOT cross at the M=10 floor when posterior stddev is still wide', () => {
  // Floor-test: 10 consecutive cycles + 100% present produces
  // α=11, β=1 → stddev ≈ 0.077 — does NOT meet the < 0.05 threshold.
  // This confirms the stddev gate is the binding constraint with default
  // thresholds; M=10 is the lower-bound observation window only.
  const HASH = 'f'.repeat(64);
  const history = [];
  for (let i = 0; i < 10; i++) {
    history.push({
      cycle_slug: `cycle-${i}`,
      clusters: [
        { id: HASH.slice(0, 12), size: 1, sources: { fast: 1, router: 0, reflector_pattern: 0 }, examples: [] },
      ],
    });
  }
  const result = evaluateStageGate(history, { K: 1, M: 10, stddev_threshold: 0.05 });
  assert.equal(result.crossed, false, 'stddev gate must hold cluster out at the M=10 floor');
  assert.equal(result.stable_cluster_ids.length, 0);
  assert.equal(result.cycles_observed, 10);
});

// ---------------------------------------------------------------------------
// Test 4 — gate not crossed: 2 stable + 1 noisy cluster (appears only
// in the first N of 30 cycles, breaking the consecutive-presence run).

test('29-03 T4: evaluateStageGate returns crossed=false when only 2/K=3 stable clusters present', () => {
  const HASH_A = 'a'.repeat(64);
  const HASH_B = 'b'.repeat(64);
  const HASH_NOISY = 'd'.repeat(64);
  const history = [];
  const CYCLES = 30;
  for (let i = 0; i < CYCLES; i++) {
    const cycleClusters = [
      { id: HASH_A.slice(0, 12), size: 5, sources: { fast: 5, router: 0, reflector_pattern: 0 }, examples: [] },
      { id: HASH_B.slice(0, 12), size: 4, sources: { fast: 0, router: 4, reflector_pattern: 0 }, examples: [] },
    ];
    // Noisy cluster: appears in only the first 4 of 30 cycles —
    // breaks both the consecutive-presence requirement (run < M=10)
    // AND the stddev gate (Beta(5, 27) → sd ≈ 0.065 also wide).
    if (i < 4) {
      cycleClusters.push({
        id: HASH_NOISY.slice(0, 12),
        size: 1,
        sources: { fast: 1, router: 0, reflector_pattern: 0 },
        examples: [],
      });
    }
    history.push({ cycle_slug: `cycle-${i}`, clusters: cycleClusters });
  }
  const config = { K: 3, M: 10, stddev_threshold: 0.05 };
  const result = evaluateStageGate(history, config);
  assert.equal(result.crossed, false, 'gate not crossed — only 2 clusters stable');
  assert.equal(result.stable_cluster_ids.length, 2, 'two stable clusters');
  const ids = new Set(result.stable_cluster_ids);
  assert.ok(ids.has(HASH_A.slice(0, 12)));
  assert.ok(ids.has(HASH_B.slice(0, 12)));
  assert.ok(!ids.has(HASH_NOISY.slice(0, 12)), 'noisy cluster must NOT be reported as stable');
});

test('29-03 T4b: evaluateStageGate handles fewer-than-M cycles (cycles_observed < M)', () => {
  const HASH_A = 'a'.repeat(64);
  const history = [];
  for (let i = 0; i < 5; i++) {
    history.push({
      cycle_slug: `cycle-${i}`,
      clusters: [
        { id: HASH_A.slice(0, 12), size: 5, sources: { fast: 5, router: 0, reflector_pattern: 0 }, examples: [] },
      ],
    });
  }
  const config = { K: 3, M: 10, stddev_threshold: 0.05 };
  const result = evaluateStageGate(history, config);
  assert.equal(result.crossed, false, 'gate not crossed — insufficient cycles');
  assert.equal(result.cycles_observed, 5);
});

// ---------------------------------------------------------------------------
// Test 5 — CLI: spawn `hone-events --type capability_gap --path=<fixture>`
// against a synthetic JSONL and assert stdout contains only capability_gap.

test('29-03 T5: hone-events --type capability_gap filters to matching events only', { skip: SKIP_PLATFORM }, () => {
  const dir = mkTmpdir();
  try {
    const fixturePath = join(dir, 'events.jsonl');
    const lines = [
      { type: 'capability_gap', timestamp: 't1', sessionId: 's1', payload: { source: 'fast', context_hash: 'a'.repeat(64) } },
      { type: 'state.transition', timestamp: 't2', sessionId: 's2', payload: {} },
      { type: 'capability_gap', timestamp: 't3', sessionId: 's3', payload: { source: 'router', context_hash: 'b'.repeat(64) } },
      { type: 'hook.fired', timestamp: 't4', sessionId: 's4', payload: {} },
    ];
    writeFileSync(fixturePath, lines.map((l) => JSON.stringify(l)).join('\n') + '\n');

    const r = runCli(['--type', 'capability_gap', `--path=${fixturePath}`]);
    assert.equal(r.status, 0, `stderr: ${r.stderr}`);
    const out = r.stdout.trim().split('\n').filter(Boolean);
    assert.equal(out.length, 2, 'two capability_gap rows');
    for (const line of out) {
      const ev = JSON.parse(line);
      assert.equal(ev.type, 'capability_gap');
    }
  } finally {
    rmTmpdir(dir);
  }
});

test('29-03 T5b: hone-events --type=<typename> equals-form is supported', { skip: SKIP_PLATFORM }, () => {
  const dir = mkTmpdir();
  try {
    const fixturePath = join(dir, 'events.jsonl');
    const lines = [
      { type: 'capability_gap', timestamp: 't1', sessionId: 's1', payload: {} },
      { type: 'hook.fired', timestamp: 't2', sessionId: 's2', payload: {} },
    ];
    writeFileSync(fixturePath, lines.map((l) => JSON.stringify(l)).join('\n') + '\n');

    const r = runCli([`--type=capability_gap`, `--path=${fixturePath}`]);
    assert.equal(r.status, 0, `stderr: ${r.stderr}`);
    const out = r.stdout.trim().split('\n').filter(Boolean);
    assert.equal(out.length, 1);
    assert.equal(JSON.parse(out[0]).type, 'capability_gap');
  } finally {
    rmTmpdir(dir);
  }
});

// ---------------------------------------------------------------------------
// Additional coverage: aggregator can read from a chain-file path (string),
// not just an in-memory iterable. Critical for the reflector pass which
// passes the .design/gep/events.jsonl path.

test('29-03 T6: aggregateCapabilityGaps accepts a file path (JSONL) and reads it', () => {
  const dir = mkTmpdir();
  try {
    const HASH = 'e'.repeat(64);
    const lines = [
      makeChainRecord({ context_hash: HASH, source: 'fast' }),
      makeChainRecord({ context_hash: HASH, source: 'fast' }),
      { type: 'unrelated', timestamp: 't', sessionId: 's', payload: {} },
    ];
    const chainPath = join(dir, 'events.jsonl');
    writeFileSync(chainPath, lines.map((l) => JSON.stringify(l)).join('\n') + '\n');

    const { clusters } = aggregateCapabilityGaps(chainPath);
    assert.equal(clusters.length, 1, 'one cluster from path input');
    assert.equal(clusters[0].size, 2);
    assert.equal(clusters[0].id, HASH.slice(0, 12));
  } finally {
    rmTmpdir(dir);
  }
});

// D-11 / D-01: gate spec test — config overrides must be honoured.

test('29-03 T7: evaluateStageGate respects config overrides (K=2 + relaxed threshold)', () => {
  const HASH_A = 'a'.repeat(64);
  const HASH_B = 'b'.repeat(64);
  const history = [];
  // 10 cycles all-present + relaxed stddev_threshold (0.1) lets the
  // posterior pass at the M=10 floor. Confirms config overrides flow
  // through normalizeConfig and reach the gate evaluation.
  for (let i = 0; i < 10; i++) {
    history.push({
      cycle_slug: `cycle-${i}`,
      clusters: [
        { id: HASH_A.slice(0, 12), size: 5, sources: { fast: 5, router: 0, reflector_pattern: 0 }, examples: [] },
        { id: HASH_B.slice(0, 12), size: 4, sources: { fast: 0, router: 4, reflector_pattern: 0 }, examples: [] },
      ],
    });
  }
  const result = evaluateStageGate(history, { K: 2, M: 10, stddev_threshold: 0.1 });
  assert.equal(result.crossed, true, 'K=2 + sd<0.1 override → 2 stable clusters trigger gate');
  assert.equal(result.stable_cluster_ids.length, 2);
});
