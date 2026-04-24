// tests/cli-events.test.cjs — Plan 22-06 CLI transport
'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { mkdtempSync, rmSync, writeFileSync, readFileSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { join } = require('node:path');
const { spawnSync } = require('node:child_process');

const CLI = join(__dirname, '..', 'scripts', 'cli', 'gdd-events.mjs');

function runCli(args, opts = {}) {
  return spawnSync(
    process.execPath,
    ['--experimental-strip-types', CLI, ...args],
    { encoding: 'utf8', timeout: 5000, ...opts },
  );
}

function seedEvents(events) {
  const dir = mkdtempSync(join(tmpdir(), 'gdd-cli-'));
  const path = join(dir, 'events.jsonl');
  writeFileSync(path, events.map((e) => JSON.stringify(e)).join('\n') + '\n');
  return { dir, path };
}

test('22-06: list-types prints all 23 types', () => {
  const r = runCli(['list-types']);
  assert.equal(r.status, 0, `stderr: ${r.stderr}`);
  const lines = r.stdout.trim().split('\n');
  assert.equal(lines.length, 23);
  assert.ok(lines.includes('stage.entered'));
  assert.ok(lines.includes('agent.outcome'));
});

test('22-06: tail dumps events in order without --follow', () => {
  const { dir, path } = seedEvents([
    { type: 'stage.entered', timestamp: 't1', sessionId: 's', payload: {} },
    { type: 'stage.exited', timestamp: 't2', sessionId: 's', payload: {} },
  ]);
  try {
    const r = runCli(['tail', `--path=${path}`]);
    assert.equal(r.status, 0, `stderr: ${r.stderr}`);
    const lines = r.stdout.trim().split('\n');
    assert.equal(lines.length, 2);
    assert.equal(JSON.parse(lines[0]).type, 'stage.entered');
    assert.equal(JSON.parse(lines[1]).type, 'stage.exited');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('22-06: grep by type=foo returns only matching', () => {
  const { dir, path } = seedEvents([
    { type: 'stage.entered', timestamp: 't', sessionId: 's', payload: {} },
    { type: 'hook.fired', timestamp: 't', sessionId: 's', payload: {} },
    { type: 'stage.entered', timestamp: 't', sessionId: 's', payload: {} },
  ]);
  try {
    const r = runCli(['grep', 'type=stage.entered', `--path=${path}`]);
    assert.equal(r.status, 0, `stderr: ${r.stderr}`);
    const lines = r.stdout.trim().split('\n');
    assert.equal(lines.length, 2);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('22-06: grep with payload.<path>=value drills', () => {
  const { dir, path } = seedEvents([
    { type: 'cost.update', timestamp: 't', sessionId: 's', payload: { tier: 'haiku' } },
    { type: 'cost.update', timestamp: 't', sessionId: 's', payload: { tier: 'opus' } },
    { type: 'cost.update', timestamp: 't', sessionId: 's', payload: { tier: 'haiku' } },
  ]);
  try {
    const r = runCli(['grep', 'payload.tier=haiku', `--path=${path}`]);
    assert.equal(r.status, 0, `stderr: ${r.stderr}`);
    const lines = r.stdout.trim().split('\n');
    assert.equal(lines.length, 2);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('22-06: grep negation !type=foo returns non-matching', () => {
  const { dir, path } = seedEvents([
    { type: 'stage.entered', timestamp: 't', sessionId: 's', payload: {} },
    { type: 'hook.fired', timestamp: 't', sessionId: 's', payload: {} },
    { type: 'stage.entered', timestamp: 't', sessionId: 's', payload: {} },
  ]);
  try {
    const r = runCli(['grep', '!type=stage.entered', `--path=${path}`]);
    assert.equal(r.status, 0);
    const lines = r.stdout.trim().split('\n');
    assert.equal(lines.length, 1);
    assert.equal(JSON.parse(lines[0]).type, 'hook.fired');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('22-06: grep with multiple terms is AND', () => {
  const { dir, path } = seedEvents([
    { type: 'cost.update', timestamp: 't', sessionId: 's', payload: { tier: 'haiku', agent: 'A' } },
    { type: 'cost.update', timestamp: 't', sessionId: 's', payload: { tier: 'haiku', agent: 'B' } },
    { type: 'cost.update', timestamp: 't', sessionId: 's', payload: { tier: 'opus', agent: 'A' } },
  ]);
  try {
    const r = runCli([
      'grep',
      'type=cost.update',
      'payload.tier=haiku',
      'payload.agent=A',
      `--path=${path}`,
    ]);
    assert.equal(r.status, 0);
    const lines = r.stdout.trim().split('\n');
    assert.equal(lines.length, 1);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('22-06: cat pretty-prints with timestamp+type prefix', () => {
  const { dir, path } = seedEvents([
    { type: 'hook.fired', timestamp: '2026-04-25T00:00:00.000Z', sessionId: 's', payload: { x: 1 } },
  ]);
  try {
    const r = runCli(['cat', `--path=${path}`]);
    assert.equal(r.status, 0);
    assert.match(r.stdout, /2026-04-25T00:00:00\.000Z\s+hook\.fired/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('22-06: grep with no terms returns exit-code 2', () => {
  const r = runCli(['grep']);
  assert.equal(r.status, 2);
});

test('22-06: unknown subcommand exits non-zero', () => {
  const r = runCli(['nonexistent-cmd']);
  assert.equal(r.status, 2);
});

test('22-06: serve without --token + no env exits 2', () => {
  const r = runCli(['serve'], { env: { ...process.env, GDD_EVENTS_TOKEN: '' } });
  // 1 if `ws` not installed (handled inside cmdServe), 2 if token check rejects.
  // Either way must not be 0.
  assert.notEqual(r.status, 0);
});
