'use strict';
// tests/runtime-detect.test.cjs — Plan 26-02 Task 2.
//
// Covers `scripts/lib/runtime-detect.cjs`:
//   * each of the 14 runtime env-vars individually triggers the correct
//     detection
//   * no env-var set returns null
//   * multiple env-vars set returns the first runtime per declaration
//     order in scripts/lib/install/runtimes.cjs

const test = require('node:test');
const assert = require('node:assert/strict');

const { detect, envVarMap } = require('../../scripts/lib/runtime-detect.cjs');
const { RUNTIMES } = require('../../scripts/lib/install/runtimes.cjs');

/**
 * Snapshot the 14 runtime env-var names so we can clear them all
 * before each test. Reading from RUNTIMES (the Phase 24 source of
 * truth) means this test stays green when new runtimes are added.
 */
const ALL_ENV_VARS = RUNTIMES.map((r) => r.configDirEnv);

/**
 * Save + restore the entire process.env subset we touch. Test isolation
 * matters because the test runner's own env may have CLAUDE_CONFIG_DIR
 * set (developer machine).
 */
function withCleanEnv(setupFn) {
  const saved = {};
  for (const name of ALL_ENV_VARS) {
    saved[name] = process.env[name];
    delete process.env[name];
  }
  try {
    return setupFn();
  } finally {
    for (const name of ALL_ENV_VARS) {
      if (saved[name] === undefined) {
        delete process.env[name];
      } else {
        process.env[name] = saved[name];
      }
    }
  }
}

test('detect() returns null when no runtime env-var is set', () => {
  withCleanEnv(() => {
    assert.equal(detect(), null);
  });
});

test('detect() returns null when env-var is set to empty string', () => {
  withCleanEnv(() => {
    process.env.CLAUDE_CONFIG_DIR = '';
    assert.equal(detect(), null);
  });
});

// One sub-test per runtime — locks the env-var ↔ id contract for all 14.
// Phase 28.8 (Plans B1, C1): Tier-2 distribution-channel entries
// (`cursor-marketplace`, `codex-plugin`) have no `configDirEnv` — they
// are out-of-band bundles, not per-user runtime install targets. Skip
// the parametrized loop for them (they would all collide on the
// `process.env[undefined]` string key) — runtime-detect intentionally
// never matches them since their env-var is undefined.
for (const r of RUNTIMES) {
  if (typeof r.configDirEnv !== 'string') continue;
  test(`detect() returns '${r.id}' when ${r.configDirEnv} is set`, () => {
    withCleanEnv(() => {
      process.env[r.configDirEnv] = `/tmp/fake/${r.id}`;
      assert.equal(detect(), r.id);
    });
  });
}

test('envVarMap() exposes all 14 runtimes in declaration order', () => {
  const m = envVarMap();
  assert.equal(m.length, RUNTIMES.length);
  for (let i = 0; i < RUNTIMES.length; i++) {
    assert.equal(m[i].env, RUNTIMES[i].configDirEnv);
    assert.equal(m[i].id, RUNTIMES[i].id);
  }
});

test('envVarMap() returns a fresh array — mutation is not observable', () => {
  const a = envVarMap();
  const b = envVarMap();
  assert.notEqual(a, b, 'should be different array instances');
  a.length = 0;
  assert.equal(envVarMap().length, RUNTIMES.length, 'mutation leaked');
});

test('multiple env-vars set: first declared runtime wins (claude before codex)', () => {
  withCleanEnv(() => {
    process.env.CLAUDE_CONFIG_DIR = '/tmp/claude';
    process.env.CODEX_HOME = '/tmp/codex';
    // RUNTIMES declares claude before codex, so claude wins.
    assert.equal(detect(), 'claude');
  });
});

test('multiple env-vars set: declaration order respected (codex before cursor)', () => {
  withCleanEnv(() => {
    process.env.CODEX_HOME = '/tmp/codex';
    process.env.CURSOR_CONFIG_DIR = '/tmp/cursor';
    // codex is declared before cursor in RUNTIMES.
    assert.equal(detect(), 'codex');
  });
});

test('detect() pulls live env-var values, not a load-time snapshot', () => {
  withCleanEnv(() => {
    assert.equal(detect(), null);
    process.env.GEMINI_CONFIG_DIR = '/tmp/gemini';
    assert.equal(detect(), 'gemini');
    delete process.env.GEMINI_CONFIG_DIR;
    assert.equal(detect(), null);
  });
});

test('detect() does not throw on unusual but non-empty env values', () => {
  withCleanEnv(() => {
    // process.env values are always coerced to strings by Node. A
    // unicode / non-path value should still register as "set" — we
    // only check non-empty, not validity-as-a-path. (Null bytes are
    // refused by Node in setenv, so we use printable-ish weirdness.)
    process.env.QWEN_CONFIG_DIR = '~/不存在/路径';
    assert.equal(detect(), 'qwen');
  });
});

test('runtime-detect imports its mapping from runtimes.cjs (no duplication)', () => {
  // If runtime-detect ever copy-pastes the mapping, this assertion will
  // catch a drift the moment a new runtime is added to runtimes.cjs.
  const m = envVarMap();
  for (const r of RUNTIMES) {
    const pair = m.find((p) => p.id === r.id);
    assert.ok(pair, `runtime-detect missing runtime '${r.id}' from runtimes.cjs`);
    assert.equal(pair.env, r.configDirEnv);
  }
});
