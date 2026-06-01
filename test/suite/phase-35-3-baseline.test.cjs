'use strict';
// Phase 35.3 — Ticket Sync (Linear + Jira) regression baseline. FINAL sub-phase of the
// split Phase 35 — completing it completes the parent Phase 35 (Team Surfaces Layer).
// Freezes the v1.35.3 artifact: linear/jira connections + ticket-sync-agent + the contract
// reference (registered), the ticket-sync matrix column, the 6-manifest lockstep. Version-
// AGNOSTIC. Hermetic: file reads only. Every test tagged `35.3-02:`.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const REPO_ROOT = path.resolve(__dirname, '../..');
const BASELINE_DIR = path.join(REPO_ROOT, 'test', 'fixtures', 'baselines', 'phase-35-3');
const read = (rel) => fs.readFileSync(path.join(REPO_ROOT, rel), 'utf8');
const readJsonRel = (rel) => JSON.parse(read(rel));
const readBaseline = (name) => fs.readFileSync(path.join(BASELINE_DIR, name), 'utf8');

test('35.3-02: linear/jira connections + ticket-sync-agent + reference exist + registered', () => {
  assert.ok(read('connections/linear.md').length > 600, 'connections/linear.md');
  assert.ok(read('connections/jira.md').length > 600, 'connections/jira.md');
  assert.ok(read('agents/ticket-sync-agent.md').length > 800, 'agents/ticket-sync-agent.md');
  assert.ok(read('reference/ticket-sync.md').length > 600, 'reference/ticket-sync.md');
  assert.ok(JSON.stringify(readJsonRel('reference/registry.json')).includes('ticket-sync'), 'ticket-sync registered');
});

test('35.3-02: ticket-sync-agent is MCP-based + redacts', () => {
  const a = read('agents/ticket-sync-agent.md');
  assert.match(a, /mcp__linear/, 'Linear MCP');
  assert.match(a, /mcp__atlassian/, 'Atlassian MCP');
  assert.match(a, /redact/, 'redacts outbound');
});

test('35.3-02: connections.md gains the ticket-sync column + linear/jira rows (16 -> 18)', () => {
  const c = read('connections/connections.md');
  assert.match(c, /\| generator \| notify \| ticket-sync \|/, 'matrix has a ticket-sync column');
  // the onboarded COUNT grows with later phases; freeze the 35.3 ticket-sync column + rows.
  assert.match(c, /\| Linear \| Active \|/, 'Linear row');
  assert.match(c, /\| Jira \| Active \|/, 'Jira row');
});

test('35.3-02: 6-manifest version lockstep', () => {
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

test('35.3-02: phase-35-3/manifests-version.txt == live + CHANGELOG [1.35.3]', () => {
  assert.equal(readBaseline('manifests-version.txt').replace(/\s+$/, ''), readJsonRel('package.json').version, 'manifests-version == live');
  assert.match(read('CHANGELOG.md'), /## \[1\.35\.3\]/, 'CHANGELOG [1.35.3]');
});
