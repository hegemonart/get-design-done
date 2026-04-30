'use strict';

// tests/phase-25-baseline.test.cjs — Phase 25 regression baseline.
//
// Same shape as tests/phase-24-baseline.test.cjs. Asserts the four
// sub-features that ship in Phase 25 (per CONTEXT.md) all landed:
//
//   1. Prototype gate          (Plans 25-01, 25-05, 25-06)
//   2. S/M/L/XL complexity     (Plan 25-02)
//   3. Quality gate (Stage 4.5)(Plans 25-03, 25-07)
//   4. Turn closeout Stop hook (Plans 25-04, 25-08)
//
// Plus the manifest alignment + CHANGELOG block that bookends the phase
// (Plan 25-09 — D-12).

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const REPO_ROOT = path.join(__dirname, '..');

// --- Manifest alignment (D-12) -----------------------------------------

test('phase-25 baseline: all 4 manifests aligned on current version (Phase 27 D-12 — version-agnostic)', () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, 'package.json'), 'utf8'));
  const plugin = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, '.claude-plugin', 'plugin.json'), 'utf8'));
  const market = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, '.claude-plugin', 'marketplace.json'), 'utf8'));
  const v = pkg.version;
  assert.match(v, /^\d+\.\d+\.\d+/, 'package.json version must be a valid semver');
  assert.equal(plugin.version, v, 'plugin.json must agree with package.json');
  assert.equal(market.metadata.version, v, 'marketplace.json metadata.version must agree with package.json');
  assert.equal(market.plugins[0].version, v, 'marketplace.json plugins[0].version must agree with package.json');
});

test('phase-25 baseline: CHANGELOG.md has a [1.25.0] block', () => {
  const changelog = fs.readFileSync(path.join(REPO_ROOT, 'CHANGELOG.md'), 'utf8');
  assert.match(
    changelog,
    /## \[1\.25\.0\]/,
    'CHANGELOG.md must contain a "## [1.25.0]" version block (Phase 25 entry)',
  );
});

// --- Sub-feature 1: Prototype gate (Plans 25-01, 25-05, 25-06) ---------

test('phase-25 baseline: agents/prototype-gate.md exists', () => {
  const target = path.join(REPO_ROOT, 'agents', 'prototype-gate.md');
  assert.ok(fs.existsSync(target), 'Plan 25-01 must ship agents/prototype-gate.md');
});

test('phase-25 baseline: <prototyping> block round-trip is covered by gdd-state-prototyping.test.ts', () => {
  // The deeper round-trip / extra_attrs coverage lives in this sister test
  // file — assert it is present so phase-25 has a reachable byte-loss
  // regression guard from the baseline.
  const target = path.join(REPO_ROOT, 'tests', 'gdd-state-prototyping.test.ts');
  assert.ok(fs.existsSync(target), 'tests/gdd-state-prototyping.test.ts must exist (Plan 25-01 acceptance)');
});

test('phase-25 baseline: sketch-wrap-up writes both D-XX and <sketch …/>', () => {
  const skill = fs.readFileSync(
    path.join(REPO_ROOT, 'skills', 'sketch-wrap-up', 'SKILL.md'),
    'utf8',
  );
  assert.match(
    skill,
    /D-XX/,
    'sketch-wrap-up must document the D-XX decision write',
  );
  // Note: the SKILL.md uses `<slug>` and `<cycle>` as literal placeholder
  // tokens, so the attribute span contains `<`/`>` characters and we cannot
  // use `[^>]*` here. Anchor on the meaningful tokens instead.
  assert.match(
    skill,
    /<sketch slug=.*decision="D-XX".*status="resolved"\/>/,
    'sketch-wrap-up must document the <sketch …/> dual-write line',
  );
});

test('phase-25 baseline: spike-wrap-up writes both D-XX and <spike …/>', () => {
  const skill = fs.readFileSync(
    path.join(REPO_ROOT, 'skills', 'spike-wrap-up', 'SKILL.md'),
    'utf8',
  );
  assert.match(
    skill,
    /D-XX/,
    'spike-wrap-up must document the D-XX decision write',
  );
  // Same placeholder-`<>`-in-attribute caveat as the sketch-wrap-up test:
  // the SKILL.md uses `<slug>` literally, so `[^>]*` does not work.
  assert.match(
    skill,
    /<spike slug=.*verdict=.*status="resolved"\/>/,
    'spike-wrap-up must document the <spike …/> dual-write line',
  );
});

test('phase-25 baseline: decision-injector hook references <prototyping>', () => {
  const hook = fs.readFileSync(
    path.join(REPO_ROOT, 'hooks', 'gdd-decision-injector.js'),
    'utf8',
  );
  assert.match(
    hook,
    /<prototyping>/,
    'gdd-decision-injector.js must reference the <prototyping> block (Plan 25-06)',
  );
});

// --- Sub-feature 2: S/M/L/XL complexity (Plan 25-02) -------------------

test('phase-25 baseline: router SKILL.md emits complexity_class with all four buckets', () => {
  const skill = fs.readFileSync(
    path.join(REPO_ROOT, 'skills', 'router', 'SKILL.md'),
    'utf8',
  );
  assert.match(skill, /complexity_class/, 'router must document complexity_class');
  for (const bucket of ['`S`', '`M`', '`L`', '`XL`']) {
    assert.ok(skill.includes(bucket), `router heuristic table must reference ${bucket}`);
  }
});

// --- Sub-feature 3: Quality gate Stage 4.5 (Plans 25-03, 25-07) --------

test('phase-25 baseline: skills/quality-gate/SKILL.md exists', () => {
  const target = path.join(REPO_ROOT, 'skills', 'quality-gate', 'SKILL.md');
  assert.ok(fs.existsSync(target), 'Plan 25-03 must ship skills/quality-gate/SKILL.md');
});

test('phase-25 baseline: agents/quality-gate-runner.md exists', () => {
  const target = path.join(REPO_ROOT, 'agents', 'quality-gate-runner.md');
  assert.ok(fs.existsSync(target), 'Plan 25-03 must ship agents/quality-gate-runner.md');
});

test('phase-25 baseline: scripts/lib/quality-gate-detect.cjs exposes the detection chain', () => {
  // Plan 25-09 promoted the doc-only auto-detect logic into a testable
  // module. The phase-25 baseline asserts the module is present and
  // exposes detect() — the module is the executable encoding of D-06.
  const mod = require(path.join(REPO_ROOT, 'scripts', 'lib', 'quality-gate-detect.cjs'));
  assert.equal(typeof mod.detect, 'function', 'quality-gate-detect.cjs must export detect()');
});

test('phase-25 baseline: verify SKILL.md documents the Step 2.5 quality-gate entry-gate', () => {
  // Plan 25-07 deviation: the gateForVerifyEntry pure-function helper was
  // NOT added to scripts/lib/gdd-state/gates.ts (executor honored the
  // tighter scope per orchestrator instruction). The verify-entry-refuses-
  // on-fail acceptance is therefore asserted at the SKILL.md content
  // level — same pattern as phase-24-baseline asserting on install.cjs
  // content. See Plan 25-09 commit message for the choice rationale.
  const skill = fs.readFileSync(
    path.join(REPO_ROOT, 'skills', 'verify', 'SKILL.md'),
    'utf8',
  );
  assert.match(skill, /Step 2\.5/, 'verify SKILL must document the Step 2.5 quality-gate gate');
  assert.match(
    skill,
    /quality_gate/,
    'verify SKILL must reference state.quality_gate at the entry gate',
  );
  assert.match(
    skill,
    /(refuse|refuses|refuse to advance)/i,
    'verify SKILL must document refusal on quality_gate.status === "fail"',
  );
});

test('phase-25 baseline: quality-gate SKILL emits all six events.jsonl lifecycle names', () => {
  const skill = fs.readFileSync(
    path.join(REPO_ROOT, 'skills', 'quality-gate', 'SKILL.md'),
    'utf8',
  );
  for (const event of [
    'quality_gate_started',
    'quality_gate_iteration',
    'quality_gate_pass',
    'quality_gate_fail',
    'quality_gate_timeout',
    'quality_gate_skipped',
  ]) {
    assert.ok(
      skill.includes(event),
      `quality-gate SKILL must list the ${event} lifecycle event (D-09)`,
    );
  }
});

// --- Sub-feature 4: Turn closeout Stop hook (Plans 25-04, 25-08) -------

test('phase-25 baseline: hooks/gdd-turn-closeout.js exists', () => {
  const target = path.join(REPO_ROOT, 'hooks', 'gdd-turn-closeout.js');
  assert.ok(fs.existsSync(target), 'Plan 25-04 must ship hooks/gdd-turn-closeout.js');
});

test('phase-25 baseline: skills/turn-closeout/SKILL.md exists (portable mirror)', () => {
  const target = path.join(REPO_ROOT, 'skills', 'turn-closeout', 'SKILL.md');
  assert.ok(fs.existsSync(target), 'Plan 25-04 must ship skills/turn-closeout/SKILL.md');
});

test('phase-25 baseline: hooks/hooks.json Stop entry points at gdd-turn-closeout.js', () => {
  const hooks = JSON.parse(
    fs.readFileSync(path.join(REPO_ROOT, 'hooks', 'hooks.json'), 'utf8'),
  );
  assert.ok(hooks.hooks.Stop, 'hooks.json must have a Stop event registered (Plan 25-08)');
  assert.ok(Array.isArray(hooks.hooks.Stop), 'hooks.Stop must be an array');
  const flat = JSON.stringify(hooks.hooks.Stop);
  assert.match(
    flat,
    /gdd-turn-closeout\.js/,
    'hooks.json Stop entry must invoke gdd-turn-closeout.js',
  );
});
