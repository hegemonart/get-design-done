'use strict';
// Phase 42 C1 (COMPILE-07) — per-harness compile smoke + frontmatter-on-compiled-output.
// Each harness compiles independently so a failure isolates to one harness id.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const { compileAll } = require('../../scripts/build-skills.cjs');
const { CONFIGS } = require('../../scripts/lib/build/harness-configs.cjs');

function parseFrontmatter(text) {
  if (!text.startsWith('---')) return null;
  const end = text.indexOf('\n---', 3);
  if (end === -1) return null;
  return text.slice(3, end);
}

for (const cfg of CONFIGS) {
  test(`42-ci-smoke[${cfg.id}]: compiles all 115 skills with no unresolved placeholders`, () => {
    const map = compileAll(cfg);
    assert.equal(map.size, 115, `${cfg.id}: expected 115 compiled files`);
    for (const [rel, text] of map) {
      assert.ok(text.length > 0, `${cfg.id}:${rel} empty`);
      assert.equal(
        /\{\{(command_prefix|model|config_file|ask_instruction)\}\}/.test(text),
        false,
        `${cfg.id}:${rel} has an unresolved placeholder`,
      );
    }
  });

  test(`42-ci-frontmatter[${cfg.id}]: every compiled SKILL.md keeps valid frontmatter`, () => {
    const map = compileAll(cfg);
    for (const [rel, text] of map) {
      if (path.basename(rel) !== 'SKILL.md') continue;
      const fm = parseFrontmatter(text);
      assert.ok(fm, `${cfg.id}:${rel} lost its frontmatter fence`);
      assert.match(fm, /\bname:/, `${cfg.id}:${rel} frontmatter missing name`);
      assert.match(fm, /\bdescription:/, `${cfg.id}:${rel} frontmatter missing description`);
    }
  });
}

test('42-ci-coverage: smoke covers all 14 manifest harnesses', () => {
  assert.equal(CONFIGS.length, 14);
});
