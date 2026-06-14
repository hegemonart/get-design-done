'use strict';
// Phase 41 — hone-detect regression baseline. Freezes v1.41.0: the CLI + engine + 11 rules + the
// golden findings on the positive fixture + the 6-manifest lockstep. v1.41.0 is the first MINOR since
// the Phase 39.5 lint-changelog floor (1.39.0), so the [1.41.0] entry MUST carry a Breaking-changes
// section. Version-AGNOSTIC. Every test tagged `41-03:`.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const REPO_ROOT = path.resolve(__dirname, '../..');
const BASELINE_DIR = path.join(REPO_ROOT, 'test', 'fixtures', 'baselines', 'phase-41');
const read = (rel) => fs.readFileSync(path.join(REPO_ROOT, rel), 'utf8');
const readJsonRel = (rel) => JSON.parse(read(rel));
const readBaseline = (name) => fs.readFileSync(path.join(BASELINE_DIR, name), 'utf8');

const engine = require(path.join(REPO_ROOT, 'scripts/lib/detect/engine.cjs'));
const { lintChangelog } = require(path.join(REPO_ROOT, 'scripts/lint-changelog.cjs'));

test('41-03: all deliverables exist', () => {
  for (const f of [
    'bin/hone-detect',
    'scripts/lib/detect/engine.cjs',
    'scripts/lib/detect/cli.cjs',
    'scripts/lib/detect/rule-schema.json',
    'scripts/lib/detect/rules/index.cjs',
    'scripts/sync-rule-catalogue.cjs',
    'scripts/hooks/pre-commit-detect.sh',
  ]) {
    assert.ok(fs.existsSync(path.join(REPO_ROOT, f)), `${f} exists`);
  }
  // package.json wiring
  const pkg = readJsonRel('package.json');
  assert.equal(pkg.bin['hone-detect'], './bin/hone-detect', 'bin entry');
  assert.ok(pkg.scripts['lint:design'], 'lint:design script');
});

test('41-03: golden findings on the positive fixture (normalized)', () => {
  const res = engine.run(path.join(REPO_ROOT, 'test/fixtures/detect/positive'), { cwd: REPO_ROOT });
  const norm = res.findings.map((f) => ({ ruleId: f.ruleId, file: f.file, line: f.line, column: f.column, match: f.match }));
  const golden = JSON.parse(readBaseline('detect-golden.json'));
  assert.deepEqual(norm, golden, 'hone-detect output drifted from the golden; regenerate phase-41/detect-golden.json if intentional');
});

test('41-03: 6-manifest version lockstep', () => {
  const pkg = readJsonRel('package.json').version;
  assert.match(pkg, /^\d+\.\d+\.\d+$/, 'semver');
  for (const f of ['.claude-plugin/plugin.json', '.cursor-plugin/plugin.json', '.codex-plugin/plugin.json']) {
    assert.equal(readJsonRel(f).version, pkg, `${f}`);
  }
  const mp = readJsonRel('.claude-plugin/marketplace.json');
  assert.equal(mp.metadata.version, pkg, 'marketplace metadata.version');
  assert.equal(mp.plugins[0].version, pkg, 'marketplace plugins[0].version');
  const lock = readJsonRel('package-lock.json');
  assert.equal(lock.version, pkg, 'package-lock root');
  if (lock.packages && lock.packages['']) assert.equal(lock.packages[''].version, pkg, 'package-lock packages.""');
});

test('41-03: phase-41/manifests-version.txt == live + CHANGELOG [1.41.0] WITH a Breaking-changes section', () => {
  assert.equal(readBaseline('manifests-version.txt').replace(/\s+$/, ''), readJsonRel('package.json').version, 'manifests-version == live');
  const cl = read('CHANGELOG.md');
  assert.match(cl, /## \[1\.41\.0\]/, 'CHANGELOG [1.41.0]');
  const lint = lintChangelog(cl);
  assert.equal(lint.ok, true, `lint-changelog must pass for the 1.41.0 minor: ${JSON.stringify(lint.violations)}`);
});
