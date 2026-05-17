'use strict';
// tests/gdd-sessionstart-recap.test.cjs — Plan 27.6-05 Task 5.
//
// Covers absent-snapshot tolerance, diff computation correctness, stderr
// markdown emission, JSON sidecar write, and Codex no-op for
// hooks/gdd-sessionstart-recap.js.

const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  readFileSync,
  existsSync,
  rmSync,
} = require('node:fs');
const { tmpdir } = require('node:os');
const { join, resolve } = require('node:path');
const { spawnSync } = require('node:child_process');

const HOOK_PATH = resolve(__dirname, '..', 'hooks', 'gdd-sessionstart-recap.js');

function setupTmp(prefix) {
  const dir = mkdtempSync(join(tmpdir(), `gdd-ssr-${prefix}-`));
  mkdirSync(join(dir, '.design', 'snapshots'), { recursive: true });
  mkdirSync(join(dir, '.design', 'telemetry'), { recursive: true });
  return dir;
}

function writeSnapshot(dir, ts, body) {
  const fname = ts.replace(/[:.]/g, '-') + '.json';
  const full = join(dir, '.design', 'snapshots', fname);
  writeFileSync(full, JSON.stringify(body, null, 2), 'utf8');
  return full;
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
  return spawnSync('node', [HOOK_PATH], {
    cwd,
    env: { ...process.env, ...(env || {}) },
    encoding: 'utf8',
    input: '',
    timeout: 10_000,
  });
}

function readRecap(dir) {
  const p = join(dir, '.design', 'snapshots', 'last-recap.json');
  return JSON.parse(readFileSync(p, 'utf8'));
}

// ---------------------------------------------------------------------------
// 1. Absent snapshot dir — recap exits 0 with notice
// ---------------------------------------------------------------------------
test("27.6-05: absent snapshot dir — recap exits 0 with 'no prior snapshot' notice", () => {
  const dir = mkdtempSync(join(tmpdir(), 'gdd-ssr-absent-'));
  try {
    // Do not create .design/snapshots/ at all.
    const r = runHook(dir, {});
    assert.equal(r.status, 0);
    assert.ok(
      r.stderr.includes('no prior snapshot'),
      `expected 'no prior snapshot' in stderr, got: ${r.stderr}`,
    );
    assert.ok(
      !existsSync(join(dir, '.design', 'snapshots', 'last-recap.json')),
      'no sidecar should be written when no prior snapshot',
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// 2. Empty snapshot dir — recap exits 0 with notice
// ---------------------------------------------------------------------------
test("27.6-05: empty snapshot dir — recap exits 0 with 'no prior snapshot' notice", () => {
  const dir = setupTmp('empty');
  try {
    const r = runHook(dir, {});
    assert.equal(r.status, 0);
    assert.ok(
      r.stderr.includes('no prior snapshot'),
      `expected 'no prior snapshot' in stderr, got: ${r.stderr}`,
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// 3. Diff computation — new decisions + cycle changed
// ---------------------------------------------------------------------------
test('27.6-05: diff computation correct — new decisions + cycle_changed', () => {
  const dir = setupTmp('diff');
  try {
    writeSnapshot(dir, '2026-05-18T12:00:00.000Z', {
      schema_version: '1.0.0',
      timestamp: '2026-05-18T12:00:00.000Z',
      cycle_id: 'v1.27.5',
      state_md_sections: {},
      last_n_events: [],
      last_n_decisions: ['D-01: alpha', 'D-02: beta'],
    });
    writeState(
      dir,
      '---\nmilestone: v1.27.6\n---\n\n## Decisions\nD-01: alpha\nD-02: beta\nD-03: gamma is the new one\n',
    );

    const r = runHook(dir, {});
    assert.equal(r.status, 0, `hook stderr: ${r.stderr}`);

    const recap = readRecap(dir);
    assert.equal(recap.diff.new_decisions.length, 1);
    assert.ok(recap.diff.new_decisions[0].startsWith('D-03'));
    assert.equal(recap.diff.cycle_changed, 'v1.27.5 → v1.27.6');
    assert.equal(recap.schema_version, '1.0.0');
    assert.ok(typeof recap.diff.time_elapsed_ms === 'number');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// 4. Stderr markdown summary emitted
// ---------------------------------------------------------------------------
test('27.6-05: stderr emits markdown summary with Session Recap header', () => {
  const dir = setupTmp('md');
  try {
    writeSnapshot(dir, '2026-05-18T12:00:00.000Z', {
      schema_version: '1.0.0',
      timestamp: '2026-05-18T12:00:00.000Z',
      cycle_id: 'v1.27.5',
      state_md_sections: {},
      last_n_events: [],
      last_n_decisions: ['D-01: alpha'],
    });
    writeState(
      dir,
      '---\nmilestone: v1.27.6\n---\n\n## Decisions\nD-01: alpha\nD-99: newly added\n',
    );

    const r = runHook(dir, {});
    assert.equal(r.status, 0, `hook stderr: ${r.stderr}`);
    assert.ok(r.stderr.includes('Session Recap'), `stderr should contain '## Session Recap'`);
    assert.ok(r.stderr.includes('New decisions: 1'), `stderr should show new decisions count`);
    assert.ok(r.stderr.includes('Cycle'), `stderr should mention cycle status`);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// 5. Codex harness — no-op, no last-recap.json written
// ---------------------------------------------------------------------------
test('27.6-05: codex harness path — stderr no-op, no last-recap.json written', () => {
  const dir = setupTmp('codex');
  try {
    writeSnapshot(dir, '2026-05-18T12:00:00.000Z', {
      schema_version: '1.0.0',
      timestamp: '2026-05-18T12:00:00.000Z',
      cycle_id: 'v1.27.5',
      state_md_sections: {},
      last_n_events: [],
      last_n_decisions: [],
    });
    writeState(dir, '---\nmilestone: v1.27.6\n---\nD-01: should not get diffed\n');

    const r = runHook(dir, { CLAUDE_HARNESS: 'codex' });
    assert.equal(r.status, 0);
    assert.ok(
      r.stderr.includes('codex harness no-op'),
      `expected 'codex harness no-op' in stderr, got: ${r.stderr}`,
    );
    assert.ok(
      !existsSync(join(dir, '.design', 'snapshots', 'last-recap.json')),
      'codex path must not write last-recap.json',
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// 6. new_events_since_snapshot counted by timestamp comparison
// ---------------------------------------------------------------------------
test('27.6-05: new_events_since_snapshot counted from events.jsonl by timestamp', () => {
  const dir = setupTmp('events');
  try {
    const snapTs = '2026-05-18T12:00:00.000Z';
    writeSnapshot(dir, snapTs, {
      schema_version: '1.0.0',
      timestamp: snapTs,
      cycle_id: 'v1.27.6',
      state_md_sections: {},
      last_n_events: [],
      last_n_decisions: [],
    });
    writeState(dir, '---\nmilestone: v1.27.6\n---\n');
    // 3 events AFTER snapshot, 2 BEFORE.
    writeEvents(dir, [
      { type: 'test.before1', timestamp: '2026-05-18T11:00:00.000Z', sessionId: 's1', payload: {} },
      { type: 'test.before2', timestamp: '2026-05-18T11:30:00.000Z', sessionId: 's1', payload: {} },
      { type: 'test.after1', timestamp: '2026-05-18T12:30:00.000Z', sessionId: 's1', payload: {} },
      { type: 'test.after2', timestamp: '2026-05-18T13:00:00.000Z', sessionId: 's1', payload: {} },
      { type: 'test.after3', timestamp: '2026-05-18T14:00:00.000Z', sessionId: 's1', payload: {} },
    ]);

    const r = runHook(dir, {});
    assert.equal(r.status, 0, `hook stderr: ${r.stderr}`);
    const recap = readRecap(dir);
    assert.equal(recap.diff.new_events_since_snapshot, 3);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// 7. Latest snapshot picked when multiple present (mtime-based selection)
// ---------------------------------------------------------------------------
test('27.6-05: latest snapshot is picked when multiple snapshots are present', () => {
  const dir = setupTmp('multi');
  try {
    // Older snapshot
    writeSnapshot(dir, '2026-05-18T10:00:00.000Z', {
      schema_version: '1.0.0',
      timestamp: '2026-05-18T10:00:00.000Z',
      cycle_id: 'v1.27.4',
      state_md_sections: {},
      last_n_events: [],
      last_n_decisions: ['D-old: ancient'],
    });
    // Small wait so mtimes differ deterministically; then newer snapshot.
    // Use atomic writeFile to ensure newer mtime is later.
    const newerPath = writeSnapshot(dir, '2026-05-18T14:00:00.000Z', {
      schema_version: '1.0.0',
      timestamp: '2026-05-18T14:00:00.000Z',
      cycle_id: 'v1.27.5',
      state_md_sections: {},
      last_n_events: [],
      last_n_decisions: ['D-recent: from newer snapshot'],
    });
    // Touch newer file again to ensure its mtime is the highest.
    const now = Date.now() / 1000;
    require('node:fs').utimesSync(newerPath, now, now);

    writeState(
      dir,
      '---\nmilestone: v1.27.6\n---\n\n## Decisions\nD-recent: from newer snapshot\nD-99: brand new\n',
    );

    const r = runHook(dir, {});
    assert.equal(r.status, 0, `hook stderr: ${r.stderr}`);
    const recap = readRecap(dir);
    assert.equal(recap.previous_snapshot, newerPath, 'should use the newer snapshot');
    // D-recent existed in the newer snapshot's last_n_decisions, so it's NOT new.
    // D-99 is new. D-old is unrelated (came from older snapshot, not in current state).
    assert.equal(recap.diff.new_decisions.length, 1);
    assert.ok(recap.diff.new_decisions[0].startsWith('D-99'));
    assert.equal(recap.diff.cycle_changed, 'v1.27.5 → v1.27.6');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
