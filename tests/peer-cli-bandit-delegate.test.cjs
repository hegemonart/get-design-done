// tests/peer-cli-bandit-delegate.test.cjs — Plan 27-07 / D-08
// Bandit posterior gains `delegate` as a third context dimension.
// Arm space becomes (agent_type, touches_size_bin, delegate) where
// delegate ∈ {none, gemini, codex, cursor, copilot, qwen}. Reward
// signal is UNCHANGED — two-stage lexicographic via computeReward().

'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { mkdtempSync, existsSync, rmSync, readFileSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { join } = require('node:path');

const {
  pull,
  update,
  pullWithDelegate,
  updateWithDelegate,
  loadPosterior,
  computeReward,
  priorFor,
  DEFAULT_TIERS,
  DEFAULT_DELEGATES,
  DELEGATE_NONE,
  PRIOR_STRENGTH,
} = require('../scripts/lib/bandit-router.cjs');

function tmp(prefix) {
  return mkdtempSync(join(tmpdir(), `gdd-bandit-delegate-${prefix}-`));
}

test('27-07: DEFAULT_DELEGATES contains the 6 expected values', () => {
  assert.equal(DEFAULT_DELEGATES.length, 6);
  for (const expected of ['none', 'gemini', 'codex', 'cursor', 'copilot', 'qwen']) {
    assert.ok(DEFAULT_DELEGATES.includes(expected), `missing delegate: ${expected}`);
  }
  assert.equal(DELEGATE_NONE, 'none');
});

test('27-07: pullWithDelegate returns one of the 6 delegates and one of the 3 tiers', () => {
  const dir = tmp('pull-shape');
  try {
    const r = pullWithDelegate({ agent: 'design-planner', bin: 'small', baseDir: dir });
    assert.ok(DEFAULT_TIERS.includes(r.tier), `unexpected tier: ${r.tier}`);
    assert.ok(DEFAULT_DELEGATES.includes(r.delegate), `unexpected delegate: ${r.delegate}`);
    assert.ok(r.delegate !== undefined && r.delegate !== null, 'delegate must be defined');
    // samples is a 2-level map: delegate → tier → number.
    for (const d of DEFAULT_DELEGATES) {
      assert.ok(r.samples[d], `samples missing delegate=${d}`);
      for (const t of DEFAULT_TIERS) {
        const s = r.samples[d][t];
        assert.equal(typeof s, 'number');
        assert.ok(!Number.isNaN(s), `NaN sample for ${d}/${t}`);
        assert.ok(s >= 0 && s <= 1, `sample out of [0,1]: ${s}`);
      }
    }
    assert.ok(existsSync(r.posteriorPath));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('27-07: pullWithDelegate persists arms with the delegate field', () => {
  const dir = tmp('persist');
  try {
    const r = pullWithDelegate({
      agent: 'design-executor',
      bin: 'medium',
      baseDir: dir,
    });
    const posterior = JSON.parse(readFileSync(r.posteriorPath, 'utf8'));
    // After one pull, all (tier × delegate) arms should have been
    // ensured (3 × 6 = 18 arms minimum).
    assert.ok(posterior.arms.length >= 18, `expected >=18 arms, got ${posterior.arms.length}`);
    // Every persisted arm must carry the delegate field.
    for (const arm of posterior.arms) {
      assert.ok(
        DEFAULT_DELEGATES.includes(arm.delegate),
        `arm has invalid delegate: ${arm.delegate}`,
      );
    }
    // The chosen arm should match (tier=r.tier, delegate=r.delegate)
    // and have count=1.
    const chosen = posterior.arms.find(
      (a) =>
        a.agent === 'design-executor' &&
        a.bin === 'medium' &&
        a.tier === r.tier &&
        a.delegate === r.delegate,
    );
    assert.ok(chosen, 'chosen arm should be persisted');
    assert.equal(chosen.count, 1);
    assert.ok(chosen.last_used);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('27-07: pullWithDelegate bootstraps neutrally on the new dimension (no NaN, no crash)', () => {
  const dir = tmp('neutral-bootstrap');
  try {
    // Pull on an empty posterior — every arm bootstraps from the
    // informed prior. None of the 18 arms has any data.
    const r = pullWithDelegate({ agent: 'fresh-agent', bin: 'tiny', baseDir: dir });
    assert.ok(DEFAULT_TIERS.includes(r.tier));
    assert.ok(DEFAULT_DELEGATES.includes(r.delegate));
    // Verify all arms started with the same per-tier prior shape
    // regardless of delegate value (neutral bootstrap on the 5 peer
    // arms; delegate='none' uses the same prior as Phase 23.5 baseline).
    const posterior = JSON.parse(readFileSync(r.posteriorPath, 'utf8'));
    for (const tier of DEFAULT_TIERS) {
      const expected = priorFor(tier, PRIOR_STRENGTH);
      for (const delegate of DEFAULT_DELEGATES) {
        const arm = posterior.arms.find(
          (a) =>
            a.agent === 'fresh-agent' &&
            a.bin === 'tiny' &&
            a.tier === tier &&
            a.delegate === delegate,
        );
        // The chosen arm gets +0 to alpha/beta during pull (only
        // count/last_used update). All 18 should match prior shape.
        assert.ok(arm, `missing arm tier=${tier} delegate=${delegate}`);
        assert.ok(Math.abs(arm.alpha - expected.alpha) < 1e-9, `alpha differs for ${tier}/${delegate}`);
        assert.ok(Math.abs(arm.beta - expected.beta) < 1e-9, `beta differs for ${tier}/${delegate}`);
      }
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('27-07: updateWithDelegate updates the right arm and does not pollute siblings', () => {
  const dir = tmp('isolation');
  try {
    // Seed all arms via a single pull.
    pullWithDelegate({ agent: 'iso-agent', bin: 'small', baseDir: dir });

    // Snapshot priors before update.
    const before = JSON.parse(
      readFileSync(loadPosteriorPath(dir), 'utf8'),
    ).arms.filter((a) => a.agent === 'iso-agent' && a.bin === 'small');

    // Update only (tier=opus, delegate=gemini) with a strong reward.
    updateWithDelegate({
      agent: 'iso-agent',
      bin: 'small',
      tier: 'opus',
      delegate: 'gemini',
      reward: 1,
      baseDir: dir,
    });

    const after = JSON.parse(
      readFileSync(loadPosteriorPath(dir), 'utf8'),
    ).arms.filter((a) => a.agent === 'iso-agent' && a.bin === 'small');

    // Find the targeted arm — alpha must have grown by 1.
    const target = after.find((a) => a.tier === 'opus' && a.delegate === 'gemini');
    const targetBefore = before.find((a) => a.tier === 'opus' && a.delegate === 'gemini');
    assert.ok(Math.abs(target.alpha - targetBefore.alpha - 1) < 1e-9, 'target alpha should grow by 1');
    assert.ok(Math.abs(target.beta - targetBefore.beta) < 1e-9, 'target beta should not change');

    // All other (tier × delegate) siblings must be unchanged. This
    // proves the delegate dimension is correctly partitioning state
    // and the update on (opus, gemini) does NOT leak into (opus, none),
    // (opus, codex), (sonnet, gemini), etc.
    for (const arm of after) {
      if (arm.tier === 'opus' && arm.delegate === 'gemini') continue;
      const sibling = before.find(
        (b) => b.tier === arm.tier && b.delegate === arm.delegate,
      );
      assert.ok(sibling, `missing sibling tier=${arm.tier} delegate=${arm.delegate}`);
      assert.ok(
        Math.abs(arm.alpha - sibling.alpha) < 1e-9,
        `sibling alpha should not change for ${arm.tier}/${arm.delegate}`,
      );
      assert.ok(
        Math.abs(arm.beta - sibling.beta) < 1e-9,
        `sibling beta should not change for ${arm.tier}/${arm.delegate}`,
      );
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('27-07: pullWithDelegate respects delegates=[none] (delegate_to: none agent constraint)', () => {
  const dir = tmp('none-only');
  try {
    // Simulates an agent with `delegate_to: none` in frontmatter:
    // the bandit must NEVER explore peer delegations for this agent.
    for (let i = 0; i < 20; i++) {
      const r = pullWithDelegate({
        agent: 'security-sensitive',
        bin: 'small',
        delegates: ['none'],
        baseDir: dir,
      });
      assert.equal(
        r.delegate,
        'none',
        `delegate_to:none agent must always sample delegate=none, got ${r.delegate}`,
      );
      assert.ok(DEFAULT_TIERS.includes(r.tier));
    }

    // Verify the posterior persisted only the 'none' slice — no peer
    // arms were ever ensured for this agent.
    const posterior = JSON.parse(readFileSync(loadPosteriorPath(dir), 'utf8'));
    const myArms = posterior.arms.filter(
      (a) => a.agent === 'security-sensitive' && a.bin === 'small',
    );
    for (const arm of myArms) {
      assert.equal(
        arm.delegate,
        'none',
        `delegate_to:none agent posterior leaked: ${arm.delegate}`,
      );
    }
    // Should have exactly 3 arms (one per tier, all delegate=none).
    assert.equal(myArms.length, 3, `expected 3 arms for none-only agent, got ${myArms.length}`);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('27-07: legacy pull() still works without delegate dimension (back-compat)', () => {
  const dir = tmp('back-compat');
  try {
    // The Phase 23.5 API (pull / update without delegate) must continue
    // to work — agents that haven't migrated to the delegate dimension
    // keep their existing behaviour.
    const r = pull({ agent: 'legacy-agent', bin: 'medium', baseDir: dir });
    assert.ok(DEFAULT_TIERS.includes(r.tier));
    update({
      agent: 'legacy-agent',
      bin: 'medium',
      tier: r.tier,
      reward: 1,
      baseDir: dir,
    });
    const posterior = JSON.parse(readFileSync(r.posteriorPath, 'utf8'));
    // Legacy arms are persisted WITHOUT the delegate field.
    const arm = posterior.arms.find(
      (a) => a.agent === 'legacy-agent' && a.bin === 'medium' && a.tier === r.tier,
    );
    assert.ok(arm, 'legacy arm must persist');
    assert.equal(arm.delegate, undefined, 'legacy arm must not carry delegate field');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('27-07: legacy and delegate-aware arms coexist in the same posterior', () => {
  const dir = tmp('coexist');
  try {
    // Mix legacy + new API. Legacy slice (no delegate field) and
    // delegate='none' slice are independent contexts on disk —
    // proves the file format is round-trippable in both modes.
    pull({ agent: 'mixed', bin: 'small', baseDir: dir });
    pullWithDelegate({ agent: 'mixed', bin: 'small', baseDir: dir });

    const posterior = JSON.parse(readFileSync(loadPosteriorPath(dir), 'utf8'));
    const legacyArms = posterior.arms.filter(
      (a) => a.agent === 'mixed' && a.bin === 'small' && a.delegate === undefined,
    );
    const delegateArms = posterior.arms.filter(
      (a) => a.agent === 'mixed' && a.bin === 'small' && a.delegate !== undefined,
    );
    // 3 legacy arms (one per tier) + 18 delegate-aware arms (3 tier × 6 delegate).
    assert.equal(legacyArms.length, 3, `legacy arms: ${legacyArms.length}`);
    assert.equal(delegateArms.length, 18, `delegate arms: ${delegateArms.length}`);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('27-07: updateWithDelegate validates required string fields', () => {
  assert.throws(
    () => updateWithDelegate({ bin: 's', tier: 'opus', delegate: 'gemini', reward: 1 }),
    /agent/,
  );
  assert.throws(
    () => updateWithDelegate({ agent: 'a', tier: 'opus', delegate: 'gemini', reward: 1 }),
    /bin/,
  );
  assert.throws(
    () => updateWithDelegate({ agent: 'a', bin: 's', delegate: 'gemini', reward: 1 }),
    /tier/,
  );
  assert.throws(
    () => updateWithDelegate({ agent: 'a', bin: 's', tier: 'opus', reward: 1 }),
    /delegate/,
  );
  assert.throws(
    () => updateWithDelegate({ agent: 'a', bin: 's', tier: 'opus', delegate: 'gemini' }),
    /reward/,
  );
});

test('27-07: pullWithDelegate validates delegates array', () => {
  assert.throws(
    () => pullWithDelegate({ agent: 'a', bin: 's', delegates: [] }),
    /non-empty/,
  );
  assert.throws(
    () => pullWithDelegate({ agent: 'a', bin: 's', delegates: 'not-an-array' }),
    /non-empty/,
  );
  assert.throws(() => pullWithDelegate({ bin: 's' }), /agent/);
  assert.throws(() => pullWithDelegate({ agent: 'a' }), /bin/);
});

test('27-07: reward signal is UNCHANGED by the delegate dimension (D-08)', () => {
  // The two-stage lexicographic computeReward must continue to behave
  // exactly as in Phase 23.5 — the delegate dimension is plumbed
  // through arm storage only, never into reward computation.
  assert.equal(computeReward({ solidify_pass: false, cost_usd: 0 }), 0);
  assert.equal(
    computeReward({ solidify_pass: true, user_undo_in_session: true, cost_usd: 0 }),
    0,
  );
  assert.equal(
    computeReward({ solidify_pass: true, cost_usd: 0, wall_time_ms: 0 }),
    1,
  );
  // Cost-as-tiebreaker: with cost_usd=5 + lambda=0.3, reward = 0.7.
  const r = computeReward({
    solidify_pass: true,
    cost_usd: 5,
    wall_time_ms: 0,
    lambda: 0.3,
  });
  assert.ok(Math.abs(r - 0.7) < 1e-9);
});

test('27-07: convergence — gemini-favourable signal shifts posterior toward gemini', () => {
  const dir = tmp('converge');
  try {
    // Simulate: delegate=gemini consistently succeeds on (opus, gemini);
    // all other arms get neutral 0.5. After enough rounds with
    // pullWithDelegate, the (opus, gemini) arm should be picked
    // measurably more often than its 1/18 base rate.
    let geminiOpusCount = 0;
    const ROUNDS = 80;
    for (let i = 0; i < ROUNDS; i++) {
      const r = pullWithDelegate({ agent: 'demo', bin: 'tiny', baseDir: dir });
      if (r.tier === 'opus' && r.delegate === 'gemini') geminiOpusCount += 1;
      const reward = r.tier === 'opus' && r.delegate === 'gemini' ? 1 : 0.4;
      updateWithDelegate({
        agent: 'demo',
        bin: 'tiny',
        tier: r.tier,
        delegate: r.delegate,
        reward,
        baseDir: dir,
      });
    }
    // Base rate for any single (tier, delegate) pair is 1/18 ≈ 5.6%
    // → ~4–5 hits in 80 rounds. Strong reward signal should push
    // (opus, gemini) well above base rate.
    assert.ok(
      geminiOpusCount >= 12,
      `(opus, gemini) selected only ${geminiOpusCount}/${ROUNDS} — convergence too slow`,
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// Test helper: resolve the posterior path the same way the bandit does
// when the caller passes baseDir but no posteriorPath.
function loadPosteriorPath(dir) {
  return join(dir, '.design', 'telemetry', 'posterior.json');
}
