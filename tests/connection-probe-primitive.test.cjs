// tests/connection-probe-primitive.test.cjs — Plan 22-08 connection probe primitive
'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { mkdtempSync, rmSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { join } = require('node:path');

const { probe, loadState, statePathFor } = require('../scripts/lib/connection-probe/index.cjs');

test('22-08: probe returns ok on first-try success', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'gdd-cp-'));
  try {
    const state = join(dir, 'state.json');
    const out = await probe({
      name: 'mock',
      cmd: async () => true,
      retries: 3,
      statePath: state,
    });
    assert.equal(out.status, 'ok');
    assert.equal(out.attempts, 1);
    assert.equal(out.fallback_used, false);
    assert.ok(typeof out.latency_ms === 'number');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('22-08: probe retries on falsy and succeeds on attempt 3', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'gdd-cp-retry-'));
  try {
    const state = join(dir, 'state.json');
    let calls = 0;
    const out = await probe({
      name: 'mock',
      cmd: async () => {
        calls += 1;
        return calls === 3;
      },
      retries: 4,
      timeout: 1000,
      statePath: state,
    });
    assert.equal(out.status, 'ok');
    assert.equal(out.attempts, 3);
    assert.equal(calls, 3);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('22-08: probe returns down when all retries fail (no fallback)', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'gdd-cp-down-'));
  try {
    const state = join(dir, 'state.json');
    const out = await probe({
      name: 'mock',
      cmd: async () => {
        throw new Error('connection refused');
      },
      retries: 2,
      timeout: 200,
      statePath: state,
    });
    assert.equal(out.status, 'down');
    assert.equal(out.attempts, 2);
    assert.equal(out.fallback_used, false);
    assert.match(out.error, /connection refused/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('22-08: probe returns degraded with fallback when retries fail', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'gdd-cp-deg-'));
  try {
    const state = join(dir, 'state.json');
    let fallbackCalled = false;
    const out = await probe({
      name: 'figma',
      cmd: async () => {
        throw new Error('timeout');
      },
      fallback: async () => {
        fallbackCalled = true;
        return 'cached-data';
      },
      retries: 2,
      timeout: 200,
      statePath: state,
    });
    assert.equal(out.status, 'degraded');
    assert.equal(out.fallback_used, true);
    assert.equal(fallbackCalled, true);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('22-08: probe enforces timeout', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'gdd-cp-timeout-'));
  try {
    const state = join(dir, 'state.json');
    const out = await probe({
      name: 'slow',
      cmd: async () => new Promise((r) => setTimeout(() => r(true), 5000)),
      retries: 1,
      timeout: 100,
      statePath: state,
    });
    assert.equal(out.status, 'down');
    assert.match(out.error, /timed out/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('22-08: probe persists state across calls', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'gdd-cp-state-'));
  try {
    const state = join(dir, 'state.json');
    await probe({ name: 'a', cmd: async () => true, retries: 1, statePath: state });
    await probe({
      name: 'b',
      cmd: async () => {
        throw new Error('x');
      },
      retries: 1,
      timeout: 100,
      statePath: state,
    });
    const persisted = loadState(state);
    assert.equal(persisted.a, 'ok');
    assert.equal(persisted.b, 'down');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('22-08: probe emits connection.status_change on transition only', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'gdd-cp-emit-'));
  try {
    const state = join(dir, 'state.json');
    const events = [];
    const emit = (ev) => events.push(ev);
    await probe({ name: 'figma', cmd: async () => true, retries: 1, statePath: state, emit });
    await probe({ name: 'figma', cmd: async () => true, retries: 1, statePath: state, emit });
    await probe({
      name: 'figma',
      cmd: async () => {
        throw new Error('x');
      },
      retries: 1,
      timeout: 100,
      statePath: state,
      emit,
    });
    assert.equal(events.length, 2);
    assert.equal(events[0].type, 'connection.status_change');
    assert.equal(events[0].payload.name, 'figma');
    assert.equal(events[0].payload.from, 'unknown');
    assert.equal(events[0].payload.to, 'ok');
    assert.equal(events[1].payload.from, 'ok');
    assert.equal(events[1].payload.to, 'down');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('22-08: probe throws on missing name or cmd', async () => {
  await assert.rejects(() => probe({ cmd: async () => true }), /name/);
  await assert.rejects(() => probe({ name: 'x' }), /cmd/);
});

test('22-08: statePathFor honors absolute + relative paths', () => {
  // Use platform-appropriate absolute paths (POSIX `/abs/...` vs Windows `C:\abs\...`).
  const path = require('node:path');
  const abs = process.platform === 'win32' ? 'C:\\abs\\state.json' : '/abs/state.json';
  const base = process.platform === 'win32' ? 'C:\\proj' : '/proj';
  assert.equal(statePathFor({ statePath: abs }), abs);
  const rel = statePathFor({ baseDir: base, statePath: 'rel.json' });
  assert.equal(rel, path.resolve(base, 'rel.json'));
});
