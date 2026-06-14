'use strict';
// tests/validate-frontmatter-model-tier.test.cjs - Plan 59-03 (Wave A) coverage.
//
// Validates the `model` vs `default-tier` coherence axis added to
// scripts/validate-frontmatter.ts (validateModelTier + modelTierWarnings).
//
// Axis rules (CONTEXT Wave A):
//   - `model` is OPTIONAL. Valid values: inherit | opus | sonnet | haiku.
//   - `default-tier` is opus | sonnet | haiku.
//   - HARD ERROR (fails the gate) when: model present AND model != inherit AND
//     default-tier present AND model != default-tier. A literal model naming a
//     DIFFERENT tier than default-tier is a real contradiction.
//   - WARN (advisory, must NOT fail the gate / change the exit code) when:
//     model == inherit AND default-tier == haiku.
//   - model == inherit with any non-haiku default-tier is FINE.
//   - model absent is FINE.
//
// The functions are exercised two ways, both canonical for this repo:
//   1. Directly via `require('../../scripts/validate-frontmatter.ts')`: Node
//      v22+ strips types on require(), so the exported helpers are callable
//      from this .cjs test (the task asks us to assert validateModelTier's
//      return value directly).
//   2. End-to-end via spawnSync against the real CLI under
//      `node --experimental-strip-types`, to assert the gate exit code, and
//      crucially that the inherit+haiku advisory does NOT change it. This is
//      the same cjs/ts boundary pattern used by
//      frontmatter-reasoning-class.test.cjs.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { REPO_ROOT } = require('./helpers.ts');
const {
  validateModelTier,
  modelTierWarnings,
} = require('../../scripts/validate-frontmatter.ts');

const VALIDATOR = path.join(REPO_ROOT, 'scripts', 'validate-frontmatter.ts');

/**
 * Run the real validator CLI against the given target path. Returns
 * `{ exitCode, stdout, stderr }`.
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
 * Write a temp agent fixture with a minimal-but-valid frontmatter block plus
 * the optional `model` / `default-tier` keys under test. Satisfies the Phase 7
 * required-fields gate so the only variable being tested is the model/tier
 * coherence axis. Returns `{ path, cleanup }`.
 */
function makeAgentFixture({ name = 'test-agent', model, tier }) {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hone-fm-mt-'));
  const file = path.join(tmpDir, `${name}.md`);
  const lines = [
    '---',
    `name: ${name}`,
    'description: "Test fixture for model/default-tier validation"',
    'tools: Read',
    'color: blue',
    'parallel-safe: always',
    'typical-duration-seconds: 10',
    'reads-only: true',
    'writes: []',
  ];
  if (tier !== undefined) lines.push(`default-tier: ${tier}`);
  if (model !== undefined) lines.push(`model: ${model}`);
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
// (a) Planted contradiction (model:sonnet, default-tier:opus) is REJECTED:
// validateModelTier returns a violation naming the agent + both values.
// ──────────────────────────────────────────────────────────────────────
test('model-tier: literal model differing from default-tier returns a violation', () => {
  const v = validateModelTier(
    { model: 'sonnet', 'default-tier': 'opus' },
    'planted-contradiction',
  );
  assert.equal(v.length, 1, `expected exactly one violation; got ${JSON.stringify(v)}`);
  assert.match(v[0], /contradiction/i, 'message should call out the contradiction');
  assert.ok(
    v[0].includes('planted-contradiction'),
    'message should name the offending agent',
  );
  assert.ok(
    v[0].includes('sonnet') && v[0].includes('opus'),
    'message should surface both values (model + default-tier)',
  );
});

// All literal-vs-tier mismatches must be rejected (full matrix sweep).
const LITERAL_MISMATCHES = [
  { model: 'sonnet', tier: 'opus' },
  { model: 'haiku', tier: 'opus' },
  { model: 'opus', tier: 'sonnet' },
  { model: 'haiku', tier: 'sonnet' },
  { model: 'opus', tier: 'haiku' },
  { model: 'sonnet', tier: 'haiku' },
];
for (const { model, tier } of LITERAL_MISMATCHES) {
  test(`model-tier: mismatch (model:${model}, default-tier:${tier}) returns a violation`, () => {
    const v = validateModelTier(
      { model, 'default-tier': tier },
      `mismatch-${model}-${tier}`,
    );
    assert.equal(v.length, 1, `expected one violation; got ${JSON.stringify(v)}`);
    assert.ok(v[0].includes(model) && v[0].includes(tier));
  });
}

// A literal model that MATCHES default-tier is coherent (no violation).
for (const tier of ['opus', 'sonnet', 'haiku']) {
  test(`model-tier: matching literal (model:${tier}, default-tier:${tier}) is coherent`, () => {
    const v = validateModelTier(
      { model: tier, 'default-tier': tier },
      `match-${tier}`,
    );
    assert.deepEqual(v, [], `matching pair should yield no violation; got ${JSON.stringify(v)}`);
  });
}

// A literal model with NO default-tier present cannot contradict (no violation).
test('model-tier: literal model with no default-tier yields no violation', () => {
  const v = validateModelTier({ model: 'sonnet' }, 'literal-no-tier');
  assert.deepEqual(v, []);
});

// ──────────────────────────────────────────────────────────────────────
// (b) Coherent agents produce NO violation: (model:inherit, default-tier:opus)
// and (model absent).
// ──────────────────────────────────────────────────────────────────────
test('model-tier: model=inherit with default-tier=opus produces no violation', () => {
  const v = validateModelTier(
    { model: 'inherit', 'default-tier': 'opus' },
    'inherit-opus',
  );
  assert.deepEqual(v, []);
});

test('model-tier: model=inherit with default-tier=sonnet produces no violation', () => {
  const v = validateModelTier(
    { model: 'inherit', 'default-tier': 'sonnet' },
    'inherit-sonnet',
  );
  assert.deepEqual(v, []);
});

test('model-tier: model absent produces no violation (with or without default-tier)', () => {
  assert.deepEqual(validateModelTier({}, 'no-model-no-tier'), []);
  assert.deepEqual(
    validateModelTier({ 'default-tier': 'opus' }, 'no-model-with-tier'),
    [],
  );
  // empty-string model is treated as missing (isMissing semantics).
  assert.deepEqual(
    validateModelTier({ model: '', 'default-tier': 'opus' }, 'empty-model'),
    [],
  );
});

// ──────────────────────────────────────────────────────────────────────
// (c) inherit+haiku does NOT produce a hard error; it is a WARN only.
//   - validateModelTier returns [] (no hard error)
//   - modelTierWarnings returns exactly one advisory
// ──────────────────────────────────────────────────────────────────────
test('model-tier: inherit+haiku produces no hard error (validateModelTier)', () => {
  const v = validateModelTier(
    { model: 'inherit', 'default-tier': 'haiku' },
    'inherit-haiku',
  );
  assert.deepEqual(v, [], `inherit+haiku must NOT be a hard error; got ${JSON.stringify(v)}`);
});

test('model-tier: inherit+haiku produces exactly one advisory (modelTierWarnings)', () => {
  const w = modelTierWarnings(
    { model: 'inherit', 'default-tier': 'haiku' },
    'inherit-haiku',
  );
  assert.equal(w.length, 1, `expected one advisory; got ${JSON.stringify(w)}`);
  assert.match(w[0], /advisory/i);
  assert.ok(w[0].includes('inherit-haiku'), 'advisory should name the agent');
});

// The warn must be narrow: inherit + non-haiku tiers yield NO advisory, and
// non-inherit models never warn (they go through the error path instead).
test('model-tier: inherit with non-haiku tiers produces no advisory', () => {
  assert.deepEqual(
    modelTierWarnings({ model: 'inherit', 'default-tier': 'opus' }, 'a'),
    [],
  );
  assert.deepEqual(
    modelTierWarnings({ model: 'inherit', 'default-tier': 'sonnet' }, 'b'),
    [],
  );
});

test('model-tier: literal haiku model on haiku tier produces no advisory', () => {
  // model=haiku + default-tier=haiku is coherent AND pins the cheap tier, so
  // there is nothing to advise about.
  assert.deepEqual(
    modelTierWarnings({ model: 'haiku', 'default-tier': 'haiku' }, 'c'),
    [],
  );
});

// ──────────────────────────────────────────────────────────────────────
// End-to-end CLI assertions - exit-code behavior through the real gate.
// ──────────────────────────────────────────────────────────────────────

// A planted contradiction must FAIL the gate (non-zero exit) and print the
// finding on stdout.
test('model-tier (CLI): planted contradiction fails the gate', () => {
  const fixture = makeAgentFixture({
    name: 'cli-contradiction',
    model: 'sonnet',
    tier: 'opus',
  });
  try {
    const { exitCode, stdout } = runValidator(fixture.path);
    assert.notEqual(exitCode, 0, `contradiction should fail the gate; stdout:\n${stdout}`);
    assert.match(stdout, /model\/default-tier.*contradiction/i);
    assert.ok(stdout.includes('cli-contradiction'));
  } finally {
    fixture.cleanup();
  }
});

// inherit+haiku must NOT change the exit code (warn-only). Gate stays green and
// the advisory shows up on stderr as a ::warning:: annotation, not stdout.
test('model-tier (CLI): inherit+haiku passes the gate (warn-only)', () => {
  const fixture = makeAgentFixture({
    name: 'cli-inherit-haiku',
    model: 'inherit',
    tier: 'haiku',
  });
  try {
    const { exitCode, stdout, stderr } = runValidator(fixture.path);
    assert.equal(
      exitCode,
      0,
      `inherit+haiku must pass (warn does not fail the gate); stdout:\n${stdout}\nstderr:\n${stderr}`,
    );
    assert.match(stderr, /::warning/, 'advisory should be emitted on stderr');
    assert.match(stderr, /advisory/i);
    assert.ok(
      !/model\/default-tier.*contradiction/i.test(stdout),
      'inherit+haiku must not emit a hard-error finding on stdout',
    );
  } finally {
    fixture.cleanup();
  }
});

// A coherent agent (model:inherit, default-tier:opus) passes the gate cleanly
// with no warning emitted.
test('model-tier (CLI): inherit+opus passes the gate with no advisory', () => {
  const fixture = makeAgentFixture({
    name: 'cli-inherit-opus',
    model: 'inherit',
    tier: 'opus',
  });
  try {
    const { exitCode, stderr } = runValidator(fixture.path);
    assert.equal(exitCode, 0);
    assert.ok(!/::warning/.test(stderr), `no advisory expected; stderr:\n${stderr}`);
  } finally {
    fixture.cleanup();
  }
});
