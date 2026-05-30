'use strict';
// tests/frontmatter-reasoning-class.test.cjs — Plan 26-08 coverage.
//
// Validates the runtime-neutral `reasoning-class` alias added to
// scripts/validate-frontmatter.ts. Locked equivalence (CONTEXT D-10/D-11):
//
//   high   <-> opus
//   medium <-> sonnet
//   low    <-> haiku
//
// Test coverage matrix:
//   1. Valid: only `default-tier` present (current state of all 26 agents)
//   2. Valid: only `reasoning-class` present
//   3. Valid: both present and equivalent
//   4. Invalid: only `reasoning-class` with bad enum value (e.g., `mid`)
//   5. Invalid: both present but mismatched (e.g., opus + low)
//   6. Equivalence assertion: tier <-> class equivalence holds across the
//      full agents/ roster — no agent is silently inconsistent.
//
// The validator is exercised end-to-end via spawnSync against the real
// `scripts/validate-frontmatter.ts` CLI (under `node --experimental-strip-types`).
// This is the canonical cjs/ts boundary pattern used by other tests in this
// repo (e.g. budget-enforcer-resilience.test.ts).

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { REPO_ROOT, readFrontmatter } = require('./helpers.ts');

const VALIDATOR = path.join(REPO_ROOT, 'scripts', 'validate-frontmatter.ts');
const AGENTS_DIR = path.join(REPO_ROOT, 'agents');

// Locked equivalence table (CONTEXT D-10) — duplicated here as a test
// invariant so a refactor of the validator that flips an entry would have
// to update this assertion explicitly.
const CLASS_TO_TIER = Object.freeze({
  high: 'opus',
  medium: 'sonnet',
  low: 'haiku',
});
const TIER_TO_CLASS = Object.freeze({
  opus: 'high',
  sonnet: 'medium',
  haiku: 'low',
});

/**
 * Run the real validator CLI against the given target path. Returns
 * `{ exitCode, stdout, stderr }`. Wraps spawnSync so each test does one
 * call and asserts on results.
 */
function runValidator(targetPath) {
  const result = spawnSync(
    process.execPath,
    ['--experimental-strip-types', VALIDATOR, targetPath],
    { encoding: 'utf8', cwd: REPO_ROOT },
  );
  return {
    exitCode: result.status,
    stdout: result.stdout || '',
    stderr: result.stderr || '',
  };
}

/**
 * Write a temp agent fixture file containing a minimal-but-valid frontmatter
 * block plus the optional reasoning-class / default-tier keys under test.
 * The fixture satisfies the Phase 7 required-fields gate so the only
 * variable being tested is the reasoning-class enforcement.
 *
 * Returns `{ path, cleanup }`.
 */
function makeAgentFixture({ name = 'test-agent', tier, reasoningClass }) {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gdd-fm-rc-'));
  const file = path.join(tmpDir, `${name}.md`);
  const lines = [
    '---',
    `name: ${name}`,
    'description: "Test fixture for reasoning-class validation"',
    'tools: Read',
    'color: blue',
    'parallel-safe: always',
    'typical-duration-seconds: 10',
    'reads-only: true',
    'writes: []',
  ];
  if (tier !== undefined) lines.push(`default-tier: ${tier}`);
  if (reasoningClass !== undefined) lines.push(`reasoning-class: ${reasoningClass}`);
  lines.push('---', '', '# body');
  fs.writeFileSync(file, lines.join('\n'), 'utf8');
  return {
    path: file,
    cleanup: () => {
      try {
        fs.rmSync(tmpDir, { recursive: true, force: true });
      } catch {
        // best-effort
      }
    },
  };
}

// ──────────────────────────────────────────────────────────────────────
// Scenario 1 — Valid: only default-tier present (the v1.26 baseline state
// for all 26 shipped agents). Validator must accept.
// ──────────────────────────────────────────────────────────────────────
test('reasoning-class: only default-tier present passes validation', () => {
  const fixture = makeAgentFixture({ name: 'test-only-tier', tier: 'sonnet' });
  try {
    const { exitCode, stdout } = runValidator(fixture.path);
    assert.equal(
      exitCode,
      0,
      `validator should pass with only default-tier present; stdout:\n${stdout}`,
    );
  } finally {
    fixture.cleanup();
  }
});

// ──────────────────────────────────────────────────────────────────────
// Scenario 2 — Valid: only reasoning-class present (additive alias usage).
// Validator must accept; downstream tooling derives default-tier via the
// equivalence map.
// ──────────────────────────────────────────────────────────────────────
test('reasoning-class: only reasoning-class present passes validation', () => {
  const fixture = makeAgentFixture({
    name: 'test-only-class',
    reasoningClass: 'medium',
  });
  try {
    const { exitCode, stdout } = runValidator(fixture.path);
    assert.equal(
      exitCode,
      0,
      `validator should pass with only reasoning-class present; stdout:\n${stdout}`,
    );
  } finally {
    fixture.cleanup();
  }
});

// ──────────────────────────────────────────────────────────────────────
// Scenario 3 — Valid: both present and equivalent (high+opus,
// medium+sonnet, low+haiku). Validator must accept all three pairings.
// ──────────────────────────────────────────────────────────────────────
for (const [reasoningClass, tier] of Object.entries(CLASS_TO_TIER)) {
  test(`reasoning-class: both present + equivalent passes (${reasoningClass}/${tier})`, () => {
    const fixture = makeAgentFixture({
      name: `test-pair-${reasoningClass}`,
      tier,
      reasoningClass,
    });
    try {
      const { exitCode, stdout } = runValidator(fixture.path);
      assert.equal(
        exitCode,
        0,
        `validator should pass with equivalent pair ${reasoningClass}+${tier}; stdout:\n${stdout}`,
      );
    } finally {
      fixture.cleanup();
    }
  });
}

// ──────────────────────────────────────────────────────────────────────
// Scenario 4 — Invalid: reasoning-class present with a bad enum value
// (e.g., `mid`). Validator must reject with a clear enum-violation message.
// ──────────────────────────────────────────────────────────────────────
test('reasoning-class: invalid enum value (mid) is rejected', () => {
  const fixture = makeAgentFixture({
    name: 'test-bad-enum',
    reasoningClass: 'mid',
  });
  try {
    const { exitCode, stdout } = runValidator(fixture.path);
    assert.notEqual(
      exitCode,
      0,
      `validator should reject reasoning-class="mid"; stdout:\n${stdout}`,
    );
    assert.match(
      stdout,
      /reasoning-class.*invalid value.*"mid"/,
      `error message should name the invalid value; stdout:\n${stdout}`,
    );
    assert.match(
      stdout,
      /high\|medium\|low/,
      `error message should list the accepted enum values; stdout:\n${stdout}`,
    );
  } finally {
    fixture.cleanup();
  }
});

// ──────────────────────────────────────────────────────────────────────
// Scenario 5 — Invalid: both present but mismatched. Each non-equivalent
// pairing must surface a clear mismatch error naming the agent.
// ──────────────────────────────────────────────────────────────────────
const MISMATCHES = [
  { reasoningClass: 'high', tier: 'sonnet' },
  { reasoningClass: 'high', tier: 'haiku' },
  { reasoningClass: 'medium', tier: 'opus' },
  { reasoningClass: 'medium', tier: 'haiku' },
  { reasoningClass: 'low', tier: 'opus' },
  { reasoningClass: 'low', tier: 'sonnet' },
];

for (const { reasoningClass, tier } of MISMATCHES) {
  test(`reasoning-class: mismatched pair rejected (${reasoningClass}/${tier})`, () => {
    const agentName = `test-mismatch-${reasoningClass}-${tier}`;
    const fixture = makeAgentFixture({ name: agentName, tier, reasoningClass });
    try {
      const { exitCode, stdout } = runValidator(fixture.path);
      assert.notEqual(
        exitCode,
        0,
        `validator should reject mismatched pair ${reasoningClass}+${tier}; stdout:\n${stdout}`,
      );
      assert.match(
        stdout,
        /mismatch/i,
        `error message should call out the mismatch; stdout:\n${stdout}`,
      );
      assert.ok(
        stdout.includes(agentName),
        `error message should name the offending agent "${agentName}"; stdout:\n${stdout}`,
      );
      assert.ok(
        stdout.includes(reasoningClass) && stdout.includes(tier),
        `error message should surface both values (got class=${reasoningClass}, tier=${tier}); stdout:\n${stdout}`,
      );
    } finally {
      fixture.cleanup();
    }
  });
}

// ──────────────────────────────────────────────────────────────────────
// Scenario 6 — Equivalence assertion across the full roster.
//
// Walk every agents/*.md file (skipping README.md). For each agent that
// declares BOTH default-tier AND reasoning-class, the values must satisfy
// the equivalence table. For each agent that declares only one, no
// inconsistency is possible. Today (v1.26) the entire roster carries only
// default-tier; this test guards against silent drift if a future PR adds
// reasoning-class entries without keeping them aligned.
// ──────────────────────────────────────────────────────────────────────
test('reasoning-class: equivalence holds across all agents/*.md', () => {
  const files = fs
    .readdirSync(AGENTS_DIR)
    .filter((f) => f.endsWith('.md') && f.toLowerCase() !== 'readme.md')
    .sort();

  assert.ok(files.length > 0, 'no agents found — check AGENTS_DIR');

  const inconsistent = [];
  for (const f of files) {
    const fm = readFrontmatter(path.join(AGENTS_DIR, f));
    const tier = fm['default-tier'];
    const cls = fm['reasoning-class'];

    if (cls !== undefined && cls !== '') {
      assert.ok(
        cls in CLASS_TO_TIER,
        `agents/${f}: reasoning-class="${cls}" is not a valid enum value (high|medium|low)`,
      );
    }
    if (tier !== undefined && tier !== '') {
      assert.ok(
        tier in TIER_TO_CLASS,
        `agents/${f}: default-tier="${tier}" is not a valid enum value (opus|sonnet|haiku)`,
      );
    }

    if (
      tier !== undefined &&
      tier !== '' &&
      cls !== undefined &&
      cls !== ''
    ) {
      const expectedTier = CLASS_TO_TIER[cls];
      if (tier !== expectedTier) {
        inconsistent.push(
          `agents/${f}: reasoning-class="${cls}" expects default-tier="${expectedTier}", but got default-tier="${tier}"`,
        );
      }
    }
  }

  assert.deepEqual(
    inconsistent,
    [],
    `found ${inconsistent.length} agent(s) with inconsistent dual annotations:\n  - ${inconsistent.join('\n  - ')}`,
  );
});

// ──────────────────────────────────────────────────────────────────────
// Sanity: the live `agents/` directory still passes the validator end-to-
// end with the new alias rules in effect (back-compat assertion — no
// existing agent breaks).
// ──────────────────────────────────────────────────────────────────────
test('reasoning-class: live agents/ directory passes validator', () => {
  const { exitCode, stdout } = runValidator(AGENTS_DIR);
  assert.equal(
    exitCode,
    0,
    `live agents/ directory should pass with new validator rules; stdout:\n${stdout}`,
  );
});
