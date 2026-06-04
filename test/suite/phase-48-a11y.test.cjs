'use strict';
// Phase 48 (A11Y-GATE) — the quality-gate accessibility extension. Asserts the quality-gate-runner
// gained an `a11y` fifth bucket (axe / pa11y / lighthouse / jsx-a11y matchers) and dropped the
// "do not invent a fifth bucket" prohibition, the quality-gate skill auto-detect allowlist learned
// the a11y tools and the classified_failures shape carries `a11y`, hooks.json registers the advisory
// gdd-a11y-gate.js PostToolUse hook, and that hook always emits {continue:true}.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { REPO_ROOT } = require('./helpers.ts');

const RUNNER = path.join(REPO_ROOT, 'agents', 'quality-gate-runner.md');
const QG_SKILL = path.join(REPO_ROOT, 'scripts', 'skill-templates', 'quality-gate', 'SKILL.md');
const HOOKS_JSON = path.join(REPO_ROOT, 'hooks', 'hooks.json');
const HOOK_JS = path.join(REPO_ROOT, 'hooks', 'gdd-a11y-gate.js');
const DESIGN_FIXER = path.join(REPO_ROOT, 'agents', 'design-fixer.md');

test('phase-48-a11y: quality-gate-runner declares the a11y bucket with axe/pa11y/lighthouse/jsx-a11y matchers', () => {
  const runner = fs.readFileSync(RUNNER, 'utf8');
  assert.match(runner, /`a11y`/, 'runner must name the a11y bucket');
  for (const matcher of ['axe', 'pa11y', 'lighthouse', 'jsx-a11y']) {
    assert.match(
      runner,
      new RegExp(matcher.replace('-', '\\-')),
      `runner bucketing rule must list the ${matcher} matcher`
    );
  }
});

test('phase-48-a11y: quality-gate-runner no longer says "do not invent a fifth bucket"', () => {
  const runner = fs.readFileSync(RUNNER, 'utf8').toLowerCase();
  assert.doesNotMatch(
    runner,
    /do not invent a fifth bucket/,
    'the four-bucket prohibition must be rewritten to allow the a11y fifth bucket'
  );
  // And it should now describe five buckets explicitly.
  assert.match(
    runner,
    /five[\s-]name|five buckets|sixth bucket/,
    'runner must describe the five-bucket set (and bar a sixth)'
  );
});

test('phase-48-a11y: quality-gate-runner output contract allows an a11y key', () => {
  const runner = fs.readFileSync(RUNNER, 'utf8');
  // The classified_failures schema enumerates a11y alongside the original four.
  assert.match(
    runner,
    /lint \| type \| test \| visual \| a11y/,
    'output-contract schema must include a11y in the classified_failures key set'
  );
  // The fail example demonstrates an a11y bucket value.
  assert.match(runner, /"a11y":\s*\[/, 'fail example must show an a11y bucket array');
});

test('phase-48-a11y: quality-gate skill auto-detect allowlist includes the a11y tools', () => {
  const skill = fs.readFileSync(QG_SKILL, 'utf8');
  for (const tool of ['axe', 'pa11y', 'lighthouse']) {
    assert.match(skill, new RegExp(tool), `Step 1 allowlist must include ${tool}`);
  }
  assert.match(
    skill,
    /eslint-plugin-jsx-a11y|jsx-a11y/,
    'Step 1 allowlist must include the jsx-a11y lint plugin script'
  );
});

test('phase-48-a11y: quality-gate skill classified_failures shape carries a11y', () => {
  const skill = fs.readFileSync(QG_SKILL, 'utf8');
  assert.match(
    skill,
    /classified_failures:\s*\{lint, type, test, visual, a11y\}/,
    'Step 3 classified_failures shape must list a11y'
  );
});

test('phase-48-a11y: design-fixer notes a11y failures route to it like the other classes', () => {
  const fixer = fs.readFileSync(DESIGN_FIXER, 'utf8');
  assert.match(fixer, /a11y/i, 'design-fixer must mention the a11y bucket');
  assert.match(
    fixer,
    /axe|pa11y|lighthouse/,
    'design-fixer must cite where a11y findings come from'
  );
});

test('phase-48-a11y: hooks.json registers gdd-a11y-gate.js as a PostToolUse hook', () => {
  const hooks = JSON.parse(fs.readFileSync(HOOKS_JSON, 'utf8'));
  const post = hooks.hooks && hooks.hooks.PostToolUse;
  assert.ok(Array.isArray(post), 'hooks.json must have a PostToolUse array');
  const registered = JSON.stringify(post).includes('gdd-a11y-gate.js');
  assert.ok(registered, 'PostToolUse must register hooks/gdd-a11y-gate.js');
});

test('phase-48-a11y: gdd-a11y-gate.js exists and is dependency-free (fs + path only)', () => {
  assert.ok(fs.existsSync(HOOK_JS), 'hooks/gdd-a11y-gate.js must exist');
  const src = fs.readFileSync(HOOK_JS, 'utf8');
  const requires = [...src.matchAll(/require\(['"]([^'"]+)['"]\)/g)].map((m) => m[1]);
  for (const r of requires) {
    assert.ok(
      r === 'fs' || r === 'path',
      `hook must only require core fs/path modules; found require('${r}')`
    );
  }
});

test('phase-48-a11y: hook emits {continue:true} with an advisory note when an a11y bucket is present', () => {
  const hook = require(HOOK_JS);
  assert.equal(typeof hook.evaluate, 'function', 'hook must export evaluate() for testability');
  const decision = hook.evaluate({
    cwd: os.tmpdir(),
    tool_response: {
      classified_failures: {
        type: ['typecheck: TS2304'],
        a11y: ['axe: 3 serious violations on /checkout', 'pa11y: missing form label'],
      },
    },
  });
  assert.equal(decision.continue, true, 'hook must always continue (advisory, never blocks)');
  assert.ok(decision.systemMessage, 'hook must surface an advisory note when a11y failures exist');
  assert.match(decision.systemMessage, /accessibility/i, 'note must mention accessibility');
});

test('phase-48-a11y: hook emits a bare {continue:true} when no a11y bucket is present', () => {
  const hook = require(HOOK_JS);
  for (const tr of [
    { classified_failures: { lint: ['x'] } }, // other buckets only
    { classified_failures: { a11y: [] } }, // empty a11y bucket
    { classified_failures: {} }, // pass
    null, // garbage
    undefined,
  ]) {
    const decision = hook.evaluate({ tool_response: tr });
    assert.equal(decision.continue, true, 'hook must always continue');
    assert.equal(decision.systemMessage, undefined, 'no note when there are no a11y failures');
  }
});

test('phase-48-a11y: hook tolerates the nested quality_gate wrapper shape', () => {
  const hook = require(HOOK_JS);
  const decision = hook.evaluate({
    cwd: os.tmpdir(),
    tool_response: { quality_gate: { classified_failures: { a11y: ['lighthouse: contrast 2.1:1'] } } },
  });
  assert.equal(decision.continue, true);
  assert.ok(decision.systemMessage, 'nested classified_failures.a11y must still surface the note');
});
