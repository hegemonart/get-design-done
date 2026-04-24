'use strict';
// tests/rate-guard.test.cjs — Plan 20-14 Task 2.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');

// Helper: run each test in its own tmp cwd so state files are isolated.
function tmpCwd() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gdd-rate-guard-'));
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

// Clear the require cache so each test gets a fresh instance bound to
// the current cwd (stateFileFor closes over process.cwd() lazily, but
// any cached parse of the module would still be bound to the dir that
// was cwd at load time — in practice this module doesn't close over cwd
// so we don't need to clear, but belt+suspenders).
function loadRateGuard() {
  delete require.cache[require.resolve('../scripts/lib/rate-guard.cjs')];
  return require('../scripts/lib/rate-guard.cjs');
}

test('ingestHeaders parses Anthropic headers', async () => {
  const { cleanup } = tmpCwd();
  try {
    const rg = loadRateGuard();
    const resetIso = '2099-01-01T00:00:00.000Z';
    const state = await rg.ingestHeaders('anthropic', {
      'anthropic-ratelimit-requests-remaining': '0',
      'anthropic-ratelimit-requests-reset': resetIso,
    });
    assert.ok(state, 'ingestHeaders returned null');
    assert.equal(state.provider, 'anthropic');
    assert.equal(state.remaining, 0);
    assert.equal(state.resetAt, resetIso);

    const q = rg.remaining('anthropic');
    assert.ok(q, 'remaining() returned null');
    assert.equal(q.remaining, 0);
    assert.equal(q.resetAt, resetIso);
  } finally { cleanup(); }
});

test('ingestHeaders parses OpenAI-style headers', async () => {
  const { cleanup } = tmpCwd();
  try {
    const rg = loadRateGuard();
    // 2099-01-01 in Unix seconds: 4_070_908_800
    const state = await rg.ingestHeaders('openai', {
      'x-ratelimit-remaining-requests': '5',
      'x-ratelimit-reset-requests': '4070908800',
    });
    assert.ok(state);
    assert.equal(state.remaining, 5);
    assert.ok(/^2099-/.test(state.resetAt), `expected 2099-* resetAt, got ${state.resetAt}`);
  } finally { cleanup(); }
});

test('retry-after: integer seconds → resetAt ≈ now + seconds', async () => {
  const { cleanup } = tmpCwd();
  try {
    const rg = loadRateGuard();
    const before = Date.now();
    const state = await rg.ingestHeaders('anthropic', { 'retry-after': '30' });
    const after = Date.now();
    assert.ok(state);
    assert.equal(state.remaining, 0, 'retry-after implies remaining=0');
    const reset = Date.parse(state.resetAt);
    assert.ok(reset >= before + 30_000 - 50, `resetAt too early: ${state.resetAt}`);
    assert.ok(reset <= after + 30_000 + 50, `resetAt too late: ${state.resetAt}`);
  } finally { cleanup(); }
});

test('retry-after: HTTP date → parsed to ISO', async () => {
  const { cleanup } = tmpCwd();
  try {
    const rg = loadRateGuard();
    const state = await rg.ingestHeaders('provider-x', {
      'retry-after': 'Mon, 01 Jan 2099 00:00:00 GMT',
    });
    assert.ok(state);
    assert.equal(state.resetAt, '2099-01-01T00:00:00.000Z');
  } finally { cleanup(); }
});

test('most-restrictive precedence within a single ingest', async () => {
  const { cleanup } = tmpCwd();
  try {
    const rg = loadRateGuard();
    const state = await rg.ingestHeaders('openai', {
      'x-ratelimit-remaining-requests': '50',  // higher
      'x-ratelimit-remaining-tokens': '3',     // lower → wins
      'x-ratelimit-reset-requests': '4070908800',  // 2099
      'x-ratelimit-reset-tokens': '4070912400',    // 1hr later → wins
    });
    assert.equal(state.remaining, 3, 'lowest remaining wins');
    // Latest reset wins (2099-01-01T01:00:00Z)
    assert.ok(state.resetAt.startsWith('2099-01-01T01:00:00'), `latest resetAt expected, got ${state.resetAt}`);
  } finally { cleanup(); }
});

test('case-insensitive header lookup', async () => {
  const { cleanup } = tmpCwd();
  try {
    const rg = loadRateGuard();
    const state = await rg.ingestHeaders('anthropic', {
      'Anthropic-RateLimit-Requests-Remaining': '7',
      'ANTHROPIC-RATELIMIT-REQUESTS-RESET': '2099-06-01T00:00:00Z',
    });
    assert.ok(state);
    assert.equal(state.remaining, 7);
  } finally { cleanup(); }
});

test('headers with no rate-limit signal → no state change', async () => {
  const { cleanup } = tmpCwd();
  try {
    const rg = loadRateGuard();
    const state = await rg.ingestHeaders('anthropic', {
      'content-type': 'application/json',
      'x-request-id': 'abc',
    });
    assert.equal(state, null);
    assert.equal(rg.remaining('anthropic'), null);
  } finally { cleanup(); }
});

test('state file lives under .design/rate-limits/<provider>.json', async () => {
  const { dir, cleanup } = tmpCwd();
  try {
    const rg = loadRateGuard();
    await rg.ingestHeaders('anthropic', { 'retry-after': '60' });
    const p = path.join(dir, '.design', 'rate-limits', 'anthropic.json');
    assert.ok(fs.existsSync(p), `expected state file at ${p}`);
    const parsed = JSON.parse(fs.readFileSync(p, 'utf8'));
    assert.equal(parsed.provider, 'anthropic');
    assert.equal(parsed.remaining, 0);
  } finally { cleanup(); }
});

test('remaining() returns null when resetAt has passed', async () => {
  const { cleanup } = tmpCwd();
  try {
    const rg = loadRateGuard();
    // Directly write an expired state so remaining() sees it.
    const p = path.join(process.cwd(), '.design', 'rate-limits', 'anthropic.json');
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, JSON.stringify({
      provider: 'anthropic',
      remaining: 0,
      resetAt: '2000-01-01T00:00:00.000Z',
      updatedAt: '2000-01-01T00:00:00.000Z',
    }));
    assert.equal(rg.remaining('anthropic'), null, 'expired state must be treated as cleared');
  } finally { cleanup(); }
});

test('blockUntilReady with remaining=0 and resetAt=now+100ms resolves in ~100ms', async () => {
  const { cleanup } = tmpCwd();
  try {
    const rg = loadRateGuard();
    const p = path.join(process.cwd(), '.design', 'rate-limits', 'anthropic.json');
    fs.mkdirSync(path.dirname(p), { recursive: true });
    const resetAt = new Date(Date.now() + 100).toISOString();
    fs.writeFileSync(p, JSON.stringify({
      provider: 'anthropic',
      remaining: 0,
      resetAt,
      updatedAt: new Date().toISOString(),
    }));
    const start = Date.now();
    const waited = await rg.blockUntilReady('anthropic');
    const elapsed = Date.now() - start;
    assert.ok(waited >= 50, `blockUntilReady returned too low waited=${waited}`);
    assert.ok(elapsed >= 50, `blockUntilReady returned too fast elapsed=${elapsed}`);
    assert.ok(elapsed < 1500, `blockUntilReady waited too long elapsed=${elapsed}`);
  } finally { cleanup(); }
});

test('blockUntilReady with remaining>0 returns immediately', async () => {
  const { cleanup } = tmpCwd();
  try {
    const rg = loadRateGuard();
    const p = path.join(process.cwd(), '.design', 'rate-limits', 'anthropic.json');
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, JSON.stringify({
      provider: 'anthropic',
      remaining: 5,
      resetAt: '2099-01-01T00:00:00.000Z',
      updatedAt: new Date().toISOString(),
    }));
    const start = Date.now();
    const waited = await rg.blockUntilReady('anthropic');
    const elapsed = Date.now() - start;
    assert.equal(waited, 0);
    assert.ok(elapsed < 50, `should return synchronously, waited ${elapsed}ms`);
  } finally { cleanup(); }
});

test('atomic write: concurrent ingestHeaders from 2 children produces valid JSON', async () => {
  const { dir, cleanup } = tmpCwd();
  try {
    // Spawn 2 child processes that each ingest anthropic headers in a
    // tight loop. The test cwd is their working dir via env forwarding.
    // Use JSON.stringify for both the module path and the chdir target so
    // Windows backslashes are escaped correctly inside the eval string.
    const modulePath = require.resolve('../scripts/lib/rate-guard.cjs');
    const script = `
      (async () => {
        const rg = require(${JSON.stringify(modulePath)});
        process.chdir(${JSON.stringify(dir)});
        for (let i = 0; i < 20; i++) {
          await rg.ingestHeaders('anthropic', {
            'anthropic-ratelimit-requests-remaining': String((process.pid % 10) + 1),
            'anthropic-ratelimit-requests-reset': '2099-01-01T00:00:00Z',
          });
        }
      })().catch((e) => { console.error(e); process.exit(1); });
    `;
    const runChild = () => new Promise((resolve, reject) => {
      const child = spawn(process.execPath, ['-e', script], { cwd: dir, stdio: 'pipe' });
      let stderr = '';
      child.stderr.on('data', (d) => { stderr += String(d); });
      child.on('exit', (code) => {
        if (code === 0) resolve();
        else reject(new Error(`child exit ${code}: ${stderr}`));
      });
      child.on('error', reject);
    });
    await Promise.all([runChild(), runChild()]);

    // Final file must parse as valid JSON with the expected shape.
    const p = path.join(dir, '.design', 'rate-limits', 'anthropic.json');
    const raw = fs.readFileSync(p, 'utf8');
    const parsed = JSON.parse(raw); // throws if corrupt
    assert.equal(parsed.provider, 'anthropic');
    assert.ok(Number.isInteger(parsed.remaining));
    assert.equal(typeof parsed.resetAt, 'string');
    assert.equal(typeof parsed.updatedAt, 'string');
  } finally { cleanup(); }
});

test('provider name sanitization rejects path traversal', async () => {
  const { cleanup } = tmpCwd();
  try {
    const rg = loadRateGuard();
    await assert.rejects(
      () => rg.ingestHeaders('../../etc', { 'retry-after': '10' }),
      /illegal characters/,
    );
    await assert.rejects(
      () => rg.ingestHeaders('', { 'retry-after': '10' }),
      /non-empty/,
    );
  } finally { cleanup(); }
});

test('distill extracts 0-remaining + resetAt from anthropic headers', () => {
  const rg = loadRateGuard();
  const d = rg._internal.distill({
    'anthropic-ratelimit-requests-remaining': '0',
    'anthropic-ratelimit-requests-reset': '2099-01-01T00:00:00Z',
  });
  assert.equal(d.remaining, 0);
  assert.ok(d.resetAt.startsWith('2099-01-01'));
});

test('merge: cross-call precedence picks lowest remaining and latest resetAt', async () => {
  const { cleanup } = tmpCwd();
  try {
    const rg = loadRateGuard();
    await rg.ingestHeaders('anthropic', {
      'anthropic-ratelimit-requests-remaining': '10',
      'anthropic-ratelimit-requests-reset': '2099-01-01T00:00:00Z',
    });
    // Second ingest: lower remaining, later reset.
    const second = await rg.ingestHeaders('anthropic', {
      'anthropic-ratelimit-requests-remaining': '3',
      'anthropic-ratelimit-requests-reset': '2099-06-01T00:00:00Z',
    });
    assert.equal(second.remaining, 3);
    assert.ok(second.resetAt.startsWith('2099-06-01'), `expected June 2099, got ${second.resetAt}`);

    // Third ingest: higher remaining — should NOT raise the stored value.
    const third = await rg.ingestHeaders('anthropic', {
      'anthropic-ratelimit-requests-remaining': '50',
      'anthropic-ratelimit-requests-reset': '2099-03-01T00:00:00Z',
    });
    assert.equal(third.remaining, 3, 'remaining must not go up on less-restrictive response');
    assert.ok(third.resetAt.startsWith('2099-06-01'), 'resetAt must stay at the latest seen');
  } finally { cleanup(); }
});
