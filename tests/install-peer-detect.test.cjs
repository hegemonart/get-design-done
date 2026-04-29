'use strict';

// Plan 27-11 — install-time peer detection.
// Tests the runtimes.cjs detection helpers (peerBinary field per runtime,
// listPeerCapableRuntimes, detectInstalledPeers).
// Recovered from a stalled async agent (a5d43947) — agent loaded context but
// stalled before writing files. peerBinary field + detection helper landed
// inline; the install.cjs interactive nudge integration is documented as a
// known-gap for plan 27-12 closeout.

const test = require('node:test');
const assert = require('node:assert/strict');

const REPO_ROOT = require('node:path').resolve(__dirname, '..');
const runtimesPath = require('node:path').join(REPO_ROOT, 'scripts/lib/install/runtimes.cjs');

// Fresh require to avoid cache pollution from sibling tests.
function freshRequire(p) {
  delete require.cache[require.resolve(p)];
  return require(p);
}

test('27-11: peerBinary field exists on the 5 peer-capable runtimes', () => {
  const { RUNTIMES, getRuntime } = freshRequire(runtimesPath);
  const expectedPeers = ['codex', 'gemini', 'cursor', 'copilot', 'qwen'];
  for (const id of expectedPeers) {
    const r = getRuntime(id);
    assert.equal(typeof r.peerBinary, 'string', `${id} must have peerBinary field`);
    assert.ok(r.peerBinary.length > 0, `${id}.peerBinary must be non-empty`);
  }
});

test('27-11: peerBinary field is absent on the 9 non-peer runtimes', () => {
  const { RUNTIMES } = freshRequire(runtimesPath);
  const nonPeerIds = ['claude', 'opencode', 'kilo', 'windsurf', 'antigravity', 'augment', 'trae', 'codebuddy', 'cline'];
  for (const id of nonPeerIds) {
    const r = RUNTIMES.find((x) => x.id === id);
    assert.ok(r, `${id} must exist in RUNTIMES`);
    assert.equal(r.peerBinary, undefined, `${id} must NOT have peerBinary field (it's not a peer-CLI)`);
  }
});

test('27-11: peerBinary is platform-aware (.cmd on Windows, plain elsewhere)', () => {
  const { getRuntime } = freshRequire(runtimesPath);
  const r = getRuntime('codex');
  if (process.platform === 'win32') {
    assert.match(r.peerBinary, /\.cmd$/, 'Windows peerBinary must end in .cmd');
  } else {
    assert.doesNotMatch(r.peerBinary, /\.cmd$/, 'POSIX peerBinary must not end in .cmd');
  }
});

test('27-11: listPeerCapableRuntimes returns exactly the 5 peer-capable runtimes', () => {
  const { listPeerCapableRuntimes } = freshRequire(runtimesPath);
  const peerCapable = listPeerCapableRuntimes();
  assert.equal(peerCapable.length, 5, 'Exactly 5 peer-capable runtimes expected');
  const ids = peerCapable.map((r) => r.id).sort();
  assert.deepEqual(ids, ['codex', 'copilot', 'cursor', 'gemini', 'qwen']);
});

test('27-11: detectInstalledPeers returns IDs for binaries the which-fn says exist', () => {
  const { detectInstalledPeers } = freshRequire(runtimesPath);
  // Mock `which` to claim codex + gemini are installed, others not.
  const installed = new Set(['codex', 'gemini'].map((id) => {
    return process.platform === 'win32' ? `${id}.cmd` : id;
  }));
  // For cursor (cursor-agent), use the platform-aware name explicitly:
  // The mock returns truthy iff the requested binary matches one of `installed`.
  const fakeWhich = (binary) => {
    return installed.has(binary) ? `/usr/local/bin/${binary}` : null;
  };
  const detected = detectInstalledPeers({ which: fakeWhich });
  assert.deepEqual(detected.sort(), ['codex', 'gemini']);
});

test('27-11: detectInstalledPeers returns empty array when no peers installed', () => {
  const { detectInstalledPeers } = freshRequire(runtimesPath);
  const fakeWhich = () => null;
  const detected = detectInstalledPeers({ which: fakeWhich });
  assert.deepEqual(detected, []);
});

test('27-11: detectInstalledPeers does not throw when which-fn throws', () => {
  const { detectInstalledPeers } = freshRequire(runtimesPath);
  const fakeWhich = () => {
    throw new Error('ENOENT');
  };
  // Must not propagate — return empty array instead.
  const detected = detectInstalledPeers({ which: fakeWhich });
  assert.deepEqual(detected, []);
});

test('27-11: detectInstalledPeers default which uses real PATH (smoke)', () => {
  const { detectInstalledPeers } = freshRequire(runtimesPath);
  // No `which` arg = use the real `which`/`where` command.
  // We cannot assert what's installed on the test runner, but we can assert
  // the call doesn't throw and returns an array.
  const detected = detectInstalledPeers();
  assert.ok(Array.isArray(detected));
  // All returned IDs must be from the 5 peer-capable set.
  const valid = new Set(['codex', 'gemini', 'cursor', 'copilot', 'qwen']);
  for (const id of detected) {
    assert.ok(valid.has(id), `${id} must be a known peer-capable runtime ID`);
  }
});
