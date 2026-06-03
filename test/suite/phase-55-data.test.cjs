// test/suite/phase-55-data.test.cjs — Phase 55 (GDD Dashboard, dep-free).
//
// Hermetic os.tmpdir fixtures for the dashboard DATA PLANE (executor A):
//   - sdk/dashboard/data/source.cjs        loadDashboardModel({root})
//   - sdk/dashboard/data/cost-aggregator.cjs  aggregateCosts / readCosts
//   - sdk/dashboard/data/discovery.cjs     discoverRuntimes / discoverWorktrees
//                                          / discoverSessions / recordSession
//
// All fixtures build a fake .design (STATE.md + telemetry/events.jsonl +
// telemetry/costs.jsonl + context-graph.json) under a tmpdir, pass {root}
// explicitly (never relying on cwd / package-root), and assert each section
// assembles. The absent-.design case asserts all-null/[] + degraded populated
// with NO throw. Deterministic; tagged '55-01:'.
'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
  mkdtempSync,
  rmSync,
  mkdirSync,
  writeFileSync,
  readFileSync,
} = require('node:fs');
const { tmpdir } = require('node:os');
const { join } = require('node:path');

const source = require('../../sdk/dashboard/data/source.cjs');
const costAgg = require('../../sdk/dashboard/data/cost-aggregator.cjs');
const discovery = require('../../sdk/dashboard/data/discovery.cjs');

// ---------------------------------------------------------------------------
// Fixture helpers
// ---------------------------------------------------------------------------

/** Make an empty tmp project root (no .design). */
function tmpRoot(prefix) {
  return mkdtempSync(join(tmpdir(), `gdd-dash-${prefix}-`));
}

/** A minimal-but-valid STATE.md the strict sdk/state parser accepts. */
function stateMd() {
  return [
    '---',
    'pipeline_state_version: 1',
    'stage: plan',
    'cycle: c-55',
    'wave: 1',
    'started_at: 2026-06-01',
    'last_checkpoint: 2026-06-03',
    '---',
    '',
    '<position>',
    'stage: plan',
    'wave: 1',
    'task_progress: 1/3',
    'status: in_progress',
    'handoff_source: -',
    'handoff_path: -',
    'skipped_stages: -',
    '</position>',
    '',
    '<decisions>',
    'D-1: Go fully dep-free (locked)',
    'D-2: Web layer swappable later (tentative)',
    '</decisions>',
    '',
    '<blockers>',
    '[plan] [2026-06-02]: waiting on graph fixture',
    '</blockers>',
    '',
  ].join('\n');
}

/** Build a fully-populated fake .design (+ .planning) under `root`. */
function seedDesign(root) {
  const design = join(root, '.design');
  mkdirSync(join(design, 'telemetry'), { recursive: true });
  mkdirSync(join(design, 'gep'), { recursive: true });

  writeFileSync(join(design, 'STATE.md'), stateMd(), 'utf8');

  // Telemetry events.jsonl — two well-formed BaseEvent lines.
  const ev1 = JSON.stringify({
    type: 'stage.entered',
    timestamp: '2026-06-03T10:00:00.000Z',
    sessionId: 's1',
    stage: 'plan',
    payload: { stage: 'plan' },
  });
  const ev2 = JSON.stringify({
    type: 'cost.update',
    timestamp: '2026-06-03T10:05:00.000Z',
    sessionId: 's1',
    cycle: 'c-55',
    payload: { agent: 'executor-a', tier: 'sonnet', usd: 0.02, tokens_in: 100, tokens_out: 50 },
  });
  writeFileSync(join(design, 'telemetry', 'events.jsonl'), ev1 + '\n' + ev2 + '\n', 'utf8');

  // costs.jsonl — on-disk shape (est_cost_usd) across two runtimes/cycles.
  const c1 = JSON.stringify({
    ts: '2026-06-03T10:05:00.000Z', agent: 'general-purpose', tier: 'sonnet',
    tokens_in: 100, tokens_out: 50, est_cost_usd: 0.02, cycle: 'c-55', runtime: 'claude',
  });
  const c2 = JSON.stringify({
    ts: '2026-06-03T10:06:00.000Z', agent: 'general-purpose', tier: 'opus',
    tokens_in: 200, tokens_out: 80, est_cost_usd: 0.10, cycle: 'c-55', runtime: 'codex',
  });
  writeFileSync(join(design, 'telemetry', 'costs.jsonl'), c1 + '\n' + c2 + '\n', 'utf8');

  // context-graph.json — a tiny valid graph (2 nodes, 1 edge, 1 orphan).
  const graph = {
    nodes: [
      { id: 'tok-1', type: 'token', name: 'color.primary', tags: ['color'] },
      { id: 'comp-1', type: 'component', name: 'Button', tags: ['ui'] },
      { id: 'orphan-1', type: 'pattern', name: 'Lonely', tags: [] },
    ],
    edges: [
      { source: 'comp-1', target: 'tok-1', type: 'uses', direction: 'forward', weight: 1 },
    ],
  };
  writeFileSync(join(design, 'context-graph.json'), JSON.stringify(graph), 'utf8');

  // event-chain at .design/gep/events.jsonl — one causal row.
  const chainRow = JSON.stringify({
    event_id: 'e1', parent_event_id: null, ts: '2026-06-03T10:00:00.000Z',
    agent: 'orchestrator', decision_refs: ['D-1'], outcome: 'pass',
  });
  writeFileSync(join(design, 'gep', 'events.jsonl'), chainRow + '\n', 'utf8');

  // .planning/phases with one PLAN + one SUMMARY.
  const phaseDir = join(root, '.planning', 'phases', '55-dashboard');
  mkdirSync(phaseDir, { recursive: true });
  writeFileSync(join(phaseDir, '55-01-PLAN.md'), '# plan\n', 'utf8');
  writeFileSync(join(phaseDir, '55-01-SUMMARY.md'), '# summary\n', 'utf8');
}

// ---------------------------------------------------------------------------
// loadDashboardModel — populated fixture
// ---------------------------------------------------------------------------

test('55-01: loadDashboardModel assembles every section from a fake .design', async () => {
  const root = tmpRoot('full');
  try {
    seedDesign(root);
    const model = await source.loadDashboardModel({ root });

    // Exact top-level key set (the pinned contract executors D/F consume).
    // Phase 57 Round 3-E adds `backend` to indicate the active state backend.
    assert.deepEqual(
      Object.keys(model).sort(),
      [
        'backend', 'blockers', 'chain', 'costs', 'cycle', 'decisions', 'degraded',
        'events', 'graph', 'health', 'phase', 'plans', 'root', 'runtimes',
        'sessions', 'status', 'worktrees',
      ].sort(),
    );

    // State-derived fields.
    assert.equal(model.status, 'in_progress');
    assert.equal(model.phase, 'plan');
    assert.equal(model.cycle, 'c-55');
    assert.equal(model.decisions.length, 2);
    assert.equal(model.decisions[0].id, 'D-1');
    assert.equal(model.decisions[0].status, 'locked');
    assert.equal(model.blockers.length, 1);
    assert.equal(model.blockers[0].stage, 'plan');

    // Plans (1 plan + 1 summary).
    assert.equal(model.plans.length, 2);
    assert.ok(model.plans.some((p) => p.kind === 'plan' && p.plan === '55-01'));
    assert.ok(model.plans.some((p) => p.kind === 'summary'));

    // Telemetry events (2 lines) + causal chain (1 row).
    assert.equal(model.events.length, 2);
    assert.equal(model.events[0].type, 'stage.entered');
    assert.equal(model.chain.length, 1);
    assert.equal(model.chain[0].outcome, 'pass');

    // Costs aggregated.
    assert.ok(model.costs);
    assert.equal(model.costs.rows.length, 2);
    assert.ok(model.costs.byRuntime.claude);
    assert.ok(model.costs.byRuntime.codex);
    assert.ok(Math.abs(model.costs.cumulative.est_cost_usd - 0.12) < 1e-9);

    // Graph (3 nodes, 1 orphan) + lib derivations.
    assert.ok(model.graph);
    assert.equal(model.graph.graph.nodes.length, 3);
    assert.deepEqual(model.graph.unreachable, ['orphan-1']);
    assert.ok(model.graph.coverage && typeof model.graph.coverage.pct === 'number');

    // Health checks present (>= 9 from the shared mirror).
    assert.ok(model.health && Array.isArray(model.health.checks));
    assert.ok(model.health.checks.length >= 9);

    // Discovery sections.
    assert.equal(model.runtimes.length, 14);
    assert.ok(Array.isArray(model.worktrees));
    assert.ok(Array.isArray(model.sessions));

    // Root echoed back.
    assert.equal(model.root, require('node:fs').realpathSync(root) === root ? root : model.root);
    assert.ok(typeof model.root === 'string' && model.root.length > 0);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// loadDashboardModel — absent .design -> graceful degrade, no throw
// ---------------------------------------------------------------------------

test('55-01: loadDashboardModel degrades gracefully when .design is absent', async () => {
  const root = tmpRoot('empty');
  try {
    // No .design, no .planning at all.
    let model;
    await assert.doesNotReject(async () => {
      model = await source.loadDashboardModel({ root });
    });

    assert.equal(model.status, null);
    assert.equal(model.phase, null);
    assert.equal(model.cycle, null);
    assert.deepEqual(model.decisions, []);
    assert.deepEqual(model.blockers, []);
    assert.deepEqual(model.plans, []);
    assert.deepEqual(model.events, []);
    assert.deepEqual(model.chain, []);
    assert.equal(model.graph, null);

    // costs is a struct with empty buckets (readCosts -> [] is not a failure).
    assert.ok(model.costs);
    assert.deepEqual(model.costs.rows, []);
    assert.deepEqual(model.costs.byRuntime, {});

    // Discovery still works (runtimes always 14; worktrees/sessions [] here).
    assert.equal(model.runtimes.length, 14);

    // degraded[] is populated with notes about the missing sections.
    assert.ok(Array.isArray(model.degraded));
    assert.ok(model.degraded.length > 0, 'degraded should list missing sections');
    assert.ok(model.degraded.some((d) => d.includes('STATE.md')), 'note about STATE.md');
    assert.ok(model.degraded.some((d) => d.includes('context-graph.json')), 'note about graph');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// loadDashboardModel — malformed STATE.md falls back to scrape (no throw)
// ---------------------------------------------------------------------------

test('55-01: loadDashboardModel scrapes a STATE.md the strict parser rejects', async () => {
  const root = tmpRoot('badstate');
  try {
    const design = join(root, '.design');
    mkdirSync(design, { recursive: true });
    // Malformed blocker line throws in the strict parser -> exercises scrape.
    const bad = [
      '---',
      'pipeline_state_version: 1',
      'stage: design',
      'cycle: c-bad',
      'wave: 1',
      'started_at: 2026-06-01',
      'last_checkpoint: 2026-06-03',
      '---',
      '',
      '<position>',
      'stage: design',
      'wave: 1',
      'task_progress: 0/1',
      'status: blocked',
      'handoff_source: -',
      'handoff_path: -',
      'skipped_stages: -',
      '</position>',
      '',
      '<decisions>',
      'D-9: Scrape me (locked)',
      '</decisions>',
      '',
      '<blockers>',
      'this line is not a valid blocker and the strict parser throws',
      '</blockers>',
      '',
    ].join('\n');
    writeFileSync(join(design, 'STATE.md'), bad, 'utf8');

    const model = await source.loadDashboardModel({ root });
    // Scrape recovers status/phase/cycle/decisions without throwing.
    assert.equal(model.status, 'blocked');
    assert.equal(model.phase, 'design');
    assert.equal(model.cycle, 'c-bad');
    assert.equal(model.decisions.length, 1);
    assert.equal(model.decisions[0].id, 'D-9');
    // A degraded note records the typed-read failure + scrape fallback.
    assert.ok(model.degraded.some((d) => d.startsWith('state:')));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// cost-aggregator
// ---------------------------------------------------------------------------

test('55-01: aggregateCosts groups by runtime + cycle + cumulative', () => {
  const rows = [
    { runtime: 'claude', cycle: 'c1', tokens_in: 10, tokens_out: 5, est_cost_usd: 0.01 },
    { runtime: 'claude', cycle: 'c2', tokens_in: 20, tokens_out: 10, est_cost_usd: 0.02 },
    { runtime: 'codex', cycle: 'c1', tokens_in: 100, tokens_out: 40, cost_usd: 0.50 },
  ];
  const agg = costAgg.aggregateCosts(rows);

  assert.equal(agg.byRuntime.claude.tokens_in, 30);
  assert.equal(agg.byRuntime.claude.tokens_out, 15);
  assert.ok(Math.abs(agg.byRuntime.claude.est_cost_usd - 0.03) < 1e-9);

  // codex row uses cost_usd (newer shape) -> still aggregated.
  assert.equal(agg.byRuntime.codex.tokens_in, 100);
  assert.ok(Math.abs(agg.byRuntime.codex.est_cost_usd - 0.50) < 1e-9);

  // byCycle: c1 spans both runtimes.
  assert.equal(agg.byCycle.c1.tokens_in, 110);
  assert.equal(agg.byCycle.c2.tokens_in, 20);

  // cumulative.
  assert.equal(agg.cumulative.tokens_in, 130);
  assert.equal(agg.cumulative.tokens_out, 55);
  assert.ok(Math.abs(agg.cumulative.est_cost_usd - 0.53) < 1e-9);
});

test('55-01: aggregateCosts tolerates nullish / non-iterable input', () => {
  for (const bad of [null, undefined, 42, {}]) {
    const agg = costAgg.aggregateCosts(bad);
    assert.deepEqual(agg.byRuntime, {});
    assert.deepEqual(agg.byCycle, {});
    assert.equal(agg.cumulative.tokens_in, 0);
  }
});

test('55-01: aggregateCosts falls back runtime->tier->agent->unknown for the group key', () => {
  const rows = [
    { tier: 'sonnet', tokens_in: 1, est_cost_usd: 0.001 }, // no runtime -> tier
    { agent: 'planner', tokens_in: 2, est_cost_usd: 0.002 }, // no runtime/tier -> agent
    { tokens_in: 3, est_cost_usd: 0.003 }, // nothing -> "unknown"
  ];
  const agg = costAgg.aggregateCosts(rows);
  assert.ok(agg.byRuntime.sonnet);
  assert.ok(agg.byRuntime.planner);
  assert.ok(agg.byRuntime.unknown);
});

test('55-01: readCosts reads JSONL and tolerates a malformed line', () => {
  const root = tmpRoot('costs');
  try {
    mkdirSync(join(root, '.design', 'telemetry'), { recursive: true });
    const good1 = JSON.stringify({ runtime: 'claude', tokens_in: 5, est_cost_usd: 0.01 });
    const good2 = JSON.stringify({ runtime: 'codex', tokens_in: 7, est_cost_usd: 0.02 });
    const body = good1 + '\n' + '{ this is not valid json ]\n' + good2 + '\n' + '\n';
    writeFileSync(join(root, '.design', 'telemetry', 'costs.jsonl'), body, 'utf8');

    const rows = costAgg.readCosts({ root });
    assert.equal(rows.length, 2, 'malformed + blank lines skipped, 2 good rows kept');
    assert.equal(rows[0].runtime, 'claude');
    assert.equal(rows[1].runtime, 'codex');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('55-01: readCosts returns [] when the file is absent (never throws)', () => {
  const root = tmpRoot('nocosts');
  try {
    assert.deepEqual(costAgg.readCosts({ root }), []);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// discovery — runtimes
// ---------------------------------------------------------------------------

test('55-01: discoverRuntimes returns 14 entries with present:boolean', () => {
  const runtimes = discovery.discoverRuntimes();
  assert.equal(runtimes.length, 14);
  for (const r of runtimes) {
    assert.equal(typeof r.runtime, 'string');
    assert.equal(typeof r.present, 'boolean');
    assert.ok('configDir' in r);
    assert.ok('skillsBase' in r);
  }
  // cline is rules-based -> skillsBase null (Phase 28.7 D-09).
  const cline = runtimes.find((r) => r.runtime === 'cline');
  assert.ok(cline);
  assert.equal(cline.skillsBase, null);
  // claude is in the set and has a non-null skillsBase.
  const claude = runtimes.find((r) => r.runtime === 'claude');
  assert.ok(claude);
  assert.equal(typeof claude.skillsBase, 'string');
});

// ---------------------------------------------------------------------------
// discovery — worktrees (injected exec, no real git)
// ---------------------------------------------------------------------------

test('55-01: discoverWorktrees parses porcelain output via an injected exec', () => {
  const porcelain = [
    'worktree /repo/main',
    'HEAD abc123',
    'branch refs/heads/main',
    '',
    'worktree /repo/.worktrees/feature',
    'HEAD def456',
    'branch refs/heads/feature/x',
    'locked needs review',
    '',
    'worktree /repo/.worktrees/detached',
    'HEAD 999fff',
    'detached',
    '',
  ].join('\n');

  const fakeExec = (cmd, args) => {
    assert.equal(cmd, 'git');
    assert.deepEqual(args, ['worktree', 'list', '--porcelain']);
    return porcelain;
  };

  const wts = discovery.discoverWorktrees({ root: '/repo', exec: fakeExec });
  assert.equal(wts.length, 3);

  assert.equal(wts[0].path, '/repo/main');
  assert.equal(wts[0].branch, 'main');
  assert.equal(wts[0].detached, false);
  assert.equal(wts[0].locked, false);

  assert.equal(wts[1].branch, 'feature/x');
  assert.equal(wts[1].locked, true);

  assert.equal(wts[2].detached, true);
  assert.equal(wts[2].branch, null);
});

test('55-01: discoverWorktrees returns [] when git is unavailable (exec -> null)', () => {
  const wts = discovery.discoverWorktrees({ root: '/repo', exec: () => null });
  assert.deepEqual(wts, []);
});

test('55-01: discoverWorktrees returns [] when injected exec throws', () => {
  const wts = discovery.discoverWorktrees({
    root: '/repo',
    exec: () => { throw new Error('git not found'); },
  });
  assert.deepEqual(wts, []);
});

// ---------------------------------------------------------------------------
// discovery — sessions + recordSession round-trip
// ---------------------------------------------------------------------------

test('55-01: discoverSessions returns [] when no sessions dir exists', () => {
  const root = tmpRoot('nosess');
  try {
    assert.deepEqual(discovery.discoverSessions({ root }), []);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('55-01: recordSession atomically writes a manifest that discoverSessions reads back', () => {
  const root = tmpRoot('sess');
  try {
    const written = discovery.recordSession({
      id: 'sess-abc',
      harness: 'claude',
      root,
      extra: { pid: 1234 },
    });
    // File exists at the expected location.
    const onDisk = JSON.parse(readFileSync(written, 'utf8'));
    assert.equal(onDisk.id, 'sess-abc');
    assert.equal(onDisk.harness, 'claude');
    assert.deepEqual(onDisk.extra, { pid: 1234 });
    assert.equal(typeof onDisk.updated_at, 'string');

    // discoverSessions round-trips it.
    const sessions = discovery.discoverSessions({ root });
    assert.equal(sessions.length, 1);
    assert.equal(sessions[0].id, 'sess-abc');
    assert.equal(sessions[0].harness, 'claude');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('55-01: recordSession sanitizes a path-traversal id into a safe filename', () => {
  const root = tmpRoot('safe');
  try {
    const written = discovery.recordSession({ id: '../../evil/../x y', root });
    // The written file lives INSIDE the sessions dir (no traversal escape).
    const sessDir = discovery.sessionsDirFor({ root });
    assert.ok(
      written.startsWith(sessDir),
      `written path ${written} must stay under ${sessDir}`,
    );
    // The original id is preserved inside the manifest body.
    const onDisk = JSON.parse(readFileSync(written, 'utf8'));
    assert.equal(onDisk.id, '../../evil/../x y');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('55-01: recordSession throws only on a missing/empty id', () => {
  assert.throws(() => discovery.recordSession({}), /id is required/);
  assert.throws(() => discovery.recordSession({ id: '' }), /id is required/);
});

// ---------------------------------------------------------------------------
// parseWorktreePorcelain — direct unit (edge cases)
// ---------------------------------------------------------------------------

test('55-01: parseWorktreePorcelain handles empty + CRLF input', () => {
  assert.deepEqual(discovery.parseWorktreePorcelain(''), []);
  assert.deepEqual(discovery.parseWorktreePorcelain('   '), []);
  const crlf = 'worktree /a\r\nHEAD x\r\nbranch refs/heads/main\r\n';
  const out = discovery.parseWorktreePorcelain(crlf);
  assert.equal(out.length, 1);
  assert.equal(out[0].path, '/a');
  assert.equal(out[0].branch, 'main');
});
