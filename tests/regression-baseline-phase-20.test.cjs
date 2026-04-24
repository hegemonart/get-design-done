'use strict';
// tests/regression-baseline-phase-20.test.cjs
// ---------------------------------------------------------------------------
// Plan 20-15, SDK-12 — Phase 20 regression baseline.
//
// Captures the post-Phase-20 repo surface in `test-fixture/baselines/phase-20/`
// and asserts future commits don't accidentally delete or silently rename
// anything. Complements the cross-phase `test-fixture/baselines/current/`
// baseline which tracks minimum-version + long-lived invariants.
//
// Baselines covered here:
//   - agent-list.txt              — every *.md in agents/ (sorted)
//   - skill-list.txt              — every directory in skills/ (sorted)
//   - agent-frontmatter-snapshot  — { "<file>": [sorted frontmatter keys] }
//   - mcp-tools-manifest          — 11 gdd-state tools × schema sha256
//   - event-schema-snapshot       — reference/schemas/events.schema.json sha256
//   - hook-list.txt               — hooks/ entries (post TS-rewrite: .ts + hooks.json + .sh)
//   - resilience-primitives.txt   — scripts/lib/*.cjs (post Plan 20-14)
//
// Philosophy: snapshots enforce EXACT equality — any drift fails the test
// with a clear diff. Re-lock by re-running the ephemeral generator used
// in Plan 20-15 and committing the updated baseline alongside the change.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const { REPO_ROOT } = require('./helpers.ts');

const BASELINE_DIR = path.join(REPO_ROOT, 'test-fixture', 'baselines', 'phase-20');

function readBaseline(filename) {
  return fs.readFileSync(path.join(BASELINE_DIR, filename), 'utf8');
}

function readBaselineLines(filename) {
  return readBaseline(filename)
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .sort();
}

function sha256File(p) {
  return crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
}

// ---------------------------------------------------------------------------
// Existence gate — every expected baseline file must be on disk.

test('phase-20 baseline: all 7 snapshot files exist', () => {
  const expected = [
    'agent-list.txt',
    'skill-list.txt',
    'agent-frontmatter-snapshot.json',
    'mcp-tools-manifest.json',
    'event-schema-snapshot.json',
    'hook-list.txt',
    'resilience-primitives.txt',
  ];
  for (const f of expected) {
    assert.ok(
      fs.existsSync(path.join(BASELINE_DIR, f)),
      `missing phase-20 baseline: test-fixture/baselines/phase-20/${f}`,
    );
  }
});

// ---------------------------------------------------------------------------
// agent-list — agents/*.md sorted.

test('phase-20 baseline: agent-list matches agents/*.md', () => {
  const expected = readBaselineLines('agent-list.txt');
  const actual = fs
    .readdirSync(path.join(REPO_ROOT, 'agents'))
    .filter((f) => f.endsWith('.md'))
    .sort();
  assert.deepEqual(
    actual,
    expected,
    'Agent list drift. Re-run the phase-20 baseline generator and commit if intentional.',
  );
});

// ---------------------------------------------------------------------------
// skill-list — skills/<name>/ subdirectories sorted.

test('phase-20 baseline: skill-list matches skills/*/', () => {
  const expected = readBaselineLines('skill-list.txt');
  const skillsDir = path.join(REPO_ROOT, 'skills');
  const actual = fs
    .readdirSync(skillsDir)
    .filter((d) => fs.statSync(path.join(skillsDir, d)).isDirectory())
    .sort();
  assert.deepEqual(actual, expected, 'Skill list drift.');
});

// ---------------------------------------------------------------------------
// Frontmatter snapshot — every file listed has the exact same sorted key set.

test('phase-20 baseline: agent frontmatter keys match snapshot (no silent drift)', () => {
  const snapshot = JSON.parse(readBaseline('agent-frontmatter-snapshot.json'));
  const agentsDir = path.join(REPO_ROOT, 'agents');

  // No orphans: every agent file on disk must be in the snapshot (or be README).
  const onDisk = fs
    .readdirSync(agentsDir)
    .filter((f) => f.endsWith('.md'));
  for (const f of onDisk) {
    if (f === 'README.md') continue;
    assert.ok(
      f in snapshot,
      `agents/${f} exists on disk but is missing from the phase-20 frontmatter snapshot`,
    );
  }
  // No stale entries: every snapshot entry must still exist.
  for (const f of Object.keys(snapshot)) {
    assert.ok(
      fs.existsSync(path.join(agentsDir, f)),
      `snapshot references agents/${f} but file no longer exists`,
    );
  }

  // Exact key-set match per file.
  for (const [f, expectedKeys] of Object.entries(snapshot)) {
    assert.ok(
      Array.isArray(expectedKeys),
      `snapshot entry for agents/${f} is not an array of keys`,
    );
    const content = fs
      .readFileSync(path.join(agentsDir, f), 'utf8')
      .replace(/\r\n/g, '\n');
    const m = content.match(/^---\n([\s\S]*?)\n---/);
    assert.ok(m, `agents/${f}: no YAML frontmatter found`);
    const keys = new Set();
    for (const line of m[1].split('\n')) {
      const kv = line.match(/^([a-zA-Z_][a-zA-Z0-9_-]*):/);
      if (kv) keys.add(kv[1]);
    }
    const actualKeys = [...keys].sort();
    assert.deepEqual(
      actualKeys,
      expectedKeys,
      `agents/${f}: frontmatter key set drifted. Expected [${expectedKeys.join(', ')}], got [${actualKeys.join(', ')}]`,
    );
  }
});

// ---------------------------------------------------------------------------
// MCP tools manifest — hash every schema file and compare to the snapshot.
// Also double-check the tool count (PLAN.md: exactly 11 tools).

test('phase-20 baseline: mcp-tools manifest has 11 gdd-state tools', () => {
  const manifest = JSON.parse(readBaseline('mcp-tools-manifest.json'));
  assert.equal(
    manifest.length,
    11,
    `expected exactly 11 gdd-state MCP tools in manifest, found ${manifest.length}`,
  );
});

test('phase-20 baseline: mcp-tools schema sha256 matches snapshot (catches schema drift)', () => {
  const manifest = JSON.parse(readBaseline('mcp-tools-manifest.json'));
  for (const entry of manifest) {
    const full = path.join(REPO_ROOT, entry.schemaPath);
    assert.ok(fs.existsSync(full), `schema file missing: ${entry.schemaPath}`);
    const actualHash = sha256File(full);
    assert.equal(
      actualHash,
      entry.schemaHash,
      `schema drift in ${entry.schemaPath} — expected sha256 ${entry.schemaHash}, got ${actualHash}. Re-lock the phase-20 baseline if intentional.`,
    );
  }
});

test('phase-20 baseline: mcp-tools covers every schema in scripts/mcp-servers/gdd-state/schemas/', () => {
  const manifest = JSON.parse(readBaseline('mcp-tools-manifest.json'));
  const schemaDir = path.join(
    REPO_ROOT,
    'scripts',
    'mcp-servers',
    'gdd-state',
    'schemas',
  );
  const onDisk = fs
    .readdirSync(schemaDir)
    .filter((f) => f.endsWith('.schema.json'))
    .sort();
  const manifestSchemas = manifest
    .map((e) => path.basename(e.schemaPath))
    .sort();
  assert.deepEqual(
    manifestSchemas,
    onDisk,
    'mcp-tools-manifest does not cover every schema on disk. Re-lock the phase-20 baseline.',
  );
});

// ---------------------------------------------------------------------------
// Event schema — single-file sha256 snapshot.

test('phase-20 baseline: events.schema.json sha256 matches snapshot', () => {
  const snapshot = JSON.parse(readBaseline('event-schema-snapshot.json'));
  const full = path.join(REPO_ROOT, snapshot.path);
  assert.ok(fs.existsSync(full), `events schema missing: ${snapshot.path}`);
  const actualHash = sha256File(full);
  assert.equal(
    actualHash,
    snapshot.sha256,
    `events.schema.json sha256 drifted. Expected ${snapshot.sha256}, got ${actualHash}. Re-lock if intentional.`,
  );
});

// ---------------------------------------------------------------------------
// Hook list — post Plan 20-13, .js hooks are gone; .ts + hooks.json + .sh only.

test('phase-20 baseline: hook-list.txt matches hooks/ directory', () => {
  const expected = readBaselineLines('hook-list.txt');
  const actual = fs
    .readdirSync(path.join(REPO_ROOT, 'hooks'))
    .filter((f) => f !== '.DS_Store')
    .sort();
  assert.deepEqual(
    actual,
    expected,
    'hooks/ directory drift vs. phase-20 baseline. Plan 20-13 locked this list — any addition/removal needs a re-lock.',
  );
});

test('phase-20 baseline: Plan 20-13 migrated its owned hooks to .ts', () => {
  // Plan 20-13 rewrote the 3 hooks owned by Phase 20 (budget-enforcer,
  // context-exhaustion, gdd-read-injection-scanner). .js hooks added by
  // later/parallel phases (bash-guard, decision-injector, mcp-circuit-breaker,
  // protected-paths) are allowed — they are owned by those phases' re-lock.
  const owned = [
    'budget-enforcer',
    'context-exhaustion',
    'gdd-read-injection-scanner',
  ];
  const entries = fs.readdirSync(path.join(REPO_ROOT, 'hooks'));
  for (const base of owned) {
    assert.ok(
      entries.includes(`${base}.ts`),
      `Plan 20-13 migration: hooks/${base}.ts must exist`,
    );
    assert.ok(
      !entries.includes(`${base}.js`),
      `Plan 20-13 migration: hooks/${base}.js must be removed (use .ts)`,
    );
  }
});

// ---------------------------------------------------------------------------
// Resilience primitives — scripts/lib/*.cjs post Plan 20-14.

test('phase-20 baseline: resilience-primitives.txt matches scripts/lib/*.cjs', () => {
  const expected = readBaselineLines('resilience-primitives.txt');
  const actual = fs
    .readdirSync(path.join(REPO_ROOT, 'scripts', 'lib'))
    .filter((f) => f.endsWith('.cjs'))
    .sort();
  assert.deepEqual(
    actual,
    expected,
    'scripts/lib/*.cjs drift vs. phase-20 baseline. Plan 20-14 locked jittered-backoff / rate-guard / error-classifier / iteration-budget / lockfile.',
  );
});
