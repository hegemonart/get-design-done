// tests/session-runner-bandit-record.test.cjs — Plan 27.5-03
//
// Verifies the bandit-posterior feedback loop wired into the
// session-runner's terminal-emit path. After every
// `emit('session.completed', …)` the runner calls
// `bandit-router/integration.cjs#recordOutcome()` so the posterior
// reflects the measured (status + cost) signal for the
// (agent × bin × tier × delegate) slice.
//
// Sandbox strategy: each test mkdtemp()s a private CWD, chdirs into it,
// writes a .design/budget.json with the desired `adaptive_mode`, runs
// session-runner with a queryOverride that yields deterministic chunks,
// then asserts on .design/telemetry/posterior.json. The session-runner
// uses process.cwd() to resolve both budget.json (via adaptive-mode.cjs)
// and posterior.json (via bandit-router.cjs DEFAULT_POSTERIOR_PATH),
// so the chdir is the entire isolation mechanism.
//
// Test groups:
//   1. Full mode + local-call completion → posterior with delegate=none
//   2. Full mode + peer-call completion → posterior with delegate=<peer>
//   3. Static mode → no posterior write (shim short-circuits)
//   4. Failed-status (status !== 'completed') → reward = 0 still written
//   5. Hedge mode → no posterior write (D-07 hedge silent)
//   6. Posterior throws → does NOT bubble out of session-runner
//   7. turnCap=0 → posterior write happens for the synthetic
//      turn_cap_exceeded status (delegate=none)
//   8. Multiple successful runs accumulate alpha on the same arm

'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  readFileSync,
  existsSync,
  rmSync,
} = require('node:fs');
const { tmpdir } = require('node:os');
const { join, resolve } = require('node:path');

const REPO_ROOT = resolve(__dirname, '..');

// Synchronous require of the .ts session-runner works on Node 24 (type
// stripping handles the imports transparently; the ESM/CJS interop bridge
// returns the module synchronously when the dep graph is already loaded).
const sessionRunner = require(
  join(REPO_ROOT, 'scripts', 'lib', 'session-runner', 'index.ts'),
);
const eventStream = require(
  join(REPO_ROOT, 'scripts', 'lib', 'event-stream', 'index.ts'),
);

const POSTERIOR_REL = '.design/telemetry/posterior.json';

// ── Sandbox helpers ─────────────────────────────────────────────────────────

/** Create a fresh tmp dir with .design/ subdir, return its path. */
function tmp(prefix) {
  const dir = mkdtempSync(join(tmpdir(), `gdd-sr-bandit-${prefix}-`));
  mkdirSync(join(dir, '.design', 'telemetry'), { recursive: true });
  mkdirSync(join(dir, '.design', 'rate-limits'), { recursive: true });
  return dir;
}

/** Write .design/budget.json with the given adaptive_mode. */
function writeBudget(dir, adaptive_mode) {
  writeFileSync(
    join(dir, '.design', 'budget.json'),
    JSON.stringify({ adaptive_mode, enforcement_mode: 'enforce' }, null, 2),
  );
}

/** Load posterior.json from the sandbox; null when absent. */
function loadPosterior(dir) {
  const p = join(dir, POSTERIOR_REL);
  if (!existsSync(p)) return null;
  return JSON.parse(readFileSync(p, 'utf8'));
}

/**
 * Run the session-runner inside a scoped CWD swap. Always restores
 * process.cwd + env on exit so a failing test cannot poison sibling tests.
 *
 * Also pins the event-stream writer to a sandboxed path and resets
 * between tests so the in-process event bus doesn't leak listeners.
 */
async function runInSandbox(dir, opts) {
  const originalCwd = process.cwd();
  const originalSessionDir = process.env['GDD_SESSION_DIR'];
  const sessionsDir = join(dir, 'sessions');
  mkdirSync(sessionsDir, { recursive: true });
  process.env['GDD_SESSION_DIR'] = sessionsDir;
  process.chdir(dir);
  try {
    eventStream.reset();
    eventStream.getWriter({ path: join(dir, '.design', 'telemetry', 'events.jsonl') });
    return await sessionRunner.run(opts);
  } finally {
    process.chdir(originalCwd);
    if (originalSessionDir === undefined) {
      delete process.env['GDD_SESSION_DIR'];
    } else {
      process.env['GDD_SESSION_DIR'] = originalSessionDir;
    }
    eventStream.reset();
  }
}

// ── Mock query factory — minimal chunks for completion path ─────────────────

/**
 * Build a queryOverride that yields one assistant chunk with stop_reason.
 * The model name controls which tier the session-runner records to.
 */
function makeCompletionQuery({ model = 'claude-sonnet-4-5', inputTokens = 100, outputTokens = 50, costMultiplier = 1 } = {}) {
  void costMultiplier;
  return function query(_args) {
    return (async function* () {
      yield {
        type: 'assistant',
        stop_reason: 'end_turn',
        model,
        usage: { input_tokens: inputTokens, output_tokens: outputTokens },
      };
    })();
  };
}

/**
 * Build a queryOverride that always throws an auth error → terminal
 * 'error' status with no retry. Used to verify failed-status writes.
 */
function makeAuthErrorQuery() {
  return function query(_args) {
    return (async function* () {
      throw { type: 'authentication_error', message: 'bad key', status: 401 };
    })();
  };
}

/**
 * Build a registryOverride for the peer path. Returns a successful
 * dispatch result for any role/tier combo. The peer name is used
 * verbatim as the delegate slice in the posterior.
 */
function makePeerRegistryOverride(peerName) {
  return async function dispatch(_role, _tier, _text, _opts) {
    return {
      result: 'peer says hello',
      peer: peerName,
      protocol: 'asp',
    };
  };
}

const DEFAULT_BUDGET = { usdLimit: 100, inputTokensLimit: 1_000_000, outputTokensLimit: 1_000_000 };
const DEFAULT_TURN_CAP = { maxTurns: 5 };

// ═══════════════════════════════════════════════════════════════════════════
// Test 1 — Local-call completion writes posterior with delegate=none
// ═══════════════════════════════════════════════════════════════════════════

test('27.5-03: full mode + local completion → posterior write with delegate=none, reward=1', async () => {
  const dir = tmp('local-complete');
  try {
    writeBudget(dir, 'full');
    const res = await runInSandbox(dir, {
      prompt: 'hello',
      stage: 'verify',
      budget: DEFAULT_BUDGET,
      turnCap: DEFAULT_TURN_CAP,
      queryOverride: makeCompletionQuery({ model: 'claude-sonnet-4-5' }),
    });
    assert.equal(res.status, 'completed', `expected completed, got ${res.status}`);
    const posterior = loadPosterior(dir);
    assert.ok(posterior, 'posterior.json should be created after a full-mode completion');
    assert.ok(Array.isArray(posterior.arms), 'posterior must have arms array');
    // Find the arm for (agent='verify', bin='medium', delegate='none', tier='sonnet').
    const arm = posterior.arms.find(
      (a) =>
        a.agent === 'verify' &&
        a.bin === 'medium' &&
        (a.delegate === undefined || a.delegate === 'none') &&
        a.tier === 'sonnet',
    );
    assert.ok(arm, `expected arm (verify, medium, sonnet, none) — got arms: ${JSON.stringify(posterior.arms.map((a) => ({ agent: a.agent, bin: a.bin, tier: a.tier, delegate: a.delegate })))}`);
    // status='completed' + cost ≈ 0.001 → reward ≈ 1.0; alpha grew via update().
    // Note: bandit-router.update() bumps alpha/beta but does NOT bump `count`
    // — count is incremented only by pull() during sampling. So we assert on
    // alpha growth, not count.
    assert.ok(arm.alpha > 1, `alpha should grow on success: alpha=${arm.alpha}`);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// Test 2 — Peer-call completion writes posterior with delegate=<peer>
// ═══════════════════════════════════════════════════════════════════════════

test('27.5-03: full mode + peer-CLI completion → posterior write with delegate=<peer>', async () => {
  const dir = tmp('peer-complete');
  try {
    writeBudget(dir, 'full');
    const res = await runInSandbox(dir, {
      prompt: 'hello',
      stage: 'explore',
      budget: DEFAULT_BUDGET,
      turnCap: DEFAULT_TURN_CAP,
      delegateTo: 'gemini-research',
      delegateRole: 'research',
      delegateTier: 'sonnet',
      registryOverride: makePeerRegistryOverride('gemini'),
      // queryOverride MUST be present even on peer path — the runner doesn't
      // hit it (peerResult returns early) but the type system requires it
      // for the fallback path. Use a never-yielding fixture.
      queryOverride: makeCompletionQuery(),
    });
    assert.equal(res.status, 'completed', `expected completed, got ${res.status}`);
    const posterior = loadPosterior(dir);
    assert.ok(posterior, 'posterior.json should be created after a peer completion');
    // Peer arm should carry delegate='gemini' (NOT 'none').
    const peerArm = posterior.arms.find(
      (a) => a.agent === 'explore' && a.bin === 'medium' && a.delegate === 'gemini' && a.tier === 'sonnet',
    );
    assert.ok(
      peerArm,
      `expected peer arm (explore, medium, sonnet, delegate=gemini) — got arms: ${JSON.stringify(posterior.arms.map((a) => ({ agent: a.agent, bin: a.bin, tier: a.tier, delegate: a.delegate })))}`,
    );
    assert.ok(peerArm.alpha > 1, `peer alpha should grow on success: alpha=${peerArm.alpha}`);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// Test 3 — Static mode → NO posterior write (shim short-circuits)
// ═══════════════════════════════════════════════════════════════════════════

test('27.5-03: static mode → NO posterior write (shim short-circuits per D-07)', async () => {
  const dir = tmp('static-silent');
  try {
    writeBudget(dir, 'static');
    const res = await runInSandbox(dir, {
      prompt: 'hello',
      stage: 'verify',
      budget: DEFAULT_BUDGET,
      turnCap: DEFAULT_TURN_CAP,
      queryOverride: makeCompletionQuery(),
    });
    assert.equal(res.status, 'completed');
    const posterior = loadPosterior(dir);
    assert.equal(
      posterior,
      null,
      `static mode must not create posterior.json — got: ${JSON.stringify(posterior)}`,
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// Test 4 — Failed status (status !== 'completed') → write fires, reward = 0
// ═══════════════════════════════════════════════════════════════════════════

test('27.5-03: full mode + error status → posterior write with reward=0 (beta grows, not alpha)', async () => {
  const dir = tmp('failed-status');
  try {
    writeBudget(dir, 'full');
    // Auth-error query → no retries, terminal 'error' status, no usage observed.
    const res = await runInSandbox(dir, {
      prompt: 'hello',
      stage: 'verify',
      budget: DEFAULT_BUDGET,
      turnCap: DEFAULT_TURN_CAP,
      queryOverride: makeAuthErrorQuery(),
      maxRetries: 1,
    });
    assert.equal(res.status, 'error', `expected error status, got ${res.status}`);
    const posterior = loadPosterior(dir);
    assert.ok(posterior, 'posterior must still be written on error status');
    // No model observed → tierFromModel(null) → 'sonnet'. delegate='none'.
    const arm = posterior.arms.find(
      (a) => a.agent === 'verify' && a.bin === 'medium' && a.tier === 'sonnet' && (a.delegate === undefined || a.delegate === 'none'),
    );
    assert.ok(arm, 'arm should exist for failed completion');
    // status='error' → solidify_pass=false → reward=0 → beta grows, alpha stays.
    assert.ok(
      arm.beta > 1,
      `beta should grow on failure (reward=0): beta=${arm.beta}, alpha=${arm.alpha}`,
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// Test 5 — Hedge mode → NO posterior write (D-07: hedge silent)
// ═══════════════════════════════════════════════════════════════════════════

test('27.5-03: hedge mode → NO posterior write (D-07 hedge silent)', async () => {
  const dir = tmp('hedge-silent');
  try {
    writeBudget(dir, 'hedge');
    const res = await runInSandbox(dir, {
      prompt: 'hello',
      stage: 'plan',
      budget: DEFAULT_BUDGET,
      turnCap: DEFAULT_TURN_CAP,
      queryOverride: makeCompletionQuery(),
    });
    assert.equal(res.status, 'completed');
    const posterior = loadPosterior(dir);
    assert.equal(posterior, null, 'hedge mode must not write posterior');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// Test 6 — Posterior throwing inside shim does NOT bubble out of run()
// ═══════════════════════════════════════════════════════════════════════════

test('27.5-03: corrupted posterior.json → run() still completes (telemetry failure swallowed)', async () => {
  const dir = tmp('corrupted-posterior');
  try {
    writeBudget(dir, 'full');
    // Make the posterior write path explode by writing a directory at the
    // posterior.json path. The bandit-router.update() will try to readFile
    // → fail → catch in the shim → catch in _recordBanditOutcome → swallow.
    // Result: run() completes normally with status='completed'.
    const posteriorAsDir = join(dir, POSTERIOR_REL);
    mkdirSync(posteriorAsDir, { recursive: true });
    const res = await runInSandbox(dir, {
      prompt: 'hello',
      stage: 'verify',
      budget: DEFAULT_BUDGET,
      turnCap: DEFAULT_TURN_CAP,
      queryOverride: makeCompletionQuery(),
    });
    // run() never throws even when posterior write fails — that's the
    // whole point of the defensive try/catch in _recordBanditOutcome.
    assert.equal(
      res.status,
      'completed',
      `run() must complete even when posterior write fails: status=${res.status}`,
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// Test 7 — turnCap=0 path → posterior write happens for synthetic turn_cap
// ═══════════════════════════════════════════════════════════════════════════

test('27.5-03: turnCap=0 short-circuit → posterior write with status=turn_cap_exceeded, reward=0', async () => {
  const dir = tmp('turncap-zero');
  try {
    writeBudget(dir, 'full');
    const res = await runInSandbox(dir, {
      prompt: 'hello',
      stage: 'verify',
      budget: DEFAULT_BUDGET,
      turnCap: { maxTurns: 0 },
      queryOverride: makeCompletionQuery(),
    });
    assert.equal(res.status, 'turn_cap_exceeded');
    assert.equal(res.turns, 0);
    const posterior = loadPosterior(dir);
    assert.ok(posterior, 'posterior must be written even for turnCap=0 path');
    const arm = posterior.arms.find(
      (a) => a.agent === 'verify' && a.bin === 'medium' && (a.delegate === undefined || a.delegate === 'none'),
    );
    assert.ok(arm, 'arm should exist for turnCap=0 short-circuit');
    // status !== 'completed' → reward=0 → beta grows.
    assert.ok(arm.beta > 1, `beta should grow when turnCap trips before any turn: beta=${arm.beta}`);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// Test 8 — Multiple successful runs accumulate alpha on the same arm
// ═══════════════════════════════════════════════════════════════════════════

test('27.5-03: 3 successful runs → alpha accumulates 3× on (verify, medium, sonnet, none)', async () => {
  const dir = tmp('alpha-accumulates');
  try {
    writeBudget(dir, 'full');
    for (let i = 0; i < 3; i++) {
      await runInSandbox(dir, {
        prompt: `hello ${i}`,
        stage: 'verify',
        budget: DEFAULT_BUDGET,
        turnCap: DEFAULT_TURN_CAP,
        queryOverride: makeCompletionQuery({ model: 'claude-sonnet-4-5' }),
      });
    }
    const posterior = loadPosterior(dir);
    const arm = posterior.arms.find(
      (a) =>
        a.agent === 'verify' &&
        a.bin === 'medium' &&
        a.tier === 'sonnet' &&
        (a.delegate === undefined || a.delegate === 'none'),
    );
    assert.ok(arm, 'arm should exist after 3 runs');
    // Each successful run adds reward∈(0,1] to alpha via update(). bandit-router's
    // update() does NOT bump `count` — it only adjusts alpha/beta. So we measure
    // accumulation via alpha growth: after 3 successes alpha should be
    // appreciably > the 1.0 prior (PRIOR_STRENGTH/3 split across arms).
    assert.ok(
      arm.alpha > 1 + 1.5,
      `alpha should grow meaningfully across 3 success runs: alpha=${arm.alpha}`,
    );
    // beta tracks cumulative (1 - reward); even on perfect successes
    // reward < 1 by a small cost-penalty term, so beta also grows but
    // by a much smaller amount than alpha.
    assert.ok(
      arm.alpha > arm.beta,
      `alpha should dominate beta after 3 successes: alpha=${arm.alpha}, beta=${arm.beta}`,
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// Test 9 — Tier inference from model id (opus / sonnet / haiku)
// ═══════════════════════════════════════════════════════════════════════════

test('27.5-03: model=claude-opus-4-7 → posterior arm with tier=opus', async () => {
  const dir = tmp('tier-opus');
  try {
    writeBudget(dir, 'full');
    const res = await runInSandbox(dir, {
      prompt: 'hello',
      stage: 'verify',
      budget: DEFAULT_BUDGET,
      turnCap: DEFAULT_TURN_CAP,
      queryOverride: makeCompletionQuery({ model: 'claude-opus-4-7' }),
    });
    assert.equal(res.status, 'completed');
    const posterior = loadPosterior(dir);
    assert.ok(posterior, 'posterior must be written');
    const opusArm = posterior.arms.find(
      (a) => a.agent === 'verify' && a.bin === 'medium' && a.tier === 'opus',
    );
    assert.ok(
      opusArm,
      `opus arm must exist when model=claude-opus-4-7 — arms: ${JSON.stringify(posterior.arms.map((a) => a.tier))}`,
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// Test 10 — Unknown adaptive_mode → fallback to 'static' → no write
// ═══════════════════════════════════════════════════════════════════════════

test('27.5-03: missing budget.json → adaptive_mode falls back to static → no posterior write', async () => {
  const dir = tmp('no-budget');
  try {
    // Do NOT writeBudget — adaptive-mode reads default = 'static' when
    // budget.json is absent. Posterior path stays clean.
    const res = await runInSandbox(dir, {
      prompt: 'hello',
      stage: 'verify',
      budget: DEFAULT_BUDGET,
      turnCap: DEFAULT_TURN_CAP,
      queryOverride: makeCompletionQuery(),
    });
    assert.equal(res.status, 'completed');
    assert.equal(loadPosterior(dir), null, 'missing budget.json must default to static (no write)');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
