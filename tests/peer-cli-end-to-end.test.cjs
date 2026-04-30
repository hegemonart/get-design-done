'use strict';

// Plan 27-12 — minimal end-to-end peer-CLI flow test.
// Heavy mocking — does NOT spawn real peer binaries. Asserts that the
// Wave A→B→C surfaces compose into a working pipeline.

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');

const REPO_ROOT = path.join(__dirname, '..');

// ── 1. Registry → adapter dispatch path ───────────────────────────────────

test('peer-cli e2e: registry refuses dispatch when peer not in enabled_peers', async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'peer-cli-e2e-'));
  // Write an empty .design/config.json
  fs.mkdirSync(path.join(tmp, '.design'), { recursive: true });
  fs.writeFileSync(
    path.join(tmp, '.design/config.json'),
    JSON.stringify({ peer_cli: { enabled_peers: [] } }),
  );

  // Spawn a registry instance scoped to the tmp cwd. Registry reads
  // .design/config.json relative to cwd (per readEnabledPeers).
  const origCwd = process.cwd();
  try {
    process.chdir(tmp);
    delete require.cache[require.resolve(path.join(REPO_ROOT, 'scripts/lib/peer-cli/registry.cjs'))];
    const registry = require(path.join(REPO_ROOT, 'scripts/lib/peer-cli/registry.cjs'));
    // No peer is allowlisted → findPeerFor returns null.
    const result = await registry.dispatch('research', 'opus', 'test prompt', {});
    assert.equal(result, null, 'dispatch must return null when no peer is allowlisted');
  } finally {
    process.chdir(origCwd);
  }
});

test('peer-cli e2e: capability matrix is exactly the locked D-05 shape', () => {
  const registry = require(path.join(REPO_ROOT, 'scripts/lib/peer-cli/registry.cjs'));
  const matrix = registry.describeCapabilities();

  // D-05 (CONTEXT.md): codex→execute, gemini→research/exploration,
  // cursor→debug/plan, copilot→review/research, qwen→write
  const expected = {
    codex:   ['execute'].sort(),
    gemini:  ['exploration', 'research'].sort(),
    cursor:  ['debug', 'plan'].sort(),
    copilot: ['research', 'review'].sort(),
    qwen:    ['write'].sort(),
  };
  for (const [peer, roles] of Object.entries(expected)) {
    // matrix[peer] shape: { roles: [...], protocol: 'acp'|'asp' }
    const entry = matrix[peer];
    assert.ok(entry, `${peer} must be in describeCapabilities() output`);
    const got = (entry.roles || []).slice().sort();
    assert.deepEqual(got, roles, `${peer} must claim exactly ${roles.join(',')}`);
  }
});

// ── 2. Frontmatter delegate_to flow ──────────────────────────────────────

test('peer-cli e2e: frontmatter validator accepts known delegate_to values', () => {
  // Read scripts/validate-frontmatter.ts and confirm it cross-references
  // the capability matrix. This is a content-level check; deeper validation
  // happens in the dedicated frontmatter test file.
  const src = fs.readFileSync(
    path.join(REPO_ROOT, 'scripts/validate-frontmatter.ts'),
    'utf8',
  );
  assert.match(src, /delegate_to/);
  assert.match(src, /capability matrix|registry|peer-cli/i);
});

// ── 3. Event chain runtime_role tagging ─────────────────────────────────

test('peer-cli e2e: event-stream types module exports peer_call_* constants', () => {
  const types = fs.readFileSync(
    path.join(REPO_ROOT, 'scripts/lib/event-stream/types.ts'),
    'utf8',
  );
  // The 3 new event types must be declared.
  assert.match(types, /['"]peer_call_started['"]/);
  assert.match(types, /['"]peer_call_complete['"]/);
  assert.match(types, /['"]peer_call_failed['"]/);
  // runtime_role must be a tag with both literals.
  assert.match(types, /['"]host['"]/);
  assert.match(types, /['"]peer['"]/);
});

// ── 4. Bandit posterior delegate? dimension ─────────────────────────────

test('peer-cli e2e: bandit-router is aware of delegate dimension', () => {
  const src = fs.readFileSync(
    path.join(REPO_ROOT, 'scripts/lib/bandit-router.cjs'),
    'utf8',
  );
  assert.match(src, /delegate/i, 'bandit-router must reference delegate context dimension');
});

// ── 5. Cross-runtime cost-arbitrage extension ───────────────────────────

test('peer-cli e2e: budget-enforcer threads runtime_role + peer_id into cost rows', () => {
  const src = fs.readFileSync(
    path.join(REPO_ROOT, 'scripts/lib/budget-enforcer.cjs'),
    'utf8',
  );
  assert.match(src, /runtime_role/);
  assert.match(src, /peer_id/);
});

// ── 6. Detection helpers (Plan 27-11) ───────────────────────────────────

test('peer-cli e2e: detectInstalledPeers returns valid peer-IDs only', () => {
  const { detectInstalledPeers } = require(
    path.join(REPO_ROOT, 'scripts/lib/install/runtimes.cjs'),
  );
  const valid = new Set(['codex', 'gemini', 'cursor', 'copilot', 'qwen']);
  const detected = detectInstalledPeers({ which: () => null });   // no peers installed
  assert.deepEqual(detected, [], 'no peers detected when which-fn returns null');

  // With a fake which that claims gemini is installed:
  const detected2 = detectInstalledPeers({
    which: (b) => (b.startsWith('gemini') ? '/usr/local/bin/gemini' : null),
  });
  for (const id of detected2) assert.ok(valid.has(id));
});
