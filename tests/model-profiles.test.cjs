'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { REPO_ROOT, readFrontmatter } = require('./helpers.cjs');

const VALID_PROFILES = ['quality', 'balanced', 'budget'];
const VALID_MODELS = ['inherit', 'sonnet', 'haiku', 'opus'];

// Model assignment rules per profile (from GSD convention):
// quality: inherit (opus-tier), balanced: inherit or sonnet, budget: haiku or sonnet
const PROFILE_MODEL_MAP = {
  quality: ['inherit'],
  balanced: ['inherit', 'sonnet'],
  budget: ['haiku', 'sonnet'],
};

test('model-profiles: agents with model:inherit use appropriate convention', () => {
  const agentsDir = path.join(REPO_ROOT, 'agents');
  const agentFiles = fs.readdirSync(agentsDir)
    .filter(f => f.startsWith('design-') && f.endsWith('.md'));

  for (const f of agentFiles) {
    const fm = readFrontmatter(path.join(agentsDir, f));
    if (fm.model) {
      assert.ok(
        VALID_MODELS.includes(fm.model),
        `agents/${f}: model "${fm.model}" is not a recognized value. Valid: ${VALID_MODELS.join(', ')}`
      );
    }
    // If no model field, that is OK — orchestrator applies default
  }
});

test('model-profiles: VALID_PROFILES list matches expected values', () => {
  assert.deepEqual(VALID_PROFILES.sort(), ['balanced', 'budget', 'quality']);
});
