'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { spawnSync } = require('node:child_process');

const { REPO_ROOT } = require('./helpers.cjs');
const HOOK = path.join(REPO_ROOT, 'hooks', 'gdd-mcp-circuit-breaker.js');

function scaffold(config) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gdd-cb-'));
  fs.mkdirSync(path.join(dir, '.design'), { recursive: true });
  // STATE.md so append-blocker has a target
  fs.writeFileSync(path.join(dir, '.design', 'STATE.md'), '# STATE\n', 'utf8');
  if (config) {
    fs.writeFileSync(path.join(dir, '.design', 'config.json'), JSON.stringify(config), 'utf8');
  }
  return { dir, cleanup: () => fs.rmSync(dir, { recursive: true, force: true }) };
}

function runHook(payload, cwd) {
  const r = spawnSync(process.execPath, [HOOK], {
    input: JSON.stringify(payload),
    encoding: 'utf8',
    cwd,
    env: { ...process.env, PWD: cwd },
  });
  let parsed = null;
  try { parsed = JSON.parse(r.stdout); } catch {}
  return { parsed, stderr: r.stderr };
}

function buildCall(outcome, tool = 'mcp__figma__use_figma') {
  if (outcome === 'success') return { tool_name: tool, tool_response: { content: 'ok' } };
  if (outcome === 'timeout') return { tool_name: tool, tool_response: { is_error: true, content: 'Execution timed out after 5000ms' } };
  return { tool_name: tool, tool_response: { is_error: true, content: 'plain error' } };
}

test('mcp-circuit-breaker: hook file exists', () => {
  assert.ok(fs.existsSync(HOOK));
});

test('mcp-circuit-breaker: 3 consecutive timeouts → break on 3rd call', () => {
  const { dir, cleanup } = scaffold();
  try {
    const p1 = runHook({ ...buildCall('timeout'), cwd: dir }, dir);
    assert.equal(p1.parsed.continue, true);
    const p2 = runHook({ ...buildCall('timeout'), cwd: dir }, dir);
    assert.equal(p2.parsed.continue, true);
    const p3 = runHook({ ...buildCall('timeout'), cwd: dir }, dir);
    assert.equal(p3.parsed.continue, false);
    assert.match(p3.parsed.stopReason, /consecutive MCP timeouts/);
    // STATE.md got a blocker line
    const state = fs.readFileSync(path.join(dir, '.design', 'STATE.md'), 'utf8');
    assert.match(state, /BLOCKER/);
    assert.match(state, /figma:figma-generate-design/);
  } finally { cleanup(); }
});

test('mcp-circuit-breaker: 2 timeouts + 1 success → counter resets; 4th call passes', () => {
  const { dir, cleanup } = scaffold();
  try {
    runHook({ ...buildCall('timeout'), cwd: dir }, dir);
    runHook({ ...buildCall('timeout'), cwd: dir }, dir);
    runHook({ ...buildCall('success'), cwd: dir }, dir);
    const p4 = runHook({ ...buildCall('timeout'), cwd: dir }, dir);
    assert.equal(p4.parsed.continue, true, 'counter should have reset after success');
    // JSONL ledger reflects consecutive_timeouts = 1 on the last row
    const ledger = fs.readFileSync(path.join(dir, '.design', 'telemetry', 'mcp-budget.jsonl'), 'utf8');
    const rows = ledger.trim().split('\n').map(l => JSON.parse(l));
    assert.equal(rows.length, 4);
    assert.equal(rows[3].consecutive_timeouts, 1);
  } finally { cleanup(); }
});

test('mcp-circuit-breaker: max_calls_per_task enforcement', () => {
  const { dir, cleanup } = scaffold({ mcp_budget: { max_calls_per_task: 3 } });
  try {
    runHook({ ...buildCall('success'), cwd: dir }, dir);
    runHook({ ...buildCall('success'), cwd: dir }, dir);
    runHook({ ...buildCall('success'), cwd: dir }, dir);
    const p4 = runHook({ ...buildCall('success'), cwd: dir }, dir);
    assert.equal(p4.parsed.continue, false, '4th call with max=3 must be blocked');
    assert.match(p4.parsed.stopReason, /max_calls_per_task/);
  } finally { cleanup(); }
});

test('mcp-circuit-breaker: config override raises consecutive-timeouts threshold', () => {
  const { dir, cleanup } = scaffold({ mcp_budget: { max_consecutive_timeouts: 5 } });
  try {
    for (let i = 0; i < 4; i++) {
      const r = runHook({ ...buildCall('timeout'), cwd: dir }, dir);
      assert.equal(r.parsed.continue, true, `call ${i + 1} should pass (threshold=5)`);
    }
    const p5 = runHook({ ...buildCall('timeout'), cwd: dir }, dir);
    assert.equal(p5.parsed.continue, false, '5th timeout with threshold=5 must block');
  } finally { cleanup(); }
});

test('mcp-circuit-breaker: untracked tool passes through', () => {
  const { dir, cleanup } = scaffold();
  try {
    const r = runHook({ tool_name: 'Read', tool_response: { content: 'x' }, cwd: dir }, dir);
    assert.equal(r.parsed.continue, true);
    // no JSONL file created
    assert.ok(!fs.existsSync(path.join(dir, '.design', 'telemetry', 'mcp-budget.jsonl')));
  } finally { cleanup(); }
});

test('mcp-circuit-breaker: JSONL row schema round-trip', () => {
  const { dir, cleanup } = scaffold();
  try {
    runHook({ ...buildCall('success'), cwd: dir }, dir);
    const ledger = fs.readFileSync(path.join(dir, '.design', 'telemetry', 'mcp-budget.jsonl'), 'utf8');
    const row = JSON.parse(ledger.trim().split('\n')[0]);
    for (const k of ['ts', 'tool', 'outcome', 'consecutive_timeouts', 'total_calls']) {
      assert.ok(k in row, `row must contain ${k}`);
    }
    assert.match(row.ts, /^\d{4}-\d{2}-\d{2}T/);
    assert.equal(row.outcome, 'success');
  } finally { cleanup(); }
});

test('mcp-circuit-breaker: each tracked tool variant is counted', () => {
  const tools = ['mcp__figma__use_figma', 'mcp__paper__use_paper', 'mcp__pencil__use_pencil'];
  for (const tool of tools) {
    const { dir, cleanup } = scaffold();
    try {
      const r = runHook({ ...buildCall('success', tool), cwd: dir }, dir);
      assert.equal(r.parsed.continue, true);
      const ledger = fs.readFileSync(path.join(dir, '.design', 'telemetry', 'mcp-budget.jsonl'), 'utf8');
      assert.ok(ledger.includes(tool));
    } finally { cleanup(); }
  }
});
