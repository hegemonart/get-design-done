// tests/bandit-router-integration.test.cjs — Plan 27.5-01 integration shim
'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
  mkdtempSync,
  existsSync,
  rmSync,
  readFileSync,
  writeFileSync,
  mkdirSync,
} = require('node:fs');
const { tmpdir } = require('node:os');
const { join } = require('node:path');

const {
  consultBandit,
  recordOutcome,
  DELEGATE_NONE,
} = require('../scripts/lib/bandit-router/integration.cjs');
const banditRouter = require('../scripts/lib/bandit-router.cjs');

const POSTERIOR_REL = '.design/telemetry/posterior.json';

function tmp(prefix) {
  return mkdtempSync(join(tmpdir(), `gdd-integration-${prefix}-`));
}

function loadPosteriorAt(baseDir) {
  return JSON.parse(readFileSync(join(baseDir, POSTERIOR_REL), 'utf8'));
}

// ---------------------------------------------------------------------------
// Group A — Path 1 (static mode): frontmatter authoritative, no posterior IO
// ---------------------------------------------------------------------------

test('27.5-01: static + default_tier=haiku + no override → tier=haiku, source=frontmatter', () => {
  const baseDir = tmp('static-haiku');
  try {
    const r = consultBandit({
      agent: 'design-verifier',
      bin: 'small',
      agentFrontmatter: { default_tier: 'haiku' },
      adaptiveMode: 'static',
      baseDir,
    });
    assert.equal(r.tier, 'haiku');
    assert.equal(r.decision_log.source, 'frontmatter');
    assert.equal(r.decision_log.adaptive_mode, 'static');
    assert.equal(r.decision_log.reason, 'static_mode_authoritative');
    assert.ok(!existsSync(join(baseDir, POSTERIOR_REL)), 'no posterior write in static mode');
  } finally {
    rmSync(baseDir, { recursive: true, force: true });
  }
});

test('27.5-01: static + default_tier=opus → tier=opus, source=frontmatter', () => {
  const baseDir = tmp('static-opus');
  try {
    const r = consultBandit({
      agent: 'design-planner',
      bin: 'medium',
      agentFrontmatter: { default_tier: 'opus' },
      adaptiveMode: 'static',
      baseDir,
    });
    assert.equal(r.tier, 'opus');
    assert.equal(r.decision_log.source, 'frontmatter');
    assert.equal(r.decision_log.adaptive_mode, 'static');
  } finally {
    rmSync(baseDir, { recursive: true, force: true });
  }
});

test('27.5-01: static + no default_tier + no override → tier=sonnet (fallback)', () => {
  const baseDir = tmp('static-fallback');
  try {
    const r = consultBandit({
      agent: 'design-executor',
      bin: 'small',
      agentFrontmatter: {},
      adaptiveMode: 'static',
      baseDir,
    });
    assert.equal(r.tier, 'sonnet');
    assert.equal(r.decision_log.source, 'frontmatter');
  } finally {
    rmSync(baseDir, { recursive: true, force: true });
  }
});

test('27.5-01: static does NOT create posterior file on disk', () => {
  const baseDir = tmp('static-no-write');
  try {
    consultBandit({
      agent: 'a',
      bin: 'small',
      agentFrontmatter: { default_tier: 'sonnet' },
      adaptiveMode: 'static',
      baseDir,
    });
    assert.ok(!existsSync(join(baseDir, POSTERIOR_REL)));
  } finally {
    rmSync(baseDir, { recursive: true, force: true });
  }
});

test('27.5-01: static + delegate=gemini still no posterior write (static mode wins)', () => {
  const baseDir = tmp('static-delegate-gemini');
  try {
    const r = consultBandit({
      agent: 'a',
      bin: 'small',
      delegate: 'gemini',
      agentFrontmatter: { default_tier: 'haiku' },
      adaptiveMode: 'static',
      baseDir,
    });
    assert.equal(r.tier, 'haiku');
    assert.equal(r.decision_log.source, 'frontmatter');
    assert.ok(!existsSync(join(baseDir, POSTERIOR_REL)));
  } finally {
    rmSync(baseDir, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// Group B — Path 2 (tier_override bypass): overrides all other modes
// ---------------------------------------------------------------------------

test('27.5-01: tier_override=opus + adaptive=full → tier=opus, source=tier_override_bypass', () => {
  const baseDir = tmp('override-full');
  try {
    const r = consultBandit({
      agent: 'a',
      bin: 'small',
      agentFrontmatter: { tier_override: 'opus' },
      adaptiveMode: 'full',
      baseDir,
    });
    assert.equal(r.tier, 'opus');
    assert.equal(r.decision_log.source, 'tier_override_bypass');
    assert.equal(r.decision_log.adaptive_mode, 'full');
    assert.equal(r.decision_log.reason, 'frontmatter_tier_override_set');
    assert.ok(!existsSync(join(baseDir, POSTERIOR_REL)), 'tier_override skips posterior write');
  } finally {
    rmSync(baseDir, { recursive: true, force: true });
  }
});

test('27.5-01: tier_override=opus + adaptive=static → tier=opus, source=tier_override_bypass', () => {
  const baseDir = tmp('override-static');
  try {
    const r = consultBandit({
      agent: 'a',
      bin: 'small',
      agentFrontmatter: { tier_override: 'opus' },
      adaptiveMode: 'static',
      baseDir,
    });
    assert.equal(r.tier, 'opus');
    assert.equal(r.decision_log.source, 'tier_override_bypass');
  } finally {
    rmSync(baseDir, { recursive: true, force: true });
  }
});

test('27.5-01: tier_override=haiku + default_tier=opus → tier=haiku (override wins)', () => {
  const baseDir = tmp('override-vs-default');
  try {
    const r = consultBandit({
      agent: 'a',
      bin: 'small',
      agentFrontmatter: { tier_override: 'haiku', default_tier: 'opus' },
      adaptiveMode: 'static',
      baseDir,
    });
    assert.equal(r.tier, 'haiku');
    assert.equal(r.decision_log.source, 'tier_override_bypass');
  } finally {
    rmSync(baseDir, { recursive: true, force: true });
  }
});

test('27.5-01: tier_override + delegate=gemini → still tier_override, no posterior write', () => {
  const baseDir = tmp('override-delegate');
  try {
    const r = consultBandit({
      agent: 'a',
      bin: 'small',
      delegate: 'gemini',
      agentFrontmatter: { tier_override: 'sonnet' },
      adaptiveMode: 'full',
      baseDir,
    });
    assert.equal(r.tier, 'sonnet');
    assert.equal(r.decision_log.source, 'tier_override_bypass');
    assert.ok(!existsSync(join(baseDir, POSTERIOR_REL)));
  } finally {
    rmSync(baseDir, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// Group C — Path 3 (full + delegate='none' or undefined): pull()
// ---------------------------------------------------------------------------

test('27.5-01: full + delegate=none → tier in [haiku,sonnet,opus], source=bandit_pull, samples populated', () => {
  const baseDir = tmp('full-none');
  try {
    const r = consultBandit({
      agent: 'a',
      bin: 'small',
      delegate: 'none',
      agentFrontmatter: { default_tier: 'sonnet' },
      adaptiveMode: 'full',
      baseDir,
    });
    assert.ok(['haiku', 'sonnet', 'opus'].includes(r.tier), `tier was ${r.tier}`);
    assert.equal(r.decision_log.source, 'bandit_pull');
    assert.equal(r.decision_log.delegate, 'none');
    assert.equal(r.decision_log.adaptive_mode, 'full');
    assert.ok(r.decision_log.samples);
    // pull() returns flat samples: {haiku, sonnet, opus}
    assert.equal(typeof r.decision_log.samples.haiku, 'number');
    assert.equal(typeof r.decision_log.samples.sonnet, 'number');
    assert.equal(typeof r.decision_log.samples.opus, 'number');
    assert.ok(existsSync(join(baseDir, POSTERIOR_REL)), 'posterior file should be created');
  } finally {
    rmSync(baseDir, { recursive: true, force: true });
  }
});

test('27.5-01: full + delegate undefined treated same as delegate=none → source=bandit_pull', () => {
  const baseDir = tmp('full-undefined');
  try {
    const r = consultBandit({
      agent: 'a',
      bin: 'small',
      // delegate omitted on purpose
      agentFrontmatter: { default_tier: 'sonnet' },
      adaptiveMode: 'full',
      baseDir,
    });
    assert.equal(r.decision_log.source, 'bandit_pull');
    assert.notEqual(r.decision_log.source, 'bandit_pull_with_delegate');
    assert.equal(r.decision_log.delegate, 'none');
  } finally {
    rmSync(baseDir, { recursive: true, force: true });
  }
});

test('27.5-01: full + delegate=none creates posterior arm with delegate=undefined slice', () => {
  const baseDir = tmp('full-none-arm-shape');
  try {
    consultBandit({
      agent: 'arm-test',
      bin: 'medium',
      delegate: 'none',
      agentFrontmatter: { default_tier: 'sonnet' },
      adaptiveMode: 'full',
      baseDir,
    });
    const posterior = loadPosteriorAt(baseDir);
    // pull() uses delegate=undefined in findArm/ensureArm — arms have no delegate field
    const armsForAgent = posterior.arms.filter((a) => a.agent === 'arm-test' && a.bin === 'medium');
    assert.ok(armsForAgent.length >= 1, 'at least one arm should exist');
    for (const arm of armsForAgent) {
      assert.equal(arm.delegate, undefined, 'pull() writes arms without delegate field');
    }
  } finally {
    rmSync(baseDir, { recursive: true, force: true });
  }
});

test('27.5-01: full + delegate=none + same agent twice → posterior file accumulates pulls', () => {
  const baseDir = tmp('full-none-accumulate');
  try {
    const first = consultBandit({
      agent: 'acc',
      bin: 'small',
      delegate: 'none',
      agentFrontmatter: { default_tier: 'sonnet' },
      adaptiveMode: 'full',
      baseDir,
    });
    const posterior1 = loadPosteriorAt(baseDir);
    const chosen1 = posterior1.arms.find(
      (a) => a.agent === 'acc' && a.bin === 'small' && a.tier === first.tier,
    );
    assert.ok(chosen1, 'first chosen arm exists');
    assert.ok(chosen1.count >= 1, `count after first pull: ${chosen1.count}`);

    const second = consultBandit({
      agent: 'acc',
      bin: 'small',
      delegate: 'none',
      agentFrontmatter: { default_tier: 'sonnet' },
      adaptiveMode: 'full',
      baseDir,
    });
    const posterior2 = loadPosteriorAt(baseDir);
    // Sum of counts across all tier arms for (acc, small) should be >= 2
    const totalCount = posterior2.arms
      .filter((a) => a.agent === 'acc' && a.bin === 'small')
      .reduce((s, a) => s + (a.count || 0), 0);
    assert.ok(totalCount >= 2, `total pulls across arms should be >= 2, got ${totalCount}`);
    // Sanity: second pull's tier is also a valid tier
    assert.ok(['haiku', 'sonnet', 'opus'].includes(second.tier));
  } finally {
    rmSync(baseDir, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// Group D — Path 4 (full + delegate=<peer>): pullWithDelegate()
// ---------------------------------------------------------------------------

test('27.5-01: full + delegate=gemini → source=bandit_pull_with_delegate, decision_log.delegate=gemini', () => {
  const baseDir = tmp('full-gemini');
  try {
    const r = consultBandit({
      agent: 'a',
      bin: 'small',
      delegate: 'gemini',
      agentFrontmatter: { default_tier: 'sonnet' },
      adaptiveMode: 'full',
      baseDir,
    });
    assert.equal(r.decision_log.source, 'bandit_pull_with_delegate');
    assert.equal(r.decision_log.delegate, 'gemini');
    assert.equal(r.decision_log.adaptive_mode, 'full');
    assert.ok(['haiku', 'sonnet', 'opus'].includes(r.tier));
    // pullWithDelegate returns nested samples: {gemini: {haiku, sonnet, opus}}
    assert.ok(r.decision_log.samples);
    assert.ok(r.decision_log.samples.gemini);
    assert.equal(typeof r.decision_log.samples.gemini.haiku, 'number');
  } finally {
    rmSync(baseDir, { recursive: true, force: true });
  }
});

test('27.5-01: full + delegate=codex → arm written with delegate=codex', () => {
  const baseDir = tmp('full-codex');
  try {
    const r = consultBandit({
      agent: 'a',
      bin: 'small',
      delegate: 'codex',
      agentFrontmatter: { default_tier: 'sonnet' },
      adaptiveMode: 'full',
      baseDir,
    });
    assert.equal(r.decision_log.delegate, 'codex');
    const posterior = loadPosteriorAt(baseDir);
    const codexArms = posterior.arms.filter(
      (arm) => arm.agent === 'a' && arm.bin === 'small' && arm.delegate === 'codex',
    );
    assert.ok(codexArms.length >= 1, `at least one codex-tagged arm expected, found ${codexArms.length}`);
  } finally {
    rmSync(baseDir, { recursive: true, force: true });
  }
});

test('27.5-01: full + delegate=cursor → arm written with delegate=cursor', () => {
  const baseDir = tmp('full-cursor');
  try {
    consultBandit({
      agent: 'a',
      bin: 'small',
      delegate: 'cursor',
      agentFrontmatter: { default_tier: 'sonnet' },
      adaptiveMode: 'full',
      baseDir,
    });
    const posterior = loadPosteriorAt(baseDir);
    const cursorArms = posterior.arms.filter(
      (arm) => arm.agent === 'a' && arm.bin === 'small' && arm.delegate === 'cursor',
    );
    assert.ok(cursorArms.length >= 1);
  } finally {
    rmSync(baseDir, { recursive: true, force: true });
  }
});

test('27.5-01: full + delegate=copilot → arm written with delegate=copilot', () => {
  const baseDir = tmp('full-copilot');
  try {
    const r = consultBandit({
      agent: 'a',
      bin: 'small',
      delegate: 'copilot',
      agentFrontmatter: { default_tier: 'sonnet' },
      adaptiveMode: 'full',
      baseDir,
    });
    assert.equal(r.decision_log.delegate, 'copilot');
    assert.equal(r.decision_log.source, 'bandit_pull_with_delegate');
  } finally {
    rmSync(baseDir, { recursive: true, force: true });
  }
});

test('27.5-01: full + delegate=qwen → arm written with delegate=qwen', () => {
  const baseDir = tmp('full-qwen');
  try {
    const r = consultBandit({
      agent: 'a',
      bin: 'small',
      delegate: 'qwen',
      agentFrontmatter: { default_tier: 'sonnet' },
      adaptiveMode: 'full',
      baseDir,
    });
    assert.equal(r.decision_log.delegate, 'qwen');
  } finally {
    rmSync(baseDir, { recursive: true, force: true });
  }
});

test('27.5-01: full + delegate=claude (invalid peer name) → throws RangeError mentioning expected delegate set', () => {
  const baseDir = tmp('invalid-delegate');
  try {
    assert.throws(
      () =>
        consultBandit({
          agent: 'a',
          bin: 'small',
          delegate: 'claude',
          agentFrontmatter: { default_tier: 'sonnet' },
          adaptiveMode: 'full',
          baseDir,
        }),
      (err) => err instanceof RangeError && /gemini|codex|cursor|copilot|qwen/.test(err.message),
    );
  } finally {
    rmSync(baseDir, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// Group E — Path 5 (hedge mode): bandit silent, same as static
// ---------------------------------------------------------------------------

test('27.5-01: hedge + default_tier=sonnet → tier=sonnet, source=frontmatter, reason=hedge_mode_skips_bandit', () => {
  const baseDir = tmp('hedge-default');
  try {
    const r = consultBandit({
      agent: 'a',
      bin: 'small',
      agentFrontmatter: { default_tier: 'sonnet' },
      adaptiveMode: 'hedge',
      baseDir,
    });
    assert.equal(r.tier, 'sonnet');
    assert.equal(r.decision_log.source, 'frontmatter');
    assert.equal(r.decision_log.adaptive_mode, 'hedge');
    assert.equal(r.decision_log.reason, 'hedge_mode_skips_bandit');
  } finally {
    rmSync(baseDir, { recursive: true, force: true });
  }
});

test('27.5-01: hedge + tier_override=opus → tier=opus, source=tier_override_bypass (override beats mode gating)', () => {
  const baseDir = tmp('hedge-override');
  try {
    const r = consultBandit({
      agent: 'a',
      bin: 'small',
      agentFrontmatter: { tier_override: 'opus', default_tier: 'sonnet' },
      adaptiveMode: 'hedge',
      baseDir,
    });
    assert.equal(r.tier, 'opus');
    assert.equal(r.decision_log.source, 'tier_override_bypass');
    assert.equal(r.decision_log.adaptive_mode, 'hedge');
  } finally {
    rmSync(baseDir, { recursive: true, force: true });
  }
});

test('27.5-01: hedge does NOT create posterior file', () => {
  const baseDir = tmp('hedge-no-write');
  try {
    consultBandit({
      agent: 'a',
      bin: 'small',
      agentFrontmatter: { default_tier: 'sonnet' },
      adaptiveMode: 'hedge',
      baseDir,
    });
    assert.ok(!existsSync(join(baseDir, POSTERIOR_REL)));
  } finally {
    rmSync(baseDir, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// Group F — recordOutcome paths
// ---------------------------------------------------------------------------

test('27.5-01: recordOutcome adaptive=static is a silent no-op (no posterior file created)', () => {
  const baseDir = tmp('rec-static');
  try {
    const ret = recordOutcome({
      agent: 'a',
      bin: 'small',
      tier: 'opus',
      status: 'completed',
      costUsd: 0.1,
      adaptiveMode: 'static',
      baseDir,
    });
    assert.equal(ret, undefined);
    assert.ok(!existsSync(join(baseDir, POSTERIOR_REL)));
  } finally {
    rmSync(baseDir, { recursive: true, force: true });
  }
});

test('27.5-01: recordOutcome adaptive=hedge is a silent no-op', () => {
  const baseDir = tmp('rec-hedge');
  try {
    const ret = recordOutcome({
      agent: 'a',
      bin: 'small',
      tier: 'opus',
      status: 'completed',
      adaptiveMode: 'hedge',
      baseDir,
    });
    assert.equal(ret, undefined);
    assert.ok(!existsSync(join(baseDir, POSTERIOR_REL)));
  } finally {
    rmSync(baseDir, { recursive: true, force: true });
  }
});

test('27.5-01: recordOutcome adaptive=full + status=completed + delegate=none → posterior arm updated, alpha increased', () => {
  const baseDir = tmp('rec-full-success');
  try {
    // Seed by recording outcome with success.
    recordOutcome({
      agent: 'rec-a',
      bin: 'small',
      tier: 'sonnet',
      status: 'completed',
      costUsd: 0.05,
      adaptiveMode: 'full',
      baseDir,
    });
    const posterior = loadPosteriorAt(baseDir);
    const arm = posterior.arms.find(
      (a) => a.agent === 'rec-a' && a.bin === 'small' && a.tier === 'sonnet' && a.delegate === undefined,
    );
    assert.ok(arm, 'arm should exist after recordOutcome');
    // Prior for sonnet at strength 10: alpha = 2 + 0.8*6 = 6.8.
    // Reward ≈ 1 - 0.3 * (0.05/5) = 0.997. So alpha ≈ 7.797 (> prior 6.8).
    assert.ok(arm.alpha > 6.9, `alpha should be > prior 6.8 (reward ~0.997 added), got ${arm.alpha}`);
  } finally {
    rmSync(baseDir, { recursive: true, force: true });
  }
});

test('27.5-01: recordOutcome adaptive=full + status=error → posterior arm updated, beta increased (reward = 0)', () => {
  const baseDir = tmp('rec-full-error');
  try {
    recordOutcome({
      agent: 'rec-err',
      bin: 'small',
      tier: 'sonnet',
      status: 'error',
      costUsd: 0,
      adaptiveMode: 'full',
      baseDir,
    });
    const posterior = loadPosteriorAt(baseDir);
    const arm = posterior.arms.find(
      (a) => a.agent === 'rec-err' && a.bin === 'small' && a.tier === 'sonnet' && a.delegate === undefined,
    );
    assert.ok(arm);
    // Prior for sonnet: alpha = 6.8, beta = 3.2.
    // Reward = 0 (status !== completed). So beta += 1 → 4.2; alpha unchanged.
    assert.ok(Math.abs(arm.alpha - 6.8) < 0.001, `alpha should equal prior 6.8, got ${arm.alpha}`);
    assert.ok(Math.abs(arm.beta - 4.2) < 0.001, `beta should be prior+1 = 4.2, got ${arm.beta}`);
  } finally {
    rmSync(baseDir, { recursive: true, force: true });
  }
});

test('27.5-01: recordOutcome adaptive=full + delegate=gemini → arm with delegate=gemini updated, alpha increased', () => {
  const baseDir = tmp('rec-full-gemini');
  try {
    recordOutcome({
      agent: 'rec-g',
      bin: 'small',
      tier: 'sonnet',
      delegate: 'gemini',
      status: 'completed',
      costUsd: 0,
      adaptiveMode: 'full',
      baseDir,
    });
    const posterior = loadPosteriorAt(baseDir);
    const arm = posterior.arms.find(
      (a) =>
        a.agent === 'rec-g' &&
        a.bin === 'small' &&
        a.tier === 'sonnet' &&
        a.delegate === 'gemini',
    );
    assert.ok(arm, 'gemini-delegated arm should exist');
    // Reward = 1 (status=completed, costUsd=0). alpha += 1 → 7.8.
    assert.ok(arm.alpha > 7.5, `alpha should be > 7.5 after reward=1, got ${arm.alpha}`);
  } finally {
    rmSync(baseDir, { recursive: true, force: true });
  }
});

test('27.5-01: recordOutcome swallows write errors (posterior path is a directory) — does NOT throw', () => {
  const baseDir = tmp('rec-broken-path');
  try {
    // Create a directory at the posterior path location so the write fails.
    const posteriorPath = join(baseDir, POSTERIOR_REL);
    mkdirSync(posteriorPath, { recursive: true });
    // recordOutcome must swallow the exception silently.
    let thrown = null;
    try {
      recordOutcome({
        agent: 'rec-broken',
        bin: 'small',
        tier: 'sonnet',
        status: 'completed',
        costUsd: 0,
        adaptiveMode: 'full',
        baseDir,
      });
    } catch (err) {
      thrown = err;
    }
    assert.equal(thrown, null, 'recordOutcome must not throw on write error');
  } finally {
    rmSync(baseDir, { recursive: true, force: true });
  }
});

test('27.5-01: recordOutcome wall_time_ms is fixed at 0 (D-08) — reward matches computeReward({wall_time_ms:0})', () => {
  const baseDir = tmp('rec-walltime');
  try {
    recordOutcome({
      agent: 'rec-w',
      bin: 'small',
      tier: 'sonnet',
      status: 'completed',
      costUsd: 5,
      adaptiveMode: 'full',
      baseDir,
    });
    const posterior = loadPosteriorAt(baseDir);
    const arm = posterior.arms.find(
      (a) => a.agent === 'rec-w' && a.bin === 'small' && a.tier === 'sonnet' && a.delegate === undefined,
    );
    assert.ok(arm);
    // computeReward({solidify_pass:true, cost_usd:5, wall_time_ms:0}):
    //   norm(5 + 0) = min(1, 5/5) = 1; reward = 1 - 0.3 * 1 = 0.7.
    // Prior alpha = 6.8; after reward: 6.8 + 0.7 = 7.5; beta = 3.2 + 0.3 = 3.5.
    assert.ok(Math.abs(arm.alpha - 7.5) < 0.01, `alpha should be 7.5 (prior 6.8 + reward 0.7), got ${arm.alpha}`);
    assert.ok(Math.abs(arm.beta - 3.5) < 0.01, `beta should be 3.5 (prior 3.2 + 1-reward 0.3), got ${arm.beta}`);
  } finally {
    rmSync(baseDir, { recursive: true, force: true });
  }
});

test('27.5-01: recordOutcome + delegate=undefined treated as delegate=none (writes flat arm)', () => {
  const baseDir = tmp('rec-undef-delegate');
  try {
    recordOutcome({
      agent: 'rec-u',
      bin: 'small',
      tier: 'haiku',
      // delegate omitted
      status: 'completed',
      costUsd: 0,
      adaptiveMode: 'full',
      baseDir,
    });
    const posterior = loadPosteriorAt(baseDir);
    // delegate undefined should route through update() (not updateWithDelegate),
    // which writes arms without a delegate field.
    const arm = posterior.arms.find(
      (a) => a.agent === 'rec-u' && a.bin === 'small' && a.tier === 'haiku',
    );
    assert.ok(arm);
    assert.equal(arm.delegate, undefined, 'delegate=undefined should write arms without a delegate field');
  } finally {
    rmSync(baseDir, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// Group G — Input validation
// ---------------------------------------------------------------------------

test('27.5-01: consultBandit missing agent throws TypeError', () => {
  assert.throws(
    () =>
      consultBandit({
        bin: 'small',
        agentFrontmatter: { default_tier: 'sonnet' },
        adaptiveMode: 'static',
      }),
    (err) => err instanceof TypeError && /agent/.test(err.message),
  );
});

test('27.5-01: consultBandit missing bin throws TypeError', () => {
  assert.throws(
    () =>
      consultBandit({
        agent: 'a',
        agentFrontmatter: { default_tier: 'sonnet' },
        adaptiveMode: 'static',
      }),
    (err) => err instanceof TypeError && /bin/.test(err.message),
  );
});

test('27.5-01: consultBandit missing input object throws TypeError', () => {
  assert.throws(() => consultBandit(undefined), (err) => err instanceof TypeError);
});

test('27.5-01: recordOutcome missing tier throws TypeError', () => {
  assert.throws(
    () =>
      recordOutcome({
        agent: 'a',
        bin: 'small',
        status: 'completed',
        adaptiveMode: 'full',
      }),
    (err) => err instanceof TypeError && /tier/.test(err.message),
  );
});

test('27.5-01: recordOutcome missing status throws TypeError', () => {
  assert.throws(
    () =>
      recordOutcome({
        agent: 'a',
        bin: 'small',
        tier: 'sonnet',
        adaptiveMode: 'full',
      }),
    (err) => err instanceof TypeError && /status/.test(err.message),
  );
});

// ---------------------------------------------------------------------------
// Group H — Adaptive-mode resolution from disk when not passed explicitly
// ---------------------------------------------------------------------------

test('27.5-01: consultBandit reads adaptive_mode from disk when not passed (full)', () => {
  const baseDir = tmp('disk-mode-full');
  try {
    // Seed .design/budget.json with adaptive_mode: full
    mkdirSync(join(baseDir, '.design'), { recursive: true });
    writeFileSync(join(baseDir, '.design/budget.json'), JSON.stringify({ adaptive_mode: 'full' }));
    const r = consultBandit({
      agent: 'disk-a',
      bin: 'small',
      agentFrontmatter: { default_tier: 'sonnet' },
      // adaptiveMode omitted — should be read from disk
      baseDir,
    });
    // 'full' mode + no delegate → bandit_pull
    assert.equal(r.decision_log.source, 'bandit_pull');
    assert.equal(r.decision_log.adaptive_mode, 'full');
  } finally {
    rmSync(baseDir, { recursive: true, force: true });
  }
});

test('27.5-01: consultBandit defaults to static when no budget.json on disk', () => {
  const baseDir = tmp('disk-mode-default');
  try {
    const r = consultBandit({
      agent: 'disk-b',
      bin: 'small',
      agentFrontmatter: { default_tier: 'haiku' },
      // adaptiveMode omitted; no budget.json on disk
      baseDir,
    });
    assert.equal(r.decision_log.source, 'frontmatter');
    assert.equal(r.decision_log.adaptive_mode, 'static');
    assert.equal(r.tier, 'haiku');
  } finally {
    rmSync(baseDir, { recursive: true, force: true });
  }
});

test('27.5-01: DELEGATE_NONE export equals "none"', () => {
  assert.equal(DELEGATE_NONE, 'none');
});

test('27.5-01: recordOutcome + delegate=copilot writes arm with delegate=copilot', () => {
  const baseDir = tmp('rec-copilot');
  try {
    recordOutcome({
      agent: 'rec-c',
      bin: 'small',
      tier: 'sonnet',
      delegate: 'copilot',
      status: 'completed',
      costUsd: 0,
      adaptiveMode: 'full',
      baseDir,
    });
    const posterior = loadPosteriorAt(baseDir);
    const arm = posterior.arms.find(
      (a) =>
        a.agent === 'rec-c' &&
        a.bin === 'small' &&
        a.tier === 'sonnet' &&
        a.delegate === 'copilot',
    );
    assert.ok(arm, 'copilot-delegated arm should exist');
  } finally {
    rmSync(baseDir, { recursive: true, force: true });
  }
});
