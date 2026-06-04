'use strict';
// Phase 35.2 — Notification Backplane regression baseline (Slack + Discord). Freezes the
// v1.35.2 release artifact: the 2 connection specs, the redacting dispatcher, the routing
// reference (registered), the notify matrix column, and the 6-manifest lockstep. Version-
// AGNOSTIC (== live). Hermetic: file reads only. Every test tagged `35.2-02:`.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const REPO_ROOT = path.resolve(__dirname, '../..');
const BASELINE_DIR = path.join(REPO_ROOT, 'test', 'fixtures', 'baselines', 'phase-35-2');
const read = (rel) => fs.readFileSync(path.join(REPO_ROOT, rel), 'utf8');
const readJsonRel = (rel) => JSON.parse(read(rel));
const readBaseline = (name) => fs.readFileSync(path.join(BASELINE_DIR, name), 'utf8');

test('35.2-02: slack + discord connection specs + dispatcher + routing reference exist', () => {
  assert.ok(read('connections/slack.md').length > 600, 'connections/slack.md');
  assert.ok(read('connections/discord.md').length > 600, 'connections/discord.md');
  assert.ok(read('scripts/lib/notify/dispatch.cjs').length > 400, 'scripts/lib/notify/dispatch.cjs');
  assert.ok(read('reference/notification-routing.md').length > 600, 'reference/notification-routing.md');
  assert.ok(JSON.stringify(readJsonRel('reference/registry.json')).includes('notification-routing'), 'notification-routing registered');
});

test('35.2-02: dispatcher redacts + injectable fetch + allowlisted egress', () => {
  const d = read('scripts/lib/notify/dispatch.cjs');
  assert.match(d, /redact/, 'dispatcher redacts');
  assert.match(d, /fetchImpl/, 'injectable fetchImpl');
  assert.match(read('scripts/security/outbound-allowlist.json'), /scripts\/lib\/notify/, 'notify allowlisted under the 33.5 gate');
});

test('35.2-02: connections.md gains the notify column + slack/discord rows (14 -> 16)', () => {
  const c = read('connections/connections.md');
  // Stage names: scan/discover were later renamed to brief/explore; ticket-sync column added by 35.3.
  // Freeze: notify column present + matrix uses the post-rename brief/explore stage names.
  assert.match(c, /\| Connection \| brief \| explore \| plan \| design \| verify \| canvas \| generator \| notify \|/, 'matrix has a notify column');
  // the onboarded COUNT grows with later phases (35.3 → 18); freeze the 35.2 rows + the
  // notify column, not the count.
  assert.match(c, /\| Slack \| Active \|/, 'Slack active row');
  assert.match(c, /\| Discord \| Active \|/, 'Discord active row');
});

test('35.2-02: 6-manifest version lockstep', () => {
  const pkg = readJsonRel('package.json').version;
  assert.match(pkg, /^\d+\.\d+\.\d+$/, 'semver');
  for (const f of ['.claude-plugin/plugin.json', '.cursor-plugin/plugin.json', '.codex-plugin/plugin.json']) {
    assert.equal(readJsonRel(f).version, pkg, `${f} != package.json`);
  }
  const mp = readJsonRel('.claude-plugin/marketplace.json');
  assert.equal(mp.metadata.version, pkg, 'marketplace metadata.version');
  assert.equal(mp.plugins[0].version, pkg, 'marketplace plugins[0].version');
  const lock = readJsonRel('package-lock.json');
  assert.equal(lock.version, pkg, 'package-lock root');
  if (lock.packages && lock.packages['']) assert.equal(lock.packages[''].version, pkg, 'package-lock packages.""');
});

test('35.2-02: phase-35-2/manifests-version.txt == live + CHANGELOG [1.35.2]', () => {
  const baseline = readBaseline('manifests-version.txt').replace(/\s+$/, '');
  assert.equal(baseline, readJsonRel('package.json').version, 'manifests-version == live');
  assert.match(read('CHANGELOG.md'), /## \[1\.35\.2\]/, 'CHANGELOG [1.35.2]');
});
