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

const agentFiles = fs.readdirSync(AGENTS_DIR)
  .filter(f => f.startsWith('design-') && f.endsWith('.md'))
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
