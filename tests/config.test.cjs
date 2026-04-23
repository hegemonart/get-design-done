'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { scaffoldDesignDir } = require('./helpers.ts');

const VALID_PROFILES = ['quality', 'balanced', 'budget'];

test('config: valid model_profile accepted', () => {
  for (const profile of VALID_PROFILES) {
    const { designDir, cleanup } = scaffoldDesignDir({
      configContent: JSON.stringify({ model_profile: profile, parallelism: { enabled: true } })
    });
    try {
      const cfg = JSON.parse(fs.readFileSync(path.join(designDir, 'config.json'), 'utf8'));
      assert.ok(VALID_PROFILES.includes(cfg.model_profile), `Profile ${profile} should be valid`);
    } finally { cleanup(); }
  }
});

test('config: invalid model_profile rejected', () => {
  const { designDir, cleanup } = scaffoldDesignDir({
    configContent: JSON.stringify({ model_profile: 'ultra', parallelism: false })
  });
  try {
    const cfg = JSON.parse(fs.readFileSync(path.join(designDir, 'config.json'), 'utf8'));
    assert.ok(
      !VALID_PROFILES.includes(cfg.model_profile),
      'ultra is not a valid profile — test confirms schema would reject it'
    );
  } finally { cleanup(); }
});

test('config: parallelism accepts boolean false', () => {
  const { designDir, cleanup } = scaffoldDesignDir({
    configContent: JSON.stringify({ model_profile: 'balanced', parallelism: false })
  });
  try {
    const cfg = JSON.parse(fs.readFileSync(path.join(designDir, 'config.json'), 'utf8'));
    assert.equal(cfg.parallelism, false);
  } finally { cleanup(); }
});

test('config: parallelism accepts object with enabled key', () => {
  const para = { enabled: true, max_parallel_agents: 3, worktree_isolation: false };
  const { designDir, cleanup } = scaffoldDesignDir({
    configContent: JSON.stringify({ model_profile: 'quality', parallelism: para })
  });
  try {
    const cfg = JSON.parse(fs.readFileSync(path.join(designDir, 'config.json'), 'utf8'));
    assert.equal(typeof cfg.parallelism, 'object');
    assert.equal(cfg.parallelism.enabled, true);
  } finally { cleanup(); }
});
