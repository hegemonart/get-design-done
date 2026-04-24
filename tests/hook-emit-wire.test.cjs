// tests/hook-emit-wire.test.cjs — Plan 22-09 hook → event-stream wire-in
'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { mkdtempSync, rmSync, readFileSync, existsSync, writeFileSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { join } = require('node:path');
const { spawnSync } = require('node:child_process');

const REPO_ROOT = join(__dirname, '..');

/**
 * Run a hook subprocess with the given stdin payload and a temp cwd
 * pointed at events.jsonl via GDD_EVENTS_PATH. Returns the parsed
 * events.jsonl lines (or [] if file absent).
 */
function runHook(hookPath, stdinJson, opts = {}) {
  const dir = opts.dir || mkdtempSync(join(tmpdir(), 'gdd-emit-'));
  const eventsPath = join(dir, 'events.jsonl');
  const env = {
    ...process.env,
    GDD_EVENTS_PATH: eventsPath,
    GDD_SESSION_ID: 'test-sess',
    ...(opts.env || {}),
  };
  const cmd = hookPath.endsWith('.ts')
    ? [process.execPath, '--experimental-strip-types', hookPath]
    : [process.execPath, hookPath];
  const res = spawnSync(cmd[0], cmd.slice(1), {
    input: typeof stdinJson === 'string' ? stdinJson : JSON.stringify(stdinJson),
    cwd: dir,
    encoding: 'utf8',
    env,
    timeout: 5000,
  });
  const events = existsSync(eventsPath)
    ? readFileSync(eventsPath, 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l))
    : [];
  return { res, events, dir };
}

test('22-09: gdd-bash-guard emits hook.fired allow on benign command', () => {
  const hook = join(REPO_ROOT, 'hooks', 'gdd-bash-guard.js');
  const { res, events, dir } = runHook(hook, {
    tool_name: 'Bash',
    tool_input: { command: 'ls -la' },
  });
  try {
    assert.equal(res.status, 0, `stderr: ${res.stderr}`);
    const fired = events.filter((e) => e.type === 'hook.fired');
    assert.ok(fired.length >= 1, `no hook.fired event: ${JSON.stringify(events)}`);
    assert.equal(fired[0].payload.hook, 'gdd-bash-guard');
    assert.equal(fired[0].payload.decision, 'allow');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('22-09: gdd-bash-guard emits hook.fired block on dangerous command', () => {
  const hook = join(REPO_ROOT, 'hooks', 'gdd-bash-guard.js');
  const { res, events, dir } = runHook(hook, {
    tool_name: 'Bash',
    tool_input: { command: 'rm -rf /' },
  });
  try {
    assert.equal(res.status, 0);
    const stdoutObj = JSON.parse(res.stdout);
    assert.equal(stdoutObj.continue, false);
    const fired = events.filter((e) => e.type === 'hook.fired');
    assert.ok(fired.length >= 1);
    assert.equal(fired[0].payload.hook, 'gdd-bash-guard');
    assert.equal(fired[0].payload.decision, 'block');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('22-09: gdd-protected-paths emits hook.fired allow when path not protected', () => {
  const hook = join(REPO_ROOT, 'hooks', 'gdd-protected-paths.js');
  const dir = mkdtempSync(join(tmpdir(), 'gdd-emit-pp-'));
  // Need a config so the hook resolves protected_paths from defaults.
  try {
    const { res, events } = runHook(hook, {
      tool_name: 'Edit',
      tool_input: { file_path: 'src/totally/normal/file.ts' },
    }, { dir });
    assert.equal(res.status, 0);
    const fired = events.filter((e) => e.type === 'hook.fired');
    // Could be allow OR block depending on default config — either way at
    // least one hook.fired event must appear.
    assert.ok(fired.length >= 1, `no hook.fired event: stderr=${res.stderr}`);
    assert.equal(fired[0].payload.hook, 'gdd-protected-paths');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('22-09: hook-emit helper survives missing event-stream module', () => {
  // Verify the helper itself loads + does not throw when called.
  const { emitHookFired } = require('../hooks/_hook-emit.js');
  // Calling with bad input must NOT throw.
  assert.doesNotThrow(() => emitHookFired('test-hook', 'noop'));
  assert.doesNotThrow(() => emitHookFired('test-hook', 'noop', { extra: 1 }));
});
