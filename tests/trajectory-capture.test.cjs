// tests/trajectory-capture.test.cjs — Plan 22-03 trajectory capture
'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { mkdtempSync, readFileSync, rmSync, existsSync, readdirSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { join } = require('node:path');
const { spawnSync } = require('node:child_process');

const {
  recordCall,
  trajectoryPath,
  hashOf,
} = require('../scripts/lib/trajectory/index.cjs');

test('22-03: hashOf is deterministic + 16-char hex', () => {
  const a = hashOf({ x: 1, y: 'hi' });
  const b = hashOf({ x: 1, y: 'hi' });
  assert.equal(a, b);
  assert.match(a, /^[0-9a-f]{16}$/);
});

test('22-03: hashOf differs for different inputs', () => {
  assert.notEqual(hashOf({ x: 1 }), hashOf({ x: 2 }));
});

test('22-03: trajectoryPath sanitizes cycle name', () => {
  const p = trajectoryPath({ baseDir: '/tmp', cycle: 'feature/branch-x' });
  assert.match(p, /\/feature_branch-x\.jsonl$/);
});

test('22-03: recordCall writes one JSONL line with all fields', () => {
  const dir = mkdtempSync(join(tmpdir(), 'gdd-traj-'));
  try {
    const path = join(dir, 'cycle.jsonl');
    const line = recordCall({
      path,
      agent: 'design-planner',
      tool: 'Bash',
      args: { command: 'ls' },
      result: { stdout: 'foo\n' },
      latency_ms: 42,
      status: 'ok',
    });
    const parsed = JSON.parse(line);
    assert.equal(parsed.agent, 'design-planner');
    assert.equal(parsed.tool, 'Bash');
    assert.equal(parsed.latency_ms, 42);
    assert.equal(parsed.status, 'ok');
    assert.equal(parsed.cycle, 'current');
    assert.match(parsed.args_hash, /^[0-9a-f]{16}$/);
    assert.match(parsed.result_hash, /^[0-9a-f]{16}$/);
    assert.match(parsed.ts, /^\d{4}-\d{2}-\d{2}T/);
    // file content matches
    const onDisk = readFileSync(path, 'utf8').trim();
    assert.equal(onDisk, line);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('22-03: multiple recordCall appends produce N lines', () => {
  const dir = mkdtempSync(join(tmpdir(), 'gdd-traj-multi-'));
  try {
    const path = join(dir, 'multi.jsonl');
    for (let i = 0; i < 5; i++) {
      recordCall({ path, agent: 'a', tool: 'T', args: { i }, result: 'ok', latency_ms: i });
    }
    const lines = readFileSync(path, 'utf8').trim().split('\n');
    assert.equal(lines.length, 5);
    for (const ln of lines) JSON.parse(ln); // parses
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('22-03: hook reads stdin JSON and writes a trajectory line', () => {
  const dir = mkdtempSync(join(tmpdir(), 'gdd-traj-hook-'));
  try {
    const hookInput = JSON.stringify({
      tool_name: 'Bash',
      tool_input: { command: 'echo hi' },
      tool_response: { stdout: 'hi\n', is_error: false },
      session_id: 'sess-abc',
      agent: 'design-executor',
    });
    const result = spawnSync(
      process.execPath,
      [join(__dirname, '..', 'hooks', 'gdd-trajectory-capture.js')],
      {
        input: hookInput,
        cwd: dir,
        encoding: 'utf8',
        env: { ...process.env, GDD_CYCLE: 'cycle-22-03' },
      },
    );
    assert.equal(result.status, 0, `hook stderr: ${result.stderr}`);
    const trajDir = join(dir, '.design', 'telemetry', 'trajectories');
    assert.ok(existsSync(trajDir));
    const files = readdirSync(trajDir);
    assert.ok(files.includes('cycle-22-03.jsonl'));
    const lineRaw = readFileSync(join(trajDir, 'cycle-22-03.jsonl'), 'utf8').trim();
    const parsed = JSON.parse(lineRaw);
    assert.equal(parsed.tool, 'Bash');
    assert.equal(parsed.agent, 'design-executor');
    assert.equal(parsed.session_id, 'sess-abc');
    assert.equal(parsed.cycle, 'cycle-22-03');
    assert.equal(parsed.status, 'ok');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('22-03: hook tags status=error when tool_response.is_error is true', () => {
  const dir = mkdtempSync(join(tmpdir(), 'gdd-traj-err-'));
  try {
    const hookInput = JSON.stringify({
      tool_name: 'Bash',
      tool_input: { command: 'false' },
      tool_response: { stdout: '', stderr: 'boom', is_error: true },
      session_id: 'sess-err',
    });
    spawnSync(
      process.execPath,
      [join(__dirname, '..', 'hooks', 'gdd-trajectory-capture.js')],
      { input: hookInput, cwd: dir, encoding: 'utf8' },
    );
    const path = join(dir, '.design', 'telemetry', 'trajectories', 'current.jsonl');
    const parsed = JSON.parse(readFileSync(path, 'utf8').trim());
    assert.equal(parsed.status, 'error');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
