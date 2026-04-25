// tests/design-solidify.test.cjs — Plan 23-02 solidify-with-rollback gate
'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { mkdtempSync, rmSync, writeFileSync, readFileSync, existsSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { join } = require('node:path');
const { spawnSync } = require('node:child_process');
const { pathToFileURL } = require('node:url');

// Phase 22 lesson: dynamic-importing .mjs (which itself does NOT
// dynamic-import .ts) is safe even on Node 24 + Windows. The buffer-
// overrun bug was specific to .mjs → .ts, and design-solidify.mjs
// only requires .cjs siblings. So no platform skip needed.
const MOD_URL = pathToFileURL(
  require.resolve('../scripts/lib/design-solidify.mjs'),
).href;

async function loadSolidify() {
  const mod = await import(MOD_URL);
  return mod.solidify;
}

function seedRepo() {
  const dir = mkdtempSync(join(tmpdir(), 'gdd-solidify-'));
  const init = spawnSync('git', ['init', '-b', 'main'], { cwd: dir, encoding: 'utf8' });
  if (init.status !== 0) throw new Error(`git init failed: ${init.stderr}`);
  spawnSync('git', ['config', 'user.email', 't@t.t'], { cwd: dir });
  spawnSync('git', ['config', 'user.name', 'tester'], { cwd: dir });
  spawnSync('git', ['config', 'commit.gpgsign', 'false'], { cwd: dir });
  writeFileSync(join(dir, 'README.md'), 'seed\n');
  spawnSync('git', ['add', '.'], { cwd: dir });
  spawnSync('git', ['commit', '-m', 'seed', '--no-verify'], { cwd: dir });
  return dir;
}

test('23-02: solidify passes when all steps pass', async () => {
  const repo = seedRepo();
  try {
    const chainPath = join(repo, 'chain.jsonl');
    const solidify = await loadSolidify();
    const result = await solidify({
      taskId: 'pass-all',
      cwd: repo,
      chainPath,
      validations: [
        { name: 'echo', cmd: 'node', args: ['-e', 'process.exit(0)'] },
        { name: 'echo2', cmd: 'node', args: ['-e', 'process.exit(0)'] },
      ],
    });
    assert.equal(result.outcome, 'pass');
    assert.equal(result.steps.length, 2);
    assert.ok(typeof result.eventId === 'string');
    const line = readFileSync(chainPath, 'utf8').trim();
    const ev = JSON.parse(line);
    assert.equal(ev.outcome, 'pass');
    assert.equal(ev.task_id, 'pass-all');
    assert.equal(ev.rolled_back_via, 'none');
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
});

test('23-02: failing step triggers stash rollback + chain event', async () => {
  const repo = seedRepo();
  try {
    // Create a dirty change so the stash has something to capture.
    writeFileSync(join(repo, 'dirty.txt'), 'uncommitted\n');
    const chainPath = join(repo, 'chain.jsonl');
    const solidify = await loadSolidify();
    const result = await solidify({
      taskId: 'fail-targeted',
      cwd: repo,
      chainPath,
      validations: [
        { name: 'first', cmd: 'node', args: ['-e', 'process.exit(0)'] },
        { name: 'targeted-test', cmd: 'node', args: ['-e', 'process.exit(1)'] },
      ],
    });
    assert.equal(result.outcome, 'fail');
    // stash captures untracked → expect via = stash on dirty repo with -u flag
    assert.equal(result.rolledBackVia, 'stash');
    assert.match(result.stashRef || '', /^stash@\{\d+\}$/);
    const ev = JSON.parse(readFileSync(chainPath, 'utf8').trim());
    assert.equal(ev.outcome, 'rolled-back');
    assert.match(ev.rollback_reason, /targeted-test failed/);
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
});

test('23-02: rollback=none does not invoke git on failure', async () => {
  const repo = seedRepo();
  try {
    writeFileSync(join(repo, 'dirty.txt'), 'still-here\n');
    const chainPath = join(repo, 'chain.jsonl');
    const solidify = await loadSolidify();
    const result = await solidify({
      taskId: 'no-rollback',
      cwd: repo,
      chainPath,
      rollback: 'none',
      validations: [{ name: 'fail', cmd: 'node', args: ['-e', 'process.exit(1)'] }],
    });
    assert.equal(result.outcome, 'fail');
    assert.equal(result.rolledBackVia, 'none');
    // dirty.txt must still be in the working tree (no stash happened).
    assert.ok(existsSync(join(repo, 'dirty.txt')));
    const ev = JSON.parse(readFileSync(chainPath, 'utf8').trim());
    assert.equal(ev.outcome, 'rolled-back');
    assert.equal(ev.rolled_back_via, 'none');
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
});

test('23-02: cwd without .git → rolledBackVia=skipped, no throw', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'gdd-solidify-nogit-'));
  try {
    const solidify = await loadSolidify();
    const chainPath = join(dir, 'chain.jsonl');
    const result = await solidify({
      taskId: 'no-git',
      cwd: dir,
      chainPath,
      rollback: 'stash',
      validations: [{ name: 'fail', cmd: 'node', args: ['-e', 'process.exit(1)'] }],
    });
    assert.equal(result.outcome, 'fail');
    assert.equal(result.rolledBackVia, 'skipped');
    const ev = JSON.parse(readFileSync(chainPath, 'utf8').trim());
    assert.equal(ev.rolled_back_via, 'skipped');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('23-02: throws on missing taskId', async () => {
  const solidify = await loadSolidify();
  await assert.rejects(() => solidify({}), /taskId/);
  await assert.rejects(() => solidify({ taskId: '' }), /taskId/);
});

test('23-02: emit callback fires on failure', async () => {
  const repo = seedRepo();
  try {
    const chainPath = join(repo, 'chain.jsonl');
    const events = [];
    const solidify = await loadSolidify();
    await solidify({
      taskId: 'emit-test',
      cwd: repo,
      chainPath,
      rollback: 'none',
      emit: (ev) => events.push(ev),
      validations: [{ name: 'fail', cmd: 'node', args: ['-e', 'process.exit(1)'] }],
    });
    assert.equal(events.length, 1);
    assert.equal(events[0].type, 'solidify.rollback');
    assert.equal(events[0].payload.task_id, 'emit-test');
    assert.equal(events[0].payload.failing_step, 'fail');
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
});
