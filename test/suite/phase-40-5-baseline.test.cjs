'use strict';
// Phase 40.5 — GDD CLI Localization regression baseline. The FINAL phase of the 38.5→40.5 sequence.
// Freezes the v1.40.5 artifact: the i18n resolver, the 7 message tables, the /gdd:locale skill, the
// cli-localization contract, and the 6-manifest lockstep. Version-AGNOSTIC. Every test `40.5-03:`.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const REPO_ROOT = path.resolve(__dirname, '../..');
const BASELINE_DIR = path.join(REPO_ROOT, 'test', 'fixtures', 'baselines', 'phase-40-5');
const read = (rel) => fs.readFileSync(path.join(REPO_ROOT, rel), 'utf8');
const readJsonRel = (rel) => JSON.parse(read(rel));
const readBaseline = (name) => fs.readFileSync(path.join(BASELINE_DIR, name), 'utf8');

const i18n = require(path.resolve(REPO_ROOT, 'scripts/lib/i18n/index.cjs'));

test('40.5-03: all deliverables exist', () => {
  const files = [
    'scripts/lib/i18n/index.cjs',
    'reference/cli-localization.md',
    'skills/locale/SKILL.md',
  ];
  for (const loc of i18n.KNOWN_LOCALES) files.push(`scripts/lib/i18n/messages/${loc}.json`);
  for (const f of files) assert.ok(fs.existsSync(path.join(REPO_ROOT, f)), `${f} exists`);
});

test('40.5-03: resolver works end-to-end + cli-localization registered', () => {
  const tables = {};
  for (const loc of i18n.KNOWN_LOCALES) tables[loc] = i18n.loadTable(loc);
  assert.equal(i18n.resolveLocale({ configLocale: 'ru' }), 'ru');
  assert.match(i18n.translate(tables, 'help.usage', 'ru'), /gdd/, 'ru help.usage translated');
  assert.match(i18n.translate(tables, 'error.no_state', 'de'), /STATE/, 'de falls back to en');
  assert.ok(JSON.stringify(readJsonRel('reference/registry.json')).includes('reference/cli-localization.md'), 'registered');
});

test('40.5-03: 6-manifest version lockstep', () => {
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

test('40.5-03: phase-40-5/manifests-version.txt == live + CHANGELOG [1.40.5]', () => {
  assert.equal(readBaseline('manifests-version.txt').replace(/\s+$/, ''), readJsonRel('package.json').version, 'manifests-version == live');
  assert.match(read('CHANGELOG.md'), /## \[1\.40\.5\]/, 'CHANGELOG [1.40.5]');
});
