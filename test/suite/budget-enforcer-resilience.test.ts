// tests/budget-enforcer-resilience.test.ts — Plan 20-14 integration coverage.
//
// Proves that the rate-guard + iteration-budget wiring added to
// hooks/budget-enforcer.ts in Plan 20-14 Task 6 triggers the right
// decisions without regressing the 20-13 baseline. These tests spawn
// the real hook (via `node --experimental-strip-types`) against a
// throw-away `.design/` scaffold, so they exercise the full CJS
// require-bridge, not just the code paths in isolation.

import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, writeFileSync, rmSync, readFileSync, mkdirSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { tmpdir } from 'node:os';

/**
 * Walk up from `process.cwd()` to locate our package.json — identical to
 * scripts/validate-schemas.ts's findRepoRoot. We deliberately avoid
 * `__dirname` / `import.meta.url` so this test file stays compatible
 * with the Node16 tsconfig module setting without forcing
 * "type":"module" in package.json.
 */
function findRepoRoot(): string {
  let dir: string = process.cwd();
  for (let i = 0; i < 10; i++) {
    try {
      const pkgPath: string = join(dir, 'package.json');
      const pkg: { name?: string } = JSON.parse(readFileSync(pkgPath, 'utf8')) as { name?: string };
      if (pkg.name === '@hegemonart/get-design-done') return dir;
    } catch {
      // not this level
    }
    const parent: string = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return resolve(process.cwd());
}

const REPO_ROOT = findRepoRoot();
const BUDGET_HOOK = join(REPO_ROOT, 'hooks', 'budget-enforcer.ts');

function makeTempCwd(prefix: string): { dir: string; cleanup: () => void } {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  return {
    dir,
    cleanup: () => {
      try { rmSync(dir, { recursive: true, force: true }); } catch { /* ignore */ }
    },
  };
}

interface HookResult {
  stdout: string;
  stderr: string;
  status: number | null;
}

function runHook(hookPath: string, stdin: string, cwd: string): HookResult {
  const result = spawnSync(
    process.execPath,
    ['--experimental-strip-types', hookPath],
    {
      cwd,
      input: stdin,
      encoding: 'utf8',
      env: { ...process.env, GDD_TEST_MODE: '1' },
    },
  );
  return {
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
    status: result.status,
  };
}

interface HookStdin {
  tool_name: string;
  tool_input: Record<string, unknown>;
}

function agentStdin(toolInput: Record<string, unknown>): string {
  const envelope: HookStdin = { tool_name: 'Agent', tool_input: toolInput };
  return JSON.stringify(envelope);
}

/** Write a rate-guard state file signalling remaining=0. */
function writeRateLimitState(dir: string, resetAtIso: string): string {
  const p = join(dir, '.design', 'rate-limits', 'anthropic.json');
  mkdirSync(join(dir, '.design', 'rate-limits'), { recursive: true });
  writeFileSync(p, JSON.stringify({
    provider: 'anthropic',
    remaining: 0,
    resetAt: resetAtIso,
    updatedAt: new Date().toISOString(),
  }));
  return p;
}

test('budget-enforcer: rate-guard short-circuit emits rate-limited decision + block message', () => {
  const { dir, cleanup } = makeTempCwd('gdd-hook-rate-');
  try {
    // Signal that anthropic is rate-limited until 5s from now.
    const resetAt = new Date(Date.now() + 5_000).toISOString();
    writeRateLimitState(dir, resetAt);

    // Seed STATE.md so readCycleAndPhase() returns known values.
    mkdirSync(join(dir, '.design'), { recursive: true });
    writeFileSync(join(dir, '.design', 'STATE.md'), '---\ncycle: c1\nphase: p1\n---\n');

    const stdin = agentStdin({
      subagent_type: 'design-verifier',
      _est_cost_usd: 0.01,
      _tokens_in_est: 100,
      _tokens_out_est: 100,
    });
    const r = runHook(BUDGET_HOOK, stdin, dir);

    assert.equal(r.status, 0, `nonzero exit: stderr=${r.stderr}`);
    assert.ok(r.stdout.length > 0, 'expected stdout payload');
    const parsed = JSON.parse(r.stdout) as { continue: boolean; message?: string };
    assert.equal(parsed.continue, false, 'rate-limited spawn must be blocked');
    assert.ok(
      typeof parsed.message === 'string' && parsed.message.includes('rate-limited on anthropic'),
      `expected rate-limited message, got: ${parsed.message ?? 'undefined'}`,
    );
    assert.ok(
      parsed.message?.includes('retry in'),
      'rate-limited message must include a wait time',
    );

    // Event stream must carry a hook.fired event with decision='rate-limited'.
    const eventsPath = join(dir, '.design', 'telemetry', 'events.jsonl');
    assert.ok(existsSync(eventsPath), `expected events.jsonl at ${eventsPath}`);
    const lines = readFileSync(eventsPath, 'utf8').split(/\r?\n/).filter(Boolean);
    const fired = lines
      .map((l) => {
        try { return JSON.parse(l) as { type?: string; payload?: { hook?: string; decision?: string } }; }
        catch { return null; }
      })
      .find((e) => e && e.type === 'hook.fired' && e.payload?.hook === 'budget-enforcer');
    assert.ok(fired, 'expected a hook.fired event from budget-enforcer');
    assert.equal(fired?.payload?.decision, 'rate-limited');
  } finally { cleanup(); }
});

test('budget-enforcer: rate-guard with expired resetAt does NOT block (stale state → proceed)', () => {
  const { dir, cleanup } = makeTempCwd('gdd-hook-rate-stale-');
  try {
    // Reset was an hour ago — rate-guard.remaining() must treat this as null.
    const resetAt = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    writeRateLimitState(dir, resetAt);
    mkdirSync(join(dir, '.design'), { recursive: true });
    writeFileSync(join(dir, '.design', 'STATE.md'), '---\ncycle: c1\nphase: p1\n---\n');

    const stdin = agentStdin({
      subagent_type: 'design-verifier',
      _est_cost_usd: 0.01,
      _tokens_in_est: 100,
      _tokens_out_est: 100,
    });
    const r = runHook(BUDGET_HOOK, stdin, dir);
    assert.equal(r.status, 0, `nonzero exit: stderr=${r.stderr}`);
    const parsed = JSON.parse(r.stdout) as { continue: boolean; message?: string };
    assert.equal(parsed.continue, true, 'expired rate-limit must not block');
    assert.ok(
      !(parsed.message ?? '').includes('rate-limited'),
      `expected no rate-limit message, got: ${parsed.message}`,
    );
  } finally { cleanup(); }
});

test('budget-enforcer: missing rate-guard state → pass through (no false positives)', () => {
  const { dir, cleanup } = makeTempCwd('gdd-hook-no-rate-');
  try {
    mkdirSync(join(dir, '.design'), { recursive: true });
    writeFileSync(join(dir, '.design', 'STATE.md'), '---\ncycle: c1\nphase: p1\n---\n');

    const stdin = agentStdin({
      subagent_type: 'design-verifier',
      _est_cost_usd: 0.01,
      _tokens_in_est: 100,
      _tokens_out_est: 100,
    });
    const r = runHook(BUDGET_HOOK, stdin, dir);
    assert.equal(r.status, 0, `nonzero exit: stderr=${r.stderr}`);
    const parsed = JSON.parse(r.stdout) as { continue: boolean; message?: string };
    assert.equal(parsed.continue, true);
  } finally { cleanup(); }
});

test('budget-enforcer: rate-guard with remaining > 0 does NOT block', () => {
  const { dir, cleanup } = makeTempCwd('gdd-hook-rate-ok-');
  try {
    const p = join(dir, '.design', 'rate-limits', 'anthropic.json');
    mkdirSync(join(dir, '.design', 'rate-limits'), { recursive: true });
    writeFileSync(p, JSON.stringify({
      provider: 'anthropic',
      remaining: 5,
      resetAt: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
      updatedAt: new Date().toISOString(),
    }));
    mkdirSync(join(dir, '.design'), { recursive: true });
    writeFileSync(join(dir, '.design', 'STATE.md'), '---\ncycle: c1\nphase: p1\n---\n');

    const stdin = agentStdin({
      subagent_type: 'design-verifier',
      _est_cost_usd: 0.01,
      _tokens_in_est: 100,
      _tokens_out_est: 100,
    });
    const r = runHook(BUDGET_HOOK, stdin, dir);
    assert.equal(r.status, 0, `nonzero exit: stderr=${r.stderr}`);
    const parsed = JSON.parse(r.stdout) as { continue: boolean };
    assert.equal(parsed.continue, true);
  } finally { cleanup(); }
});

test('budget-enforcer: cache-hit short-circuit triggers iteration-budget refund call', () => {
  const { dir, cleanup } = makeTempCwd('gdd-hook-cache-refund-');
  try {
    // Seed a cached answer for agent+inputHash so Branch B fires.
    const manifest = {
      ttl_seconds: 3600,
      entries: {
        'design-verifier:abc123': {
          ts_unix: Math.floor(Date.now() / 1000),
          result: { ok: true, cached: 'payload' },
        },
      },
    };
    mkdirSync(join(dir, '.design'), { recursive: true });
    writeFileSync(join(dir, '.design', 'cache-manifest.json'), JSON.stringify(manifest));
    writeFileSync(join(dir, '.design', 'STATE.md'), '---\ncycle: c1\nphase: p1\n---\n');

    // Pre-seed iteration-budget with one unit consumed so the refund has
    // room to land. Without this the refund is a no-op at full budget.
    writeFileSync(join(dir, '.design', 'iteration-budget.json'), JSON.stringify({
      budget: 10,
      remaining: 9,
      consumed: 1,
      refunded: 0,
      updatedAt: new Date().toISOString(),
    }));

    const stdin = agentStdin({
      subagent_type: 'design-verifier',
      _input_hash: 'abc123',
      _est_cost_usd: 0,
    });
    const r = runHook(BUDGET_HOOK, stdin, dir);
    assert.equal(r.status, 0, `nonzero exit: stderr=${r.stderr}`);
    const parsed = JSON.parse(r.stdout) as { continue: boolean; cached_result?: unknown; message?: string };
    assert.equal(parsed.continue, false, 'cache-hit must short-circuit');
    assert.ok(
      typeof parsed.message === 'string' && parsed.message.includes('SkippedCached'),
      `expected SkippedCached message, got: ${parsed.message}`,
    );

    // The refund fires asynchronously — give it a moment to land on disk.
    // Poll up to 1s for the file to reflect the refunded=1 update.
    const budgetPath = join(dir, '.design', 'iteration-budget.json');
    const deadline = Date.now() + 1000;
    let parsedBudget: { remaining: number; refunded: number; consumed: number } | null = null;
    while (Date.now() < deadline) {
      try {
        const raw = readFileSync(budgetPath, 'utf8');
        const p = JSON.parse(raw) as { remaining: number; refunded: number; consumed: number };
        if (p.refunded >= 1) { parsedBudget = p; break; }
      } catch { /* tmp file mid-rename; retry */ }
      // busy-wait briefly
      const b = Date.now() + 20; while (Date.now() < b) { /* spin */ }
    }
    assert.ok(parsedBudget, 'expected iteration-budget.json to reflect refund within 1s');
    assert.equal(parsedBudget?.refunded, 1, 'refunded counter should be 1');
    assert.equal(parsedBudget?.remaining, 10, 'remaining should have climbed back to budget');
  } finally { cleanup(); }
});
