'use strict';
// tests/gdd-precompact-snapshot.test.cjs — Plan 27.6-05 Task 4.
//
// Covers atomicity, retention, harness fallback, malformed-input tolerance,
// and snapshot shape for hooks/gdd-precompact-snapshot.js.
//
// Hook is a stand-alone Node script — every test spawns it via spawnSync
// with a fresh tmpdir as CWD so each scenario runs in isolation.

const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  readFileSync,
  existsSync,
  readdirSync,
  statSync,
  rmSync,
  utimesSync,
} = require('node:fs');
const { tmpdir } = require('node:os');
const { join, resolve } = require('node:path');
const { spawnSync } = require('node:child_process');

const HOOK_PATH = resolve(__dirname, '..', 'hooks', 'gdd-precompact-snapshot.js');

function setupTmp(prefix) {
  const dir = mkdtempSync(join(tmpdir(), `gdd-pc-${prefix}-`));
  mkdirSync(join(dir, '.design'), { recursive: true });
  mkdirSync(join(dir, '.design', 'telemetry'), { recursive: true });
  return dir;
}

function writeState(dir, body) {
  writeFileSync(join(dir, '.design', 'STATE.md'), body, 'utf8');
}

function writeEvents(dir, events) {
  writeFileSync(
    join(dir, '.design', 'telemetry', 'events.jsonl'),
    events.map((e) => JSON.stringify(e)).join('\n') + '\n',
    'utf8',
  );
}

function runHook(cwd, env) {
  // Use empty stdin so the hook's stdin.resume() handler completes promptly.
  return spawnSync('node', [HOOK_PATH], {
    cwd,
    env: { ...process.env, ...(env || {}) },
    encoding: 'utf8',
    input: '',
    timeout: 10_000,
  });
}

function listSnapshots(dir) {
  const snapDir = join(dir, '.design', 'snapshots');
  if (!existsSync(snapDir)) return [];
  return readdirSync(snapDir);
}

function readSnapshot(dir) {
  const files = listSnapshots(dir).filter(
    (f) => f.endsWith('.json') && f !== 'last-recap.json',
  );
  assert.equal(files.length, 1, `expected exactly one snapshot, got: ${files.join(',')}`);
  return JSON.parse(readFileSync(join(dir, '.design', 'snapshots', files[0]), 'utf8'));
}

// ---------------------------------------------------------------------------
// 1. Snapshot writes valid JSON with all required keys
// ---------------------------------------------------------------------------
test('27.6-05: snapshot writes valid JSON to .design/snapshots/', () => {
  const dir = setupTmp('shape');
  try {
    writeState(
      dir,
      '---\nmilestone: v1.27.6\nphase: 27.6\n---\n\n## Decisions\nD-01: alpha decision\nD-02: beta decision\n',
    );
    writeEvents(dir, [
      { type: 'state.mutation', timestamp: '2026-05-18T10:00:00.000Z', sessionId: 's1', payload: {} },
      { type: 'stage.entered', timestamp: '2026-05-18T10:01:00.000Z', sessionId: 's1', payload: {} },
      { type: 'stage.exited', timestamp: '2026-05-18T10:02:00.000Z', sessionId: 's1', payload: {} },
    ]);

    const r = runHook(dir, {});
    assert.equal(r.status, 0, `hook stderr: ${r.stderr}`);

    const files = listSnapshots(dir).filter((f) => f.endsWith('.json'));
    assert.equal(files.length, 1, 'expected exactly one snapshot file');
    assert.ok(!files[0].endsWith('.tmp'), 'snapshot should not be a .tmp file');

    const snap = readSnapshot(dir);
    assert.ok(typeof snap.schema_version === 'string');
    assert.ok(typeof snap.timestamp === 'string');
    assert.ok(typeof snap.cycle_id === 'string');
    assert.ok(snap.state_md_sections && typeof snap.state_md_sections === 'object');
    assert.ok(Array.isArray(snap.last_n_events));
    assert.ok(Array.isArray(snap.last_n_decisions));
    assert.equal(snap.cycle_id, 'v1.27.6');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// 2. last_n_events tail from events.jsonl is included
// ---------------------------------------------------------------------------
test('27.6-05: snapshot includes last_n_events from events.jsonl', () => {
  const dir = setupTmp('events');
  try {
    writeState(dir, '---\nmilestone: v1.27.6\n---\n');
    const events = [];
    for (let i = 0; i < 5; i++) {
      events.push({
        type: 'test.event',
        timestamp: `2026-05-18T10:00:0${i}.000Z`,
        sessionId: 's1',
        payload: { idx: i },
      });
    }
    writeEvents(dir, events);

    const r = runHook(dir, {});
    assert.equal(r.status, 0, `hook stderr: ${r.stderr}`);
    const snap = readSnapshot(dir);
    assert.equal(snap.last_n_events.length, 5);
    assert.equal(snap.last_n_events[4].payload.idx, 4);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// 3. last_n_events caps at 50
// ---------------------------------------------------------------------------
test('27.6-05: snapshot caps last_n_events at 50', () => {
  const dir = setupTmp('cap50');
  try {
    writeState(dir, '---\nmilestone: v1.27.6\n---\n');
    const events = [];
    for (let i = 0; i < 75; i++) {
      // Pad with zeros so timestamp strings sort lexically.
      const idxStr = String(i).padStart(3, '0');
      events.push({
        type: 'test.event',
        timestamp: `2026-05-18T10:00:${(i % 60).toString().padStart(2, '0')}.${idxStr}Z`,
        sessionId: 's1',
        payload: { idx: i },
      });
    }
    writeEvents(dir, events);

    const r = runHook(dir, {});
    assert.equal(r.status, 0, `hook stderr: ${r.stderr}`);
    const snap = readSnapshot(dir);
    assert.equal(snap.last_n_events.length, 50);
    // The hook keeps the LAST 50 (slice(-count)) → first kept event is idx 25.
    assert.equal(snap.last_n_events[0].payload.idx, 25);
    assert.equal(snap.last_n_events[49].payload.idx, 74);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// 4. Codex harness path emits stderr notice and writes NO snapshot
// ---------------------------------------------------------------------------
test('27.6-05: codex harness path emits stderr notice and writes NO snapshot', () => {
  const dir = setupTmp('codex');
  try {
    writeState(dir, '---\nmilestone: v1.27.6\n---\nD-01: should not appear in any snapshot\n');
    const r = runHook(dir, { CLAUDE_HARNESS: 'codex' });
    assert.equal(r.status, 0);
    assert.ok(
      r.stderr.includes('snapshots disabled'),
      `expected stderr to include 'snapshots disabled', got: ${r.stderr}`,
    );
    const snapDir = join(dir, '.design', 'snapshots');
    if (existsSync(snapDir)) {
      const files = readdirSync(snapDir);
      const jsonFiles = files.filter((f) => f.endsWith('.json'));
      assert.equal(jsonFiles.length, 0, 'codex path must not create snapshot files');
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// 5. Malformed STATE.md is tolerated
// ---------------------------------------------------------------------------
test('27.6-05: malformed STATE.md tolerated — snapshot still writes', () => {
  const dir = setupTmp('malformed');
  try {
    writeState(dir, 'this is not yaml frontmatter\njust plain text\nrandom garbage\n');
    const r = runHook(dir, {});
    assert.equal(r.status, 0, `hook stderr: ${r.stderr}`);
    const snap = readSnapshot(dir);
    assert.ok(snap.state_md_sections && typeof snap.state_md_sections === 'object');
    // frontmatter empty, decisions empty — but file still wrote.
    assert.deepEqual(snap.state_md_sections.frontmatter, {});
    assert.equal(snap.cycle_id, 'unknown');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// 6. Retention prunes to last 10
// ---------------------------------------------------------------------------
test('27.6-05: retention prunes to 10 — 11th write removes oldest', () => {
  const dir = setupTmp('retention');
  try {
    const snapDir = join(dir, '.design', 'snapshots');
    mkdirSync(snapDir, { recursive: true });

    // Pre-populate 10 dummy snapshots with mtimes 1000, 2000, ... 10000 (ms).
    // Use real mtime by writing then utimesSync.
    const baseTime = Date.now() / 1000 - 1000; // 1000s ago
    for (let i = 0; i < 10; i++) {
      const fname = `dummy-${String(i).padStart(2, '0')}.json`;
      const full = join(snapDir, fname);
      writeFileSync(full, JSON.stringify({ marker: i }), 'utf8');
      // mtime = baseTime + i seconds → ascending order, i=0 is oldest.
      const mtime = baseTime + i;
      utimesSync(full, mtime, mtime);
    }

    writeState(dir, '---\nmilestone: v1.27.6\n---\n');
    const r = runHook(dir, {});
    assert.equal(r.status, 0, `hook stderr: ${r.stderr}`);

    const files = readdirSync(snapDir).filter(
      (f) => f.endsWith('.json') && f !== 'last-recap.json',
    );
    assert.equal(
      files.length,
      10,
      `expected exactly 10 snapshots after prune, got ${files.length}: ${files.join(',')}`,
    );
    // The oldest (dummy-00.json with mtime baseTime+0) must be gone.
    assert.ok(
      !files.includes('dummy-00.json'),
      'oldest dummy (mtime=baseTime+0) should have been pruned',
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// 7. Atomic write — no .tmp orphan on successful run
// ---------------------------------------------------------------------------
test('27.6-05: snapshot write does not leave .tmp orphan on success', () => {
  const dir = setupTmp('atomic');
  try {
    writeState(dir, '---\nmilestone: v1.27.6\n---\nD-01: foo\n');
    const r = runHook(dir, {});
    assert.equal(r.status, 0, `hook stderr: ${r.stderr}`);

    const snapDir = join(dir, '.design', 'snapshots');
    const files = readdirSync(snapDir);
    const tmpFiles = files.filter((f) => f.endsWith('.tmp'));
    assert.equal(tmpFiles.length, 0, 'no .tmp orphans after successful write');
    const jsonFiles = files.filter((f) => f.endsWith('.json'));
    assert.equal(jsonFiles.length, 1);
    // True interrupt-mid-write atomicity is a Phase 27.6-06 deferred fixture
    // (requires SIGKILL between writeFileSync and renameSync); the cleanup
    // discipline above is the durable invariant the hook DOES enforce.
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// 8. Missing .design/snapshots/ directory is created by hook
// ---------------------------------------------------------------------------
test('27.6-05: missing .design/snapshots/ directory is created by hook', () => {
  const dir = mkdtempSync(join(tmpdir(), `gdd-pc-mkdir-`));
  try {
    mkdirSync(join(dir, '.design'), { recursive: true });
    // Deliberately do NOT create .design/snapshots/ or telemetry/.
    writeState(dir, '---\nmilestone: v1.27.6\n---\n');
    const r = runHook(dir, {});
    assert.equal(r.status, 0, `hook stderr: ${r.stderr}`);

    const snapDir = join(dir, '.design', 'snapshots');
    assert.ok(existsSync(snapDir), 'snapshots dir should be created by hook');
    const files = readdirSync(snapDir).filter((f) => f.endsWith('.json'));
    assert.equal(files.length, 1);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// 9. Missing events.jsonl tolerated — last_n_events empty
// ---------------------------------------------------------------------------
test('27.6-05: missing events.jsonl tolerated — last_n_events is empty array', () => {
  const dir = setupTmp('noevents');
  try {
    writeState(dir, '---\nmilestone: v1.27.6\n---\n');
    // Do not write events.jsonl.
    const r = runHook(dir, {});
    assert.equal(r.status, 0, `hook stderr: ${r.stderr}`);
    const snap = readSnapshot(dir);
    assert.ok(Array.isArray(snap.last_n_events));
    assert.equal(snap.last_n_events.length, 0);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// 10. Malformed events.jsonl lines are skipped (JSONL-tolerant)
// ---------------------------------------------------------------------------
test('27.6-05: malformed events.jsonl lines are skipped (T-27.6.05-05 mitigation)', () => {
  const dir = setupTmp('badjsonl');
  try {
    writeState(dir, '---\nmilestone: v1.27.6\n---\n');
    const goodLine = JSON.stringify({
      type: 'test.event',
      timestamp: '2026-05-18T10:00:00.000Z',
      sessionId: 's1',
      payload: { ok: true },
    });
    const malformed = '{ not valid json';
    writeFileSync(
      join(dir, '.design', 'telemetry', 'events.jsonl'),
      [goodLine, malformed, goodLine, '', '   '].join('\n') + '\n',
      'utf8',
    );

    const r = runHook(dir, {});
    assert.equal(r.status, 0, `hook stderr: ${r.stderr}`);
    const snap = readSnapshot(dir);
    // 2 good events kept, malformed + blank lines dropped silently.
    assert.equal(snap.last_n_events.length, 2);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
