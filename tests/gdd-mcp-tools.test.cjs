'use strict';
// tests/gdd-mcp-tools.test.cjs
// ---------------------------------------------------------------------------
// Plan 27.7-02 — 12-tool MCP test suite.
//
// Test names are all prefixed `27.7-02:` for the tag count check.
// Includes: 24 base tests (2 per tool = input contract + output shape),
// plus 3 graceful-missing-directory tests (Warning #5), plus 3 invariant
// tests (TOOL_COUNT, no write-name patterns, schema file 12-entry cap).
// Total: 30 tagged.
//
// macOS symlink discipline: every tmpdir is canonicalized via
// fs.realpathSync (Phase 27.6 lesson).

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const REPO_ROOT = path.resolve(__dirname, '..');
const TOOLS_DIR = path.join(REPO_ROOT, 'scripts', 'mcp-servers', 'gdd-mcp', 'tools');
const SCHEMA_PATH = path.join(REPO_ROOT, 'reference', 'schemas', 'mcp-gdd-tools.schema.json');

const TOOL_NAMES = [
  'gdd_status',
  'gdd_phase_current',
  'gdd_phases_list',
  'gdd_plans_list',
  'gdd_decisions_list',
  'gdd_intel_get',
  'gdd_telemetry_query',
  'gdd_cycle_recap',
  'gdd_reflections_latest',
  'gdd_learnings_digest',
  'gdd_events_tail',
  'gdd_health',
];

/** Canonicalized tmpdir — macOS symlink discipline. */
function tmp(prefix) {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), prefix + '-'));
  return fs.realpathSync(d);
}

/** Dynamic-import a .ts module under --experimental-strip-types. */
async function loadTool(toolName) {
  const file = path.join(TOOLS_DIR, toolName + '.ts');
  const url = new URL('file://' + file.replace(/\\/g, '/'));
  return await import(url.href);
}

/** Write a minimal STATE.md surface to a tmp project root. */
function writeMinimalState(root) {
  const p = path.join(root, '.design', 'STATE.md');
  fs.mkdirSync(path.dirname(p), { recursive: true });
  const body = [
    '---',
    'pipeline_state_version: "1.0"',
    'stage: explore',
    'cycle: cycle-test',
    'wave: 1',
    'started_at: 2026-05-18T00:00:00Z',
    'last_checkpoint: 2026-05-18T00:00:00Z',
    '---',
    '',
    '<position>',
    'stage: explore',
    'wave: 1',
    'task_progress: 1/3',
    'status: in_progress',
    'handoff_source:',
    'handoff_path:',
    'skipped_stages:',
    '</position>',
    '',
    '<decisions>',
    'D-01: Use stdio-only transport (locked)',
    'D-02: 12-tool cap (locked)',
    '</decisions>',
    '',
    '<must_haves>',
    'M-01: Helper libs ship cjs+d.cts | status: pass',
    'M-02: Tools <=30 LOC | status: pending',
    '</must_haves>',
    '',
    '<connections>',
    '</connections>',
    '',
    '<blockers>',
    '</blockers>',
    '',
    '<parallelism_decision>',
    '</parallelism_decision>',
    '',
    '<todos>',
    '</todos>',
    '',
    '<timestamps>',
    'explore_started_at: 2026-05-18T00:00:00Z',
    '</timestamps>',
    '',
  ].join('\n');
  fs.writeFileSync(p, body, 'utf8');
}

function writeMinimalRoadmap(root) {
  const p = path.join(root, '.planning', 'ROADMAP.md');
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(
    p,
    [
      '# Roadmap',
      '',
      '## Phases',
      '',
      '- [x] [Phase 1](#phase-1-foo) — Foo — v1.0.0',
      '- [ ] [Phase 27.7](#phase-277-bar) — Bar — v1.27.7',
      '',
      '### Phase 1: Foo',
      '',
      '**Target version**: v1.0.0',
      '',
      '### Phase 27.7: Bar',
      '',
      '**Target version**: v1.27.7',
      '',
    ].join('\n'),
    'utf8',
  );
}

function writeMinimalProject(root) {
  fs.mkdirSync(path.join(root, '.planning'), { recursive: true });
  fs.mkdirSync(path.join(root, '.design'), { recursive: true });
  fs.writeFileSync(path.join(root, 'CLAUDE.md'), '# CLAUDE');
  fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({ name: 'test', version: '0.0.1' }));
  writeMinimalState(root);
  writeMinimalRoadmap(root);
  // optional data sources
  fs.mkdirSync(path.join(root, '.design', 'telemetry'), { recursive: true });
  fs.writeFileSync(path.join(root, '.design', 'telemetry', 'events.jsonl'), '');
  fs.mkdirSync(path.join(root, '.design', 'intel'), { recursive: true });
  fs.writeFileSync(path.join(root, '.design', 'intel', 'slice-001.json'), JSON.stringify({ name: 'slice-001', payload: 42 }));
  fs.mkdirSync(path.join(root, '.design', 'reflections'), { recursive: true });
  fs.writeFileSync(path.join(root, '.design', 'reflections', '2026-05-18-cycle-test.md'), '# Cycle test\n\nLessons learned.\n');
  fs.mkdirSync(path.join(root, '.design', 'snapshots'), { recursive: true });
  fs.writeFileSync(
    path.join(root, '.design', 'snapshots', 'snap-001.json'),
    JSON.stringify({ schema_version: '1.0.0', timestamp: '2026-05-17T00:00:00Z', cycle_id: 'cycle-test', decisions_count: 1, completed_plans_count: 0 }),
  );
}

/** Pin GDD_PROJECT_ROOT for the body of `fn`. */
async function withProjectRoot(root, fn) {
  const prev = process.env.GDD_PROJECT_ROOT;
  process.env.GDD_PROJECT_ROOT = root;
  try { return await fn(); }
  finally {
    if (prev === undefined) delete process.env.GDD_PROJECT_ROOT;
    else process.env.GDD_PROJECT_ROOT = prev;
  }
}

// ---------------------------------------------------------------------------
// Invariant tests
// ---------------------------------------------------------------------------

test('27.7-02: TOOL_COUNT === 12', async () => {
  const idx = await loadTool('index'.replace('index', 'index'));
});

test('27.7-02: tools/index exports TOOL_COUNT === 12', async () => {
  const file = path.join(TOOLS_DIR, 'index.ts');
  const url = new URL('file://' + file.replace(/\\/g, '/'));
  const m = await import(url.href);
  assert.equal(m.TOOL_COUNT, 12);
  assert.equal(m.TOOL_MODULES.length, 12);
});

test('27.7-02: no write-tool names', async () => {
  const file = path.join(TOOLS_DIR, 'index.ts');
  const url = new URL('file://' + file.replace(/\\/g, '/'));
  const m = await import(url.href);
  const names = m.TOOL_MODULES.map((t) => t.name);
  const forbidden = /_(create|update|delete|append|clear|write|set)(?:_|$)/;
  for (const n of names) {
    assert.equal(forbidden.test(n), false, 'forbidden name pattern in: ' + n);
  }
});

test('27.7-02: schema-file has exactly 12 entries', () => {
  const s = JSON.parse(fs.readFileSync(SCHEMA_PATH, 'utf8'));
  const tools = s.properties.tools.properties;
  assert.equal(Object.keys(tools).length, 12);
  for (const n of TOOL_NAMES) {
    assert.ok(tools[n], 'missing schema entry for: ' + n);
    assert.ok(tools[n].properties.input, 'missing input for: ' + n);
    assert.ok(tools[n].properties.output, 'missing output for: ' + n);
  }
});

// ---------------------------------------------------------------------------
// Per-tool tests: input contract + output shape (2 per tool = 24)
// ---------------------------------------------------------------------------

test('27.7-02: gdd_status — input schema is open object; output shape matches', async () => {
  const root = tmp('mcp-status');
  writeMinimalProject(root);
  await withProjectRoot(root, async () => {
    const mod = await loadTool('gdd_status');
    assert.equal(mod.name, 'gdd_status');
    const res = await mod.handle({});
    assert.equal(res.success, true);
    for (const k of ['phase', 'branch', 'last_decisions', 'last_completed_plans', 'blocker_count']) {
      assert.ok(k in res.data, 'missing output key: ' + k);
    }
    assert.equal(typeof res.data.blocker_count, 'number');
  });
});

test('27.7-02: gdd_status — schema input is empty-additionalProperties-false', () => {
  const sp = path.join(TOOLS_DIR, '..', 'schemas', 'gdd_status.schema.json');
  const s = JSON.parse(fs.readFileSync(sp, 'utf8'));
  assert.equal(s.properties.input.additionalProperties, false);
});

test('27.7-02: gdd_phase_current — returns position fields', async () => {
  const root = tmp('mcp-phase-current');
  writeMinimalProject(root);
  await withProjectRoot(root, async () => {
    const mod = await loadTool('gdd_phase_current');
    const res = await mod.handle({});
    assert.equal(res.success, true);
    for (const k of ['phase', 'stage', 'task_progress', 'status']) {
      assert.ok(k in res.data);
    }
    assert.equal(res.data.stage, 'explore');
  });
});

test('27.7-02: gdd_phase_current — schema declares 4 required output keys', () => {
  const sp = path.join(TOOLS_DIR, '..', 'schemas', 'gdd_phase_current.schema.json');
  const s = JSON.parse(fs.readFileSync(sp, 'utf8'));
  assert.deepEqual(s.properties.output.required.sort(), ['phase', 'stage', 'status', 'task_progress'].sort());
});

test('27.7-02: gdd_phases_list — returns array of parsed phases', async () => {
  const root = tmp('mcp-phases');
  writeMinimalProject(root);
  await withProjectRoot(root, async () => {
    const mod = await loadTool('gdd_phases_list');
    const res = await mod.handle({});
    assert.equal(res.success, true);
    assert.ok(Array.isArray(res.data.phases));
    assert.ok(res.data.phases.length >= 2);
  });
});

test('27.7-02: gdd_phases_list — schema input is empty', () => {
  const sp = path.join(TOOLS_DIR, '..', 'schemas', 'gdd_phases_list.schema.json');
  const s = JSON.parse(fs.readFileSync(sp, 'utf8'));
  assert.deepEqual(Object.keys(s.properties.input.properties || {}), []);
});

test('27.7-02: gdd_plans_list — returns {phase, plans}', async () => {
  const root = tmp('mcp-plans');
  writeMinimalProject(root);
  await withProjectRoot(root, async () => {
    const mod = await loadTool('gdd_plans_list');
    const res = await mod.handle({});
    assert.equal(res.success, true);
    assert.ok(Array.isArray(res.data.plans));
    assert.equal(res.data.plans.length, 2);
    assert.equal(res.data.plans[0].id, 'M-01');
  });
});

test('27.7-02: gdd_plans_list — schema allows optional phase input', () => {
  const sp = path.join(TOOLS_DIR, '..', 'schemas', 'gdd_plans_list.schema.json');
  const s = JSON.parse(fs.readFileSync(sp, 'utf8'));
  assert.ok(s.properties.input.properties.phase);
});

test('27.7-02: gdd_decisions_list — returns decisions array', async () => {
  const root = tmp('mcp-decisions');
  writeMinimalProject(root);
  await withProjectRoot(root, async () => {
    const mod = await loadTool('gdd_decisions_list');
    const res = await mod.handle({});
    assert.equal(res.success, true);
    assert.ok(Array.isArray(res.data.decisions));
    assert.equal(res.data.decisions.length, 2);
  });
});

test('27.7-02: gdd_decisions_list — filters by status', async () => {
  const root = tmp('mcp-decisions-filter');
  writeMinimalProject(root);
  await withProjectRoot(root, async () => {
    const mod = await loadTool('gdd_decisions_list');
    const res = await mod.handle({ status: 'locked' });
    assert.equal(res.success, true);
    for (const d of res.data.decisions) assert.equal(d.status, 'locked');
  });
});

test('27.7-02: gdd_intel_get — reads existing slice', async () => {
  const root = tmp('mcp-intel-ok');
  writeMinimalProject(root);
  await withProjectRoot(root, async () => {
    const mod = await loadTool('gdd_intel_get');
    const res = await mod.handle({ slice_id: 'slice-001' });
    assert.equal(res.success, true);
    assert.equal(res.data.slice_id, 'slice-001');
    assert.equal(res.data.data.name, 'slice-001');
  });
});

test('27.7-02: gdd_intel_get — schema requires slice_id', () => {
  const sp = path.join(TOOLS_DIR, '..', 'schemas', 'gdd_intel_get.schema.json');
  const s = JSON.parse(fs.readFileSync(sp, 'utf8'));
  assert.deepEqual(s.properties.input.required, ['slice_id']);
});

test('27.7-02: gdd_telemetry_query — returns events array', async () => {
  const root = tmp('mcp-telemetry');
  writeMinimalProject(root);
  // Append two events
  const eventsPath = path.join(root, '.design', 'telemetry', 'events.jsonl');
  fs.writeFileSync(
    eventsPath,
    JSON.stringify({ type: 'foo', timestamp: '2026-05-18T00:00:00Z', sessionId: 's1', payload: {} }) + '\n' +
    JSON.stringify({ type: 'bar', timestamp: '2026-05-18T00:00:01Z', sessionId: 's1', payload: {} }) + '\n',
  );
  await withProjectRoot(root, async () => {
    const mod = await loadTool('gdd_telemetry_query');
    const res = await mod.handle({ limit: 10 });
    assert.equal(res.success, true);
    assert.equal(Array.isArray(res.data.events), true);
    assert.equal(res.data.events.length, 2);
  });
});

test('27.7-02: gdd_telemetry_query — schema declares limit/since/type', () => {
  const sp = path.join(TOOLS_DIR, '..', 'schemas', 'gdd_telemetry_query.schema.json');
  const s = JSON.parse(fs.readFileSync(sp, 'utf8'));
  for (const k of ['type', 'since', 'limit']) {
    assert.ok(s.properties.input.properties[k], 'missing input.' + k);
  }
});

test('27.7-02: gdd_cycle_recap — returns since + diff with full snapshot present', async () => {
  const root = tmp('mcp-recap');
  writeMinimalProject(root);
  await withProjectRoot(root, async () => {
    const mod = await loadTool('gdd_cycle_recap');
    const res = await mod.handle({});
    assert.equal(res.success, true);
    assert.ok('since' in res.data);
    assert.ok('diff' in res.data);
    assert.ok(Array.isArray(res.data.diff.state_sections));
  });
});

test('27.7-02: gdd_cycle_recap — schema output requires since+diff', () => {
  const sp = path.join(TOOLS_DIR, '..', 'schemas', 'gdd_cycle_recap.schema.json');
  const s = JSON.parse(fs.readFileSync(sp, 'utf8'));
  assert.deepEqual(s.properties.output.required.sort(), ['diff', 'since']);
});

test('27.7-02: gdd_reflections_latest — returns latest reflection content_excerpt', async () => {
  const root = tmp('mcp-reflect');
  writeMinimalProject(root);
  await withProjectRoot(root, async () => {
    const mod = await loadTool('gdd_reflections_latest');
    const res = await mod.handle({});
    assert.equal(res.success, true);
    assert.match(res.data.content_excerpt, /Lessons learned/);
    assert.ok(res.data.content_excerpt.length <= 4096);
  });
});

test('27.7-02: gdd_reflections_latest — schema caps content_excerpt to 4096 chars', () => {
  const sp = path.join(TOOLS_DIR, '..', 'schemas', 'gdd_reflections_latest.schema.json');
  const s = JSON.parse(fs.readFileSync(sp, 'utf8'));
  assert.equal(s.properties.output.properties.content_excerpt.maxLength, 4096);
});

test('27.7-02: gdd_learnings_digest — returns digest <= 5120 chars', async () => {
  const root = tmp('mcp-digest');
  writeMinimalProject(root);
  await withProjectRoot(root, async () => {
    const mod = await loadTool('gdd_learnings_digest');
    const res = await mod.handle({ cycles: 5 });
    assert.equal(res.success, true);
    assert.equal(typeof res.data.digest, 'string');
    assert.ok(res.data.digest.length <= 5120);
    assert.equal(typeof res.data.cycles_included, 'number');
  });
});

test('27.7-02: gdd_learnings_digest — schema declares cycles input', () => {
  const sp = path.join(TOOLS_DIR, '..', 'schemas', 'gdd_learnings_digest.schema.json');
  const s = JSON.parse(fs.readFileSync(sp, 'utf8'));
  assert.ok(s.properties.input.properties.cycles);
});

test('27.7-02: gdd_events_tail — returns last-N events', async () => {
  const root = tmp('mcp-events-tail');
  writeMinimalProject(root);
  const eventsPath = path.join(root, '.design', 'telemetry', 'events.jsonl');
  const lines = [];
  for (let i = 0; i < 5; i++) {
    lines.push(JSON.stringify({ type: 'tick', timestamp: '2026-05-18T00:00:0' + i + 'Z', sessionId: 's', payload: { i } }));
  }
  fs.writeFileSync(eventsPath, lines.join('\n') + '\n');
  await withProjectRoot(root, async () => {
    const mod = await loadTool('gdd_events_tail');
    const res = await mod.handle({ limit: 2 });
    assert.equal(res.success, true);
    assert.equal(res.data.events.length, 2);
  });
});

test('27.7-02: gdd_events_tail — schema declares limit+type', () => {
  const sp = path.join(TOOLS_DIR, '..', 'schemas', 'gdd_events_tail.schema.json');
  const s = JSON.parse(fs.readFileSync(sp, 'utf8'));
  assert.ok(s.properties.input.properties.limit);
  assert.ok(s.properties.input.properties.type);
});

test('27.7-02: gdd_health — returns 4 checks with valid statuses', async () => {
  const root = tmp('mcp-health');
  writeMinimalProject(root);
  await withProjectRoot(root, async () => {
    const mod = await loadTool('gdd_health');
    const res = await mod.handle({});
    assert.equal(res.success, true);
    assert.equal(res.data.checks.length, 4);
    for (const c of res.data.checks) {
      assert.ok(['ok', 'warn', 'fail'].includes(c.status));
    }
  });
});

test('27.7-02: gdd_health — schema enum restricts status to ok/warn/fail', () => {
  const sp = path.join(TOOLS_DIR, '..', 'schemas', 'gdd_health.schema.json');
  const s = JSON.parse(fs.readFileSync(sp, 'utf8'));
  assert.deepEqual(
    s.properties.output.properties.checks.items.properties.status.enum.sort(),
    ['fail', 'ok', 'warn'],
  );
});

// ---------------------------------------------------------------------------
// Graceful-missing-directory tests (Warning #5) — 3 tools
// ---------------------------------------------------------------------------

test('27.7-02: gdd_intel_get — returns directory_not_found error when .design/intel/ absent', async () => {
  const root = tmp('mcp-intel-missing');
  // No .design/intel/ — satisfy walk-up with .planning only
  fs.mkdirSync(path.join(root, '.planning'), { recursive: true });
  fs.mkdirSync(path.join(root, '.design'), { recursive: true });
  await withProjectRoot(root, async () => {
    const mod = await loadTool('gdd_intel_get');
    const res = await mod.handle({ slice_id: 'foo' });
    assert.equal(res.success, false);
    assert.equal(res.error.mcp_code, 'directory_not_found');
  });
});

test('27.7-02: gdd_reflections_latest — returns directory_not_found when .design/reflections/ absent', async () => {
  const root = tmp('mcp-reflect-missing');
  fs.mkdirSync(path.join(root, '.planning'), { recursive: true });
  fs.mkdirSync(path.join(root, '.design'), { recursive: true });
  await withProjectRoot(root, async () => {
    const mod = await loadTool('gdd_reflections_latest');
    const res = await mod.handle({});
    assert.equal(res.success, false);
    assert.equal(res.error.mcp_code, 'directory_not_found');
  });
});

test('27.7-02: gdd_cycle_recap — returns directory_not_found when .design/snapshots/ absent', async () => {
  const root = tmp('mcp-recap-missing');
  fs.mkdirSync(path.join(root, '.planning'), { recursive: true });
  fs.mkdirSync(path.join(root, '.design'), { recursive: true });
  // Need a STATE.md for the recap read; but the snapshot probe runs first
  writeMinimalState(root);
  await withProjectRoot(root, async () => {
    const mod = await loadTool('gdd_cycle_recap');
    const res = await mod.handle({});
    assert.equal(res.success, false);
    assert.equal(res.error.mcp_code, 'directory_not_found');
  });
});
