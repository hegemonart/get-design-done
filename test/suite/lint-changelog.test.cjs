'use strict';
// Phase 39.5 — lint-changelog.cjs unit test. Verifies the forward-only Breaking-changes gate:
// ≥floor minors must declare the section, historical minors are grandfathered, patches are ignored,
// and the REAL CHANGELOG passes. Every test tagged `39.5-03:`.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const REPO_ROOT = path.resolve(__dirname, '../..');
const MOD = path.resolve(REPO_ROOT, 'scripts/lint-changelog.cjs');
const { lintChangelog, FLOOR_MINOR } = require(MOD);

test('39.5-03: a ≥floor minor missing the section is a violation; with it passes', () => {
  const missing = '# Changelog\n\n## [1.40.0] - 2026-07-01\n\n### Added\n\n- stuff\n';
  const r1 = lintChangelog(missing);
  assert.equal(r1.ok, false);
  assert.equal(r1.checked, 1);
  assert.equal(r1.violations[0].version, '1.40.0');

  const present = '# Changelog\n\n## [1.40.0] - 2026-07-01\n\n### Breaking changes\n\nNone.\n\n### Added\n\n- stuff\n';
  const r2 = lintChangelog(present);
  assert.equal(r2.ok, true);
  assert.equal(r2.violations.length, 0);
});

test('39.5-03: historical minors below the floor are grandfathered', () => {
  const old = '# Changelog\n\n## [1.38.0] - 2026-06-01\n\n### Added\n\n- x\n\n## [1.20.0] - 2026-01-01\n\n### Added\n\n- y\n';
  const r = lintChangelog(old);
  assert.equal(r.ok, true, 'no violations for <floor minors');
  assert.equal(r.checked, 0);
  assert.equal(r.grandfathered, 2);
});

test('39.5-03: patch releases (x.y.z, z>0) are not minor bumps — never checked', () => {
  const patch = '# Changelog\n\n## [1.40.2] - 2026-07-02\n\n### Added\n\n- only a patch\n';
  const r = lintChangelog(patch);
  assert.equal(r.ok, true, 'patch not subject to the rule');
  assert.equal(r.checked, 0);
});

test('39.5-03: "## Breaking changes" (h2) also satisfies the gate', () => {
  const h2 = '# Changelog\n\n## [1.41.0] - 2026-08-01\n\n## Breaking changes\n\nNone.\n';
  assert.equal(lintChangelog(h2).ok, true);
});

test('39.5-03: the real CHANGELOG.md passes (floor 1.39.0)', () => {
  const md = fs.readFileSync(path.join(REPO_ROOT, 'CHANGELOG.md'), 'utf8');
  const r = lintChangelog(md);
  assert.equal(r.ok, true, `real CHANGELOG must pass; violations: ${JSON.stringify(r.violations)}`);
  assert.equal(FLOOR_MINOR, '1.39.0');
});

test('39.5-03: pure core — lintChangelog does no file IO', () => {
  // The module requires fs/path only inside main() (the CLI). The exported core is string→object.
  const r = lintChangelog('# Changelog\n');
  assert.deepEqual(r.violations, []);
  assert.equal(r.ok, true);
});
