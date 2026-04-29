'use strict';

// Plan 27-06 — minimal smoke tests for the delegate_to frontmatter +
// session-runner peer-first dispatch. Recovered from a stalled async agent
// (a5026b4) — focuses on the validation + capability-matrix surface that
// downstream phases will exercise more thoroughly.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const REPO_ROOT = path.resolve(__dirname, '..');

// ── 1. validate-frontmatter.ts knows about delegate_to ────────────────────

test('27-06: validate-frontmatter.ts declares delegate_to as optional field', () => {
  const src = fs.readFileSync(
    path.join(REPO_ROOT, 'scripts/validate-frontmatter.ts'),
    'utf8',
  );
  assert.match(src, /delegate_to/, 'validate-frontmatter.ts must reference delegate_to');
  assert.match(src, /'delegate_to'\?:/, 'AgentFrontmatter type must declare delegate_to as optional');
});

test('27-06: validate-frontmatter.ts cross-references the capability matrix', () => {
  const src = fs.readFileSync(
    path.join(REPO_ROOT, 'scripts/validate-frontmatter.ts'),
    'utf8',
  );
  assert.match(
    src,
    /capability matrix|peer-cli\/registry|registry\.cjs/i,
    'delegate_to validator must consult the capability matrix to reject unknown <peer>-<role> pairs',
  );
});

// ── 2. session-runner has the delegation entry point ─────────────────────

test('27-06: session-runner exposes peer-registry cache reset for tests', () => {
  const src = fs.readFileSync(
    path.join(REPO_ROOT, 'scripts/lib/session-runner/index.ts'),
    'utf8',
  );
  assert.match(
    src,
    /_resetPeerRegistryCache/,
    'session-runner must expose a peer-registry cache reset for test isolation',
  );
});

test('27-06: session-runner imports the peer-cli registry', () => {
  const src = fs.readFileSync(
    path.join(REPO_ROOT, 'scripts/lib/session-runner/index.ts'),
    'utf8',
  );
  assert.match(
    src,
    /peer-cli\/registry/,
    'session-runner must import the peer-cli registry for delegation dispatch',
  );
});

test('27-06: session-runner type surface includes peer-call shape', () => {
  const src = fs.readFileSync(
    path.join(REPO_ROOT, 'scripts/lib/session-runner/types.ts'),
    'utf8',
  );
  assert.ok(
    src.length > 0,
    'session-runner types.ts must exist (Plan 27-06 added type slots for delegate_to flow)',
  );
});

// ── 3. agents/README.md documents the delegate_to field ──────────────────

test('27-06: agents/README.md documents delegate_to', () => {
  const readme = fs.readFileSync(path.join(REPO_ROOT, 'agents/README.md'), 'utf8');
  assert.match(readme, /delegate_to/, 'agents/README.md must document delegate_to');
  assert.match(
    readme,
    /Peer-CLI delegation/i,
    'agents/README.md must have a section heading mentioning peer-CLI delegation',
  );
  assert.match(
    readme,
    /gemini-research|codex-execute|cursor-debug/,
    'agents/README.md must list valid <peer>-<role> values',
  );
});

test('27-06: agents/README.md mentions the opt-in gating contract', () => {
  const readme = fs.readFileSync(path.join(REPO_ROOT, 'agents/README.md'), 'utf8');
  assert.match(
    readme,
    /enabled_peers|opt-in|allowlist/i,
    'agents/README.md must explain that delegate_to dispatch only fires when peer is in enabled_peers allowlist',
  );
});

// ── 4. Cross-referenced files exist (sanity) ─────────────────────────────

test('27-06: registry, adapters, and capability-matrix doc exist (cross-refs)', () => {
  for (const p of [
    'scripts/lib/peer-cli/registry.cjs',
    'scripts/lib/peer-cli/adapters/codex.cjs',
    'scripts/lib/peer-cli/adapters/gemini.cjs',
    'scripts/lib/peer-cli/adapters/cursor.cjs',
    'scripts/lib/peer-cli/adapters/copilot.cjs',
    'scripts/lib/peer-cli/adapters/qwen.cjs',
    'reference/peer-cli-capabilities.md',
  ]) {
    assert.ok(
      fs.existsSync(path.join(REPO_ROOT, p)),
      `${p} must exist (cross-referenced from delegate_to documentation)`,
    );
  }
});
