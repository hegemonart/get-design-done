'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');

const { CONFIGS, byId, claude, buildConfigs } = require('../../scripts/lib/build/harness-configs.cjs');
const { readHarnesses } = require('../../scripts/lib/manifest/index.cjs');
const { PLACEHOLDERS } = require('../../scripts/lib/build/factory.cjs');

test('42-cfg-01: one config per manifest harness (14)', () => {
  const { harnesses } = readHarnesses();
  assert.equal(CONFIGS.length, harnesses.length);
  assert.equal(CONFIGS.length, 14);
  for (const h of harnesses) assert.ok(byId(h.id), `missing config for ${h.id}`);
});

test('42-cfg-02: claude command_prefix is exactly /hone: (round-trip anchor)', () => {
  assert.equal(claude().command_prefix, '/hone:');
  assert.equal(claude().bundleSlug, 'claude-code');
});

test('42-cfg-03: every config supplies all four placeholder values + a configDir + bundleSlug', () => {
  for (const c of CONFIGS) {
    for (const key of PLACEHOLDERS) {
      assert.equal(typeof c[key], 'string', `${c.id}.${key} must be a string`);
      assert.ok(c[key].length > 0, `${c.id}.${key} must be non-empty`);
    }
    assert.ok(c.configDir && c.configDir.startsWith('.'), `${c.id}.configDir must be a dotdir`);
    assert.ok(c.bundleSlug && c.bundleSlug.length > 0, `${c.id}.bundleSlug required`);
    assert.ok(Array.isArray(c.stripFrontmatter));
  }
});

test('42-cfg-04: bundleSlugs are unique', () => {
  const slugs = CONFIGS.map((c) => c.bundleSlug);
  assert.equal(new Set(slugs).size, slugs.length);
});

test('42-cfg-05: configDir matches the manifest config_dir', () => {
  const { harnesses } = readHarnesses();
  const byid = Object.fromEntries(harnesses.map((h) => [h.id, h.config_dir]));
  for (const c of CONFIGS) assert.equal(c.configDir, byid[c.id]);
});

test('42-cfg-06: buildConfigs is a pure re-derivation (stable shape)', () => {
  const a = buildConfigs();
  const b = buildConfigs();
  assert.deepEqual(a, b);
});

test('42-cfg-07: at least one non-claude harness has a distinct command_prefix', () => {
  const distinct = CONFIGS.filter((c) => c.id !== 'claude' && c.command_prefix !== '/hone:');
  assert.ok(distinct.length >= 1, 'expected >=1 harness with a non-/hone: prefix (codex)');
  assert.equal(byId('codex').command_prefix, '/hone-');
});
