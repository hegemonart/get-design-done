'use strict';
// tests/issue-reporter-dedup.test.cjs
// Plan 30-05 — dedup module tests. All gh calls mocked via injected spawn spy.
// D-13: no live `gh` invocation in CI. Test 10 enforces.
//
// Covers ≥10 cases (we ship 11) against scripts/lib/issue-reporter/dedup.cjs:
//
//   1. searchByFingerprint single-match fixture → 1 match
//   2. searchByFingerprint no-match fixture → 0 matches
//   3. searchByFingerprint multi-match fixture → N matches in fixture order
//   4. react argv shape — gh api -X POST .../reactions -f content=+1
//   5. buildMeTooBody verbatim — exact 3-section string
//   6. buildMeTooBody negative-presence — no stack/path/env/cmd, exactly 3 lines
//   7. graceful network failure on searchByFingerprint → {degraded:true,reason:'network'}
//   8. react auth failure → rejects with err.reason === 'auth'
//   9. multi-match user selection — react(156) builds argv with 156
//  10. no live gh invocation — defense-in-depth real-spawn counter stays 0
//  11. destination guard — react/commentMeToo throw TypeError on empty destination

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const REPO_ROOT = path.resolve(__dirname, '..');
const ISSUE_REPORTER_DIR = path.join(REPO_ROOT, 'scripts', 'lib', 'issue-reporter');
const FIXTURES_DIR = path.join(REPO_ROOT, 'test-fixture', 'baselines', 'phase-30');

const NO_MATCH_FIXTURE = path.join(FIXTURES_DIR, 'gh-issue-list-no-match.json');
const MATCH_FIXTURE = path.join(FIXTURES_DIR, 'gh-issue-list-match.json');
const MULTI_MATCH_FIXTURE = path.join(FIXTURES_DIR, 'gh-issue-list-multi-match.json');

const {
  searchByFingerprint,
  react,
  commentMeToo,
  buildMeTooBody,
} = require(path.join(ISSUE_REPORTER_DIR, 'dedup.cjs'));

// -------------------------------------------------------------------------
// Helpers
// -------------------------------------------------------------------------

/**
 * Build a synchronous spawn spy.
 *
 * @param {Array<{status:number|null, stdout:string, stderr:string}>} responses
 * @returns {Function & {calls: Array<{cmd:string, args:string[], opts:any}>}}
 */
function makeSpawnSpy(responses) {
  const calls = [];
  let idx = 0;
  const spy = (cmd, args, opts) => {
    calls.push({ cmd, args: Array.isArray(args) ? args.slice() : [], opts });
    const r = responses[idx++] || { status: 1, stdout: '', stderr: 'no more mock responses' };
    return { status: r.status, stdout: r.stdout, stderr: r.stderr };
  };
  spy.calls = calls;
  return spy;
}

// -------------------------------------------------------------------------
// Defense-in-depth: count any real-spawn invocations from dedup.cjs.
// Test 10 asserts this is 0 at the end of the suite (D-13).
// -------------------------------------------------------------------------

const realSpawnCount = { count: 0 };
{
  // Wrap child_process.spawnSync ONCE so any non-injected spawn from dedup.cjs
  // increments the counter. The tests below always inject a spy, so this
  // should remain 0.
  const cp = require('node:child_process');
  const origSpawnSync = cp.spawnSync;
  cp.spawnSync = function tracedSpawnSync(...args) {
    realSpawnCount.count += 1;
    return origSpawnSync.apply(this, args);
  };
}

// -------------------------------------------------------------------------
// Test 1 — single-match
// -------------------------------------------------------------------------

test('30-05: searchByFingerprint single-match fixture → 1 match', async () => {
  const stdout = fs.readFileSync(MATCH_FIXTURE, 'utf8');
  const spawn = makeSpawnSpy([{ status: 0, stdout, stderr: '' }]);
  const result = await searchByFingerprint('abc12345', { destination: 'owner/repo', spawn });
  assert.equal(result.matches.length, 1);
  assert.equal(result.matches[0].number, 142);
  assert.equal(result.matches[0].title, 'Fast-lookup crash on Figma token sync (recurring)');
  assert.equal(result.matches[0].url, 'https://github.com/hegemonart/get-design-done/issues/142');
  assert.equal(result.degraded, undefined);
  // argv shape: gh issue list --search "fingerprint:<hash>" --json number,title,url --repo <destination>
  assert.equal(spawn.calls[0].cmd, 'gh');
  assert.deepEqual(spawn.calls[0].args, [
    'issue', 'list',
    '--search', 'fingerprint:abc12345',
    '--json', 'number,title,url',
    '--repo', 'owner/repo',
  ]);
});

// -------------------------------------------------------------------------
// Test 2 — no-match
// -------------------------------------------------------------------------

test('30-05: searchByFingerprint no-match fixture → 0 matches', async () => {
  const stdout = fs.readFileSync(NO_MATCH_FIXTURE, 'utf8');
  const spawn = makeSpawnSpy([{ status: 0, stdout, stderr: '' }]);
  const result = await searchByFingerprint('zzz00000', { destination: 'owner/repo', spawn });
  assert.equal(result.matches.length, 0);
  assert.equal(result.degraded, undefined);
});

// -------------------------------------------------------------------------
// Test 3 — multi-match
// -------------------------------------------------------------------------

test('30-05: searchByFingerprint multi-match fixture → 3 matches in fixture order', async () => {
  const stdout = fs.readFileSync(MULTI_MATCH_FIXTURE, 'utf8');
  const spawn = makeSpawnSpy([{ status: 0, stdout, stderr: '' }]);
  const result = await searchByFingerprint('abc12345', { destination: 'owner/repo', spawn });
  assert.equal(result.matches.length, 3);
  assert.equal(result.matches[0].number, 142);
  assert.equal(result.matches[1].number, 156);
  assert.equal(result.matches[2].number, 178);
});

// -------------------------------------------------------------------------
// Test 4 — react argv shape
// -------------------------------------------------------------------------

test('30-05: react spawns expected `gh api -X POST .../reactions -f content=+1` argv', async () => {
  const spawn = makeSpawnSpy([{ status: 0, stdout: '{"id":99}', stderr: '' }]);
  const r = await react(142, { destination: 'owner/repo', spawn });
  assert.equal(r.ok, true);
  assert.equal(spawn.calls[0].cmd, 'gh');
  assert.deepEqual(spawn.calls[0].args, [
    'api',
    '-X', 'POST',
    '/repos/owner/repo/issues/142/reactions',
    '-f', 'content=+1',
  ]);
});

// -------------------------------------------------------------------------
// Test 5 — buildMeTooBody verbatim (D-06 contract: exactly 3 fields)
// -------------------------------------------------------------------------

test('30-05: buildMeTooBody returns exact 3-section string verbatim', () => {
  const body = buildMeTooBody({
    lastErrorLine: 'TypeError: x is undefined',
    runtime: 'node 22.5.0 (darwin-arm64)',
    pluginVersion: '1.30.0',
  });
  assert.equal(
    body,
    'Last error: TypeError: x is undefined\n' +
    'Runtime: node 22.5.0 (darwin-arm64)\n' +
    'Plugin version: 1.30.0'
  );
});

// -------------------------------------------------------------------------
// Test 6 — buildMeTooBody negative-presence (no stack/path/env/cmd, 3 lines)
// -------------------------------------------------------------------------

test('30-05: buildMeTooBody body has NO stack/path/env/command + exactly 3 lines', () => {
  const body = buildMeTooBody({
    lastErrorLine: 'TypeError: x is undefined',
    runtime: 'node 22.5.0',
    pluginVersion: '1.30.0',
  });
  // No stack-frame markers.
  assert.ok(!body.includes(' at '), 'body must not contain stack-frame "at " markers');
  // No POSIX or Windows absolute paths.
  assert.ok(!body.includes('/Users/'), 'body must not leak /Users/ paths');
  assert.ok(!body.includes('/home/'), 'body must not leak /home/ paths');
  assert.ok(!body.includes('C:\\'), 'body must not leak Windows C:\\ paths');
  // No env dump (env-var assignment-style).
  assert.ok(!body.includes('USER='), 'body must not include USER= dump');
  assert.ok(!body.includes('PATH='), 'body must not include PATH= dump');
  assert.ok(!body.includes('HOME='), 'body must not include HOME= dump');
  // No invocation line.
  assert.ok(!body.includes('gh '), 'body must not include gh command-line');
  // Exactly 3 lines, in order.
  const lines = body.split('\n');
  assert.equal(lines.length, 3, 'body must be exactly 3 lines');
  assert.ok(lines[0].startsWith('Last error:'), 'line 1 must start with "Last error:"');
  assert.ok(lines[1].startsWith('Runtime:'), 'line 2 must start with "Runtime:"');
  assert.ok(lines[2].startsWith('Plugin version:'), 'line 3 must start with "Plugin version:"');
});

// -------------------------------------------------------------------------
// Test 7 — graceful network failure (degraded:true, reason:'network')
// -------------------------------------------------------------------------

test('30-05: searchByFingerprint resolves degraded:true on network failure', async () => {
  const spawn = makeSpawnSpy([{
    status: 1,
    stdout: '',
    stderr: 'Could not resolve host: api.github.com',
  }]);
  const result = await searchByFingerprint('abc12345', { destination: 'owner/repo', spawn });
  assert.equal(result.matches.length, 0);
  assert.equal(result.degraded, true);
  assert.equal(result.reason, 'network');
});

// -------------------------------------------------------------------------
// Test 8 — react auth failure → rejects with err.reason === 'auth'
// -------------------------------------------------------------------------

test('30-05: react rejects with reason=auth on HTTP 401 stderr', async () => {
  const spawn = makeSpawnSpy([{
    status: 1,
    stdout: '',
    stderr: 'gh: HTTP 401: Bad credentials (https://api.github.com/...)',
  }]);
  await assert.rejects(
    () => react(142, { destination: 'owner/repo', spawn }),
    (err) => {
      assert.equal(err.reason, 'auth');
      assert.ok(typeof err.stderr === 'string' && err.stderr.includes('401'));
      return true;
    }
  );
});

// -------------------------------------------------------------------------
// Test 9 — multi-match user selection: react(156) builds argv with 156
// -------------------------------------------------------------------------

test('30-05: multi-match user picks #156 → react argv path uses /issues/156/reactions', async () => {
  const spawn = makeSpawnSpy([{ status: 0, stdout: '{"id":100}', stderr: '' }]);
  await react(156, { destination: 'owner/repo', spawn });
  // /repos/owner/repo/issues/156/reactions is at args index 3.
  assert.equal(spawn.calls[0].args[3], '/repos/owner/repo/issues/156/reactions');
  // Sanity: NOT #142.
  assert.ok(!spawn.calls[0].args[3].includes('/142/'));
});

// -------------------------------------------------------------------------
// Test 10 — defense-in-depth: NO real gh binary invocations occurred
// -------------------------------------------------------------------------

test('30-05: D-13 — zero live gh invocations during test run', () => {
  assert.equal(
    realSpawnCount.count,
    0,
    `Expected 0 real child_process.spawnSync calls; got ${realSpawnCount.count}. ` +
    'Per D-13, dedup tests MUST inject a spawn spy and never reach the real binary.'
  );
});

// -------------------------------------------------------------------------
// Test 11 — destination guard: empty destination throws TypeError
// -------------------------------------------------------------------------

test('30-05: react/commentMeToo refuse empty destination (TypeError guard)', async () => {
  // react with empty destination.
  await assert.rejects(
    () => react(142, { destination: '', spawn: makeSpawnSpy([{ status: 0, stdout: '', stderr: '' }]) }),
    TypeError
  );
  // commentMeToo with empty destination.
  await assert.rejects(
    () => commentMeToo(142, {
      destination: '',
      errorContext: { lastErrorLine: 'x' },
      runtime: 'node 22',
      pluginVersion: '1.30.0',
      spawn: makeSpawnSpy([{ status: 0, stdout: '', stderr: '' }]),
    }),
    TypeError
  );
  // searchByFingerprint with empty destination.
  await assert.rejects(
    () => searchByFingerprint('abc', { destination: '', spawn: makeSpawnSpy([{ status: 0, stdout: '[]', stderr: '' }]) }),
    TypeError
  );
  // searchByFingerprint with empty fingerprint.
  await assert.rejects(
    () => searchByFingerprint('', { destination: 'owner/repo', spawn: makeSpawnSpy([{ status: 0, stdout: '[]', stderr: '' }]) }),
    TypeError
  );
});

// -------------------------------------------------------------------------
// Bonus — commentMeToo end-to-end happy path (verifies pseudonymized
// lastErrorLine flows through unchanged, per D-01).
// -------------------------------------------------------------------------

test('30-05: commentMeToo passes pseudonymized lastErrorLine through to gh body', async () => {
  const spawn = makeSpawnSpy([{
    status: 0,
    stdout: 'https://github.com/owner/repo/issues/142#issuecomment-9999\n',
    stderr: '',
  }]);
  const result = await commentMeToo(142, {
    destination: 'owner/repo',
    // ALREADY pseudonymized by 30-02 upstream — dedup must NOT re-derive.
    errorContext: { lastErrorLine: 'Error: <home>/proj/foo.cjs:1 — undefined token' },
    runtime: 'node 22.5.0 (linux-x64)',
    pluginVersion: '1.30.0',
    spawn,
  });
  assert.equal(result.ok, true);
  // argv shape: gh issue comment <number> --repo <destination> --body <body>
  const call = spawn.calls[0];
  assert.equal(call.cmd, 'gh');
  assert.equal(call.args[0], 'issue');
  assert.equal(call.args[1], 'comment');
  assert.equal(call.args[2], '142');
  assert.equal(call.args[3], '--repo');
  assert.equal(call.args[4], 'owner/repo');
  assert.equal(call.args[5], '--body');
  // Body uses pseudonymized lastErrorLine verbatim.
  const body = call.args[6];
  assert.ok(body.includes('<home>/proj/foo.cjs'), 'body must carry pseudonymized path token');
  assert.ok(!body.includes('/Users/'), 'body must NOT contain raw POSIX home path');
  assert.ok(!body.includes('C:\\'), 'body must NOT contain raw Windows path');
});
