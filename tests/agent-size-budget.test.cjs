'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { REPO_ROOT, readFrontmatter, countLines } = require('./helpers.cjs');

const AGENTS_DIR = path.join(REPO_ROOT, 'agents');

const TIER_LIMITS = {
  XXL: 700,
  XL: 500,
  LARGE: 350,
  M: 300,      // Phase 13.2 Worker tier (CONTEXT D-05) — network+classify agents; 200-270 target body + frontmatter
  DEFAULT: 250,
  S: 150,  // Phase 10.1 Haiku gate agents — tight cap enforces lean diff-scanners
};

const agentFiles = fs.readdirSync(AGENTS_DIR)
  .filter(f => f.startsWith('design-') && f.endsWith('.md'))
  .sort();

for (const agentFile of agentFiles) {
  const filePath = path.join(AGENTS_DIR, agentFile);

  test(`agent-size-budget: ${agentFile} within line-count budget`, () => {
    const fm = readFrontmatter(filePath);
    const tier = (fm.size_budget || 'DEFAULT').toUpperCase();
    const limit = TIER_LIMITS[tier];

    assert.ok(
      limit !== undefined,
      `agents/${agentFile}: unknown size_budget tier "${tier}". Valid values: XXL, XL, LARGE, DEFAULT`
    );

    const lineCount = countLines(filePath);
    assert.ok(
      lineCount <= limit,
      `agents/${agentFile}: ${lineCount} lines exceeds ${tier} budget of ${limit} lines.\n` +
      `To raise: add size_budget: XL (or XXL for >500) to frontmatter AND include rationale in the PR description.`
    );
  });
}
