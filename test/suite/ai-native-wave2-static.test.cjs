'use strict';
// Phase 37.1 — AI-Native Tools Wave 2 static contract. Verifies the 6 connection specs
// exist + are categorized + wired into the connections index + the shared component
// generator. Hermetic (D-05): file reads only, no live tool calls. Every test `37.1-03:`.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const REPO_ROOT = path.resolve(__dirname, '../..');
const read = (rel) => fs.readFileSync(path.join(REPO_ROOT, rel), 'utf8');
const WAVE2 = ['framer', 'penpot', 'webflow', 'v0-dev', 'plasmic', 'builder-io'];

test('37.1-03: all 6 Wave-2 connection specs exist with the standard sections', () => {
  for (const c of WAVE2) {
    const body = read(`connections/${c}.md`);
    assert.ok(body.length > 800, `${c}.md substantive`);
    assert.match(body, /^## Setup/m, `${c} Setup`);
    assert.match(body, /^## Probe Pattern/m, `${c} Probe Pattern`);
    assert.match(body, /^## Fallback Behavior/m, `${c} Fallback Behavior`);
  }
});

test('37.1-03: connections index — intro 27 + 6 Active rows + matrix categories', () => {
  const c = read('connections/connections.md');
  assert.match(c, /probes all 27 connections/, 'intro → 27');
  for (const [name] of [['Framer'], ['Penpot'], ['Webflow'], ['v0.dev'], ['Plasmic'], ['Builder.io']]) {
    assert.match(c, new RegExp(`\\| ${name.replace('.', '\\.')} \\| Active \\|`), `${name} Active row`);
  }
  // matrix categories: framer/penpot → canvas ✓; v0/builder-io → generator; plasmic → both
  assert.match(c, /\| Framer \| —[\s\S]*?canvas source[\s\S]*?\| ✓ \| — \| — \| — \|/, 'Framer canvas');
  assert.match(c, /\| v0\.dev \| —[\s\S]*?component-generator \(v0 impl\)[\s\S]*?\| — \| ✓ \| — \| — \|/, 'v0 generator');
  assert.match(c, /\| Plasmic \| —[\s\S]*?\| ✓ \| ✓ \| — \| — \|/, 'Plasmic dual canvas+generator');
});

test('37.1-03: component-generator has v0/plasmic/builder-io impls + Step-0 detection', () => {
  const g = read('agents/design-component-generator.md');
  for (const tool of ['v0', 'plasmic', 'builder-io']) {
    assert.match(g, new RegExp(`<!-- impl: ${tool} -->`), `impl section for ${tool}`);
    assert.match(g, new RegExp(`<!-- /impl: ${tool} -->`), `impl close for ${tool}`);
  }
  assert.match(g, /`v0-dev: available`/, 'Step-0 detects v0-dev');
  assert.match(g, /`plasmic: available`/, 'Step-0 detects plasmic');
  assert.match(g, /`builder-io: available`/, 'Step-0 detects builder-io');
  assert.match(g, /--tool 21st\|magic-patterns\|v0\|plasmic\|builder-io/, '--tool flag extended');
});

test('37.1-03: generators cross-link their connection specs (no inlined tool catalogue)', () => {
  const g = read('agents/design-component-generator.md');
  assert.match(g, /connections\/v0-dev\.md/, 'v0 impl cross-links its spec');
  assert.match(g, /connections\/plasmic\.md/, 'plasmic impl cross-links its spec');
  assert.match(g, /connections\/builder-io\.md/, 'builder-io impl cross-links its spec');
});
