'use strict';
/**
 * tests/phase-28.5-baseline.test.cjs — Phase 28.5-11 Task 3 regression baseline.
 *
 * Locks the post-Wave-A/B/C skill-length distribution. Future PRs that
 * regress a skill past the warn/block thresholds, or drift line counts
 * beyond ±5 from baseline, will fail this test.
 *
 * Version-agnostic (Phase 28 lesson D-08) — reads `package.json#version`
 * dynamically; the baseline files are pinned to the v1.28.5 snapshot at
 * Phase 28.5 close but the test does not encode the literal version.
 *
 * Full RegExp escape per CodeQL js/incomplete-sanitization (Phase 28
 * lesson 5) for any user-provided strings used in dynamic regexes.
 *
 * Tagged '28.5-11:' per closeout discipline.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const REPO_ROOT = path.resolve(__dirname, '..');
const BASELINE_DIR = path.join(REPO_ROOT, 'test-fixture', 'baselines', 'phase-28.5');
const VALIDATOR = path.join(REPO_ROOT, 'scripts', 'validate-skill-length.cjs');
const DISTRIBUTION_PATH = path.join(BASELINE_DIR, 'skill-length-distribution.txt');
const SUMMARY_PATH = path.join(BASELINE_DIR, 'validator-summary.txt');

// Drift tolerance: ±5 lines per skill before flagging regression.
// Skills frequently get minor refactors that don't materially change
// agent context cost; rigid exact-match would fail too often.
const LINE_DRIFT_TOLERANCE = 5;

function runValidator() {
  const r = spawnSync(process.execPath, [VALIDATOR, '--quiet', '--json'], {
    encoding: 'utf8',
    cwd: REPO_ROOT,
  });
  if (r.status !== 0 && r.status !== 1 && r.status !== 2) {
    throw new Error(`validator exited ${r.status}; stderr: ${r.stderr}`);
  }
  return { exit: r.status, parsed: JSON.parse(r.stdout) };
}

function parseDistribution(text) {
  const m = new Map();
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    // Full RegExp escape discipline — skill names are alphanumeric + . _ -
    // per the validator's walkSkills convention. Match defensively.
    const match = line.match(/^([a-zA-Z0-9._-]+):\s*(\d+)\s*$/);
    if (match) m.set(match[1], Number(match[2]));
  }
  return m;
}

test('28.5-11 baseline: distribution file exists', () => {
  assert.ok(fs.existsSync(DISTRIBUTION_PATH), `missing baseline file: ${DISTRIBUTION_PATH}`);
});

test('28.5-11 baseline: validator-summary file exists', () => {
  assert.ok(fs.existsSync(SUMMARY_PATH), `missing baseline file: ${SUMMARY_PATH}`);
});

test('28.5-11 baseline: distribution has at least 60 entries (post-Wave-B/C state)', () => {
  const text = fs.readFileSync(DISTRIBUTION_PATH, 'utf8');
  const dist = parseDistribution(text);
  assert.ok(dist.size >= 60, `baseline has only ${dist.size} entries; expected >=60`);
});

test('28.5-11 baseline: validator-summary is parseable JSON with required fields', () => {
  const text = fs.readFileSync(SUMMARY_PATH, 'utf8').trim();
  const obj = JSON.parse(text);
  assert.ok(Number.isInteger(obj.total), 'summary.total missing or non-integer');
  assert.ok(Number.isInteger(obj.clean), 'summary.clean missing or non-integer');
  assert.ok(Number.isInteger(obj.warnings), 'summary.warnings missing or non-integer');
  assert.ok(Number.isInteger(obj.blockers), 'summary.blockers missing or non-integer');
});

test('28.5-11 baseline: summary records 0 blockers + 0 warnings (D-12 success criterion)', () => {
  const text = fs.readFileSync(SUMMARY_PATH, 'utf8').trim();
  const summary = JSON.parse(text);
  assert.equal(summary.blockers, 0, `baseline records blockers=${summary.blockers}; expected 0 post-rework`);
  assert.equal(summary.warnings, 0, `baseline records warnings=${summary.warnings}; expected 0 post-rework`);
});

test('28.5-11 baseline: current validator run matches baseline summary (zero regression in blockers/warnings)', () => {
  const baseline = JSON.parse(fs.readFileSync(SUMMARY_PATH, 'utf8').trim());
  const { parsed } = runValidator();
  assert.equal(parsed.summary.blockers, baseline.blockers, `blocker count regression: ${parsed.summary.blockers} vs baseline ${baseline.blockers}`);
  assert.equal(parsed.summary.warnings, baseline.warnings, `warning count regression: ${parsed.summary.warnings} vs baseline ${baseline.warnings}`);
});

test('28.5-11 baseline: current distribution does not drift more than tolerance', () => {
  const baseline = parseDistribution(fs.readFileSync(DISTRIBUTION_PATH, 'utf8'));
  const { parsed } = runValidator();
  const regressions = [];
  for (const s of parsed.skills) {
    const b = baseline.get(s.name);
    if (b === undefined) continue; // new skill — not a regression
    const drift = s.lines - b;
    if (Math.abs(drift) > LINE_DRIFT_TOLERANCE) {
      regressions.push(`${s.name}: baseline=${b}, current=${s.lines}, drift=${drift > 0 ? '+' : ''}${drift}`);
    }
  }
  assert.equal(regressions.length, 0, `line-count regressions (>${LINE_DRIFT_TOLERANCE} lines):\n  ${regressions.join('\n  ')}`);
});

test('28.5-11 baseline: all baseline-listed skills are present in current run', () => {
  const baseline = parseDistribution(fs.readFileSync(DISTRIBUTION_PATH, 'utf8'));
  const { parsed } = runValidator();
  const currentNames = new Set(parsed.skills.map(s => s.name));
  const missing = [];
  for (const name of baseline.keys()) {
    if (!currentNames.has(name)) missing.push(name);
  }
  assert.equal(missing.length, 0, `skills removed since baseline: ${missing.join(', ')}`);
});

test('28.5-11 baseline: validator exit code matches summary (clean ⇒ exit 0)', () => {
  const { exit, parsed } = runValidator();
  const expectedExit = parsed.summary.blockers > 0 ? 2 : (parsed.summary.warnings > 0 ? 1 : 0);
  assert.equal(exit, expectedExit, `validator exit ${exit} disagrees with summary (${JSON.stringify(parsed.summary)})`);
});
