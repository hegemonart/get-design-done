'use strict';
// tests/iteration-budget.test.cjs — Plan 20-14 Task 4 + Task 5.
//
// Covers iteration-budget consume/refund/exhaustion + concurrent lock
// safety + lock release on error. The concurrent test also exercises
// scripts/lib/lockfile.cjs by construction.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');

function tmpCwd() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gdd-iter-budget-'));
  const prev = process.cwd();
  process.chdir(dir);
  return {
    dir,
    cleanup: () => {
      process.chdir(prev);
      try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* ignore */ }
    },
  };
}

function loadIb() {
  delete require.cache[require.resolve('../scripts/lib/iteration-budget.cjs')];
  return require('../scripts/lib/iteration-budget.cjs');
}

function loadLockfile() {
  delete require.cache[require.resolve('../scripts/lib/lockfile.cjs')];
  return require('../scripts/lib/lockfile.cjs');
}

test('reset(10) + 5 consume() → remaining=5, consumed=5', async () => {
  const { cleanup } = tmpCwd();
  try {
    const ib = loadIb();
    await ib.reset(10);
    for (let i = 0; i < 5; i++) await ib.consume();
    const state = ib.remaining();
    assert.equal(state.budget, 10);
    assert.equal(state.remaining, 5);
    assert.equal(state.consumed, 5);
    assert.equal(state.refunded, 0);
  } finally { cleanup(); }
});

test('consume() when remaining === 0 throws IterationBudgetExhaustedError', async () => {
  const { cleanup } = tmpCwd();
  try {
    const ib = loadIb();
    await ib.reset(2);
    await ib.consume();
    await ib.consume();
    await assert.rejects(
      () => ib.consume(),
      (err) => err.name === 'IterationBudgetExhaustedError' && err.amount === 1,
    );
    // State should remain at remaining=0 (no write happened during the throw).
    const state = ib.remaining();
    assert.equal(state.remaining, 0);
    assert.equal(state.consumed, 2);
  } finally { cleanup(); }
});

test('refund() caps at budget (no unlimited accumulation)', async () => {
  const { cleanup } = tmpCwd();
  try {
    const ib = loadIb();
    await ib.reset(5);
    await ib.consume(); // remaining=4
    await ib.refund(10); // should cap at 5, not 14
    const state = ib.remaining();
    assert.equal(state.budget, 5);
    assert.equal(state.remaining, 5, 'remaining must cap at budget');
    assert.equal(state.refunded, 1, 'refunded should count only actual increase (1 unit)');
  } finally { cleanup(); }
});

test('consume N>1 works as a batch', async () => {
  const { cleanup } = tmpCwd();
  try {
    const ib = loadIb();
    await ib.reset(10);
    await ib.consume(3);
    const s = ib.remaining();
    assert.equal(s.remaining, 7);
    assert.equal(s.consumed, 3);
  } finally { cleanup(); }
});

test('consume on missing state file auto-initializes to default budget', async () => {
  const { cleanup } = tmpCwd();
  try {
    const ib = loadIb();
    // No reset() first.
    const s = await ib.consume();
    assert.ok(s.budget > 0, 'auto-init should seed a default budget');
    assert.equal(s.remaining, s.budget - 1);
    assert.equal(s.consumed, 1);
  } finally { cleanup(); }
});

test('refund on empty state auto-initializes and is a no-op at full budget', async () => {
  const { cleanup } = tmpCwd();
  try {
    const ib = loadIb();
    const s = await ib.refund();
    assert.equal(s.remaining, s.budget, 'refund on fresh state should leave remaining at budget');
    assert.equal(s.refunded, 0, 'refunded counter should not increment when no room');
  } finally { cleanup(); }
});

test('concurrent consume from 10 spawned children: consumed=10, no lost increments', async () => {
  const { dir, cleanup } = tmpCwd();
  try {
    const ib = loadIb();
    await ib.reset(50);

    const modulePath = require.resolve('../scripts/lib/iteration-budget.cjs');
    const childScript = `
      (async () => {
        const ib = require(${JSON.stringify(modulePath)});
        process.chdir(${JSON.stringify(dir)});
        await ib.consume(1);
      })().catch((e) => { console.error(e); process.exit(1); });
    `;

    const children = [];
    for (let i = 0; i < 10; i++) {
      children.push(new Promise((resolve, reject) => {
        const child = spawn(process.execPath, ['-e', childScript], { cwd: dir, stdio: 'pipe' });
        let stderr = '';
        child.stderr.on('data', (d) => { stderr += String(d); });
        child.on('exit', (code) => code === 0 ? resolve() : reject(new Error(`child ${i} exit ${code}: ${stderr}`)));
        child.on('error', reject);
      }));
    }
    await Promise.all(children);

    const state = ib.remaining();
    assert.equal(state.consumed, 10, `expected consumed=10, got ${state.consumed}`);
    assert.equal(state.remaining, 40, `expected remaining=40, got ${state.remaining}`);
  } finally { cleanup(); }
});

test('file-lock release on error: consume() throwing still releases the lock', async () => {
  const { cleanup } = tmpCwd();
  try {
    const ib = loadIb();
    await ib.reset(1);
    await ib.consume(); // remaining=0
    // Second consume throws — MUST release the lock on the way out.
    await assert.rejects(
      () => ib.consume(),
      { name: 'IterationBudgetExhaustedError' },
    );
    // If the lock leaked, the next refund would stall for LOCK_MAX_WAIT_MS
    // (~5s). Add a wall-clock assertion to catch a hang.
    const start = Date.now();
    const res = await ib.refund(1);
    const elapsed = Date.now() - start;
    assert.ok(elapsed < 1000, `refund after thrown consume took ${elapsed}ms — lock was not released`);
    assert.equal(res.remaining, 1);
    assert.equal(res.refunded, 1);
  } finally { cleanup(); }
});

test('invalid inputs throw synchronously', async () => {
  const { cleanup } = tmpCwd();
  try {
    const ib = loadIb();
    await ib.reset(10);
    await assert.rejects(() => ib.consume(0), /positive finite/);
    await assert.rejects(() => ib.consume(-1), /positive finite/);
    await assert.rejects(() => ib.consume(Number.NaN), /positive finite/);
    await assert.rejects(() => ib.refund(0), /positive finite/);
    await assert.rejects(() => ib.reset(-5), /non-negative/);
  } finally { cleanup(); }
});

test('state file lives at .design/iteration-budget.json', async () => {
  const { dir, cleanup } = tmpCwd();
  try {
    const ib = loadIb();
    await ib.reset(7);
    const p = path.join(dir, '.design', 'iteration-budget.json');
    assert.ok(fs.existsSync(p), 'state file should exist after reset()');
    const parsed = JSON.parse(fs.readFileSync(p, 'utf8'));
    assert.equal(parsed.budget, 7);
    assert.equal(parsed.remaining, 7);
  } finally { cleanup(); }
});

// --- lockfile.cjs coverage via integration ---

test('lockfile acquire/release: release is idempotent', async () => {
  const { dir, cleanup } = tmpCwd();
  try {
    const lf = loadLockfile();
    const target = path.join(dir, 'sample.json');
    fs.writeFileSync(target, '{}');

    const release = await lf.acquire(target);
    assert.ok(fs.existsSync(`${target}.lock`), 'lock file should exist after acquire');

    await release();
    assert.ok(!fs.existsSync(`${target}.lock`), 'lock file should be gone after release');

    // Second release should be a no-op.
    await release();
    assert.ok(!fs.existsSync(`${target}.lock`));
  } finally { cleanup(); }
});

test('lockfile acquire: stale-detection reclaims a dead-PID lock', async () => {
  const { dir, cleanup } = tmpCwd();
  try {
    const lf = loadLockfile();
    const target = path.join(dir, 'sample.json');
    fs.writeFileSync(target, '{}');

    // Plant a lock claiming to be held by PID 999999 (very unlikely alive)
    // with an acquired_at that is fresh (so only the PID-check path
    // reclaims it, not the age-based path).
    fs.writeFileSync(`${target}.lock`, JSON.stringify({
      pid: 999_999_999,
      host: os.hostname(),
      acquired_at: new Date().toISOString(),
    }));

    const release = await lf.acquire(target, { maxWaitMs: 500, pollMs: 20 });
    await release();
    assert.ok(true, 'acquire completed — stale-detection reclaimed the lock');
  } finally { cleanup(); }
});

test('lockfile acquire: age-based staleness reclaims an old lock', async () => {
  const { dir, cleanup } = tmpCwd();
  try {
    const lf = loadLockfile();
    const target = path.join(dir, 'sample.json');
    fs.writeFileSync(target, '{}');

    // Plant a lock by our own PID (alive) but with an old acquired_at so
    // only the age path can reclaim it.
    fs.writeFileSync(`${target}.lock`, JSON.stringify({
      pid: process.pid,
      host: os.hostname(),
      acquired_at: '2000-01-01T00:00:00.000Z',
    }));

    const release = await lf.acquire(target, { staleMs: 1_000, maxWaitMs: 500, pollMs: 20 });
    await release();
  } finally { cleanup(); }
});

test('lockfile acquire: fresh lock held by live PID causes timeout', async () => {
  const { dir, cleanup } = tmpCwd();
  try {
    const lf = loadLockfile();
    const target = path.join(dir, 'sample.json');
    fs.writeFileSync(target, '{}');

    // Plant a fresh lock held by our own live PID. No path can reclaim it
    // before maxWaitMs expires.
    fs.writeFileSync(`${target}.lock`, JSON.stringify({
      pid: process.pid,
      host: os.hostname(),
      acquired_at: new Date().toISOString(),
    }));

    await assert.rejects(
      () => lf.acquire(target, { staleMs: 60_000, maxWaitMs: 200, pollMs: 20 }),
      { name: 'LockAcquisitionError' },
    );
    // Cleanup so tmpCwd cleanup doesn't choke.
    try { fs.unlinkSync(`${target}.lock`); } catch { /* ignore */ }
  } finally { cleanup(); }
});
