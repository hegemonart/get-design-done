'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { REPO_ROOT } = require('./helpers.ts');

const AGENTS_DIR = path.join(REPO_ROOT, 'agents');

function extractRequiredReadingPaths(content) {
  const paths = [];
  const rrMatch = content.match(/##\s+Required Reading([\s\S]*?)(?=\n##|\n---|\n# |$)/);
  if (!rrMatch) return paths;

  const block = rrMatch[1];
  for (const line of block.split('\n')) {
    const m = line.match(/^\s*-\s+@?(\S+\.(?:md|json|js|cjs|sh))\s*(?:—.*)?$/);
    if (m) {
      paths.push(m[1].replace(/^\.\//, ''));
    }
  }
  return paths;
}

const agentFiles = fs.readdirSync(AGENTS_DIR)
  .filter(f => f.startsWith('design-') && f.endsWith('.md'))
  .sort();

for (const agentFile of agentFiles) {
  test(`required-reading-consistency: ${agentFile} — all referenced files exist`, () => {
    const content = fs.readFileSync(path.join(AGENTS_DIR, agentFile), 'utf8');
    const refs = extractRequiredReadingPaths(content);

    for (const ref of refs) {
      const resolved = path.join(REPO_ROOT, ref);
      assert.ok(
        fs.existsSync(resolved),
        `agents/${agentFile}: required_reading references "${ref}" which does not exist at ${resolved}`
      );
    }
  });
}
