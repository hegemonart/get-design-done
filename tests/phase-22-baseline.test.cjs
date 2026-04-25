// tests/phase-22-baseline.test.cjs — Phase 22 regression baseline
'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { existsSync, readFileSync } = require('node:fs');
const { join } = require('node:path');

const REPO_ROOT = join(__dirname, '..');

test('phase-22 baseline: scripts/lib/redact.cjs is shipped', () => {
  assert.ok(existsSync(join(REPO_ROOT, 'scripts/lib/redact.cjs')));
  const mod = require(join(REPO_ROOT, 'scripts/lib/redact.cjs'));
  assert.equal(typeof mod.redact, 'function');
  assert.equal(typeof mod.redactString, 'function');
  assert.ok(Array.isArray(mod.PATTERNS));
  assert.ok(mod.PATTERNS.length >= 8);
});

test('phase-22 baseline: trajectory module is shipped', () => {
  assert.ok(existsSync(join(REPO_ROOT, 'scripts/lib/trajectory/index.cjs')));
  const mod = require(join(REPO_ROOT, 'scripts/lib/trajectory/index.cjs'));
  assert.equal(typeof mod.recordCall, 'function');
  assert.equal(typeof mod.trajectoryPath, 'function');
});

test('phase-22 baseline: PostToolUse:Agent trajectory hook is registered', () => {
  const hooksJson = JSON.parse(readFileSync(join(REPO_ROOT, 'hooks/hooks.json'), 'utf8'));
  const post = hooksJson?.hooks?.PostToolUse || [];
  const agentTrajectory = post.find(
    (g) =>
      g.matcher === 'Agent' &&
      g.hooks?.some((h) => h.command?.includes('gdd-trajectory-capture.js')),
  );
  assert.ok(agentTrajectory, 'PostToolUse:Agent trajectory hook missing from hooks.json');
});

test('phase-22 baseline: event-chain module is shipped', () => {
  assert.ok(existsSync(join(REPO_ROOT, 'scripts/lib/event-chain.cjs')));
  const mod = require(join(REPO_ROOT, 'scripts/lib/event-chain.cjs'));
  assert.equal(typeof mod.appendChainEvent, 'function');
  assert.equal(typeof mod.readChain, 'function');
  assert.equal(typeof mod.walkParents, 'function');
  assert.equal(mod.DEFAULT_CHAIN_PATH, '.design/gep/events.jsonl');
});

test('phase-22 baseline: connection-probe primitive is shipped', () => {
  assert.ok(existsSync(join(REPO_ROOT, 'scripts/lib/connection-probe/index.cjs')));
  const mod = require(join(REPO_ROOT, 'scripts/lib/connection-probe/index.cjs'));
  assert.equal(typeof mod.probe, 'function');
  assert.equal(mod.DEFAULT_STATE_PATH, '.design/telemetry/connection-state.json');
});

test('phase-22 baseline: WebSocket transport module is shipped', () => {
  assert.ok(existsSync(join(REPO_ROOT, 'scripts/lib/transports/ws.cjs')));
});

test('phase-22 baseline: gdd-events bin entry exists', () => {
  const pkg = JSON.parse(readFileSync(join(REPO_ROOT, 'package.json'), 'utf8'));
  assert.ok(pkg.bin && pkg.bin['gdd-events'], 'gdd-events bin entry missing');
  assert.equal(pkg.bin['gdd-events'], './scripts/cli/gdd-events.mjs');
  assert.ok(existsSync(join(REPO_ROOT, 'scripts/cli/gdd-events.mjs')));
});

test('phase-22 baseline: ws is declared as optionalDependency', () => {
  const pkg = JSON.parse(readFileSync(join(REPO_ROOT, 'package.json'), 'utf8'));
  assert.ok(pkg.optionalDependencies && pkg.optionalDependencies.ws);
});

test('phase-22 baseline: hooks emit-helper exists', () => {
  assert.ok(existsSync(join(REPO_ROOT, 'hooks/_hook-emit.js')));
  const mod = require(join(REPO_ROOT, 'hooks/_hook-emit.js'));
  assert.equal(typeof mod.emitHookFired, 'function');
});

test('phase-22 baseline: bash-guard, protected-paths, decision-injector all reference _hook-emit', () => {
  for (const f of [
    'hooks/gdd-bash-guard.js',
    'hooks/gdd-protected-paths.js',
    'hooks/gdd-decision-injector.js',
  ]) {
    const src = readFileSync(join(REPO_ROOT, f), 'utf8');
    assert.match(src, /_hook-emit/, `${f} does not import _hook-emit.js`);
  }
});

test('phase-22 baseline: package.json version is ≥1.22.0', () => {
  const pkg = JSON.parse(readFileSync(join(REPO_ROOT, 'package.json'), 'utf8'));
  // Phase 22 ships at 1.22.0; later phases bump. Assert minor ≥22.
  const m = pkg.version.match(/^1\.(\d+)\./);
  assert.ok(m, `unexpected version shape: ${pkg.version}`);
  assert.ok(Number(m[1]) >= 22, `expected ≥1.22.0, got ${pkg.version}`);
});

test('phase-22 baseline: CHANGELOG has [1.22.0] section', () => {
  const cl = readFileSync(join(REPO_ROOT, 'CHANGELOG.md'), 'utf8');
  assert.match(cl, /^## \[1\.22\.0\]/m, 'CHANGELOG missing [1.22.0] header');
});
