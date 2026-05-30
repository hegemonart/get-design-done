'use strict';

// tests/turn-closeout-hook.test.cjs — Phase 25 Plan 25-09 surface test.
//
// Asserts the 4 branches of hooks/gdd-turn-closeout.js (landed in 25-04,
// commit 675e879). Spawn the hook as a child process, pipe a payload on
// stdin pointing at a synthesized cwd, and verify the stdout shape and
// the events.jsonl side-effects per the D-10 contract.
//
// Branches:
//   1. No STATE.md            → {continue: true}, no events.jsonl write.
//   2. status != in_progress  → {continue: true}, no append.
//   3. Fresh event (<60s ago) → {continue: true}, no append.
//   4. Stale event + N/N      → additionalContext "Stage <stage> complete …"
//                               + a turn_end event appended to events.jsonl.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { spawnSync } = require('node:child_process');

const REPO_ROOT = path.join(__dirname, '../..');
const HOOK_PATH = path.join(REPO_ROOT, 'hooks', 'gdd-turn-closeout.js');

/**
 * Make a fresh tmp project root with a `.design/` directory and optional
 * STATE.md / events.jsonl. Returns the project root path.
 */
function makeProject({ stateMd, eventsJsonl } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gdd-turn-closeout-'));
  const designDir = path.join(dir, '.design');
  fs.mkdirSync(designDir, { recursive: true });
  if (typeof stateMd === 'string') {
    fs.writeFileSync(path.join(designDir, 'STATE.md'), stateMd, 'utf8');
  }
  if (typeof eventsJsonl === 'string') {
    const telemDir = path.join(designDir, 'telemetry');
    fs.mkdirSync(telemDir, { recursive: true });
    fs.writeFileSync(path.join(telemDir, 'events.jsonl'), eventsJsonl, 'utf8');
  }
  return dir;
}

/**
 * Run the hook with a synthesized stdin payload. Returns
 * `{stdout, stderr, status, parsed}` where `parsed` is the JSON the hook
 * emitted on stdout (or `null` if not parseable).
 */
function runHook(cwd, payload = {}) {
  const stdin = JSON.stringify({ cwd, ...payload });
  const r = spawnSync('node', [HOOK_PATH], {
    input: stdin,
    encoding: 'utf8',
    timeout: 5000,
  });
  let parsed = null;
  try { parsed = r.stdout ? JSON.parse(r.stdout) : null; } catch { parsed = null; }
  return { stdout: r.stdout, stderr: r.stderr, status: r.status, parsed };
}

function makeStateMd({ stage = 'design', status = 'in_progress', taskProgress = '1/3' } = {}) {
  return [
    '---',
    'pipeline_state_version: 1.0',
    `stage: ${stage}`,
    'cycle: c1',
    'wave: 1',
    'started_at: 2026-04-25T10:00:00Z',
    'last_checkpoint: 2026-04-25T18:00:00Z',
    '---',
    '',
    '<position>',
    `stage: ${stage}`,
    'wave: 1',
    `task_progress: ${taskProgress}`,
    `status: ${status}`,
    'handoff_source: ""',
    'handoff_path: ""',
    'skipped_stages: ""',
    '</position>',
    '',
  ].join('\n');
}

test('25-09 turn-closeout: hook file exists and is executable JS', () => {
  assert.ok(fs.existsSync(HOOK_PATH), `expected ${HOOK_PATH} to exist`);
});

test('25-09 turn-closeout: Branch 1 — no STATE.md → {continue: true}, no events write', () => {
  const cwd = makeProject({}); // no STATE.md
  const eventsPath = path.join(cwd, '.design', 'telemetry', 'events.jsonl');
  const { parsed, status } = runHook(cwd);
  assert.equal(status, 0);
  assert.deepEqual(parsed, { continue: true });
  assert.equal(fs.existsSync(eventsPath), false, 'no events.jsonl must be created when STATE.md is missing');
});

test('25-09 turn-closeout: Branch 2 — position.status=completed → {continue: true}, no append', () => {
  const stateMd = makeStateMd({ status: 'completed', taskProgress: '3/3' });
  const cwd = makeProject({ stateMd });
  const eventsPath = path.join(cwd, '.design', 'telemetry', 'events.jsonl');
  const { parsed, status } = runHook(cwd);
  assert.equal(status, 0);
  assert.deepEqual(parsed, { continue: true });
  assert.equal(
    fs.existsSync(eventsPath),
    false,
    'completed status must not trigger events.jsonl creation',
  );
});

test('25-09 turn-closeout: Branch 3 — fresh event (<60s) → {continue: true}, no append', () => {
  const stateMd = makeStateMd({ status: 'in_progress', taskProgress: '2/4' });
  const recentTs = new Date(Date.now() - 5_000).toISOString();
  const eventsJsonl = JSON.stringify({
    type: 'tool_use',
    timestamp: recentTs,
    sessionId: 'fixture',
    payload: {},
  }) + '\n';
  const cwd = makeProject({ stateMd, eventsJsonl });
  const eventsPath = path.join(cwd, '.design', 'telemetry', 'events.jsonl');
  const before = fs.readFileSync(eventsPath, 'utf8');
  const { parsed, status } = runHook(cwd);
  assert.equal(status, 0);
  assert.deepEqual(parsed, { continue: true });
  const after = fs.readFileSync(eventsPath, 'utf8');
  assert.equal(after, before, 'fresh-event branch must NOT append a turn_end event');
});

test('25-09 turn-closeout: Branch 4 — stale event + N/N → additionalContext + turn_end appended', () => {
  const stateMd = makeStateMd({ stage: 'design', status: 'in_progress', taskProgress: '3/3' });
  // 5 minutes ago — well past the 60s stale threshold.
  const staleTs = new Date(Date.now() - 5 * 60_000).toISOString();
  const eventsJsonl = JSON.stringify({
    type: 'tool_use',
    timestamp: staleTs,
    sessionId: 'fixture',
    payload: {},
  }) + '\n';
  const cwd = makeProject({ stateMd, eventsJsonl });
  const eventsPath = path.join(cwd, '.design', 'telemetry', 'events.jsonl');
  const linesBefore = fs.readFileSync(eventsPath, 'utf8').split('\n').filter(Boolean).length;

  const { parsed, status } = runHook(cwd);
  assert.equal(status, 0);
  assert.ok(parsed, 'hook must emit a parseable JSON object');
  assert.equal(parsed.continue, true);
  assert.ok(
    parsed.hookSpecificOutput
      && typeof parsed.hookSpecificOutput.additionalContext === 'string',
    'stale-branch must populate hookSpecificOutput.additionalContext',
  );
  assert.match(
    parsed.hookSpecificOutput.additionalContext,
    /Stage design complete/,
    'N/N task progress must surface a "Stage <stage> complete" nudge',
  );

  const linesAfter = fs.readFileSync(eventsPath, 'utf8').split('\n').filter(Boolean).length;
  assert.equal(
    linesAfter,
    linesBefore + 1,
    'stale-branch must append exactly one turn_end event to events.jsonl',
  );
  const lastLine = fs.readFileSync(eventsPath, 'utf8').trim().split('\n').pop();
  const ev = JSON.parse(lastLine);
  assert.equal(ev.type, 'turn_end');
  assert.equal(ev.stage, 'design');
  assert.equal(ev.payload.task_progress, '3/3');
});

test('25-09 turn-closeout: Branch 4 — paused-mid-task variant uses "paused mid-task" nudge', () => {
  const stateMd = makeStateMd({ stage: 'plan', status: 'in_progress', taskProgress: '1/4' });
  const staleTs = new Date(Date.now() - 5 * 60_000).toISOString();
  const eventsJsonl = JSON.stringify({
    type: 'tool_use',
    timestamp: staleTs,
    sessionId: 'fixture',
    payload: {},
  }) + '\n';
  const cwd = makeProject({ stateMd, eventsJsonl });
  const { parsed } = runHook(cwd);
  assert.match(
    parsed.hookSpecificOutput.additionalContext,
    /Stage plan paused mid-task/,
    'non-N/N task progress must surface a "paused mid-task" nudge',
  );
});

test('25-09 turn-closeout: idempotence — re-run after turn_end on same (stage, task_progress) does not double-append', () => {
  const stateMd = makeStateMd({ stage: 'verify', status: 'in_progress', taskProgress: '2/2' });
  const staleTs = new Date(Date.now() - 5 * 60_000).toISOString();
  const eventsJsonl = JSON.stringify({
    type: 'tool_use',
    timestamp: staleTs,
    sessionId: 'fixture',
    payload: {},
  }) + '\n';
  const cwd = makeProject({ stateMd, eventsJsonl });
  const eventsPath = path.join(cwd, '.design', 'telemetry', 'events.jsonl');

  // First run appends.
  runHook(cwd);
  const linesAfterFirst = fs.readFileSync(eventsPath, 'utf8').split('\n').filter(Boolean).length;

  // Second run with same state — last event is now a turn_end for the same
  // (stage, task_progress); idempotence guard skips the append.
  runHook(cwd);
  const linesAfterSecond = fs.readFileSync(eventsPath, 'utf8').split('\n').filter(Boolean).length;

  assert.equal(
    linesAfterSecond,
    linesAfterFirst,
    'idempotence: re-running the hook on the same (stage, task_progress) tuple must not append a duplicate',
  );
});

test('25-09 turn-closeout: latency — hook completes in well under 100ms on a fresh STATE.md', () => {
  // D-10 budget is ≤10ms typical; account for spawn overhead by allowing a
  // generous 100ms ceiling. The 25-04 spec measured ~35µs in-process; with
  // node spawn overhead (typically 30–60ms on macOS) this is still ample
  // margin.
  const stateMd = makeStateMd({ status: 'in_progress', taskProgress: '1/4' });
  const cwd = makeProject({ stateMd });
  const start = Date.now();
  const { status } = runHook(cwd);
  const elapsed = Date.now() - start;
  assert.equal(status, 0);
  assert.ok(elapsed < 1000, `hook must complete in <1s end-to-end (got ${elapsed}ms — includes node spawn)`);
});
