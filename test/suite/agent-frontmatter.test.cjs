'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { REPO_ROOT, readFrontmatter } = require('./helpers.ts');

const AGENTS_DIR = path.join(REPO_ROOT, 'agents');
const REQUIRED_FIELDS = ['name', 'description', 'tools', 'color'];
// Phase 7 additions — enable when Phase 7 ships:
// const PHASE7_FIELDS = ['parallel-safe', 'typical-duration-seconds', 'reads-only', 'writes'];

// Widened from `f.startsWith('design-')` — the original filter left 31 agents
// uncovered (a11y-mapper, motion-mapper, token-mapper, visual-hierarchy-mapper,
// component-taxonomy-mapper, all hone-* agents, quality-gate-runner,
// prototype-gate, both component-benchmark-* agents, all the *-executor
// agents, etc.). All agent files in agents/ share the same frontmatter
// contract; the prefix was an accident of when the test was authored.
const agentFiles = fs.readdirSync(AGENTS_DIR)
  .filter(f => f.endsWith('.md') && f !== 'README.md')
  .sort();

assert.ok(agentFiles.length > 0, 'No agent files found — check AGENTS_DIR path');

for (const agentFile of agentFiles) {
  const filePath = path.join(AGENTS_DIR, agentFile);

  test(`agent-frontmatter: ${agentFile} has all required fields`, () => {
    const fm = readFrontmatter(filePath);

    for (const field of REQUIRED_FIELDS) {
      assert.ok(
        field in fm && fm[field] !== '' && fm[field] !== null && fm[field] !== undefined,
        `agents/${agentFile}: required frontmatter field "${field}" is missing or empty`
      );
    }
  });

  test(`agent-frontmatter: ${agentFile} name matches filename`, () => {
    const fm = readFrontmatter(filePath);
    const expectedName = agentFile.replace('.md', '');
    assert.equal(
      fm.name,
      expectedName,
      `agents/${agentFile}: frontmatter "name" (${fm.name}) does not match filename (${expectedName})`
    );
  });
}
