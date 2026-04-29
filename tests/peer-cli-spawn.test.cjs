'use strict';
// tests/peer-cli-spawn.test.cjs — Plan 27-03.
//
// Covers the Windows .cmd EINVAL workaround in spawn-cmd.cjs:
//   - on simulated Windows + .cmd path → spawn(`"<fwd>" <args>`, [], {shell:true})
//   - on simulated Windows + .exe path → direct spawn(path, args)
//   - on POSIX  + any path → direct spawn(path, args), real round-trip via /bin/echo
//   - quoteShellArg correctly handles spaces, embedded quotes, empty args
//   - bad input (empty / non-string command) throws TypeError

const test = require('node:test');
const assert = require('node:assert/strict');
const os = require('node:os');

const {
  spawnCmd,
  quoteShellArg,
} = require('../scripts/lib/peer-cli/spawn-cmd.cjs');

// Capture every call to the injected spawn fake so we can assert on the
// EXACT args spawnCmd would have passed to child_process.spawn.
function captureSpawn() {
  const calls = [];
  const fn = (cmd, args, opts) => {
    calls.push({ cmd, args, opts });
    // Return a minimal stub — none of the spawn-cmd unit tests interact with
    // it; we only assert on the captured call shape.
    return { stub: true };
  };
  return { fn, calls };
}

test('spawnCmd: throws on missing/invalid command', () => {
  assert.throws(() => spawnCmd(), TypeError);
  assert.throws(() => spawnCmd(''), TypeError);
  assert.throws(() => spawnCmd(123), TypeError);
});

test('spawnCmd: simulated Windows + .cmd → shell:true with forward-slashed quoted path', () => {
  const { fn, calls } = captureSpawn();
  spawnCmd(
    'C:\\Users\\me\\AppData\\Local\\codex.cmd',
    ['app-server', '--workspace', '/repo'],
    { cwd: '/repo' },
    { platform: 'win32', spawn: fn },
  );
  assert.equal(calls.length, 1);
  const call = calls[0];
  assert.equal(
    call.cmd,
    '"C:/Users/me/AppData/Local/codex.cmd" app-server --workspace /repo',
    'cmd line must be a single quoted-path + space-joined args string',
  );
  assert.deepEqual(call.args, [], 'args array must be empty in shell mode');
  assert.equal(call.opts.shell, true, 'shell: true must be set');
  assert.equal(call.opts.cwd, '/repo', 'caller-supplied opts must be preserved');
});

test('spawnCmd: simulated Windows + .CMD (uppercase) → still hits the shell branch', () => {
  const { fn, calls } = captureSpawn();
  spawnCmd(
    'C:\\Tools\\GEMINI.CMD',
    ['acp'],
    {},
    { platform: 'win32', spawn: fn },
  );
  assert.equal(calls.length, 1);
  assert.equal(calls[0].opts.shell, true);
  assert.match(calls[0].cmd, /GEMINI\.CMD" acp$/);
});

test('spawnCmd: simulated Windows + .bat → shell branch (same root cause as .cmd)', () => {
  const { fn, calls } = captureSpawn();
  spawnCmd(
    'C:\\Tools\\helper.bat',
    [],
    {},
    { platform: 'win32', spawn: fn },
  );
  assert.equal(calls.length, 1);
  assert.equal(calls[0].opts.shell, true);
  assert.equal(calls[0].cmd, '"C:/Tools/helper.bat"');
});

test('spawnCmd: simulated Windows + .exe → direct exec (NOT shell)', () => {
  const { fn, calls } = captureSpawn();
  spawnCmd(
    'C:\\Windows\\System32\\node.exe',
    ['--version'],
    { cwd: 'C:/repo' },
    { platform: 'win32', spawn: fn },
  );
  assert.equal(calls.length, 1);
  const call = calls[0];
  assert.equal(call.cmd, 'C:\\Windows\\System32\\node.exe');
  assert.deepEqual(call.args, ['--version']);
  assert.notEqual(call.opts.shell, true);
});

test('spawnCmd: simulated POSIX + .sh → direct exec', () => {
  const { fn, calls } = captureSpawn();
  spawnCmd(
    '/usr/local/bin/gemini',
    ['acp'],
    { cwd: '/repo' },
    { platform: 'linux', spawn: fn },
  );
  assert.equal(calls.length, 1);
  const call = calls[0];
  assert.equal(call.cmd, '/usr/local/bin/gemini');
  assert.deepEqual(call.args, ['acp']);
  assert.notEqual(call.opts.shell, true);
});

test('spawnCmd: simulated POSIX + .cmd extension → still direct exec (we only shell on Windows)', () => {
  // Edge case: a peer-CLI on Linux that for some reason has a .cmd file —
  // the EINVAL bug does NOT exist there, so we should NOT activate the
  // shell-mode workaround. Doing so would silently change argv quoting.
  const { fn, calls } = captureSpawn();
  spawnCmd(
    '/opt/weird/binary.cmd',
    ['x'],
    {},
    { platform: 'linux', spawn: fn },
  );
  assert.equal(calls.length, 1);
  assert.notEqual(calls[0].opts.shell, true);
  assert.equal(calls[0].cmd, '/opt/weird/binary.cmd');
});

test('spawnCmd: Windows .cmd with an arg containing a space → quoted', () => {
  const { fn, calls } = captureSpawn();
  spawnCmd(
    'C:\\Tools\\codex.cmd',
    ['--prompt', 'hello world'],
    {},
    { platform: 'win32', spawn: fn },
  );
  assert.equal(calls.length, 1);
  assert.equal(
    calls[0].cmd,
    '"C:/Tools/codex.cmd" --prompt "hello world"',
  );
});

test('spawnCmd: Windows .cmd with no args → bare quoted path', () => {
  const { fn, calls } = captureSpawn();
  spawnCmd(
    'C:\\Tools\\codex.cmd',
    [],
    {},
    { platform: 'win32', spawn: fn },
  );
  assert.equal(calls.length, 1);
  assert.equal(calls[0].cmd, '"C:/Tools/codex.cmd"');
});

test('spawnCmd: Windows .cmd path with spaces → quoted around the forward-slash form', () => {
  const { fn, calls } = captureSpawn();
  spawnCmd(
    'C:\\Program Files\\codex\\codex.cmd',
    ['--help'],
    {},
    { platform: 'win32', spawn: fn },
  );
  assert.equal(calls.length, 1);
  assert.equal(
    calls[0].cmd,
    '"C:/Program Files/codex/codex.cmd" --help',
  );
});

test('quoteShellArg: leaves plain alphanumerics + dashes untouched', () => {
  assert.equal(quoteShellArg('foo'), 'foo');
  assert.equal(quoteShellArg('--flag'), '--flag');
  assert.equal(quoteShellArg('value123'), 'value123');
});

test('quoteShellArg: empty arg → ""', () => {
  assert.equal(quoteShellArg(''), '""');
});

test('quoteShellArg: arg with spaces → wrapped in double quotes', () => {
  assert.equal(quoteShellArg('hello world'), '"hello world"');
});

test('quoteShellArg: embedded double-quote → doubled per cmd.exe rules', () => {
  assert.equal(quoteShellArg('say "hi"'), '"say ""hi"""');
});

test('quoteShellArg: cmd.exe metachars → quoted', () => {
  for (const ch of ['&', '|', '<', '>', '^', '(', ')', '%', '!']) {
    const out = quoteShellArg(`x${ch}y`);
    assert.ok(
      out.startsWith('"') && out.endsWith('"'),
      `${ch} must trigger quoting, got ${out}`,
    );
  }
});

test('spawnCmd: real POSIX round-trip via /bin/echo (skipped on Windows CI)', { skip: process.platform === 'win32' }, async () => {
  // Use the real spawn — no internals override — to confirm the POSIX
  // direct-exec path actually executes a binary and returns output.
  const echo = '/bin/echo';
  // /bin/echo exists on macOS and most Linux distros; if the layout is
  // unusual this test self-skips via the os.platform check above and the
  // file-exists check below.
  const fs = require('node:fs');
  if (!fs.existsSync(echo)) {
    return; // No /bin/echo available; not a failure.
  }
  const cp = spawnCmd(echo, ['hello-from-spawn-cmd']);
  let out = '';
  cp.stdout.on('data', (b) => {
    out += b.toString('utf8');
  });
  await new Promise((resolve, reject) => {
    cp.once('error', reject);
    cp.once('exit', resolve);
  });
  assert.equal(out.trim(), 'hello-from-spawn-cmd');
});

test('spawnCmd: real POSIX nonexistent binary surfaces an error event', { skip: process.platform === 'win32' }, async () => {
  const cp = spawnCmd('/nonexistent/peer-cli-xyzzy', []);
  await new Promise((resolve) => {
    // Either 'error' fires immediately (ENOENT) or 'exit' with non-zero.
    cp.once('error', () => resolve());
    cp.once('exit', (code) => {
      assert.notEqual(code, 0, 'nonexistent binary should not exit cleanly');
      resolve();
    });
  });
  // Suppress the unhandled 'error' warning if the listener above already
  // consumed it — node deduplicates by listener reference.
  cp.removeAllListeners('error');
});

// Sanity: re-confirm the os module agrees with what we're injecting in tests.
test('test-only: process.platform is one of {linux, darwin, win32}', () => {
  assert.ok(['linux', 'darwin', 'win32'].includes(process.platform));
  assert.equal(typeof os.platform(), 'string');
});
