'use strict';
// Phase 42 C2 (COMPILE-08) — regression baseline: a synthetic fixture skill compiled across all 14
// harnesses, pinned byte-for-byte. Recompiling must reproduce the committed goldens exactly.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const { compile } = require('../../scripts/lib/build/factory.cjs');
const { CONFIGS } = require('../../scripts/lib/build/harness-configs.cjs');

const ROOT = path.resolve(__dirname, '..', '..');
const FIXTURE = path.join(ROOT, 'test', 'fixtures', 'phase-42', 'source-skill', 'SKILL.md');
const GOLDEN_DIR = path.join(ROOT, 'test', 'fixtures', 'baselines', 'phase-42');

test('42-baseline-00: a golden exists for every manifest harness', () => {
  const goldens = fs.readdirSync(GOLDEN_DIR).filter((f) => f.endsWith('.md')).map((f) => f.replace(/\.md$/, '')).sort();
  assert.deepEqual(goldens, CONFIGS.map((c) => c.id).sort());
});

for (const cfg of CONFIGS) {
  test(`42-baseline[${cfg.id}]: compile matches the committed golden byte-for-byte`, () => {
    const src = fs.readFileSync(FIXTURE, 'utf8');
    const got = compile(src, cfg);
    const golden = fs.readFileSync(path.join(GOLDEN_DIR, `${cfg.id}.md`), 'utf8');
    assert.equal(got, golden, `golden drift for ${cfg.id} — regenerate test/fixtures/baselines/phase-42/${cfg.id}.md`);
  });
}

test('42-baseline-fences: claude keeps the harness-only block; gemini strips it', () => {
  const c = fs.readFileSync(path.join(GOLDEN_DIR, 'claude.md'), 'utf8');
  const g = fs.readFileSync(path.join(GOLDEN_DIR, 'gemini.md'), 'utf8');
  assert.match(c, /ships only to the Claude and Codex bundles/);
  assert.equal(/ships only to the Claude and Codex bundles/.test(g), false);
  // escape survives in every bundle
  assert.match(c, /\{\{command_prefix\}\}/);
});
