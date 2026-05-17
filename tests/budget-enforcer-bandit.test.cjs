// tests/budget-enforcer-bandit.test.cjs — Plan 27.5-02 budget-enforcer bandit consultation
//
// Drives the hook as a child process with stdin/stdout, asserts on the
// emitted events.jsonl (via GDD_EVENTS_PATH env override) and the
// stdout response. Test isolation strategy: events go to a tmpdir via
// GDD_EVENTS_PATH; budget.json / posterior.json / costs.jsonl live in
// the real repo (the hook resolves them via process.cwd()), so we
// either write fixtures under <repo>/.design (rare) or pass-through.
//
// Most tests use the cwd-as-tmpdir approach + copy of reference/
// runtime-models.md + scripts/lib/install/parse-runtime-models.cjs so
// tier-resolver works inside the sandbox.

'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
  mkdtempSync,
  mkdirSync,
  existsSync,
  readFileSync,
  writeFileSync,
  rmSync,
  cpSync,
} = require('node:fs');
const { tmpdir } = require('node:os');
const { join, resolve } = require('node:path');
const { spawnSync } = require('node:child_process');

const REPO_ROOT = resolve(__dirname, '..');
const HOOK_PATH = join(REPO_ROOT, 'hooks', 'budget-enforcer.ts');

function tmp(prefix) {
  const dir = mkdtempSync(join(tmpdir(), `gdd-be-bandit-${prefix}-`));
  mkdirSync(join(dir, '.design', 'telemetry'), { recursive: true });
  return dir;
}

function setupTierResolverFixtures(dir) {
  // Copy reference/runtime-models.md + the parser shim so tier-resolver
  // can resolve from inside the sandbox.
  mkdirSync(join(dir, 'reference'), { recursive: true });
  mkdirSync(join(dir, 'scripts', 'lib', 'install'), { recursive: true });
  cpSync(
    join(REPO_ROOT, 'reference', 'runtime-models.md'),
    join(dir, 'reference', 'runtime-models.md'),
  );
  cpSync(
    join(REPO_ROOT, 'scripts', 'lib', 'install', 'parse-runtime-models.cjs'),
    join(dir, 'scripts', 'lib', 'install', 'parse-runtime-models.cjs'),
  );
  // Copy reference/prices/ so budget-enforcer.cjs cost lookup works.
  if (existsSync(join(REPO_ROOT, 'reference', 'prices'))) {
    cpSync(
      join(REPO_ROOT, 'reference', 'prices'),
      join(dir, 'reference', 'prices'),
      { recursive: true },
    );
  }
}

function writeBudget(dir, adaptive_mode, extra = {}) {
  writeFileSync(
    join(dir, '.design', 'budget.json'),
    JSON.stringify(
      {
        adaptive_mode,
        enforcement_mode: 'enforce',
        auto_downgrade_on_cap: true,
        per_task_cap_usd: 100, // high enough to avoid downgrade
        per_phase_cap_usd: 1000,
        ...extra,
      },
      null,
      2,
    ),
  );
}

function runHook(dir, stdinPayload, extraEnv = {}) {
  const eventsPath = join(dir, '.design', 'telemetry', 'events.jsonl');
  const env = {
    ...process.env,
    GDD_EVENTS_PATH: eventsPath,
    ...extraEnv,
  };
  const result = spawnSync(
    'node',
    ['--experimental-strip-types', HOOK_PATH],
    {
      cwd: dir,
      input: JSON.stringify(stdinPayload),
      encoding: 'utf8',
      env,
    },
  );
  return {
    stdout: result.stdout,
    stderr: result.stderr,
    status: result.status,
  };
}

function readEvents(dir) {
  const p = join(dir, '.design', 'telemetry', 'events.jsonl');
  if (!existsSync(p)) return [];
  return readFileSync(p, 'utf8')
    .split('\n')
    .filter(Boolean)
    .map((l) => {
      try {
        return JSON.parse(l);
      } catch {
        return null;
      }
    })
    .filter(Boolean);
}

function parseStdout(stdout) {
  try {
    return JSON.parse(stdout);
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Test 1 — adaptive_mode=full + no override → bandit.tier_selected event
// ---------------------------------------------------------------------------
test('27.5-02: adaptive_mode=full + no _tier_override + no _tier_downgraded → bandit.tier_selected event emitted', () => {
  const dir = tmp('full-emit');
  try {
    setupTierResolverFixtures(dir);
    writeBudget(dir, 'full');
    const r = runHook(dir, {
      tool_name: 'Agent',
      tool_input: {
        subagent_type: 'design-verifier',
        _default_tier: 'sonnet',
        _est_cost_usd: 0.01,
        _tokens_in_est: 100,
        _tokens_out_est: 100,
        context: {
          router_decision: {
            resolved_models: { 'design-verifier': 'claude-sonnet-4-7' },
            runtime: 'claude',
          },
        },
      },
    });
    assert.equal(
      r.status,
      0,
      `hook exited non-zero: status=${r.status} stderr=${r.stderr}`,
    );
    const events = readEvents(dir);
    const banditEvents = events.filter(
      (e) => e.type === 'bandit.tier_selected',
    );
    assert.ok(
      banditEvents.length >= 1,
      `expected >= 1 bandit.tier_selected events, got ${banditEvents.length}; all events: ${JSON.stringify(events.map((e) => e.type))}`,
    );
    const ev = banditEvents[0];
    assert.equal(ev.payload.agent, 'design-verifier');
    assert.equal(ev.payload.adaptive_mode, 'full');
    assert.ok(
      ['bandit_pull', 'bandit_pull_with_delegate'].includes(ev.payload.source),
      `expected bandit-pull source in full mode, got ${ev.payload.source}`,
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// Test 2 — adaptive_mode=full + bandit overrides → _tier_override set
// ---------------------------------------------------------------------------
test('27.5-02: adaptive_mode=full → modified_tool_input._tier_override reflects bandit pick', () => {
  const dir = tmp('full-override');
  try {
    setupTierResolverFixtures(dir);
    writeBudget(dir, 'full');
    // Seed posterior with a STRONG haiku bias for design-verifier so the
    // bandit picks haiku with very high probability.
    const posteriorPath = join(dir, '.design', 'telemetry', 'posterior.json');
    writeFileSync(
      posteriorPath,
      JSON.stringify({
        schema_version: '1.0.0',
        generated_at: new Date().toISOString(),
        arms: [
          {
            agent: 'design-verifier',
            bin: 'medium',
            tier: 'haiku',
            alpha: 200,
            beta: 1,
            last_used: new Date().toISOString(),
            count: 200,
          },
          {
            agent: 'design-verifier',
            bin: 'medium',
            tier: 'sonnet',
            alpha: 1,
            beta: 200,
            last_used: new Date().toISOString(),
            count: 200,
          },
          {
            agent: 'design-verifier',
            bin: 'medium',
            tier: 'opus',
            alpha: 1,
            beta: 200,
            last_used: new Date().toISOString(),
            count: 200,
          },
        ],
      }),
    );

    const r = runHook(dir, {
      tool_name: 'Agent',
      tool_input: {
        subagent_type: 'design-verifier',
        _default_tier: 'sonnet',
        _est_cost_usd: 0.01,
        _tokens_in_est: 100,
        _tokens_out_est: 100,
        context: {
          router_decision: {
            resolved_models: { 'design-verifier': 'claude-sonnet-4-7' },
            runtime: 'claude',
          },
        },
      },
    });
    assert.equal(r.status, 0, `hook failed: ${r.stderr}`);
    const out = parseStdout(r.stdout);
    assert.ok(out, `stdout was not JSON: ${r.stdout}`);
    // bandit should override to haiku given the strong prior.
    const events = readEvents(dir);
    const banditEvents = events.filter(
      (e) => e.type === 'bandit.tier_selected',
    );
    assert.ok(banditEvents.length >= 1);
    const ev = banditEvents[0];
    assert.equal(
      ev.payload.selected_tier,
      'haiku',
      `expected haiku, got ${ev.payload.selected_tier}`,
    );
    assert.equal(
      out.modified_tool_input._tier_override,
      'haiku',
      'modified_tool_input._tier_override should be stamped with bandit tier',
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// Test 3 — adaptive_mode=full + bandit overrides → resolved_models[agent] updated
// ---------------------------------------------------------------------------
test('27.5-02: adaptive_mode=full → routerDecision.resolved_models[agent] updated to bandit model', () => {
  const dir = tmp('full-resolved');
  try {
    setupTierResolverFixtures(dir);
    writeBudget(dir, 'full');
    // Strong haiku bias for the bandit pick.
    writeFileSync(
      join(dir, '.design', 'telemetry', 'posterior.json'),
      JSON.stringify({
        schema_version: '1.0.0',
        generated_at: new Date().toISOString(),
        arms: [
          { agent: 'design-verifier', bin: 'medium', tier: 'haiku', alpha: 500, beta: 1, last_used: new Date().toISOString(), count: 500 },
          { agent: 'design-verifier', bin: 'medium', tier: 'sonnet', alpha: 1, beta: 500, last_used: new Date().toISOString(), count: 500 },
          { agent: 'design-verifier', bin: 'medium', tier: 'opus', alpha: 1, beta: 500, last_used: new Date().toISOString(), count: 500 },
        ],
      }),
    );

    const r = runHook(dir, {
      tool_name: 'Agent',
      tool_input: {
        subagent_type: 'design-verifier',
        _default_tier: 'sonnet',
        _est_cost_usd: 0.01,
        _tokens_in_est: 100,
        _tokens_out_est: 100,
        context: {
          router_decision: {
            resolved_models: { 'design-verifier': 'claude-sonnet-4-7' },
            runtime: 'claude',
          },
        },
      },
    });
    assert.equal(r.status, 0, `hook failed: ${r.stderr}`);
    const out = parseStdout(r.stdout);
    assert.ok(out, `stdout was not JSON: ${r.stdout}`);
    const rd = out.modified_tool_input.context.router_decision;
    assert.ok(
      typeof rd.resolved_models['design-verifier'] === 'string',
      'resolved_models[agent] must be a model id',
    );
    // The exact model depends on reference/runtime-models.md but it
    // MUST differ from the pre-bandit value (sonnet-4-7) since bandit
    // overrode to haiku.
    assert.notEqual(
      rd.resolved_models['design-verifier'],
      'claude-sonnet-4-7',
      `resolved_models should be rewritten by bandit; still ${rd.resolved_models['design-verifier']}`,
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// Test 4 — adaptive_mode=static → NO bandit.tier_selected
// ---------------------------------------------------------------------------
test('27.5-02: adaptive_mode=static → NO bandit.tier_selected event', () => {
  const dir = tmp('static-silent');
  try {
    setupTierResolverFixtures(dir);
    writeBudget(dir, 'static');
    const r = runHook(dir, {
      tool_name: 'Agent',
      tool_input: {
        subagent_type: 'design-verifier',
        _default_tier: 'sonnet',
        _est_cost_usd: 0.01,
        _tokens_in_est: 100,
        _tokens_out_est: 100,
        context: {
          router_decision: {
            resolved_models: { 'design-verifier': 'claude-sonnet-4-7' },
            runtime: 'claude',
          },
        },
      },
    });
    assert.equal(r.status, 0, `hook failed: ${r.stderr}`);
    const events = readEvents(dir);
    const banditEvents = events.filter(
      (e) => e.type === 'bandit.tier_selected',
    );
    assert.equal(
      banditEvents.length,
      0,
      `static mode must not emit bandit.tier_selected events, got ${banditEvents.length}`,
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// Test 5 — adaptive_mode=hedge → NO bandit.tier_selected (D-07)
// ---------------------------------------------------------------------------
test('27.5-02: adaptive_mode=hedge → NO bandit.tier_selected event (D-07: hedge silent)', () => {
  const dir = tmp('hedge-silent');
  try {
    setupTierResolverFixtures(dir);
    writeBudget(dir, 'hedge');
    const r = runHook(dir, {
      tool_name: 'Agent',
      tool_input: {
        subagent_type: 'design-verifier',
        _default_tier: 'sonnet',
        _est_cost_usd: 0.01,
        _tokens_in_est: 100,
        _tokens_out_est: 100,
        context: {
          router_decision: {
            resolved_models: { 'design-verifier': 'claude-sonnet-4-7' },
            runtime: 'claude',
          },
        },
      },
    });
    assert.equal(r.status, 0, `hook failed: ${r.stderr}`);
    const events = readEvents(dir);
    const banditEvents = events.filter(
      (e) => e.type === 'bandit.tier_selected',
    );
    assert.equal(
      banditEvents.length,
      0,
      `hedge mode must not emit bandit.tier_selected, got ${banditEvents.length}`,
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// Test 6 — _tier_downgraded=true → NO bandit override; budget downgrade wins
// ---------------------------------------------------------------------------
test('27.5-02: adaptive_mode=full + _tier_downgraded:true (budget downgrade) → NO bandit override', () => {
  const dir = tmp('budget-downgrade-wins');
  try {
    setupTierResolverFixtures(dir);
    // Set a very LOW per_task_cap so 0.01 hits 80% downgrade threshold.
    writeBudget(dir, 'full', {
      per_task_cap_usd: 0.01,
      auto_downgrade_on_cap: true,
    });
    const r = runHook(dir, {
      tool_name: 'Agent',
      tool_input: {
        subagent_type: 'design-verifier',
        _default_tier: 'sonnet',
        _est_cost_usd: 0.009, // 90% of 0.01 cap, triggers downgrade
        _tokens_in_est: 100,
        _tokens_out_est: 100,
        context: {
          router_decision: {
            resolved_models: { 'design-verifier': 'claude-sonnet-4-7' },
            runtime: 'claude',
          },
        },
      },
    });
    assert.equal(r.status, 0, `hook failed: ${r.stderr}`);
    const events = readEvents(dir);
    const banditEvents = events.filter(
      (e) => e.type === 'bandit.tier_selected',
    );
    assert.equal(
      banditEvents.length,
      0,
      `budget downgrade must skip bandit, got ${banditEvents.length} bandit events`,
    );
    // Confirm the downgrade actually fired.
    const out = parseStdout(r.stdout);
    assert.ok(out, `stdout was not JSON: ${r.stdout}`);
    assert.equal(
      out.modified_tool_input._tier_downgraded,
      true,
      'expected budget downgrade to fire',
    );
    assert.equal(
      out.modified_tool_input._tier_override,
      'haiku',
      'budget downgrade sets tier_override=haiku',
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// Test 7 — complexity_class:'S' → NO bandit consultation (short-circuit)
// ---------------------------------------------------------------------------
test('27.5-02: adaptive_mode=full + complexity_class:S → NO bandit consultation (S-class short-circuit)', () => {
  const dir = tmp('s-class-short-circuit');
  try {
    setupTierResolverFixtures(dir);
    writeBudget(dir, 'full');
    const r = runHook(dir, {
      tool_name: 'Agent',
      tool_input: {
        subagent_type: 'design-verifier',
        _default_tier: 'sonnet',
        _est_cost_usd: 0.01,
        _tokens_in_est: 100,
        _tokens_out_est: 100,
        context: {
          router_decision: {
            resolved_models: { 'design-verifier': 'claude-sonnet-4-7' },
            runtime: 'claude',
            complexity_class: 'S',
          },
        },
      },
    });
    assert.equal(r.status, 0, `hook failed: ${r.stderr}`);
    const events = readEvents(dir);
    const banditEvents = events.filter(
      (e) => e.type === 'bandit.tier_selected',
    );
    assert.equal(
      banditEvents.length,
      0,
      `S-class must short-circuit before bandit, got ${banditEvents.length} bandit events`,
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// Test 8 — cache hit → NO bandit consultation
// ---------------------------------------------------------------------------
test('27.5-02: adaptive_mode=full + cache hit → NO bandit consultation', () => {
  const dir = tmp('cache-hit');
  try {
    setupTierResolverFixtures(dir);
    writeBudget(dir, 'full');
    // Write a cache-manifest that matches the input hash.
    mkdirSync(join(dir, '.design'), { recursive: true });
    writeFileSync(
      join(dir, '.design', 'cache-manifest.json'),
      JSON.stringify({
        ttl_seconds: 3600,
        entries: {
          'design-verifier:hash-abc': {
            ts_unix: Math.floor(Date.now() / 1000),
            result: { cached: true },
          },
        },
      }),
    );
    const r = runHook(dir, {
      tool_name: 'Agent',
      tool_input: {
        subagent_type: 'design-verifier',
        _input_hash: 'hash-abc',
        _default_tier: 'sonnet',
        _est_cost_usd: 0.01,
        _tokens_in_est: 100,
        _tokens_out_est: 100,
        context: {
          router_decision: {
            resolved_models: { 'design-verifier': 'claude-sonnet-4-7' },
            runtime: 'claude',
          },
        },
      },
    });
    assert.equal(r.status, 0, `hook failed: ${r.stderr}`);
    const events = readEvents(dir);
    const banditEvents = events.filter(
      (e) => e.type === 'bandit.tier_selected',
    );
    assert.equal(
      banditEvents.length,
      0,
      `cache hit must short-circuit before bandit, got ${banditEvents.length} bandit events`,
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// Test 9 — bandit.tier_selected payload shape
// ---------------------------------------------------------------------------
test('27.5-02: bandit.tier_selected payload has agent/bin/prior_tier/selected_tier/source/delegate/adaptive_mode/runtime/model_id', () => {
  const dir = tmp('payload-shape');
  try {
    setupTierResolverFixtures(dir);
    writeBudget(dir, 'full');
    const r = runHook(dir, {
      tool_name: 'Agent',
      tool_input: {
        subagent_type: 'design-verifier',
        _default_tier: 'sonnet',
        _est_cost_usd: 0.01,
        _tokens_in_est: 100,
        _tokens_out_est: 100,
        context: {
          router_decision: {
            resolved_models: { 'design-verifier': 'claude-sonnet-4-7' },
            runtime: 'claude',
          },
        },
      },
    });
    assert.equal(r.status, 0, `hook failed: ${r.stderr}`);
    const events = readEvents(dir);
    const banditEvents = events.filter(
      (e) => e.type === 'bandit.tier_selected',
    );
    assert.ok(banditEvents.length >= 1, 'expected >= 1 bandit.tier_selected event');
    const ev = banditEvents[0];
    // Required payload fields per CONTEXT D-03:
    assert.ok('agent' in ev.payload, 'payload.agent must be present');
    assert.ok('bin' in ev.payload, 'payload.bin must be present');
    assert.ok('prior_tier' in ev.payload, 'payload.prior_tier must be present');
    assert.ok('selected_tier' in ev.payload, 'payload.selected_tier must be present');
    assert.ok('source' in ev.payload, 'payload.source must be present');
    assert.ok('delegate' in ev.payload, 'payload.delegate must be present');
    assert.ok('adaptive_mode' in ev.payload, 'payload.adaptive_mode must be present');
    assert.ok('runtime' in ev.payload, 'payload.runtime must be present');
    assert.ok('model_id' in ev.payload, 'payload.model_id must be present');
    assert.equal(typeof ev.timestamp, 'string', 'event.timestamp must be ISO string');
    assert.equal(typeof ev.sessionId, 'string', 'event.sessionId must be a string');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// Test 10 — model_tier_overrides unchanged by bandit (D-03 back-compat)
// ---------------------------------------------------------------------------
test('27.5-02: model_tier_overrides[agent] is unchanged by bandit override (D-03 back-compat)', () => {
  const dir = tmp('model-tier-overrides-preserved');
  try {
    setupTierResolverFixtures(dir);
    writeBudget(dir, 'full');
    // Strong haiku bias so bandit picks haiku.
    writeFileSync(
      join(dir, '.design', 'telemetry', 'posterior.json'),
      JSON.stringify({
        schema_version: '1.0.0',
        generated_at: new Date().toISOString(),
        arms: [
          { agent: 'design-verifier', bin: 'medium', tier: 'haiku', alpha: 500, beta: 1, last_used: new Date().toISOString(), count: 500 },
          { agent: 'design-verifier', bin: 'medium', tier: 'sonnet', alpha: 1, beta: 500, last_used: new Date().toISOString(), count: 500 },
          { agent: 'design-verifier', bin: 'medium', tier: 'opus', alpha: 1, beta: 500, last_used: new Date().toISOString(), count: 500 },
        ],
      }),
    );

    const r = runHook(dir, {
      tool_name: 'Agent',
      tool_input: {
        subagent_type: 'design-verifier',
        _default_tier: 'sonnet',
        _est_cost_usd: 0.01,
        _tokens_in_est: 100,
        _tokens_out_est: 100,
        context: {
          router_decision: {
            resolved_models: { 'design-verifier': 'claude-sonnet-4-7' },
            model_tier_overrides: { 'design-verifier': 'sonnet' },
            runtime: 'claude',
          },
        },
      },
    });
    assert.equal(r.status, 0, `hook failed: ${r.stderr}`);
    const out = parseStdout(r.stdout);
    assert.ok(out, `stdout was not JSON: ${r.stdout}`);
    const rd = out.modified_tool_input.context.router_decision;
    assert.equal(
      rd.model_tier_overrides['design-verifier'],
      'sonnet',
      'model_tier_overrides must be preserved unchanged by bandit (D-03)',
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
