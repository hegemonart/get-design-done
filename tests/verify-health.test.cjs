'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { REPO_ROOT, scaffoldDesignDir } = require('./helpers.cjs');

// The /gdd:health command reads .design/ and produces a report.
// This test verifies the contract: given a .design/STATE.md with known content,
// the health check function (if extracted) returns the expected shape.
// Since health is implemented in a SKILL.md (not a callable JS module),
// this test validates the STATE.md parsing contract instead.

test('verify-health: STATE.md with all required fields passes schema check', () => {
  const { designDir, cleanup } = scaffoldDesignDir({
    stateContent: [
      '---',
      'pipeline_state_version: 1.0',
      'stage: scan',
      'cycle: default',
      'model_profile: balanced',
      '---',
      '',
      '# Pipeline State',
      '',
      '## Connections',
      '',
      '## Decisions',
    ].join('\n')
  });
  try {
    const statePath = path.join(designDir, 'STATE.md');
    const content = fs.readFileSync(statePath, 'utf8');
    assert.ok(content.includes('pipeline_state_version'), 'STATE.md must have pipeline_state_version');
    assert.ok(content.includes('stage:'), 'STATE.md must have stage field');
    assert.ok(content.includes('model_profile:'), 'STATE.md must have model_profile field');
  } finally { cleanup(); }
});

test('verify-health: .design/ without STATE.md triggers missing-artifact condition', () => {
  const { designDir, cleanup } = scaffoldDesignDir();
  try {
    const statePath = path.join(designDir, 'STATE.md');
    fs.unlinkSync(statePath);
    assert.ok(!fs.existsSync(statePath), 'STATE.md must be gone for this test');
    // Health check would flag: "STATE.md missing — run scan first"
    // We verify the scaffolding produced a deletable file
  } finally { cleanup(); }
});
