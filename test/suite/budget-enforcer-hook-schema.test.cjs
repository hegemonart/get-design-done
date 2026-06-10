'use strict';

// tests/budget-enforcer-hook-schema.test.cjs — Phase 59-8 (A1 + A2 wiring).
//
// Integration coverage proving the budget-enforcer hook speaks the
// authoritative Claude Code PreToolUse output schema:
//
//   (a) MATCHER/GUARD (A1): a payload with tool_name: 'Task' (not just
//       'Agent') still triggers enforcement — the hook emits a JSON
//       decision rather than exiting 0 silently.
//   (b) INPUT MUTATION (A2): the allow-with-override emit carries
//       hookSpecificOutput.hookEventName === 'PreToolUse' and
//       hookSpecificOutput.updatedInput (the supported input-rewrite
//       mechanism on current Claude Code).
//   (c) CACHE BLOCK (A2): the cache-hit emit blocks the re-spawn via
//       hookSpecificOutput.permissionDecision === 'deny' (the supported
//       block mechanism) instead of the ignored continue:false /
//       cached_result footgun.
//
// We spawn the real .ts hook via `node --experimental-strip-types`
// against a throw-away .design/ scaffold, mirroring the invocation
// pattern in budget-enforcer-resilience.test.ts.

const test = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const {
  mkdtempSync,
  writeFileSync,
  rmSync,
  mkdirSync,
  readFileSync,
} = require('node:fs');
const { join, dirname } = require('node:path');
const { tmpdir } = require('node:os');

function findRepoRoot() {
  let dir = process.cwd();
  for (let i = 0; i < 10; i++) {
    try {
      const pkg = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8'));
      if (pkg.name === '@hegemonart/get-design-done') return dir;
    } catch {
      // not this level
    }
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return process.cwd();
}

const REPO_ROOT = findRepoRoot();
const BUDGET_HOOK = join(REPO_ROOT, 'hooks', 'budget-enforcer.ts');

function makeTempCwd(prefix) {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  return {
    dir,
    cleanup: () => {
      try { rmSync(dir, { recursive: true, force: true }); } catch { /* ignore */ }
    },
  };
}

function runHook(stdin, cwd) {
  const result = spawnSync(
    process.execPath,
    ['--experimental-strip-types', BUDGET_HOOK],
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

/** Build a hook stdin envelope with an explicit tool_name. */
function stdinFor(toolName, toolInput) {
  return JSON.stringify({ tool_name: toolName, tool_input: toolInput });
}

/** Seed a minimal .design/ so readCycleAndPhase() returns known values. */
function seedDesign(dir) {
  mkdirSync(join(dir, '.design'), { recursive: true });
  writeFileSync(join(dir, '.design', 'STATE.md'), '---\ncycle: c1\nphase: p1\n---\n');
}

test('budget-enforcer (A1): tool_name=Task triggers enforcement (does not exit 0 silently)', () => {
  const { dir, cleanup } = makeTempCwd('gdd-hook-task-');
  try {
    seedDesign(dir);

    const stdin = stdinFor('Task', {
      subagent_type: 'design-verifier',
      _est_cost_usd: 0.01,
    });
    const r = runHook(stdin, dir);
    assert.equal(r.status, 0, `nonzero exit: stderr=${r.stderr}`);
    assert.ok(
      r.stdout.trim().length > 0,
      'Task-named spawn must emit a JSON decision, not exit 0 with empty stdout',
    );
    const parsed = JSON.parse(r.stdout);
    assert.equal(typeof parsed.continue, 'boolean', 'must be a well-formed ToolOutput envelope');
  } finally {
    cleanup();
  }
});

test('budget-enforcer (A2): allow-with-override emits hookSpecificOutput.updatedInput', () => {
  const { dir, cleanup } = makeTempCwd('gdd-hook-allow-');
  try {
    seedDesign(dir);

    // Standard allow path (no cache hash, not S-class, not rate-limited).
    const stdin = stdinFor('Task', {
      subagent_type: 'design-verifier',
      _est_cost_usd: 0.01,
    });
    const r = runHook(stdin, dir);
    assert.equal(r.status, 0, `nonzero exit: stderr=${r.stderr}`);
    const parsed = JSON.parse(r.stdout);
    assert.equal(parsed.continue, true, 'standard path must allow the spawn');
    assert.ok(parsed.hookSpecificOutput, 'must carry hookSpecificOutput');
    assert.equal(
      parsed.hookSpecificOutput.hookEventName,
      'PreToolUse',
      'hookEventName must be PreToolUse',
    );
    assert.ok(
      parsed.hookSpecificOutput.updatedInput,
      'allow must carry updatedInput so tier-downgrade/bandit overrides take effect',
    );
  } finally {
    cleanup();
  }
});

test('budget-enforcer (A2): cache-hit blocks via hookSpecificOutput.permissionDecision=deny', () => {
  const { dir, cleanup } = makeTempCwd('gdd-hook-cache-');
  try {
    seedDesign(dir);

    // Seed a fresh cache-manifest entry keyed by agent:inputHash.
    const manifest = {
      ttl_seconds: 3600,
      entries: {
        'design-verifier:abc123': {
          ts_unix: Math.floor(Date.now() / 1000),
          result: { ok: true, note: 'cached' },
        },
      },
    };
    writeFileSync(
      join(dir, '.design', 'cache-manifest.json'),
      JSON.stringify(manifest),
    );

    const stdin = stdinFor('Task', {
      subagent_type: 'design-verifier',
      _input_hash: 'abc123',
      _est_cost_usd: 0,
    });
    const r = runHook(stdin, dir);
    assert.equal(r.status, 0, `nonzero exit: stderr=${r.stderr}`);
    const parsed = JSON.parse(r.stdout);
    assert.ok(parsed.hookSpecificOutput, 'cache-hit must carry hookSpecificOutput');
    assert.equal(
      parsed.hookSpecificOutput.permissionDecision,
      'deny',
      'cache-hit must block the re-spawn via permissionDecision=deny',
    );
    assert.ok(
      typeof parsed.message === 'string' && parsed.message.includes('SkippedCached'),
      `expected SkippedCached message, got: ${parsed.message}`,
    );
  } finally {
    cleanup();
  }
});
