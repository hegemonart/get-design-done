// test/suite/phase-56-risk-gate.test.cjs — Phase 56 (RISK-02) risk-gate hook.
//
// Proves hooks/gdd-risk-gate.js — the PreToolUse:Write|Edit|MultiEdit|Bash gate
// that scores writer actions with the PURE scorer (executor A) and routes by
// `suggested_action`:
//
//   allow                -> { continue: true } (silent, no stopReason, no advisory)
//   review               -> { continue: true, hookSpecificOutput.additionalContext }
//   require_confirmation -> { continue: true, hookSpecificOutput.additionalContext + flag }
//   block                -> { continue: false, stopReason mentioning risk }
//
// Invariants under test (the repo house-style — gdd-bash-guard / gdd-protected-paths):
//   * EXIT CODE 0 in ALL cases (continue:false is the block, NOT exit 2).
//   * a `risk_assessment` event is emitted to the firehose (GDD_EVENTS_PATH).
//   * malformed stdin fails OPEN -> { continue: true }, no throw, exit 0.
//
// Subprocess runHook pattern mirrors test/suite/hook-emit-wire.test.cjs so the
// hook is exercised exactly as hooks.json invokes it (`node hooks/gdd-risk-gate.js`).
'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { mkdtempSync, rmSync, readFileSync, existsSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { join } = require('node:path');
const { spawnSync } = require('node:child_process');

const REPO_ROOT = join(__dirname, '..', '..');
const HOOK = join(REPO_ROOT, 'hooks', 'gdd-risk-gate.js');

const bigDiff = (n) => Array.from({ length: n }, (_, i) => `line ${i}`).join('\n');

/**
 * Run the hook subprocess with the given stdin payload, a temp cwd, and the
 * firehose pointed at events.jsonl via GDD_EVENTS_PATH. Returns the spawn
 * result, the parsed stdout JSON (or null), and the parsed events.jsonl lines.
 */
function runHook(stdinJson, opts = {}) {
  const dir = opts.dir || mkdtempSync(join(tmpdir(), 'hone-riskgate-'));
  const eventsPath = join(dir, 'events.jsonl');
  const env = {
    ...process.env,
    GDD_EVENTS_PATH: eventsPath,
    GDD_SESSION_ID: 'test-sess',
    ...(opts.env || {}),
  };
  const res = spawnSync(process.execPath, [HOOK], {
    input: typeof stdinJson === 'string' ? stdinJson : JSON.stringify(stdinJson),
    cwd: dir,
    encoding: 'utf8',
    env,
    timeout: 10000,
  });
  let stdout = null;
  try { stdout = JSON.parse(res.stdout); } catch { /* leave null on non-JSON */ }
  const events = existsSync(eventsPath)
    ? readFileSync(eventsPath, 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l))
    : [];
  return { res, stdout, events, dir };
}

function withRun(stdinJson, fn, opts) {
  const r = runHook(stdinJson, opts);
  try { fn(r); } finally { rmSync(r.dir, { recursive: true, force: true }); }
}

// ── allow band: benign README Write ─────────────────────────────────────────

test('56-02: benign README Write -> { continue: true }, no stopReason, exit 0', () => {
  withRun({ tool_name: 'Write', tool_input: { file_path: 'README.md', content: 'x' } }, ({ res, stdout }) => {
    assert.equal(res.status, 0, `exit 0; stderr: ${res.stderr}`);
    assert.ok(stdout, `stdout is JSON: ${res.stdout}`);
    assert.equal(stdout.continue, true);
    assert.equal(stdout.stopReason, undefined, 'allow band must not carry a stopReason');
    assert.equal(stdout.hookSpecificOutput, undefined, 'allow band is silent (no advisory)');
  });
});

// ── block band: STATE.md large-diff Edit ─────────────────────────────────────

test('56-02: Edit STATE.md large-diff -> { continue: false } with a risk stopReason, exit 0', () => {
  withRun(
    { tool_name: 'Edit', tool_input: { file_path: '.planning/STATE.md', new_string: bigDiff(300) } },
    ({ res, stdout }) => {
      assert.equal(res.status, 0, `exit 0 even on block; stderr: ${res.stderr}`);
      assert.ok(stdout, `stdout is JSON: ${res.stdout}`);
      assert.equal(stdout.continue, false, 'large-diff STATE.md edit is blocked');
      assert.equal(typeof stdout.stopReason, 'string');
      assert.match(stdout.stopReason, /risk/i, 'stopReason mentions risk');
      assert.match(stdout.stopReason, /override/i, 'stopReason points at /hone:override');
    },
  );
});

// ── review band: a plain-source Edit (advisory, non-blocking) ────────────────

test('56-02: review-band Edit -> { continue: true } + hookSpecificOutput.additionalContext, exit 0', () => {
  // Edit on a plain src file with a tiny diff scores ~0.35 -> review band
  // (see test/suite/phase-56-risk.test.cjs for the scorer fixtures).
  withRun(
    { tool_name: 'Edit', tool_input: { file_path: 'src/foo.ts', new_string: 'a\nb\nc' } },
    ({ res, stdout }) => {
      assert.equal(res.status, 0, `exit 0; stderr: ${res.stderr}`);
      assert.ok(stdout, `stdout is JSON: ${res.stdout}`);
      assert.equal(stdout.continue, true, 'review band is advisory, never blocks');
      assert.equal(stdout.stopReason, undefined);
      assert.ok(stdout.hookSpecificOutput, 'review band carries an advisory');
      assert.equal(stdout.hookSpecificOutput.hookEventName, 'PreToolUse');
      assert.equal(typeof stdout.hookSpecificOutput.additionalContext, 'string');
      assert.match(stdout.hookSpecificOutput.additionalContext, /risk=/, 'advisory shows the risk rationale');
      assert.match(stdout.hookSpecificOutput.additionalContext, /review/, 'advisory names the suggested action');
    },
  );
});

// ── require_confirmation band: advisory + the design-fixer flag (R2) ─────────

test('56-02: require_confirmation Edit -> advisory flagging design-fixer confirm (continue:true), exit 0', () => {
  // small STATE.md edit scores ~0.81 -> require_confirmation.
  withRun(
    { tool_name: 'Edit', tool_input: { file_path: '.planning/STATE.md', new_string: 'one small line' } },
    ({ res, stdout }) => {
      assert.equal(res.status, 0, `exit 0; stderr: ${res.stderr}`);
      assert.ok(stdout, `stdout is JSON: ${res.stdout}`);
      assert.equal(stdout.continue, true, 'the HOOK never blocks on require_confirmation (R2: agent prompts)');
      assert.equal(stdout.stopReason, undefined);
      assert.ok(stdout.hookSpecificOutput);
      assert.match(stdout.hookSpecificOutput.additionalContext, /require_confirmation/);
      assert.match(stdout.hookSpecificOutput.additionalContext, /design-fixer/i, 'flags that design-fixer will confirm');
    },
  );
});

// ── risk_assessment event emission ───────────────────────────────────────────

test('56-02: a risk_assessment event is emitted for a scored call', () => {
  withRun(
    { tool_name: 'Edit', tool_input: { file_path: '.planning/STATE.md', new_string: bigDiff(300) } },
    ({ res, events }) => {
      assert.equal(res.status, 0);
      const risk = events.filter((e) => e.type === 'risk_assessment');
      assert.ok(risk.length >= 1, `expected a risk_assessment event, got: ${JSON.stringify(events.map((e) => e.type))}`);
      const ev = risk[0];
      assert.equal(ev.sessionId, 'test-sess');
      // Schema-aligned field names (RiskAssessmentPayload): tool_name, risk_score, not tool/score.
      assert.equal(ev.payload.tool_name, 'Edit');
      assert.equal(ev.payload.suggested_action, 'block');
      assert.equal(typeof ev.payload.risk_score, 'number');
      assert.ok(Array.isArray(ev.payload.reasons) && ev.payload.reasons.length >= 1);
      // event_id must be a UUIDv4 (required field).
      assert.match(ev.payload.event_id, /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
    },
  );
});

test('56-02: the risk_assessment event also fires on a benign (allow) call', () => {
  withRun({ tool_name: 'Write', tool_input: { file_path: 'README.md', content: 'x' } }, ({ res, events }) => {
    assert.equal(res.status, 0);
    const risk = events.filter((e) => e.type === 'risk_assessment');
    assert.ok(risk.length >= 1, 'allow-band calls are scored + emitted too (full distribution for calibration)');
    assert.equal(risk[0].payload.suggested_action, 'allow');
  });
});

// ── fail-open: malformed stdin ───────────────────────────────────────────────

test('56-02: malformed stdin fails OPEN -> { continue: true }, no throw, exit 0', () => {
  withRun('this is not json{{{', ({ res, stdout }) => {
    assert.equal(res.status, 0, `must not crash on bad stdin; stderr: ${res.stderr}`);
    assert.ok(stdout, `stdout is still JSON: ${res.stdout}`);
    assert.equal(stdout.continue, true, 'bad stdin must never block a tool call');
    assert.equal(stdout.stopReason, undefined);
  });
});

test('56-02: empty stdin fails OPEN -> { continue: true }, exit 0', () => {
  withRun('', ({ res, stdout }) => {
    assert.equal(res.status, 0);
    assert.ok(stdout);
    assert.equal(stdout.continue, true);
  });
});

// ── unmatched tool is a silent allow (defensive; matcher should pre-exclude) ──

test('56-02: a non-writer tool (Read) is a silent allow, exit 0', () => {
  withRun({ tool_name: 'Read', tool_input: { file_path: '.planning/STATE.md' } }, ({ res, stdout }) => {
    assert.equal(res.status, 0);
    assert.ok(stdout);
    assert.equal(stdout.continue, true);
    assert.equal(stdout.hookSpecificOutput, undefined);
  });
});

// ── dangerous Bash blocks (cross-checks the dangerous-patterns addend) ───────

test('56-02: rm -rf / Bash -> { continue: false } stopReason, exit 0', () => {
  withRun({ tool_name: 'Bash', tool_input: { command: 'rm -rf /' } }, ({ res, stdout }) => {
    assert.equal(res.status, 0, `exit 0 even on block; stderr: ${res.stderr}`);
    assert.ok(stdout);
    assert.equal(stdout.continue, false);
    assert.match(stdout.stopReason, /risk/i);
  });
});

// ── read-only agent gate: advisory-suppressed silent allow ───────────────────

test('56-02: a known read-only agent is a silent allow even on a risky-looking write', () => {
  withRun(
    { tool_name: 'Edit', tool_input: { file_path: '.planning/STATE.md', new_string: 'one small line' } },
    ({ res, stdout }) => {
      assert.equal(res.status, 0);
      assert.ok(stdout);
      assert.equal(stdout.continue, true, 'read-only agent never sees write-risk');
      assert.equal(stdout.hookSpecificOutput, undefined, 'no advisory for a read-only agent');
    },
    { env: { GDD_AGENT: 'design-context-checker' } },
  );
});

// ── pure-helper unit coverage (require the module in-process; main() not run) ─

test('56-02: module pure helpers — findRiskModule + read-only gate + renderers', () => {
  const mod = require('../../hooks/gdd-risk-gate.js');
  // findRiskModule walks up from REPO_ROOT and finds the scorer.
  const found = mod.findRiskModule(join(REPO_ROOT, 'hooks'));
  assert.ok(found && found.endsWith(join('scripts', 'lib', 'risk', 'compute-risk.cjs')), `found: ${found}`);

  // read-only agent gate
  assert.equal(mod.isReadOnlyAgent('design-context-checker'), true);
  assert.equal(mod.isReadOnlyAgent('design-fixer'), false);
  assert.equal(mod.isReadOnlyAgent(''), false, 'unknown agent is scored (not read-only)');

  // block renderer mentions risk + override; advisory carries the rationale.
  const assessment = { score: 0.9, suggested_action: 'block', reasons: ['base:Edit=0.35', 'file:planning-state'] };
  const block = mod.buildBlock('Edit', assessment);
  assert.equal(block.continue, false);
  assert.match(block.stopReason, /risk=0\.90/);
  assert.match(block.stopReason, /override/i);

  const adv = mod.buildAdvisory('Edit', { score: 0.4, suggested_action: 'review', reasons: ['base:Edit=0.35'] }, null);
  assert.equal(adv.continue, true);
  assert.equal(adv.hookSpecificOutput.hookEventName, 'PreToolUse');
  assert.match(adv.hookSpecificOutput.additionalContext, /risk=0\.40/);
});

test('56-02: buildMergedTables returns undefined when no config extras (uses frozen defaults)', () => {
  const mod = require('../../hooks/gdd-risk-gate.js');
  const merged = mod.buildMergedTables({ base_tool_extra: {}, file_sensitivity_extra: [], input_pattern_extra: [] });
  assert.equal(merged, undefined, 'no extras -> let computeRisk use the frozen defaults');
});

test('56-02: compileFileSensitivityExtra drops malformed entries + compiles string tests', () => {
  const mod = require('../../hooks/gdd-risk-gate.js');
  const out = mod.compileFileSensitivityExtra([
    { test: '\\.secret$', mult: 2, add: 0.3, label: 'secret-files' },
    { test: '(', mult: 2 }, // invalid regex -> dropped
    { mult: 2 }, // no test -> dropped
    null, // junk -> dropped
    'nope', // junk -> dropped
  ]);
  assert.equal(out.length, 1);
  assert.equal(out[0].label, 'secret-files');
  assert.ok(out[0].test instanceof RegExp);
  assert.equal(out[0].test.test('foo.secret'), true);
});

// ── dbg-C: AJV regression — real emitted payload must validate against events.schema.json ──
//
// This test closes the gap that allowed the schema mismatch to ship: it compiles
// RiskAssessmentPayload via ajv against the canonical events.schema.json, runs the
// hook to collect a real emitted payload, and asserts the payload validates.
//
// Tagged dbg-C per the debug-fix session that introduced it.

// ── calibration loop wiring: hook updates the rolling-50 store per real call ──
//
// Phase 57 polish (H2): recordRiskOutcome existed in scripts/lib/risk/calibration.cjs
// but no caller invoked it, so detectDrift could only fire from synthetic tests.
// The risk gate now writes a rolling-50 calibration row on EVERY scored call when
// the agent is known — under_scoring / over_scoring drift now derives from
// production traffic. These tests pin the wiring end-to-end.

test('57-H2: scored call writes a calibration row when GDD_AGENT is set (accepted:true on allow)', () => {
  withRun(
    { tool_name: 'Write', tool_input: { file_path: 'README.md', content: 'x' } },
    ({ res, dir }) => {
      assert.equal(res.status, 0);
      const calPath = join(dir, '.design', 'telemetry', 'calibration.json');
      assert.ok(existsSync(calPath), 'calibration.json must be written under cwd/.design/telemetry');
      const store = JSON.parse(readFileSync(calPath, 'utf8'));
      assert.equal(store.schema_version, '56.0');
      const row = store.agents['design-fixer'];
      assert.ok(row, 'design-fixer agent row must be present');
      assert.equal(row.window.length, 1, 'one outcome recorded');
      assert.equal(row.window[0].accepted, true, 'allow band records accepted:true');
      assert.equal(typeof row.window[0].risk, 'number');
      assert.ok(row.window[0].risk >= 0 && row.window[0].risk <= 1);
    },
    { env: { GDD_AGENT: 'design-fixer' } },
  );
});

test('57-H2: blocked call writes accepted:false to the calibration store', () => {
  withRun(
    { tool_name: 'Edit', tool_input: { file_path: '.planning/STATE.md', new_string: bigDiff(300) } },
    ({ res, stdout, dir }) => {
      assert.equal(res.status, 0);
      assert.equal(stdout.continue, false, 'this scenario must block to validate the accepted:false path');
      const calPath = join(dir, '.design', 'telemetry', 'calibration.json');
      assert.ok(existsSync(calPath));
      const store = JSON.parse(readFileSync(calPath, 'utf8'));
      const row = store.agents['design-fixer'];
      assert.ok(row);
      assert.equal(row.window.length, 1);
      assert.equal(row.window[0].accepted, false, 'block band records accepted:false');
      assert.equal(row.override_rate, 1, 'one block -> override_rate is 1.0');
    },
    { env: { GDD_AGENT: 'design-fixer' } },
  );
});

test('57-H2: multiple scored calls accumulate in the rolling window for one agent', () => {
  // Same tmp cwd across two runs -> the store grows.
  const dir = mkdtempSync(join(tmpdir(), 'hone-riskgate-roll-'));
  try {
    runHook({ tool_name: 'Write', tool_input: { file_path: 'README.md', content: 'a' } }, { dir, env: { GDD_AGENT: 'design-fixer' } });
    runHook({ tool_name: 'Write', tool_input: { file_path: 'docs/guide.md', content: 'b' } }, { dir, env: { GDD_AGENT: 'design-fixer' } });
    const store = JSON.parse(readFileSync(join(dir, '.design', 'telemetry', 'calibration.json'), 'utf8'));
    assert.equal(store.agents['design-fixer'].window.length, 2, 'two scored calls -> two window entries');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('57-H2: no agent known -> no calibration row written (avoids meaningless "unknown" bucket)', () => {
  withRun(
    { tool_name: 'Write', tool_input: { file_path: 'README.md', content: 'x' } },
    ({ res, dir }) => {
      assert.equal(res.status, 0);
      const calPath = join(dir, '.design', 'telemetry', 'calibration.json');
      assert.ok(!existsSync(calPath), 'calibration.json must NOT be written when agent is unknown');
    },
    // Explicitly UNSET GDD_AGENT (and any other agent signal).
    { env: { GDD_AGENT: '' } },
  );
});

test('57-H2: a read-only agent never triggers a calibration write (it short-circuits before scoring)', () => {
  withRun(
    { tool_name: 'Edit', tool_input: { file_path: '.planning/STATE.md', new_string: 'one line' } },
    ({ res, dir }) => {
      assert.equal(res.status, 0);
      const calPath = join(dir, '.design', 'telemetry', 'calibration.json');
      assert.ok(!existsSync(calPath), 'read-only agents bypass scoring -> no calibration row');
    },
    { env: { GDD_AGENT: 'design-context-checker' } },
  );
});

test('57-H2: recordCalibration unit — assessment shape + tmp root produces a valid store', () => {
  const mod = require('../../hooks/gdd-risk-gate.js');
  const root = mkdtempSync(join(tmpdir(), 'hone-riskgate-unit-'));
  try {
    // allow band
    mod.recordCalibration('agent-x', { score: 0.1, suggested_action: 'allow', reasons: [] }, root);
    // block band
    mod.recordCalibration('agent-x', { score: 0.9, suggested_action: 'block', reasons: ['big'] }, root);
    const store = JSON.parse(readFileSync(join(root, '.design', 'telemetry', 'calibration.json'), 'utf8'));
    const row = store.agents['agent-x'];
    assert.equal(row.window.length, 2);
    assert.equal(row.window[0].accepted, true);
    assert.equal(row.window[1].accepted, false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('57-H2: recordCalibration is a no-op when the agent is empty / falsy', () => {
  const mod = require('../../hooks/gdd-risk-gate.js');
  const root = mkdtempSync(join(tmpdir(), 'hone-riskgate-noop-'));
  try {
    mod.recordCalibration('', { score: 0.5, suggested_action: 'review', reasons: [] }, root);
    mod.recordCalibration(undefined, { score: 0.5, suggested_action: 'review', reasons: [] }, root);
    mod.recordCalibration(null, { score: 0.5, suggested_action: 'review', reasons: [] }, root);
    const calPath = join(root, '.design', 'telemetry', 'calibration.json');
    assert.ok(!existsSync(calPath), 'no calibration.json when agent is missing');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('57-H2: recordCalibration never throws on a malformed assessment', () => {
  const mod = require('../../hooks/gdd-risk-gate.js');
  const root = mkdtempSync(join(tmpdir(), 'hone-riskgate-mal-'));
  try {
    // These must all silently no-op, not throw.
    assert.doesNotThrow(() => mod.recordCalibration('a', null, root));
    assert.doesNotThrow(() => mod.recordCalibration('a', {}, root));
    assert.doesNotThrow(() => mod.recordCalibration('a', { score: 'nope', suggested_action: 'allow' }, root));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('57-H2: findCalibrationModule resolves the calibration sibling via walk-up', () => {
  const mod = require('../../hooks/gdd-risk-gate.js');
  const found = mod.findCalibrationModule(join(REPO_ROOT, 'hooks'));
  assert.ok(
    found && found.endsWith(join('scripts', 'lib', 'risk', 'calibration.cjs')),
    `findCalibrationModule must locate the sibling; got: ${found}`,
  );
});

test('56-02 dbg-C: a REAL emitted risk_assessment payload validates against events.schema.json', () => {
  // Load ajv (must be present — it is a dev-dep on the project).
  let Ajv;
  try { Ajv = require('ajv'); } catch {
    // If ajv is not installed, skip gracefully so CI on a fresh install does not
    // hard-fail before deps are restored. In normal dev + CI ajv is always available.
    console.warn('[56-02 dbg-C] ajv not found — skipping AJV validation test');
    return;
  }

  // Collect a real payload via subprocess.
  const r = runHook(
    { tool_name: 'Write', tool_input: { file_path: 'src/any.ts', content: 'hello' } },
  );
  try {
    const riskEvents = r.events.filter((e) => e.type === 'risk_assessment');
    assert.ok(riskEvents.length >= 1, 'no risk_assessment event emitted');
    const payload = riskEvents[0].payload;

    // Load the canonical schema (SoT — never change it in this test).
    const schemaPath = join(REPO_ROOT, 'reference', 'schemas', 'events.schema.json');
    const schema = JSON.parse(require('node:fs').readFileSync(schemaPath, 'utf8'));

    // Compile the RiskAssessmentPayload sub-schema directly from definitions.
    const ajv = new Ajv({ strict: false });
    // Add the root schema so $ref chains resolve.
    ajv.addSchema(schema, schema.$id);
    const validate = ajv.compile(schema.definitions.RiskAssessmentPayload);
    const valid = validate(payload);
    assert.ok(
      valid,
      `risk_assessment payload FAILED schema validation:\n${JSON.stringify(validate.errors, null, 2)}\nPayload: ${JSON.stringify(payload, null, 2)}`,
    );
  } finally {
    rmSync(r.dir, { recursive: true, force: true });
  }
});
