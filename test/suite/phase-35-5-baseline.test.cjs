'use strict';
// Phase 35.5 — Design-Artifact Export (/gdd:export) regression baseline. Freezes the
// v1.35.5 artifact: the pure build-html assembler, the export skill, the Notion write-path
// connection, the registered format contract, and the 6-manifest lockstep. Also freezes a
// build-html GOLDEN (stored input → stored HTML) so any format drift is caught. Version-
// AGNOSTIC. Hermetic: file reads + the pure assembler only. Every test tagged `35.5-02:`.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const REPO_ROOT = path.resolve(__dirname, '../..');
const BASELINE_DIR = path.join(REPO_ROOT, 'test', 'fixtures', 'baselines', 'phase-35-5');
const read = (rel) => fs.readFileSync(path.join(REPO_ROOT, rel), 'utf8');
const readJsonRel = (rel) => JSON.parse(read(rel));
const readBaseline = (name) => fs.readFileSync(path.join(BASELINE_DIR, name), 'utf8');
const lf = (s) => s.replace(/\r\n/g, '\n'); // CRLF-tolerant compare

const { buildHtml } = require(path.resolve(REPO_ROOT, 'scripts/lib/export/build-html.cjs'));

test('35.5-02: export deliverables exist + export-formats registered', () => {
  assert.ok(read('scripts/lib/export/build-html.cjs').includes('module.exports'), 'build-html.cjs');
  assert.ok(read('skills/export/SKILL.md').length > 600, 'skills/export/SKILL.md');
  assert.ok(read('connections/notion.md').length > 400, 'connections/notion.md');
  assert.ok(read('reference/export-formats.md').length > 400, 'reference/export-formats.md');
  assert.ok(JSON.stringify(readJsonRel('reference/registry.json')).includes('export-formats'), 'export-formats registered');
});

test('35.5-02: notion connection is MCP-based + redacts + kill-switch + degrades', () => {
  const n = read('connections/notion.md');
  assert.match(n, /mcp__notion/, 'Notion MCP');
  assert.match(n, /redact/i, 'redacts outbound');
  assert.match(n, /GDD_DISABLE_NOTION/, 'kill-switch');
  assert.match(n, /degrade/i, 'degrade-to-HTML');
});

test('35.5-02: connections.md gains the Notion row + intro 19 (export-only, no matrix column)', () => {
  const c = read('connections/connections.md');
  // count-agnostic: the onboarded count grows with later phases — freeze the Notion row + that
  // the intro still advertises probing all N connections, not the specific number.
  assert.match(c, /probes all \d+ connections/, 'intro probes all N connections');
  assert.match(c, /\| Notion \| Active \|/, 'Notion Active-table row');
});

test('35.5-02: build-html GOLDEN — stored input renders to the frozen self-contained HTML', () => {
  const input = JSON.parse(readBaseline('build-html-input.json'));
  const golden = lf(readBaseline('build-html-golden.html'));
  assert.equal(lf(buildHtml(input)), golden, 'build-html output drifted from the frozen golden — re-lock if intentional');
  // The frozen golden must itself be self-contained.
  assert.doesNotMatch(golden, /<link\b|<script\b|\bsrc\s*=\s*["']?https?:/i, 'golden has no external resource refs');
  assert.match(golden, /src="data:image/, 'golden embeds the image as base64');
});

test('35.5-02: 6-manifest version lockstep', () => {
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

test('35.5-02: phase-35-5/manifests-version.txt == live + CHANGELOG [1.35.5]', () => {
  assert.equal(readBaseline('manifests-version.txt').replace(/\s+$/, ''), readJsonRel('package.json').version, 'manifests-version == live');
  assert.match(read('CHANGELOG.md'), /## \[1\.35\.5\]/, 'CHANGELOG [1.35.5]');
});
