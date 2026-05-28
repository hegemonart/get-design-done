'use strict';
// tests/issue-reporter-fallback.test.cjs
// Plan 30-06 — gh-absent fallback + kill-switch + health-mirror tests.
//
// Covers 15 cases (floor: 12):
//
//   Fallback (Task 1):
//     1.  detectGh() returns false when lookup exits non-zero → fallback path
//     2.  resolveClipboardCommand() on darwin → pbcopy
//     3.  resolveClipboardCommand() on linux (wl-copy present) → wl-copy
//     4.  resolveClipboardCommand() on linux (xclip only) → xclip -selection clipboard
//     5.  resolveClipboardCommand() on win32 → clip.exe
//     6.  buildIssueTemplateUrl() reuses 30-04 destination constant (no env override)
//     7.  runFallback() writes exact "gh CLI not found..." message + URL
//
//   Kill-switch (Task 2):
//     8.  env=1 → isDisabled true, reason 'env'
//     9.  config=false (no env) → isDisabled true, reason 'config'
//     10. env=1 AND config=false → isDisabled true, reason 'env' (precedence)
//     11. neither → isDisabled false, reason null
//     12. malformed config JSON → does not throw, reporter enabled
//
//   gsd-health (Task 3) — exact-string assertions:
//     13. neither → "issue reporter: enabled"
//     14. env=1 → "issue reporter: disabled by env (GDD_DISABLE_ISSUE_REPORTER=1)"
//     15. config=false → "issue reporter: disabled by config (.design/config.json: issue_reporter=false)"
//
// D-13: no live `gh` invocation; all spawn paths mocked via dependency
// injection (the modules under test accept `spawnSync` / `spawn` /
// `platform` overrides in their options bag).

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const REPO_ROOT = path.resolve(__dirname, '..');
const ISSUE_REPORTER_DIR = path.join(REPO_ROOT, 'scripts', 'lib', 'issue-reporter');
const HEALTH_MIRROR = path.join(REPO_ROOT, 'scripts', 'lib', 'health-mirror', 'index.cjs');

const {
  detectGh,
  resolveClipboardCommand,
  copyToClipboard,
  buildIssueTemplateUrl,
  runFallback,
} = require(path.join(ISSUE_REPORTER_DIR, 'gh-absent-fallback.cjs'));

const {
  isDisabled,
  getDisableReason,
} = require(path.join(ISSUE_REPORTER_DIR, 'kill-switch.cjs'));

const { DESTINATION_REPO } = require(path.join(ISSUE_REPORTER_DIR, 'destination.cjs'));

const { getHealthChecks } = require(HEALTH_MIRROR);

// -------------------------------------------------------------------------
// Helpers
// -------------------------------------------------------------------------

/**
 * Build a synchronous spawn spy with scripted responses.
 * Used to mock `which gh` / `where gh` / `which wl-copy` / `which xclip`.
 *
 * @param {Array<{status:number|null, stdout?:string, stderr?:string}> | Function} responses
 */
function makeSpawnSyncSpy(responses) {
  const calls = [];
  let idx = 0;
  const spy = (cmd, args, opts) => {
    calls.push({ cmd, args: Array.isArray(args) ? args.slice() : [], opts });
    if (typeof responses === 'function') {
      const r = responses(cmd, args, opts) || { status: 1 };
      return { status: r.status, stdout: r.stdout || '', stderr: r.stderr || '' };
    }
    const r = responses[idx++] || { status: 1, stdout: '', stderr: 'no more mock responses' };
    return { status: r.status, stdout: r.stdout || '', stderr: r.stderr || '' };
  };
  spy.calls = calls;
  return spy;
}

/**
 * Build an async spawn spy that emulates child_process.spawn for clipboard piping.
 * Records stdin writes and emits 'close' with the supplied exit code.
 */
function makeSpawnAsyncSpy({ exitCode = 0, beforeClose = null } = {}) {
  const calls = [];
  const stdinWrites = [];

  const spy = (cmd, args, opts) => {
    const events = {};
    const child = {
      stdin: {
        write(chunk) {
          stdinWrites.push(typeof chunk === 'string' ? chunk : chunk.toString('utf8'));
        },
        end() {
          // Schedule close on next tick so .on('close', ...) is registered first.
          setImmediate(() => {
            if (typeof beforeClose === 'function') beforeClose(events);
            if (events.close) events.close(exitCode);
          });
        },
      },
      on(event, fn) {
        events[event] = fn;
        return child;
      },
    };
    calls.push({ cmd, args: Array.isArray(args) ? args.slice() : [], opts });
    return child;
  };
  spy.calls = calls;
  spy.stdinWrites = stdinWrites;
  return spy;
}

function mkTmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'gdd-30-06-'));
}

function rmDir(dir) {
  try {
    fs.rmSync(dir, { recursive: true, force: true });
  } catch {
    /* ignore */
  }
}

// =========================================================================
// FALLBACK TESTS (Task 1)
// =========================================================================

// -------------------------------------------------------------------------
// Case 1 — detectGh() false → fallback selected
// -------------------------------------------------------------------------

test('30-06 case 1: detectGh() returns false when lookup command exits non-zero', () => {
  // Linux/Mac branch
  const spawnSyncLinux = makeSpawnSyncSpy([{ status: 1 }]);
  const presentLinux = detectGh({ platform: 'linux', spawnSync: spawnSyncLinux });
  assert.equal(presentLinux, false);
  assert.equal(spawnSyncLinux.calls[0].cmd, 'which');
  assert.deepEqual(spawnSyncLinux.calls[0].args, ['gh']);

  // Windows branch
  const spawnSyncWin = makeSpawnSyncSpy([{ status: 1 }]);
  const presentWin = detectGh({ platform: 'win32', spawnSync: spawnSyncWin });
  assert.equal(presentWin, false);
  assert.equal(spawnSyncWin.calls[0].cmd, 'where');
  assert.deepEqual(spawnSyncWin.calls[0].args, ['gh']);

  // Positive case for completeness
  const spawnSyncOk = makeSpawnSyncSpy([{ status: 0 }]);
  const presentOk = detectGh({ platform: 'darwin', spawnSync: spawnSyncOk });
  assert.equal(presentOk, true);
});

// -------------------------------------------------------------------------
// Case 2 — resolveClipboardCommand() on darwin → pbcopy
// -------------------------------------------------------------------------

test('30-06 case 2: resolveClipboardCommand() on darwin → pbcopy', () => {
  const result = resolveClipboardCommand({ platform: 'darwin', spawnSync: makeSpawnSyncSpy([]) });
  assert.deepEqual(result, { command: 'pbcopy', args: [] });
});

// -------------------------------------------------------------------------
// Case 3 — resolveClipboardCommand() on linux with wl-copy available
// -------------------------------------------------------------------------

test('30-06 case 3: resolveClipboardCommand() on linux with wl-copy present → wl-copy', () => {
  // First lookup is for wl-copy; respond status 0.
  const spawnSync = makeSpawnSyncSpy((cmd, args) => {
    if (cmd === 'which' && args[0] === 'wl-copy') return { status: 0 };
    return { status: 1 };
  });
  const result = resolveClipboardCommand({ platform: 'linux', spawnSync });
  assert.deepEqual(result, { command: 'wl-copy', args: [] });
  // Should have attempted wl-copy first.
  assert.equal(spawnSync.calls[0].cmd, 'which');
  assert.deepEqual(spawnSync.calls[0].args, ['wl-copy']);
});

// -------------------------------------------------------------------------
// Case 4 — resolveClipboardCommand() on linux with xclip fallback
// -------------------------------------------------------------------------

test('30-06 case 4: resolveClipboardCommand() on linux with xclip only → xclip -selection clipboard', () => {
  const spawnSync = makeSpawnSyncSpy((cmd, args) => {
    if (cmd === 'which' && args[0] === 'wl-copy') return { status: 1 };
    if (cmd === 'which' && args[0] === 'xclip') return { status: 0 };
    return { status: 1 };
  });
  const result = resolveClipboardCommand({ platform: 'linux', spawnSync });
  assert.deepEqual(result, { command: 'xclip', args: ['-selection', 'clipboard'] });
  // Verify both lookups happened in order.
  assert.equal(spawnSync.calls[0].args[0], 'wl-copy');
  assert.equal(spawnSync.calls[1].args[0], 'xclip');
});

test('30-06 case 4b: resolveClipboardCommand() on linux with neither tool → null', () => {
  const spawnSync = makeSpawnSyncSpy(() => ({ status: 1 }));
  const result = resolveClipboardCommand({ platform: 'linux', spawnSync });
  assert.equal(result, null);
});

// -------------------------------------------------------------------------
// Case 5 — resolveClipboardCommand() on win32 → clip.exe
// -------------------------------------------------------------------------

test('30-06 case 5: resolveClipboardCommand() on win32 → clip.exe', () => {
  const result = resolveClipboardCommand({ platform: 'win32', spawnSync: makeSpawnSyncSpy([]) });
  assert.deepEqual(result, { command: 'clip.exe', args: [] });
});

// -------------------------------------------------------------------------
// Case 6 — buildIssueTemplateUrl() reuses 30-04 destination constant
// -------------------------------------------------------------------------

test('30-06 case 6: buildIssueTemplateUrl() reuses DESTINATION_REPO from 30-04 (no env-var override)', () => {
  const before = buildIssueTemplateUrl();
  assert.ok(before.includes(DESTINATION_REPO), `URL missing destination slug: ${before}`);
  assert.ok(before.includes('template=bug_report.md'), `URL missing template param: ${before}`);
  // Verify no env-var indirection by mutating bystander env vars.
  const savedRepo = process.env.GH_REPO;
  const savedIssueRepo = process.env.GDD_DEST;
  try {
    process.env.GH_REPO = 'evil/repo';
    process.env.GDD_DEST = 'malicious/elsewhere';
    const after = buildIssueTemplateUrl();
    assert.equal(after, before, 'URL must be byte-identical regardless of env vars');
  } finally {
    if (savedRepo === undefined) delete process.env.GH_REPO; else process.env.GH_REPO = savedRepo;
    if (savedIssueRepo === undefined) delete process.env.GDD_DEST; else process.env.GDD_DEST = savedIssueRepo;
  }
});

// -------------------------------------------------------------------------
// Case 7 — runFallback() writes exact message + URL
// -------------------------------------------------------------------------

test('30-06 case 7: runFallback() emits exact "gh CLI not found..." message + blank line + URL', async () => {
  const writes = [];
  const spy = { write(chunk) { writes.push(String(chunk)); } };
  // Inject a clipboard spawn that resolves successfully.
  const spawnSpy = makeSpawnAsyncSpy({ exitCode: 0 });
  const spawnSyncSpy = makeSpawnSyncSpy([{ status: 0 }]); // wl-copy/pbcopy detection

  const result = await runFallback('payload-bytes', {
    stdout: spy,
    platform: 'darwin', // pbcopy: no spawnSync lookup needed for darwin
    spawn: spawnSpy,
    spawnSync: spawnSyncSpy,
  });
  assert.equal(result.copied, true);
  assert.ok(result.url && result.url.includes(DESTINATION_REPO));

  const joined = writes.join('');
  assert.ok(
    joined.includes('gh CLI not found; payload copied to clipboard, paste into the link below.'),
    `Missing exact message in stdout. Got:\n${joined}`
  );
  // URL should appear after a blank line.
  const idxMsg = joined.indexOf('gh CLI not found');
  const idxUrl = joined.indexOf('https://github.com/' + DESTINATION_REPO);
  assert.ok(idxUrl > idxMsg, 'URL must appear after message');
  // Blank line check: between the message line and URL line, there should be exactly one empty line.
  const lines = joined.split(/\r?\n/);
  const msgLineIdx = lines.findIndex((l) => l.includes('gh CLI not found'));
  const urlLineIdx = lines.findIndex((l) => l.startsWith('https://github.com/'));
  assert.ok(msgLineIdx >= 0 && urlLineIdx > msgLineIdx, 'Could not locate message + URL lines');
  // There should be at least one blank line between them.
  const between = lines.slice(msgLineIdx + 1, urlLineIdx).map((l) => l.trim());
  assert.ok(between.includes(''), 'Expected blank line between message and URL');
  // Clipboard received the payload.
  assert.ok(
    spawnSpy.stdinWrites.join('').includes('payload-bytes'),
    `Clipboard stdin did not receive payload. Got: ${JSON.stringify(spawnSpy.stdinWrites)}`
  );
});

// =========================================================================
// KILL-SWITCH TESTS (Task 2)
// =========================================================================

// -------------------------------------------------------------------------
// Case 8 — env=1 → disabled, reason 'env'
// -------------------------------------------------------------------------

test('30-06 case 8: env GDD_DISABLE_ISSUE_REPORTER=1 → isDisabled true, reason env', () => {
  const cwd = mkTmpDir();
  try {
    assert.equal(isDisabled({ cwd, env: { GDD_DISABLE_ISSUE_REPORTER: '1' } }), true);
    assert.equal(getDisableReason({ cwd, env: { GDD_DISABLE_ISSUE_REPORTER: '1' } }), 'env');
    // Sanity: '0' is NOT treated as truthy.
    assert.equal(isDisabled({ cwd, env: { GDD_DISABLE_ISSUE_REPORTER: '0' } }), false);
    assert.equal(getDisableReason({ cwd, env: { GDD_DISABLE_ISSUE_REPORTER: '0' } }), null);
  } finally {
    rmDir(cwd);
  }
});

// -------------------------------------------------------------------------
// Case 9 — config=false (no env) → disabled, reason 'config'
// -------------------------------------------------------------------------

test('30-06 case 9: .design/config.json issue_reporter=false → isDisabled true, reason config', () => {
  const cwd = mkTmpDir();
  try {
    fs.mkdirSync(path.join(cwd, '.design'), { recursive: true });
    fs.writeFileSync(
      path.join(cwd, '.design', 'config.json'),
      JSON.stringify({ issue_reporter: false }),
      'utf8',
    );
    assert.equal(isDisabled({ cwd, env: {} }), true);
    assert.equal(getDisableReason({ cwd, env: {} }), 'config');
  } finally {
    rmDir(cwd);
  }
});

test('30-06 case 9b: .design/config.json issue_reporter=true → not disabled', () => {
  const cwd = mkTmpDir();
  try {
    fs.mkdirSync(path.join(cwd, '.design'), { recursive: true });
    fs.writeFileSync(
      path.join(cwd, '.design', 'config.json'),
      JSON.stringify({ issue_reporter: true }),
      'utf8',
    );
    assert.equal(isDisabled({ cwd, env: {} }), false);
    assert.equal(getDisableReason({ cwd, env: {} }), null);
  } finally {
    rmDir(cwd);
  }
});

// -------------------------------------------------------------------------
// Case 10 — both set → disabled, reason 'env' (precedence)
// -------------------------------------------------------------------------

test('30-06 case 10: env=1 AND config=false → disabled, reason env (precedence wins for display)', () => {
  const cwd = mkTmpDir();
  try {
    fs.mkdirSync(path.join(cwd, '.design'), { recursive: true });
    fs.writeFileSync(
      path.join(cwd, '.design', 'config.json'),
      JSON.stringify({ issue_reporter: false }),
      'utf8',
    );
    assert.equal(isDisabled({ cwd, env: { GDD_DISABLE_ISSUE_REPORTER: '1' } }), true);
    assert.equal(getDisableReason({ cwd, env: { GDD_DISABLE_ISSUE_REPORTER: '1' } }), 'env');
  } finally {
    rmDir(cwd);
  }
});

// -------------------------------------------------------------------------
// Case 11 — neither → not disabled, reason null
// -------------------------------------------------------------------------

test('30-06 case 11: no env, no config → not disabled, reason null', () => {
  const cwd = mkTmpDir();
  try {
    assert.equal(isDisabled({ cwd, env: {} }), false);
    assert.equal(getDisableReason({ cwd, env: {} }), null);
  } finally {
    rmDir(cwd);
  }
});

// -------------------------------------------------------------------------
// Case 12 — malformed config → does not throw, treated as enabled
// -------------------------------------------------------------------------

test('30-06 case 12: malformed .design/config.json → does not throw, reporter enabled', () => {
  const cwd = mkTmpDir();
  try {
    fs.mkdirSync(path.join(cwd, '.design'), { recursive: true });
    fs.writeFileSync(
      path.join(cwd, '.design', 'config.json'),
      '{ this is not valid json',
      'utf8',
    );
    // Must not throw.
    assert.doesNotThrow(() => isDisabled({ cwd, env: {} }));
    assert.equal(isDisabled({ cwd, env: {} }), false);
    assert.equal(getDisableReason({ cwd, env: {} }), null);
  } finally {
    rmDir(cwd);
  }
});

// =========================================================================
// health-mirror TESTS (Task 3) — exact-string assertions
// =========================================================================

/**
 * Run health-mirror with explicit cwd + env, return concatenated text
 * of detail/status lines so we can do .includes() assertions on the new line.
 */
async function runHealthFixture({ env = {}, cwd } = {}) {
  // Restore process.env after each call: the mirror reads from process.env
  // via the kill-switch path, so we have to actually mutate process.env
  // here. We DON'T pass env directly to kill-switch from the mirror — we
  // mutate process.env temporarily.
  const saved = {
    GDD_DISABLE_ISSUE_REPORTER: process.env.GDD_DISABLE_ISSUE_REPORTER,
  };
  try {
    if (env.GDD_DISABLE_ISSUE_REPORTER !== undefined) {
      process.env.GDD_DISABLE_ISSUE_REPORTER = env.GDD_DISABLE_ISSUE_REPORTER;
    } else {
      delete process.env.GDD_DISABLE_ISSUE_REPORTER;
    }
    const result = await getHealthChecks(cwd);
    return result;
  } finally {
    if (saved.GDD_DISABLE_ISSUE_REPORTER === undefined) {
      delete process.env.GDD_DISABLE_ISSUE_REPORTER;
    } else {
      process.env.GDD_DISABLE_ISSUE_REPORTER = saved.GDD_DISABLE_ISSUE_REPORTER;
    }
  }
}

function summarizeChecks(result) {
  return result.checks.map((c) => `${c.name}: ${c.detail}`).join('\n');
}

// -------------------------------------------------------------------------
// Case 13 — neither → "issue reporter: enabled"
// -------------------------------------------------------------------------

test('30-06 case 13: gsd-health (no env, no config) → "issue reporter: enabled"', async () => {
  const cwd = mkTmpDir();
  try {
    const result = await runHealthFixture({ env: {}, cwd });
    const text = summarizeChecks(result);
    assert.ok(
      text.includes('issue reporter: enabled'),
      `Expected "issue reporter: enabled" in health output. Got:\n${text}`
    );
    // The line must NOT contain the disabled variants.
    assert.ok(!text.includes('disabled by env'), 'Should not say disabled by env');
    assert.ok(!text.includes('disabled by config'), 'Should not say disabled by config');
  } finally {
    rmDir(cwd);
  }
});

// -------------------------------------------------------------------------
// Case 14 — env=1 → "issue reporter: disabled by env (GDD_DISABLE_ISSUE_REPORTER=1)"
// -------------------------------------------------------------------------

test('30-06 case 14: gsd-health (env=1) → "issue reporter: disabled by env (GDD_DISABLE_ISSUE_REPORTER=1)"', async () => {
  const cwd = mkTmpDir();
  try {
    const result = await runHealthFixture({
      env: { GDD_DISABLE_ISSUE_REPORTER: '1' },
      cwd,
    });
    const text = summarizeChecks(result);
    assert.ok(
      text.includes('issue reporter: disabled by env (GDD_DISABLE_ISSUE_REPORTER=1)'),
      `Expected exact env-disabled line. Got:\n${text}`
    );
  } finally {
    rmDir(cwd);
  }
});

// -------------------------------------------------------------------------
// Case 15 — config=false → "issue reporter: disabled by config (.design/config.json: issue_reporter=false)"
// -------------------------------------------------------------------------

test('30-06 case 15: gsd-health (config=false, no env) → "issue reporter: disabled by config (.design/config.json: issue_reporter=false)"', async () => {
  const cwd = mkTmpDir();
  try {
    fs.mkdirSync(path.join(cwd, '.design'), { recursive: true });
    fs.writeFileSync(
      path.join(cwd, '.design', 'config.json'),
      JSON.stringify({ issue_reporter: false }),
      'utf8',
    );
    const result = await runHealthFixture({ env: {}, cwd });
    const text = summarizeChecks(result);
    assert.ok(
      text.includes('issue reporter: disabled by config (.design/config.json: issue_reporter=false)'),
      `Expected exact config-disabled line. Got:\n${text}`
    );
  } finally {
    rmDir(cwd);
  }
});
