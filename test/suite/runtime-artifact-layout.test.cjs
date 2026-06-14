'use strict';

// tests/runtime-artifact-layout.test.cjs — Phase 28.7 (Plan 28.7-02).
//
// Coverage for scripts/lib/install/runtime-artifact-layout.cjs:
//   - resolveRuntimeArtifactLayout(runtime, configDir, scope) returns
//     {runtime, configDir, kinds[]} for all 14 GDD runtimes.
//   - claude global → 1 skills kind; claude local → commands + agents kinds.
//   - cursor/codex/copilot/antigravity/windsurf/augment/trae/qwen/codebuddy
//     each return a single `kind:'skills'`, `destSubpath:'skills'` entry.
//   - gemini → 1 commands kind at `commands/gdd`.
//   - opencode + kilo → 1 commands kind at `command` (singular XDG dir).
//   - cline → kinds=[] + specialCase='clinerules-embed' (D-09 rules-based).
//   - Unknown runtime → TypeError (D-03 + D-10 — hermes is unknown).
//   - Invalid scope → TypeError.
//   - Empty configDir → TypeError.
//   - ALLOWED_RUNTIMES.has('hermes') === false (D-10 guard).
//   - ALLOWED_RUNTIMES.has('grok') === false (D-03 guard).
//   - Every non-cline kinds[].prefix === 'hone-' across all 14 runtimes.
//   - Every non-cline kinds[].stage is a function (lazy require — not called
//     in this Wave A test to keep parallel-safe with Wave B converters).
//   - findInstallSourceRoot() resolves to a directory containing `skills/`.
//
// Test names use `runtime-artifact-layout: ...` pattern for grep-ability.

const test = require('node:test');
const assert = require('node:assert/strict');
const os = require('node:os');
const path = require('node:path');
const fs = require('node:fs');

const {
  resolveRuntimeArtifactLayout,
  findInstallSourceRoot,
  ALLOWED_RUNTIMES,
} = require('../../scripts/lib/install/runtime-artifact-layout.cjs');

// Mirrors scripts/lib/install/runtimes.cjs listRuntimeIds() — 14 runtimes
// roadmap-locked by Phase 24 D-02. Phase 28.7 D-03 + D-10 keep this set
// stable (no hermes, no grok).
const ALL_RUNTIMES = [
  'claude',
  'cursor',
  'gemini',
  'codex',
  'copilot',
  'antigravity',
  'windsurf',
  'augment',
  'trae',
  'qwen',
  'codebuddy',
  'cline',
  'opencode',
  'kilo',
];

const SKILLS_RUNTIMES = [
  'cursor',
  'codex',
  'copilot',
  'antigravity',
  'windsurf',
  'augment',
  'trae',
  'qwen',
  'codebuddy',
];

const TMP_CFG = path.join(os.tmpdir(), 'hone-layout-test-cfg');

// ── Tests ──────────────────────────────────────────────────────────────────

test('runtime-artifact-layout: all 14 runtimes resolve to a valid layout', () => {
  for (const r of ALL_RUNTIMES) {
    const l = resolveRuntimeArtifactLayout(r, TMP_CFG);
    assert.equal(l.runtime, r, `${r} runtime mismatch`);
    assert.equal(l.configDir, TMP_CFG, `${r} configDir mismatch`);
    assert.ok(Array.isArray(l.kinds), `${r} kinds is not an array`);
  }
});

test('runtime-artifact-layout: ALLOWED_RUNTIMES has all 14 expected runtimes (no hermes, no grok)', () => {
  assert.equal(ALLOWED_RUNTIMES.size, 14, 'expected exactly 14 allowed runtimes');
  for (const r of ALL_RUNTIMES) {
    assert.ok(ALLOWED_RUNTIMES.has(r), `${r} missing from ALLOWED_RUNTIMES`);
  }
  // D-10: hermes is intentionally absent.
  assert.equal(
    ALLOWED_RUNTIMES.has('hermes'),
    false,
    'hermes leaked into ALLOWED_RUNTIMES (D-10 violation)'
  );
  // D-03: grok from upstream is intentionally absent too.
  assert.equal(
    ALLOWED_RUNTIMES.has('grok'),
    false,
    'grok leaked into ALLOWED_RUNTIMES (D-03 violation)'
  );
});

test('runtime-artifact-layout: claude global → 1 skills kind', () => {
  const l = resolveRuntimeArtifactLayout('claude', TMP_CFG, 'global');
  assert.equal(l.kinds.length, 1);
  assert.equal(l.kinds[0].kind, 'skills');
  assert.equal(l.kinds[0].destSubpath, 'skills');
  assert.equal(l.kinds[0].prefix, 'hone-');
  assert.equal(typeof l.kinds[0].stage, 'function');
});

test('runtime-artifact-layout: claude global is the default scope', () => {
  const lDefault = resolveRuntimeArtifactLayout('claude', TMP_CFG);
  const lExplicit = resolveRuntimeArtifactLayout('claude', TMP_CFG, 'global');
  assert.equal(lDefault.kinds.length, lExplicit.kinds.length);
  assert.equal(lDefault.kinds[0].kind, lExplicit.kinds[0].kind);
  assert.equal(lDefault.kinds[0].destSubpath, lExplicit.kinds[0].destSubpath);
});

test('runtime-artifact-layout: claude local → 2 kinds (commands + agents)', () => {
  const l = resolveRuntimeArtifactLayout('claude', TMP_CFG, 'local');
  assert.equal(l.kinds.length, 2, 'claude local should have 2 kinds');
  const commands = l.kinds.find((k) => k.kind === 'commands');
  const agents = l.kinds.find((k) => k.kind === 'agents');
  assert.ok(commands, 'commands kind missing');
  assert.ok(agents, 'agents kind missing');
  assert.equal(commands.destSubpath, 'commands/gdd');
  assert.equal(commands.prefix, 'hone-');
  assert.equal(agents.destSubpath, 'agents');
  assert.equal(agents.prefix, 'hone-');
});

test('runtime-artifact-layout: skills-shaped runtimes return 1 skills kind at skills/', () => {
  for (const r of SKILLS_RUNTIMES) {
    const l = resolveRuntimeArtifactLayout(r, TMP_CFG);
    assert.equal(l.kinds.length, 1, `${r} should have 1 kind`);
    assert.equal(l.kinds[0].kind, 'skills', `${r} kind != skills`);
    assert.equal(l.kinds[0].destSubpath, 'skills', `${r} destSubpath != skills`);
    assert.equal(l.kinds[0].prefix, 'hone-', `${r} prefix != hone-`);
    assert.equal(
      typeof l.kinds[0].stage,
      'function',
      `${r} stage is not a function`
    );
  }
});

test('runtime-artifact-layout: gemini → 1 commands kind at commands/gdd', () => {
  const l = resolveRuntimeArtifactLayout('gemini', TMP_CFG);
  assert.equal(l.kinds.length, 1);
  assert.equal(l.kinds[0].kind, 'commands');
  assert.equal(l.kinds[0].destSubpath, 'commands/gdd');
  assert.equal(l.kinds[0].prefix, 'hone-');
});

test('runtime-artifact-layout: opencode + kilo → 1 commands kind at command/', () => {
  for (const r of ['opencode', 'kilo']) {
    const l = resolveRuntimeArtifactLayout(r, TMP_CFG);
    assert.equal(l.kinds.length, 1, `${r} should have 1 kind`);
    assert.equal(l.kinds[0].kind, 'commands', `${r} kind != commands`);
    assert.equal(l.kinds[0].destSubpath, 'command', `${r} destSubpath != command`);
    assert.equal(l.kinds[0].prefix, 'hone-', `${r} prefix != hone-`);
  }
});

test('runtime-artifact-layout: cline → kinds=[] + specialCase=clinerules-embed (D-09)', () => {
  for (const scope of ['global', 'local']) {
    const l = resolveRuntimeArtifactLayout('cline', TMP_CFG, scope);
    assert.equal(l.kinds.length, 0, `cline kinds should be empty in ${scope} scope`);
    assert.equal(l.specialCase, 'clinerules-embed', `cline specialCase missing in ${scope}`);
    assert.equal(l.converterName, 'cline', `cline converterName missing in ${scope}`);
  }
});

test('runtime-artifact-layout: every kinds[].prefix === "hone-" for all 14 runtimes', () => {
  for (const r of ALL_RUNTIMES) {
    const l = resolveRuntimeArtifactLayout(r, TMP_CFG);
    for (const k of l.kinds) {
      assert.equal(k.prefix, 'hone-', `${r} kind ${k.kind} has wrong prefix: ${k.prefix}`);
    }
  }
});

test('runtime-artifact-layout: every non-cline kinds[].stage is a function', () => {
  for (const r of ALL_RUNTIMES) {
    if (r === 'cline') continue; // kinds=[] by design
    const l = resolveRuntimeArtifactLayout(r, TMP_CFG);
    for (const k of l.kinds) {
      assert.equal(
        typeof k.stage,
        'function',
        `${r} kind ${k.kind} stage is not a function`
      );
    }
  }
});

test('runtime-artifact-layout: unknown runtime throws TypeError', () => {
  assert.throws(
    () => resolveRuntimeArtifactLayout('madeup', TMP_CFG),
    (err) => err instanceof TypeError && /Unknown runtime/.test(err.message),
    'expected TypeError with "Unknown runtime"'
  );
  // hermes is unknown to this resolver even though gsd-build ships it (D-10).
  assert.throws(
    () => resolveRuntimeArtifactLayout('hermes', TMP_CFG),
    (err) => err instanceof TypeError && /Unknown runtime/.test(err.message),
    'hermes should throw — D-10 invariant'
  );
});

test('runtime-artifact-layout: invalid scope throws TypeError', () => {
  assert.throws(
    () => resolveRuntimeArtifactLayout('claude', TMP_CFG, 'staging'),
    (err) => err instanceof TypeError && /scope/.test(err.message),
    'expected TypeError with "scope"'
  );
  assert.throws(
    () => resolveRuntimeArtifactLayout('claude', TMP_CFG, ''),
    (err) => err instanceof TypeError && /scope/.test(err.message),
    'empty scope should throw'
  );
});

test('runtime-artifact-layout: empty or non-string configDir throws TypeError', () => {
  assert.throws(
    () => resolveRuntimeArtifactLayout('claude', ''),
    (err) => err instanceof TypeError && /configDir/.test(err.message),
    'empty configDir should throw'
  );
  assert.throws(
    () => resolveRuntimeArtifactLayout('claude', null),
    (err) => err instanceof TypeError && /configDir/.test(err.message),
    'null configDir should throw'
  );
  assert.throws(
    () => resolveRuntimeArtifactLayout('claude', undefined),
    (err) => err instanceof TypeError && /configDir/.test(err.message),
    'undefined configDir should throw'
  );
});

test('runtime-artifact-layout: findInstallSourceRoot resolves to a directory containing skills/', () => {
  const root = findInstallSourceRoot();
  assert.equal(typeof root, 'string', 'root should be a string');
  assert.ok(path.isAbsolute(root), `root should be absolute: ${root}`);
  const skillsDir = path.join(root, 'skills');
  assert.ok(
    fs.existsSync(skillsDir),
    `skills/ should exist under ${root}`
  );
  assert.ok(
    fs.statSync(skillsDir).isDirectory(),
    `${skillsDir} should be a directory`
  );
});
