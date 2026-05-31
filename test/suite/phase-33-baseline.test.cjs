'use strict';

// Phase 33 — Skill Behavior Tests (Pressure-Scenario Harness) regression baseline.
//
// Locks the union of the Wave A–C deliverable as a single release artifact so
// future drift cannot silently regress the v1.33.0 contract. Asserts:
//   1. 4-manifest version lockstep (package + claude plugin + cursor + codex),
//      VERSION-AGNOSTIC (reads package.json#version, asserts the other 3 equal it).
//   2. marketplace Tier-2 lockstep (metadata.version + plugins[0].version == package).
//   3. CHANGELOG has a [1.33.0] block at the top.
//   4. phase-33/manifests-version.txt baseline = the live package version (1.33.0).
//   5. skill-behavior harness artifacts present (runner + stub-invoker + telemetry,
//      the scenario schema, the 8 scenarios + 8 RED baselines, the A/B scenario +
//      docs/research/description-format-ab.md).
//   6. release hygiene: NOTICE writing-skills (MIT) additive block present (prior
//      attributions intact); package.json has test:behavior + the default test is
//      unchanged; CONTRIBUTING + README docs present.
//
// Version-agnostic where possible (Phase 28 D-08 lesson) — mirrors
// test/suite/phase-32-baseline.test.cjs. All tests carry the `33-06:` tag.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const REPO_ROOT = path.resolve(__dirname, '../..');
const BASELINE_DIR = path.join(REPO_ROOT, 'test/fixtures/baselines/phase-33');

function read(rel) {
  return fs.readFileSync(path.join(REPO_ROOT, rel), 'utf8');
}
function readJsonRel(rel) {
  return JSON.parse(read(rel));
}
function readBaseline(name) {
  return fs.readFileSync(path.join(BASELINE_DIR, name), 'utf8');
}
function exists(rel) {
  return fs.existsSync(path.join(REPO_ROOT, rel));
}

// ── 1. manifest lockstep (version-agnostic) ────────────────────────────────────

test('33-06: 4-manifest version lockstep (package + claude plugin + cursor plugin + codex plugin equal)', () => {
  const pkgVersion = readJsonRel('package.json').version;
  assert.match(pkgVersion, /^\d+\.\d+\.\d+$/, 'package.json version looks like semver');
  for (const f of ['.claude-plugin/plugin.json', '.cursor-plugin/plugin.json', '.codex-plugin/plugin.json']) {
    assert.equal(readJsonRel(f).version, pkgVersion, `${f} version != package.json version`);
  }
});

// ── 2. marketplace Tier-2 lockstep ─────────────────────────────────────────────

test('33-06: marketplace.json Tier-2 lockstep (metadata.version + plugins[0].version equal package version)', () => {
  const pkgVersion = readJsonRel('package.json').version;
  const mp = readJsonRel('.claude-plugin/marketplace.json');
  assert.equal(mp.metadata.version, pkgVersion, 'marketplace metadata.version != package version');
  assert.ok(mp.plugins && mp.plugins[0], 'marketplace plugins[0] exists');
  assert.equal(mp.plugins[0].version, pkgVersion, 'marketplace plugins[0].version != package version');
});

// ── 3. CHANGELOG ────────────────────────────────────────────────────────────────

test('33-06: CHANGELOG carries the [1.33.0] block + BREAKING shim-removal note (top-most heading is the live release)', () => {
  const cl = read('CHANGELOG.md');
  // The Phase-33 [1.33.0] block must remain in the CHANGELOG (this phase's history).
  assert.match(cl, /## \[1\.33\.0\]/, 'CHANGELOG must retain the ## [1.33.0] entry (D-01)');
  // The top-most release heading tracks the LIVE version (version-agnostic — a
  // later decimal release on the 1.33.x arc, e.g. 1.33.5, legitimately sits above
  // [1.33.0]; matches the phase-32 idiom so closeout bumps don't break this test).
  const live = readJsonRel('package.json').version;
  const firstHeading = cl.match(/^## \[(\d+\.\d+\.\d+)\]/m);
  assert.ok(firstHeading, 'CHANGELOG has at least one release heading');
  assert.equal(firstHeading[1], live, `the top-most release heading must be [${live}] (the live version)`);
  // The BREAKING shim-removal migration note must be present (Phase-33 [1.33.0] body).
  assert.match(cl, /import from `sdk\/…` instead|import from sdk\/\.\.\. instead|sdk\/…` instead/,
    'CHANGELOG [1.33.0] must carry the BREAKING shim-removal migration note (import from sdk/ instead)');
});

// ── 4. phase-33 manifests-version baseline = live version ───────────────────────

test('33-06: phase-33/manifests-version.txt baseline matches the live package version (D-09 forward-prop)', () => {
  // Version-agnostic (phase-32 idiom): the phase-33 baseline is a D-09 forward-prop
  // target, so a later decimal release (1.33.5) advances it in lockstep with live.
  const baseline = readBaseline('manifests-version.txt').replace(/\s+$/, '');
  const live = readJsonRel('package.json').version;
  assert.equal(baseline, live, `phase-33 manifests-version.txt (${baseline}) != package.json version (${live})`);
});

// ── 5. skill-behavior harness artifacts present ─────────────────────────────────

test('33-06: skill-behavior runner + stub-invoker + telemetry modules are present', () => {
  for (const f of [
    'scripts/lib/skill-behavior/runner.cjs',
    'scripts/lib/skill-behavior/stub-invoker.cjs',
    'scripts/lib/skill-behavior/telemetry.cjs',
  ]) {
    assert.ok(exists(f), `${f} must exist (Phase 33 harness — D-05)`);
  }
  // The runner exports its core contract (loadable + the documented surface).
  const runner = require(path.join(REPO_ROOT, 'scripts/lib/skill-behavior/runner.cjs'));
  assert.equal(typeof runner.runScenario, 'function', 'runner must export runScenario');
  assert.equal(typeof runner.loadManifest, 'function', 'runner must export loadManifest');
});

test('33-06: pressure-scenario schema + the 8 scenarios + 8 RED baselines are present', () => {
  assert.ok(
    exists('reference/schemas/pressure-scenario.schema.json'),
    'reference/schemas/pressure-scenario.schema.json must exist (D-05)',
  );

  // The 8 covered skills: 7 stage skills + using-gdd.
  const SCENARIO_SKILLS = ['brief', 'explore', 'plan', 'design', 'verify', 'discuss', 'audit', 'using-gdd'];
  for (const s of SCENARIO_SKILLS) {
    assert.ok(
      exists(`test/suite/skill-behavior/scenarios/${s}.json`),
      `test/suite/skill-behavior/scenarios/${s}.json must exist`,
    );
    assert.ok(
      exists(`test/fixtures/skill-behavior-baseline/${s}.md`),
      `test/fixtures/skill-behavior-baseline/${s}.md (synthetic RED baseline) must exist`,
    );
  }

  // At least 8 scenario manifests on disk (8 base; the A/B variant is extra).
  const scenarioDir = path.join(REPO_ROOT, 'test/suite/skill-behavior/scenarios');
  const manifests = fs.readdirSync(scenarioDir).filter((f) => f.endsWith('.json'));
  assert.ok(manifests.length >= 8, `expected >= 8 scenario manifests, found ${manifests.length}`);
});

test('33-06: description-format A/B scenario + evidence doc are present (D-08)', () => {
  assert.ok(
    exists('test/suite/skill-behavior/scenarios/using-gdd-ab.json'),
    'the description-format A/B scenario manifest must exist',
  );
  assert.ok(
    exists('docs/research/description-format-ab.md'),
    'docs/research/description-format-ab.md (A/B evidence harness) must exist (D-05)',
  );
  const ab = read('docs/research/description-format-ab.md');
  assert.match(ab, /pending keyed run|pending: keyed run/i, 'A/B doc must carry the pending-keyed-run marker (D-02)');
});

// ── 6. release hygiene: NOTICE / test:behavior / docs ───────────────────────────

test('33-06: NOTICE has the additive writing-skills (MIT) block + prior attributions intact', () => {
  const notice = read('NOTICE');
  assert.match(notice, /writing-skills/, 'NOTICE must attribute obra/superpowers/skills/writing-skills (Phase 33)');
  // Prior attributions preserved (additive-only).
  assert.match(notice, /cc-multi-cli/, 'NOTICE must keep the Phase-27 cc-multi-cli (Apache-2.0) block');
  assert.match(notice, /mattpocock\/skills/, 'NOTICE must keep the Phase-28.5 mattpocock/skills (MIT) block');
  assert.match(notice, /gsd-build\/get-shit-done/, 'NOTICE must keep the Phase-28.7 gsd-build (MIT) block');
  assert.match(notice, /obra\/superpowers/, 'NOTICE must keep the Phase-32 superpowers (MIT) block');
});

test('33-06: package.json has test:behavior (key-gated) and the default test is UNCHANGED (D-06)', () => {
  const pkg = readJsonRel('package.json');
  assert.equal(typeof pkg.scripts['test:behavior'], 'string', 'package.json must have a test:behavior script');
  assert.doesNotMatch(pkg.scripts.test, /test:behavior/, 'the default test must NOT run test:behavior (D-06)');
  // The default test stays the stub suite over test/suite/.
  assert.match(pkg.scripts.test, /--test\b/, 'default test runs node --test');
  assert.match(pkg.scripts.test, /test\/suite/, 'default test targets test/suite/');
  // scripts/mcp-servers/ must be gone from files[] (the 31.5 shim removal, D-04).
  assert.ok(!pkg.files.includes('scripts/mcp-servers/'), 'files[] must NOT list scripts/mcp-servers/ (shims removed, D-04)');
});

test('33-06: CONTRIBUTING pressure-scenario section + README skill-behavior subsection present', () => {
  assert.match(read('CONTRIBUTING.md'), /How to add a pressure scenario/i, 'CONTRIBUTING must have the pressure-scenario section');
  assert.match(read('README.md'), /Skill behavior tests/i, 'README must have the Skill behavior tests subsection');
});
