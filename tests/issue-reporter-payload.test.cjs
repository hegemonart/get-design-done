// tests/issue-reporter-payload.test.cjs — Phase 30 Plan 30-02 payload assembly
//
// ≥12 cases covering shape stability, bilingual disclaimer, fingerprint
// determinism, the redact-before-pseudonymize order (Case 9 — the negative
// test that locks threat T-30-02-01), and D-14 enforcement (Case 12).
//
// GOLDEN SNAPSHOT WORKFLOW:
//   tests/fixtures/issue-reporter-payload/golden.md is the byte-for-byte
//   snapshot for the canonical fixture in inputs.json. The test
//   auto-bootstraps the golden on first run (when the file is missing)
//   and asserts byte-equality on every subsequent run.
//
//   To intentionally regenerate after a payload-shape change:
//     node tests/issue-reporter-payload.test.cjs --regen
//   Then `git diff` the golden, confirm the change is what you wanted,
//   and commit it alongside the module change.
//
// NOTE on pseudonymize integration:
//   This suite uses the REAL Plan 30-01 pseudonymize.cjs (no mock). The
//   API is `pseudonymize(payload, opts) -> { payload, replacements }`.
//   Pseudonymize opts (identity, hostname, repoOrigin, envSnapshot) are
//   passed by stashing them on errorContext — payload-assembly.cjs reads
//   them via buildPseudonymizeOpts().
'use strict';

const path = require('node:path');
const fs = require('node:fs');

const {
  assemble,
  computeFingerprint,
  DISCLAIMER_RU,
  DISCLAIMER_EN,
} = require('../scripts/lib/issue-reporter/payload-assembly.cjs');

// ---------------------------------------------------------------------------
// Fixture loading + golden-snapshot regeneration mode.
// ---------------------------------------------------------------------------

const FIXTURE_DIR = path.resolve(__dirname, 'fixtures', 'issue-reporter-payload');
const INPUTS_PATH = path.join(FIXTURE_DIR, 'inputs.json');
const GOLDEN_PATH = path.join(FIXTURE_DIR, 'golden.md');

function loadInputs() {
  const raw = fs.readFileSync(INPUTS_PATH, 'utf8');
  return JSON.parse(raw);
}

function runAssembleFromFixture() {
  const inputs = loadInputs();
  return assemble(
    inputs.commandName,
    inputs.errorContext,
    inputs.trajectoryRef,
    inputs.capabilityGapEvent
  );
}

// --regen mode: regenerate golden.md from the current module output.
// Invoked manually when the payload shape changes intentionally.
if (process.argv.includes('--regen')) {
  const out = runAssembleFromFixture();
  fs.writeFileSync(GOLDEN_PATH, out, 'utf8');
  // eslint-disable-next-line no-console
  console.log('Regenerated golden.md (' + out.length + ' bytes)');
  process.exit(0);
}

// On first run (golden.md missing), bootstrap it. This is the documented
// workflow in the file header: first `npm test` writes the golden, then
// every subsequent run asserts byte-equality.
if (!fs.existsSync(GOLDEN_PATH)) {
  const out = runAssembleFromFixture();
  fs.writeFileSync(GOLDEN_PATH, out, 'utf8');
}

// ---------------------------------------------------------------------------
// Shared minimal errorContext factory — keeps individual cases concise.
// ---------------------------------------------------------------------------

function minimalCtx(overrides) {
  return Object.assign(
    {
      message: 'an error happened',
      stack: 'at file.cjs:1:1',
      runtime: 'claude-code',
      pluginVersion: '1.30.0',
      nodeVersion: 'v20.11.1',
      hostOsClass: 'linux',
      identity: {},
      hostname: '',
      repoOrigin: '',
      envSnapshot: {},
    },
    overrides || {}
  );
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

const { test } = require('node:test');
const assert = require('node:assert/strict');

test('30-02 Case 1: shape stability — assembled payload matches golden snapshot byte-for-byte', () => {
  const out = runAssembleFromFixture();
  const golden = fs.readFileSync(GOLDEN_PATH, 'utf8');
  assert.equal(
    out,
    golden,
    'Snapshot drift detected. If this change is intentional, update the golden file ' +
      '(run `node tests/issue-reporter-payload.test.cjs --regen`). If unintentional, ' +
      'the payload shape just broke for every downstream consumer (30-03 UI, 30-04 ' +
      'persistence, 30-05 transport).'
  );
});

test('30-02 Case 2: disclaimer presence — Russian text appears verbatim', () => {
  const out = assemble('gsd:test', minimalCtx());
  assert.ok(
    out.includes('Это псевдонимизация, не анонимизация.'),
    'D-01 RU disclaimer substring missing from payload'
  );
});

test('30-02 Case 3: disclaimer presence — English text appears verbatim', () => {
  const out = assemble('gsd:test', minimalCtx());
  assert.ok(
    out.includes('This is pseudonymization, not anonymization.'),
    'D-01 EN disclaimer substring missing from payload'
  );
});

test('30-02 Case 4: disclaimer appears BEFORE the first ## Command heading', () => {
  const out = assemble('gsd:test', minimalCtx());
  const ruIdx = out.indexOf('Это псевдонимизация');
  const cmdIdx = out.indexOf('## Command');
  assert.ok(ruIdx >= 0, 'RU disclaimer not found');
  assert.ok(cmdIdx >= 0, '## Command heading not found');
  assert.ok(
    ruIdx < cmdIdx,
    'D-01: disclaimer block must precede the first technical section'
  );
});

test('30-02 Case 5: fingerprint determinism — identical inputs produce byte-identical output', () => {
  const ctx = minimalCtx({
    message: 'TypeError',
    stack: 'at file.cjs:1:1',
  });
  // Two independent calls with the SAME input object.
  const a = assemble('gsd:plan-phase', ctx);
  const b = assemble('gsd:plan-phase', ctx);
  assert.equal(a, b, 'assemble() must be deterministic — same inputs → same output');
});

test('30-02 Case 6: fingerprint stable across cwd / line:col differences', () => {
  // Same logical bug, two different absolute path prefixes + different
  // line:col offsets. normalizeStack() should erase both differences and
  // both fingerprints should match. Note: computeFingerprint() consumes
  // the SCRUBBED stack — for this case we test normalizeStack invariance
  // directly via computeFingerprint() (no pseudonymize involvement).
  const fpA = computeFingerprint({
    stack:
      'TypeError: x\n    at fn (/home/alice/project/file.cjs:42:18)\n    at run (/home/alice/project/runner.cjs:10:5)',
    commandName: 'gsd:plan',
    runtime: 'claude-code',
    pluginVersion: '1.30.0',
  });
  const fpB = computeFingerprint({
    stack:
      'TypeError: x\n    at fn (/Users/bob/code/file.cjs:99:3)\n    at run (/Users/bob/code/runner.cjs:7:1)',
    commandName: 'gsd:plan',
    runtime: 'claude-code',
    pluginVersion: '1.30.0',
  });
  assert.equal(
    fpA,
    fpB,
    'Fingerprint must be stable across cwd + line/col differences — same bug from two users → same hash'
  );
});

test('30-02 Case 7: fingerprint changes when command_name changes', () => {
  const base = {
    stack: 'at file.cjs:1:1',
    runtime: 'claude-code',
    pluginVersion: '1.30.0',
  };
  const fpA = computeFingerprint(Object.assign({}, base, { commandName: 'gsd:plan' }));
  const fpB = computeFingerprint(Object.assign({}, base, { commandName: 'gsd:execute' }));
  assert.notEqual(fpA, fpB, 'Different command_name must yield different fingerprint');
});

test('30-02 Case 8: fingerprint changes when stack changes', () => {
  const base = {
    commandName: 'gsd:plan',
    runtime: 'claude-code',
    pluginVersion: '1.30.0',
  };
  const fpA = computeFingerprint(Object.assign({}, base, { stack: 'at foo.cjs:1:1' }));
  const fpB = computeFingerprint(Object.assign({}, base, { stack: 'at bar.cjs:1:1' }));
  assert.notEqual(fpA, fpB, 'Different stack must yield different fingerprint');
});

test('30-02 Case 9: order — redact runs BEFORE pseudonymize; Anthropic key stays redacted, not mangled', () => {
  // The negative test that locks threat T-30-02-01.
  //
  // Adversarial input: an Anthropic API key whose body happens to contain
  // the value of process.env.GITHUB_TOKEN. If pseudonymize ran FIRST,
  // Phase 30-01's R5 (env-var dropping) would substitute that value
  // inside the token body, producing `sk-ant-<env:GITHUB_TOKEN>...`. The
  // `<` non-word characters then break the redact pattern's
  // `[A-Za-z0-9_-]{20,}` character class, so the Phase 22 redaction
  // pattern no longer matches — the half-mangled `sk-ant-` prefix leaks.
  //
  // Correct order (redact FIRST): the whole `sk-ant-<24chars>` matches
  // the redact pattern unconditionally and becomes `[REDACTED:anthropic]`
  // BEFORE pseudonymize sees it. The placeholder string survives.
  //
  // The token body below intentionally embeds the substring `aliceXYZ`
  // which equals the env-var value declared in envSnapshot.
  const out = assemble(
    'gsd:test',
    minimalCtx({
      message: 'auth failed with key sk-ant-aliceXYZabcdefghijklmnopqrstu',
      envSnapshot: { GITHUB_TOKEN: 'aliceXYZ' },
    })
  );
  assert.ok(
    out.includes('[REDACTED:anthropic]'),
    'Anthropic key must be redacted to the [REDACTED:anthropic] placeholder ' +
      'when redact runs before pseudonymize.'
  );
  assert.ok(
    !out.includes('sk-ant-'),
    'No `sk-ant-` substring may appear anywhere in the output — half-mangled secret leak ' +
      '(this is the failure signature of pseudonymize-before-redact).'
  );
});

test('30-02 Case 10: capability_gap section omitted when 4th arg not provided', () => {
  const out = assemble('gsd:test', minimalCtx());
  assert.ok(
    !out.includes('## Capability Gap'),
    'Capability Gap section must be omitted when no event is provided'
  );
});

test('30-02 Case 11: capability_gap section includes all 7 D-02 fields when provided', () => {
  const out = assemble(
    'gsd:test',
    minimalCtx(),
    undefined,
    {
      event_type: 'capability_gap',
      command_name: 'gsd:plan-phase',
      capability_id: 'parallel-execution',
      expected_outcome: 'spawn 3 executors',
      observed_outcome: 'spawned 1 executor',
      runtime: 'claude-code',
      timestamp: '2026-05-20T12:00:00Z',
    }
  );
  for (const field of [
    'event_type',
    'command_name',
    'capability_id',
    'expected_outcome',
    'observed_outcome',
    'runtime',
    'timestamp',
  ]) {
    assert.ok(
      out.includes('- ' + field + ':'),
      'D-02 field `' + field + '` missing from capability_gap section'
    );
  }
});

test('30-02 Case 12: D-14 — extra fields on capability_gap event are silently dropped, never rendered', () => {
  const out = assemble(
    'gsd:test',
    minimalCtx(),
    undefined,
    {
      event_type: 'capability_gap',
      command_name: 'gsd:plan-phase',
      capability_id: 'parallel-execution',
      expected_outcome: 'spawn 3 executors',
      observed_outcome: 'spawned 1 executor',
      runtime: 'claude-code',
      timestamp: '2026-05-20T12:00:00Z',
      // Extra fields — must NEVER appear in the rendered payload.
      user_email: 'someone@example.com',
      internal_notes: 'this should not appear',
      debug_payload: { secret: 'hi' },
    }
  );
  const forbidden = ['user_email', 'internal_notes', 'debug_payload'];
  for (const tok of forbidden) {
    assert.ok(
      !out.includes(tok),
      'D-14 leak detected: extra field `' +
        tok +
        '` appeared in payload — only the 7 D-02 fields are allowed.'
    );
  }
  // The literal `someone@example.com` should also be absent — but note
  // that even if it slipped past D-14, Plan 30-01's R6 would convert it
  // to `<email>`. So we assert on the email-substring directly.
  assert.ok(
    !out.includes('someone@example.com'),
    'D-14 leak detected: extra-field value `someone@example.com` appeared in payload.'
  );
  // Sanity check: the 7 documented fields must still be present.
  assert.ok(out.includes('- event_type:'), 'documented D-02 field missing');
  assert.ok(out.includes('- capability_id:'), 'documented D-02 field missing');
});

test('30-02 Case 13: trajectory ref placeholder when 3rd arg omitted', () => {
  const out = assemble('gsd:test', minimalCtx());
  assert.ok(
    out.includes('_not provided_'),
    'Trajectory placeholder `_not provided_` must appear when ref is omitted'
  );
});

test('30-02 Case 14: disclaimer constants exported with exact D-01 text', () => {
  assert.equal(
    DISCLAIMER_RU,
    'Это псевдонимизация, не анонимизация. Содержимое промптов и кода может косвенно идентифицировать. Финальный ревью — на тебе.',
    'DISCLAIMER_RU must match D-01 verbatim'
  );
  assert.equal(
    DISCLAIMER_EN,
    'This is pseudonymization, not anonymization. Prompt and code contents can still indirectly identify. Final review is on you.',
    'DISCLAIMER_EN must match D-01 verbatim'
  );
});
