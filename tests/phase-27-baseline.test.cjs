'use strict';

// Phase 27 regression baseline. Mirrors the shape of phase-25 / phase-26
// baselines. Asserts:
//   - All 11 plan surfaces from Phase 27 (acp/asp clients, spawn-cmd, broker,
//     5 adapters, registry, capability-matrix doc, validate-frontmatter
//     delegate_to, session-runner peer-first, bandit delegate dim, event
//     chain runtime_role, /gdd:peers, customize/add skills, peerBinary).
//   - Manifest alignment via the version-agnostic shape (Phase 27 D-12).
//   - CHANGELOG `## [1.27.0]` block exists.
//   - NOTICE Apache 2.0 attribution to cc-multi-cli.
//   - docs/PEER-DELEGATION.md and reference/peer-protocols.md exist.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const REPO_ROOT = path.join(__dirname, '..');

function exists(rel) {
  return fs.existsSync(path.join(REPO_ROOT, rel));
}

function read(rel) {
  return fs.readFileSync(path.join(REPO_ROOT, rel), 'utf8');
}

// --- Manifest alignment (D-12 version-agnostic) ─────────────────────────

test('phase-27 baseline: all 4 manifests aligned on current version', () => {
  const pkg = JSON.parse(read('package.json'));
  const plugin = JSON.parse(read('.claude-plugin/plugin.json'));
  const market = JSON.parse(read('.claude-plugin/marketplace.json'));
  const v = pkg.version;
  assert.match(v, /^\d+\.\d+\.\d+/);
  assert.equal(plugin.version, v);
  assert.equal(market.metadata.version, v);
  assert.equal(market.plugins[0].version, v);
});

test('phase-27 baseline: CHANGELOG.md has a [1.27.0] block', () => {
  assert.match(read('CHANGELOG.md'), /## \[1\.27\.0\]/);
});

// --- Wave A: Transport primitives (plans 27-01, 27-02, 27-03) ───────────

test('phase-27 baseline: ACP client exists (Plan 27-01)', () => {
  assert.ok(exists('scripts/lib/peer-cli/acp-client.cjs'));
  const src = read('scripts/lib/peer-cli/acp-client.cjs');
  assert.match(src, /createAcpClient/, 'acp-client.cjs must export createAcpClient');
});

test('phase-27 baseline: ASP client exists (Plan 27-02)', () => {
  assert.ok(exists('scripts/lib/peer-cli/asp-client.cjs'));
  const src = read('scripts/lib/peer-cli/asp-client.cjs');
  assert.match(src, /createAspClient|threadStart/, 'asp-client.cjs must expose threadStart');
});

test('phase-27 baseline: spawn-cmd + broker-lifecycle exist (Plan 27-03)', () => {
  assert.ok(exists('scripts/lib/peer-cli/spawn-cmd.cjs'));
  assert.ok(exists('scripts/lib/peer-cli/broker-lifecycle.cjs'));
  const spawnCmd = read('scripts/lib/peer-cli/spawn-cmd.cjs');
  assert.match(spawnCmd, /win32|\.cmd|EINVAL/i, 'spawn-cmd must reference Windows .cmd handling');
});

// --- Wave B: Adapter registry (plans 27-04, 27-05) ──────────────────────

test('phase-27 baseline: 5 per-peer adapters exist (Plan 27-04)', () => {
  for (const peer of ['codex', 'gemini', 'cursor', 'copilot', 'qwen']) {
    assert.ok(
      exists(`scripts/lib/peer-cli/adapters/${peer}.cjs`),
      `adapters/${peer}.cjs must exist`,
    );
  }
});

test('phase-27 baseline: registry + capability matrix exist (Plan 27-05)', () => {
  assert.ok(exists('scripts/lib/peer-cli/registry.cjs'));
  assert.ok(exists('reference/peer-cli-capabilities.md'));
  const reg = read('scripts/lib/peer-cli/registry.cjs');
  assert.match(reg, /findPeerFor|describeCapabilities/, 'registry must expose findPeerFor and describeCapabilities');
});

// --- Wave C: gdd integration (plans 27-06, 27-07, 27-08) ────────────────

test('phase-27 baseline: validate-frontmatter knows about delegate_to (Plan 27-06)', () => {
  assert.match(read('scripts/validate-frontmatter.ts'), /delegate_to/);
});

test('phase-27 baseline: session-runner imports peer-cli registry (Plan 27-06)', () => {
  assert.match(read('scripts/lib/session-runner/index.ts'), /peer-cli\/registry/);
});

test('phase-27 baseline: agents/README.md documents delegate_to (Plan 27-06)', () => {
  assert.match(read('agents/README.md'), /Peer-CLI delegation|delegate_to/);
});

test('phase-27 baseline: bandit-router has delegate dimension (Plan 27-07)', () => {
  // bandit-router.cjs got +221 lines extending arm space; check for the
  // delegate-related identifiers.
  const src = read('scripts/lib/bandit-router.cjs');
  assert.match(src, /delegate/i, 'bandit-router must reference delegate dimension');
});

test('phase-27 baseline: event-stream declares peer_call_* event types (Plan 27-08)', () => {
  const src = read('scripts/lib/event-stream/types.ts');
  assert.match(src, /peer_call_started/);
  assert.match(src, /peer_call_complete/);
  assert.match(src, /peer_call_failed/);
  assert.match(src, /runtime_role/);
});

test('phase-27 baseline: budget-enforcer threads runtime_role + peer_id (Plan 27-08)', () => {
  const src = read('scripts/lib/budget-enforcer.cjs');
  assert.match(src, /runtime_role/);
  assert.match(src, /peer_id/);
});

// --- Wave D: UX (plans 27-09, 27-10, 27-11) ─────────────────────────────

test('phase-27 baseline: /gdd:peers skill exists (Plan 27-09)', () => {
  assert.ok(exists('skills/peers/SKILL.md'));
  assert.match(read('skills/peers/SKILL.md'), /capability matrix|Capability Matrix/i);
});

test('phase-27 baseline: peer-cli-customize + peer-cli-add skills exist (Plan 27-10)', () => {
  assert.ok(exists('skills/peer-cli-customize/SKILL.md'));
  assert.ok(exists('skills/peer-cli-add/SKILL.md'));
});

test('phase-27 baseline: 5 peer-capable runtimes carry peerBinary (Plan 27-11)', () => {
  const { listPeerCapableRuntimes } = require(
    path.join(REPO_ROOT, 'scripts/lib/install/runtimes.cjs'),
  );
  const peerCapable = listPeerCapableRuntimes();
  assert.equal(peerCapable.length, 5);
  for (const r of peerCapable) {
    assert.equal(typeof r.peerBinary, 'string', `${r.id} must have peerBinary`);
  }
});

// --- Wave E: Closeout artefacts (Plan 27-12) ─────────────────────────────

test('phase-27 baseline: NOTICE file cites cc-multi-cli (Plan 27-12 D-14)', () => {
  assert.ok(exists('NOTICE'));
  const notice = read('NOTICE');
  assert.match(notice, /cc-multi-cli/);
  assert.match(notice, /Apache.*2\.0/i);
});

test('phase-27 baseline: docs/PEER-DELEGATION.md ops guide exists', () => {
  assert.ok(exists('docs/PEER-DELEGATION.md'));
  const guide = read('docs/PEER-DELEGATION.md');
  assert.match(guide, /enabled_peers/);
  assert.match(guide, /fallback/i);
});

test('phase-27 baseline: reference/peer-protocols.md cheat sheet exists', () => {
  assert.ok(exists('reference/peer-protocols.md'));
  const proto = read('reference/peer-protocols.md');
  assert.match(proto, /ACP/);
  assert.match(proto, /ASP/);
});

test('phase-27 baseline: registry.json includes peer-protocols entry', () => {
  const reg = JSON.parse(read('reference/registry.json'));
  const entry = reg.entries.find((e) => e.name === 'peer-protocols');
  assert.ok(entry, 'registry.json must include peer-protocols entry');
  assert.equal(entry.path, 'reference/peer-protocols.md');
});
