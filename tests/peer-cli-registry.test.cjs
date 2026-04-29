// tests/peer-cli-registry.test.cjs — Plan 27-05.
//
// Covers `scripts/lib/peer-cli/registry.cjs`:
//   - capability matrix introspection (CONTEXT D-05)
//   - readEnabledPeers reads .design/config.json#peer_cli.enabled_peers
//     with empty-allowlist defaults (CONTEXT D-11)
//   - healthProbe returns {available:true|false, reason} for each gate
//   - findPeerFor returns the first peer in alphabetical order claiming
//     a role; tie-breaks deterministically (D-05)
//   - dispatch returns null on any peer-absent / peer-error / adapter-error
//     path (D-07 transparent fallback) and never throws on those paths
//
// Tests use mock adapters injected via opts.loadAdapter so we don't depend
// on Plan 27-04's adapter modules having landed.

'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const registry = require('../scripts/lib/peer-cli/registry.cjs');
const { makeMockAdapter } = require('./fixtures/peer-cli/mock-adapter.cjs');

// ── Helpers ────────────────────────────────────────────────────────────────

/**
 * Build a temporary repo root with .design/config.json prefilled. Returns
 * the absolute path; caller should rm -rf it on teardown if it cares about
 * filesystem hygiene (we use os.tmpdir so leftover dirs are harmless).
 */
function tmpRepoWithConfig(configValue) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gdd-peer-registry-test-'));
  const designDir = path.join(dir, '.design');
  fs.mkdirSync(designDir, { recursive: true });
  if (configValue !== undefined) {
    fs.writeFileSync(
      path.join(designDir, 'config.json'),
      typeof configValue === 'string' ? configValue : JSON.stringify(configValue),
      'utf8',
    );
  }
  return dir;
}

/**
 * Build a `loadAdapter` injection function from a plain peer→adapter table.
 */
function loadAdapterFromTable(table) {
  return (peer) => {
    if (!Object.prototype.hasOwnProperty.call(table, peer)) {
      throw new Error(`mock loadAdapter: no entry for peer "${peer}"`);
    }
    return table[peer];
  };
}

/** Build a fileExists fake from a Set of paths. */
function fileExistsFromSet(set) {
  return (p) => set.has(p);
}

// ── Capability matrix (D-05) ───────────────────────────────────────────────

test('CAPABILITY_MATRIX matches D-05 lock', () => {
  const m = registry.CAPABILITY_MATRIX;
  assert.deepEqual([...m.codex.roles], ['execute']);
  assert.equal(m.codex.protocol, 'asp');

  assert.deepEqual([...m.gemini.roles], ['research', 'exploration']);
  assert.equal(m.gemini.protocol, 'acp');

  assert.deepEqual([...m.cursor.roles], ['debug', 'plan']);
  assert.equal(m.cursor.protocol, 'acp');

  assert.deepEqual([...m.copilot.roles], ['review', 'research']);
  assert.equal(m.copilot.protocol, 'acp');

  assert.deepEqual([...m.qwen.roles], ['write']);
  assert.equal(m.qwen.protocol, 'acp');
});

test('KNOWN_PEERS is alphabetically sorted (deterministic tie-break)', () => {
  assert.deepEqual([...registry.KNOWN_PEERS], ['codex', 'copilot', 'cursor', 'gemini', 'qwen']);
});

test('describeCapabilities returns mutable JSON-shaped snapshot', () => {
  const snap = registry.describeCapabilities();
  // mutating the snapshot must not affect the frozen original
  snap.gemini.roles.push('hijack');
  assert.deepEqual([...registry.CAPABILITY_MATRIX.gemini.roles], ['research', 'exploration']);
});

// ── readEnabledPeers (D-11 opt-in gating) ──────────────────────────────────

test('readEnabledPeers returns [] when .design/config.json is missing', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gdd-peer-registry-test-'));
  // no config.json written
  assert.deepEqual(registry.readEnabledPeers(dir), []);
});

test('readEnabledPeers returns [] when config.json is malformed JSON', () => {
  const dir = tmpRepoWithConfig('{ this is not json }');
  assert.deepEqual(registry.readEnabledPeers(dir), []);
});

test('readEnabledPeers returns [] when peer_cli key is missing', () => {
  const dir = tmpRepoWithConfig({ unrelated: { stuff: true } });
  assert.deepEqual(registry.readEnabledPeers(dir), []);
});

test('readEnabledPeers returns the configured allowlist (lowercased)', () => {
  const dir = tmpRepoWithConfig({ peer_cli: { enabled_peers: ['Gemini', 'CODEX'] } });
  assert.deepEqual(registry.readEnabledPeers(dir).sort(), ['codex', 'gemini']);
});

test('readEnabledPeers drops unknown peer IDs (silent typo tolerance)', () => {
  const dir = tmpRepoWithConfig({
    peer_cli: { enabled_peers: ['gemini', 'definitely-not-a-peer', 'codex'] },
  });
  assert.deepEqual(registry.readEnabledPeers(dir).sort(), ['codex', 'gemini']);
});

test('readEnabledPeers de-duplicates repeats', () => {
  const dir = tmpRepoWithConfig({
    peer_cli: { enabled_peers: ['gemini', 'gemini', 'GEMINI'] },
  });
  assert.deepEqual(registry.readEnabledPeers(dir), ['gemini']);
});

// ── healthProbe ────────────────────────────────────────────────────────────

test('healthProbe rejects unknown peer IDs', () => {
  const r = registry.healthProbe('not-a-peer', { enabledPeers: ['not-a-peer'] });
  assert.equal(r.available, false);
  assert.match(r.reason, /unknown peer/);
});

test('healthProbe rejects peer not in enabled_peers (D-11 opt-in)', () => {
  const r = registry.healthProbe('gemini', { enabledPeers: [] });
  assert.equal(r.available, false);
  assert.match(r.reason, /opt-in required/);
});

test('healthProbe rejects when adapter module fails to load', () => {
  const r = registry.healthProbe('gemini', {
    enabledPeers: ['gemini'],
    loadAdapter: () => null, // simulate require() failing
  });
  assert.equal(r.available, false);
  assert.match(r.reason, /adapter module/);
});

test('healthProbe accepts peer when adapter omits peerBinary (graceful unprobed)', () => {
  // Per the registry's documented choice: an adapter without peerBinary is
  // "available pending real call" — dispatch will try and surface failures
  // through the null-fallback path.
  const r = registry.healthProbe('gemini', {
    enabledPeers: ['gemini'],
    loadAdapter: () => makeMockAdapter({ omitBinary: true }),
  });
  assert.equal(r.available, true);
});

test('healthProbe rejects when peerBinary throws', () => {
  const r = registry.healthProbe('gemini', {
    enabledPeers: ['gemini'],
    loadAdapter: () => makeMockAdapter({ binaryThrows: true }),
  });
  assert.equal(r.available, false);
  assert.match(r.reason, /peerBinary\(\) threw/);
});

test('healthProbe rejects when peerBinary returns null (peer not installed)', () => {
  const r = registry.healthProbe('gemini', {
    enabledPeers: ['gemini'],
    loadAdapter: () => makeMockAdapter({ binaryNull: true }),
  });
  assert.equal(r.available, false);
  assert.match(r.reason, /not resolved by adapter/);
});

test('healthProbe rejects when binary path does not exist on disk', () => {
  const r = registry.healthProbe('gemini', {
    enabledPeers: ['gemini'],
    loadAdapter: () => makeMockAdapter({ binPath: '/no/such/file' }),
    fileExists: fileExistsFromSet(new Set()),
  });
  assert.equal(r.available, false);
  assert.match(r.reason, /binary missing at \/no\/such\/file/);
});

test('healthProbe accepts when allowlisted + adapter loads + binary exists', () => {
  const r = registry.healthProbe('gemini', {
    enabledPeers: ['gemini'],
    loadAdapter: () => makeMockAdapter({ binPath: '/fake/gemini' }),
    fileExists: fileExistsFromSet(new Set(['/fake/gemini'])),
  });
  assert.equal(r.available, true);
});

// ── findPeerFor ────────────────────────────────────────────────────────────

test('findPeerFor: throws on bad role', () => {
  assert.throws(() => registry.findPeerFor('', null, {}), TypeError);
  assert.throws(() => registry.findPeerFor(123, null, {}), TypeError);
});

test('findPeerFor: throws on bad tier (non-string non-null)', () => {
  assert.throws(() => registry.findPeerFor('research', { hello: true }, {}), TypeError);
});

test('findPeerFor: returns null when no peer claims the role', () => {
  const got = registry.findPeerFor('totally-made-up-role', null, {
    enabledPeers: ['gemini', 'codex'],
    loadAdapter: () => makeMockAdapter({ binPath: '/x' }),
    fileExists: () => true,
  });
  assert.equal(got, null);
});

test('findPeerFor: returns null when role exists but no peer is allowlisted', () => {
  const got = registry.findPeerFor('research', null, {
    enabledPeers: [], // opt-in gated everything off
    loadAdapter: () => makeMockAdapter({ binPath: '/x' }),
    fileExists: () => true,
  });
  assert.equal(got, null);
});

test('findPeerFor: deterministic alphabetical tie-break (research → copilot before gemini)', () => {
  // Both copilot AND gemini claim "research". Alphabetical order across
  // KNOWN_PEERS = [codex, copilot, cursor, gemini, qwen], so copilot wins.
  const table = {
    copilot: makeMockAdapter({ binPath: '/fake/copilot' }),
    gemini:  makeMockAdapter({ binPath: '/fake/gemini' }),
  };
  const got = registry.findPeerFor('research', null, {
    enabledPeers: ['copilot', 'gemini'],
    loadAdapter: loadAdapterFromTable(table),
    fileExists: fileExistsFromSet(new Set(['/fake/copilot', '/fake/gemini'])),
  });
  assert.ok(got);
  assert.equal(got.peer, 'copilot');
  assert.equal(got.protocol, 'acp');
});

test('findPeerFor: skips earlier-alphabet peer when its health probe fails', () => {
  // copilot is allowlisted but its binary is missing → registry must
  // fall through to gemini (next in alphabetical order claiming research).
  const table = {
    copilot: makeMockAdapter({ binPath: '/missing/copilot' }),
    gemini:  makeMockAdapter({ binPath: '/fake/gemini' }),
  };
  const got = registry.findPeerFor('research', null, {
    enabledPeers: ['copilot', 'gemini'],
    loadAdapter: loadAdapterFromTable(table),
    fileExists: fileExistsFromSet(new Set(['/fake/gemini'])), // copilot path absent
  });
  assert.ok(got);
  assert.equal(got.peer, 'gemini');
});

test('findPeerFor: routes execute → codex (only claimant)', () => {
  const table = {
    codex: makeMockAdapter({ binPath: '/fake/codex' }),
  };
  const got = registry.findPeerFor('execute', 'opus', {
    enabledPeers: ['codex'],
    loadAdapter: loadAdapterFromTable(table),
    fileExists: fileExistsFromSet(new Set(['/fake/codex'])),
  });
  assert.ok(got);
  assert.equal(got.peer, 'codex');
  assert.equal(got.protocol, 'asp');
});

test('findPeerFor: tier=null is accepted', () => {
  const table = { qwen: makeMockAdapter({ binPath: '/fake/qwen' }) };
  const got = registry.findPeerFor('write', null, {
    enabledPeers: ['qwen'],
    loadAdapter: loadAdapterFromTable(table),
    fileExists: fileExistsFromSet(new Set(['/fake/qwen'])),
  });
  assert.ok(got);
  assert.equal(got.peer, 'qwen');
});

// ── dispatch (D-07 transparent fallback) ───────────────────────────────────

test('dispatch: throws on bad text type (programmer error, not peer-error)', async () => {
  await assert.rejects(
    () => registry.dispatch('research', null, 42, {}),
    TypeError,
  );
});

test('dispatch: returns null when no peer claims the role', async () => {
  const out = await registry.dispatch('totally-made-up-role', null, 'hello', {
    enabledPeers: [],
    loadAdapter: () => null,
    fileExists: () => false,
  });
  assert.equal(out, null);
});

test('dispatch: returns null when peer is not allowlisted (opt-in gate)', async () => {
  const out = await registry.dispatch('research', null, 'hello', {
    enabledPeers: [],
    loadAdapter: () => makeMockAdapter({ binPath: '/fake' }),
    fileExists: () => true,
  });
  assert.equal(out, null);
});

test('dispatch: returns {result, peer, protocol} on adapter success', async () => {
  const adapter = makeMockAdapter({
    binPath: '/fake/gemini',
    dispatch: (role, tier, text) => ({ ok: true, role, tier, text }),
  });
  const out = await registry.dispatch('research', 'sonnet', 'find me x', {
    enabledPeers: ['gemini'],
    // gemini wins research because copilot is not in the allowlist.
    loadAdapter: loadAdapterFromTable({ gemini: adapter }),
    fileExists: fileExistsFromSet(new Set(['/fake/gemini'])),
  });
  assert.ok(out, 'dispatch should return non-null on success');
  assert.equal(out.peer, 'gemini');
  assert.equal(out.protocol, 'acp');
  assert.deepEqual(out.result, { ok: true, role: 'research', tier: 'sonnet', text: 'find me x' });
  // Verify the adapter actually got called once with the registry's args.
  assert.equal(adapter.calls.length, 1);
  assert.equal(adapter.calls[0].role, 'research');
  assert.equal(adapter.calls[0].tier, 'sonnet');
  assert.equal(adapter.calls[0].text, 'find me x');
});

test('dispatch: returns null when adapter.dispatch throws (D-07 transparent fallback)', async () => {
  const adapter = makeMockAdapter({ binPath: '/fake/gemini', dispatchThrows: true });
  const out = await registry.dispatch('research', null, 'hello', {
    enabledPeers: ['gemini'],
    loadAdapter: loadAdapterFromTable({ gemini: adapter }),
    fileExists: fileExistsFromSet(new Set(['/fake/gemini'])),
  });
  assert.equal(out, null, 'peer-error must surface as null, never re-throw');
});

test('dispatch: returns null when adapter is missing dispatch fn (shape mismatch)', async () => {
  const adapter = makeMockAdapter({ binPath: '/fake/gemini', omitDispatch: true });
  const out = await registry.dispatch('research', null, 'hello', {
    enabledPeers: ['gemini'],
    loadAdapter: loadAdapterFromTable({ gemini: adapter }),
    fileExists: fileExistsFromSet(new Set(['/fake/gemini'])),
  });
  assert.equal(out, null);
});

test('dispatch: passes opts through to the adapter (caller can ride extra fields)', async () => {
  const adapter = makeMockAdapter({ binPath: '/fake/qwen' });
  const opts = {
    enabledPeers: ['qwen'],
    loadAdapter: loadAdapterFromTable({ qwen: adapter }),
    fileExists: fileExistsFromSet(new Set(['/fake/qwen'])),
    customHint: 'session-runner-trace-id-abc123',
  };
  await registry.dispatch('write', 'haiku', 'compose haiku', opts);
  assert.equal(adapter.calls.length, 1);
  // The whole opts object propagates so plan 27-08 can attach event tags.
  assert.equal(adapter.calls[0].opts.customHint, 'session-runner-trace-id-abc123');
});
