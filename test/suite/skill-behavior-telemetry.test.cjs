'use strict';
/**
 * test/suite/skill-behavior-telemetry.test.cjs — Plan 33-05 (RED-first, tdd:true).
 *
 * Structural / stub-LLM tests for the skill-behavior reflector-telemetry layer
 * (scripts/lib/skill-behavior/telemetry.cjs). Honors D-07 (≥3-of-last-10
 * sustained-failure threshold; reflector consumption is STUB-tested, no live
 * runs) and D-06 (lives in the DEFAULT suite, requires no API key / no LLM).
 *
 * Isolation contract: EVERY test injects an os.tmpdir()/mkdtempSync path for the
 * JSONL emit (opts.jsonlPath) AND for the incubator draft root
 * (opts.incubatorRoot), plus a fixed opts.now clock — so NOTHING touches the
 * real .design/ tree and no wall-clock leaks into assertions.
 *
 * Every test name is prefixed `33-05:`.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const telemetry = require('../../scripts/lib/skill-behavior/telemetry.cjs');

// --- helpers -------------------------------------------------------------

function tmpRoot(label) {
  return fs.mkdtempSync(path.join(os.tmpdir(), `sb-telemetry-${label}-`));
}

// Build a 10-run window with exactly `failCount` failing entries (pass:false).
// The first `failCount` entries fail (pass:false); the rest pass (pass:true).
function windowWith(failCount, total = 10) {
  return Array.from({ length: total }, (_v, i) => ({ pass: i >= failCount }));
}

// A canonical 33-01 runner result.
function runnerResult(overrides) {
  return Object.assign(
    {
      scenario: 'brief-under-time-pressure',
      target_skill: 'brief',
      pass: false,
      compliance_hits: 1,
      violation_hits: 2,
    },
    overrides || {},
  );
}

// Assert NO file anywhere under `skills/` (real repo) was mutated. We capture a
// before/after mtime snapshot of the tracked skills tree; propose-only must
// never write there.
function skillsTreeSnapshot() {
  const root = path.join(__dirname, '..', '..', 'skills');
  const snap = new Map();
  if (!fs.existsSync(root)) return snap;
  const stack = [root];
  while (stack.length) {
    const dir = stack.pop();
    for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, ent.name);
      if (ent.isDirectory()) stack.push(p);
      else snap.set(p, fs.statSync(p).mtimeMs);
    }
  }
  return snap;
}

// --- Test 1: recordRun appends a well-shaped failure event ---------------

test('33-05: recordRun appends a well-shaped failure event (event_type/scenario/ts; injected now)', () => {
  const dir = tmpRoot('emit');
  const jsonlPath = path.join(dir, 'nested', 'skill-behavior.jsonl');

  const event = telemetry.recordRun(runnerResult({ scenario: 'brief', compliance_hits: 1, violation_hits: 2 }), {
    jsonlPath,
    now: () => 'T-FIXED',
  });

  // Returned event has the documented shape.
  assert.ok(event, 'recordRun must return the event on a failing result');
  assert.equal(event.event_type, 'skill_behavior_failure');
  assert.equal(event.scenario, 'brief');
  assert.equal(event.pass, false);
  assert.equal(event.compliance_hits, 1);
  assert.equal(event.violation_hits, 2);
  assert.equal(event.ts, 'T-FIXED', 'ts must come from the injected now() clock');

  // Exactly ONE JSON line was appended (parent dir created defensively).
  assert.ok(fs.existsSync(jsonlPath), 'recordRun must mkdir -p the parent and write the JSONL file');
  const lines = fs.readFileSync(jsonlPath, 'utf8').split('\n').filter((l) => l.trim() !== '');
  assert.equal(lines.length, 1, 'exactly one event line');
  const parsed = JSON.parse(lines[0]);
  assert.equal(parsed.event_type, 'skill_behavior_failure');
  assert.equal(parsed.scenario, 'brief');
  assert.equal(parsed.ts, 'T-FIXED');
});

test('33-05: recordRun does not emit on a passing result (detector reads failures only)', () => {
  const dir = tmpRoot('pass');
  const jsonlPath = path.join(dir, 'skill-behavior.jsonl');
  const ev = telemetry.recordRun(runnerResult({ pass: true }), { jsonlPath, now: () => 'T' });
  assert.equal(ev, null, 'a passing run returns null (no failure event)');
  // No failure line written.
  const lines = fs.existsSync(jsonlPath)
    ? fs.readFileSync(jsonlPath, 'utf8').split('\n').filter((l) => l.trim() !== '')
    : [];
  assert.equal(lines.length, 0, 'no failure event for a passing run');
});

// --- Test 2: sustained-failure boundary (2/10 false, 3/10 true) ----------

test('33-05: isSustainedFailure is false at 2/10 and true at 3/10 (windowed to last 10)', () => {
  const scenario = 'brief';
  // 2 of 10 failing -> below the D-07 ≥3 threshold.
  assert.equal(
    telemetry.isSustainedFailure(scenario, { window: windowWith(2) }),
    false,
    '2/10 failing must be NOT sustained',
  );
  // 3 of 10 failing -> at the threshold -> sustained.
  assert.equal(
    telemetry.isSustainedFailure(scenario, { window: windowWith(3) }),
    true,
    '3/10 failing must be sustained',
  );
});

test('33-05: isSustainedFailure windows strictly to the LAST 10 (older failures excluded)', () => {
  const scenario = 'brief';
  // 12-run window: 4 failures, but 2 of them are in the OLDEST two entries,
  // so the last-10 window sees only 2 failing -> NOT sustained.
  const window = [
    { pass: false }, // oldest — excluded by last-10
    { pass: false }, // oldest — excluded by last-10
    { pass: true },
    { pass: true },
    { pass: true },
    { pass: true },
    { pass: true },
    { pass: true },
    { pass: true },
    { pass: true },
    { pass: false }, // within last-10
    { pass: false }, // within last-10
  ];
  assert.equal(window.length, 12);
  assert.equal(
    telemetry.isSustainedFailure(scenario, { window }),
    false,
    'only the last 10 runs count — 2 recent failures is below threshold',
  );
});

test('33-05: isSustainedFailure reads the on-disk JSONL tail when no window is injected', () => {
  const dir = tmpRoot('disk');
  const jsonlPath = path.join(dir, 'skill-behavior.jsonl');
  const now = () => 'T';

  // Emit 3 failing runs for 'alpha' and some passing/other-scenario noise.
  telemetry.recordRun(runnerResult({ scenario: 'alpha', pass: true }), { jsonlPath, now }); // pass -> no line
  telemetry.recordRun(runnerResult({ scenario: 'alpha', pass: false }), { jsonlPath, now });
  telemetry.recordRun(runnerResult({ scenario: 'beta', pass: false }), { jsonlPath, now }); // other scenario
  telemetry.recordRun(runnerResult({ scenario: 'alpha', pass: false }), { jsonlPath, now });
  telemetry.recordRun(runnerResult({ scenario: 'alpha', pass: false }), { jsonlPath, now });

  // 'alpha' has 3 failure rows on disk (within its last 10) -> sustained.
  assert.equal(
    telemetry.isSustainedFailure('alpha', { jsonlPath }),
    true,
    '3 on-disk failures for alpha -> sustained',
  );
  // 'beta' has only 1 -> not sustained.
  assert.equal(
    telemetry.isSustainedFailure('beta', { jsonlPath }),
    false,
    '1 on-disk failure for beta -> not sustained',
  );
  // A scenario with no rows at all -> not sustained, never throws on missing tail.
  assert.equal(telemetry.isSustainedFailure('never-seen', { jsonlPath }), false);
});

// --- Test 3: propose-only on sustained, skip otherwise -------------------

test('33-05: maybeProposeReflection drafts a propose-only reflector entry ONLY when sustained; skips otherwise; no skill auto-edit', () => {
  const incubatorRoot = tmpRoot('incubator');
  const before = skillsTreeSnapshot();

  // 2/10 -> below threshold -> skipped, no draft written.
  const skip = telemetry.maybeProposeReflection('brief', {
    window: windowWith(2),
    incubatorRoot,
  });
  assert.equal(skip.action, 'skipped', 'a non-sustained window must skip');
  assert.match(String(skip.reason || ''), /sustain|threshold/i, 'skip carries a below-threshold reason');

  // 3/10 -> sustained -> drafted, file present under the INJECTED incubator tmp dir.
  const drafted = telemetry.maybeProposeReflection('brief', {
    window: windowWith(3),
    incubatorRoot,
  });
  assert.equal(drafted.action, 'drafted', 'a sustained window must produce a draft');
  assert.ok(drafted.path, 'drafted result carries the draft path');
  assert.ok(drafted.slug, 'drafted result carries a slug keyed to the scenario');
  assert.match(drafted.slug, /brief/, 'slug names the failing scenario');
  assert.ok(fs.existsSync(drafted.path), 'the draft file must exist under the injected incubator tmp dir');

  // Draft landed in the injected incubator tree (NOT the real .design/).
  assert.ok(
    path.resolve(drafted.path).startsWith(path.resolve(incubatorRoot)),
    'draft must be under the injected incubatorRoot, never the real .design/',
  );
  assert.match(drafted.path, /[/\\]incubator[/\\]?|skill-edit-brief/, 'draft lives in the incubator tree keyed to the scenario');

  // Draft content names the failing scenario + signals a content edit, and is propose-only.
  const body = fs.readFileSync(drafted.path, 'utf8');
  assert.match(body, /brief/, 'draft names the failing scenario');
  assert.match(body, /TODO|propose|proposal/i, 'draft is a propose-only content-edit proposal');

  // PROPOSE-ONLY invariant: no file under the real skills/ tree was mutated.
  const after = skillsTreeSnapshot();
  assert.equal(after.size, before.size, 'no skill file added/removed by a proposal');
  for (const [p, mtime] of before) {
    assert.equal(after.get(p), mtime, `skill file ${p} must NOT be modified by a propose-only draft`);
  }
});

test('33-05: maybeProposeReflection drives the on-disk JSONL tail too (sustained via recorded failures)', () => {
  const dir = tmpRoot('e2e');
  const jsonlPath = path.join(dir, 'skill-behavior.jsonl');
  const incubatorRoot = path.join(dir, 'incubator');
  const now = () => 'T';

  // Record 3 failing runs for 'authority-pressure' on disk.
  for (let i = 0; i < 3; i++) {
    telemetry.recordRun(runnerResult({ scenario: 'authority-pressure', pass: false }), { jsonlPath, now });
  }
  const drafted = telemetry.maybeProposeReflection('authority-pressure', { jsonlPath, incubatorRoot });
  assert.equal(drafted.action, 'drafted', '3 on-disk failures -> sustained -> drafted');
  assert.ok(fs.existsSync(drafted.path));
  assert.match(drafted.slug, /authority-pressure/);
});
