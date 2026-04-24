'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { REPO_ROOT } = require('./helpers.cjs');

const AGENTS_DIR = path.join(REPO_ROOT, 'agents');

const agentFiles = fs.readdirSync(AGENTS_DIR)
  .filter(f => f.endsWith('.md') && f !== 'README.md')
  .sort();

assert.ok(agentFiles.length > 0, 'No agent files found — check AGENTS_DIR path');

for (const agentFile of agentFiles) {
  test(`record-contract: ${agentFile} contains a Record section`, () => {
    const content = fs.readFileSync(path.join(AGENTS_DIR, agentFile), 'utf8');
    const hasRecord = content.includes('## Record') || content.includes('### Record');
    assert.ok(
      hasRecord,
      `agents/${agentFile}: missing "## Record" section — every agent must append` +
        ' one JSONL line to .design/intel/insights.jsonl at run-end.' +
        ' See reference/schemas/insight-line.schema.json and agents/README.md.'
    );
  });
}
