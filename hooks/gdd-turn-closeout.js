#!/usr/bin/env node
'use strict';
/**
 * hooks/gdd-turn-closeout.js — Stop event hook (Plan 25-04, D-10).
 *
 * Fires when the assistant turn ends. Closes the events.jsonl gap at turn-end
 * and surfaces a stage-completion or paused-mid-task nudge as additionalContext
 * when the user is mid-pipeline and the last event is stale (>60s old).
 *
 * Contract (D-10):
 *   stdin   : { tool_name, tool_input, cwd, ... } — Claude harness Stop payload
 *   stdout  : { continue: true, hookSpecificOutput: { hookEventName: "Stop", additionalContext } }
 *             or { continue: true } when no nudge is warranted
 *   exit    : always 0 (non-blocking — never gate the user's next turn)
 *   latency : ≤10ms typical (reads STATE.md + tails events.jsonl only)
 *   idempotent: re-running on the same (stage, task_progress) tuple after a
 *               turn_end has already been written is a no-op append-skip.
 *
 * Logic:
 *   1. Try to read `.design/STATE.md`. Missing/unreadable → exit cleanly.
 *   2. Lightweight-parse the <position> block (regex, no full state parser).
 *      If status != "in_progress" → exit cleanly.
 *   3. Tail the last line of `.design/telemetry/events.jsonl`. Missing file
 *      counts as "stale by definition" (no events at all is exactly the gap
 *      this hook closes).
 *   4. If last event is <60s old → exit cleanly (no gap to fill).
 *   5. If last event is already a turn_end for the SAME (stage, task_progress)
 *      tuple → idempotent no-op (skip the append, still emit the nudge).
 *   6. Else: append `{type: "turn_end", timestamp, sessionId, stage, payload:
 *      {task_progress}}` to events.jsonl.
 *   7. Build additionalContext nudge:
 *        - task_progress matches `N/N` (stage complete) → "Stage <stage>
 *          complete — run /gdd:next or /gdd:reflect"
 *        - else → "Stage <stage> paused mid-task — resume with /gdd:resume"
 *
 * Out of scope (per Plan 25-04):
 *   - Wiring this hook into hooks.json (Plan 25-08).
 *   - Tail-calling from orchestrator skills — see skills/turn-closeout/SKILL.md
 *     for the portable mirror used by non-Claude runtimes.
 */

const fs = require('fs');
const path = require('path');

const STALE_AFTER_MS = 60_000;
const TAIL_BYTES = 8_192; // last 8 KiB is plenty for one event line (<<64KiB cap)

/**
 * Lightweight parse of the `<position>` block in STATE.md. Returns the fields
 * we care about, or null if the block isn't present / well-formed.
 *
 * We intentionally avoid the full parser at sdk/state/parser.ts
 * because (a) it requires TS execution and (b) its overhead would blow the
 * 10ms budget. The position block is k=v lines so a regex pass is fine.
 */
function parsePosition(stateMd) {
  const m = stateMd.match(/<position>([\s\S]*?)<\/position>/);
  if (!m) return null;
  const body = m[1];
  const fields = {};
  for (const line of body.split(/\r?\n/)) {
    const kv = line.match(/^\s*([a-z_]+)\s*:\s*(.*?)\s*$/);
    if (kv) fields[kv[1]] = kv[2];
  }
  if (!fields.stage || !fields.status) return null;
  return {
    stage: fields.stage,
    status: fields.status,
    task_progress: fields.task_progress || '0/0',
  };
}

/**
 * Read the last line of a JSONL file without loading the whole file.
 * Returns null if the file is missing, empty, or unreadable.
 */
function tailLastLine(filePath) {
  let fd;
  try {
    fd = fs.openSync(filePath, 'r');
    const stat = fs.fstatSync(fd);
    if (stat.size === 0) return null;
    const readLen = Math.min(TAIL_BYTES, stat.size);
    const buf = Buffer.alloc(readLen);
    fs.readSync(fd, buf, 0, readLen, stat.size - readLen);
    const tail = buf.toString('utf8');
    // Trim any trailing newlines, then take the substring after the last newline.
    const trimmed = tail.replace(/\s+$/, '');
    const idx = trimmed.lastIndexOf('\n');
    return idx === -1 ? trimmed : trimmed.slice(idx + 1);
  } catch {
    return null;
  } finally {
    if (fd !== undefined) {
      try { fs.closeSync(fd); } catch { /* swallow */ }
    }
  }
}

/**
 * Decide whether the last-event line is "stale" — older than STALE_AFTER_MS,
 * or unparseable / absent (which we also treat as stale, since the absence of
 * a recent end-of-turn marker is exactly the condition this hook closes).
 *
 * Returns { stale: boolean, lastEvent: object|null }.
 */
function classifyLastEvent(lastLine, nowMs) {
  if (!lastLine) return { stale: true, lastEvent: null };
  let ev;
  try { ev = JSON.parse(lastLine); } catch { return { stale: true, lastEvent: null }; }
  const ts = ev && typeof ev.timestamp === 'string' ? Date.parse(ev.timestamp) : NaN;
  if (!Number.isFinite(ts)) return { stale: true, lastEvent: ev };
  return { stale: nowMs - ts > STALE_AFTER_MS, lastEvent: ev };
}

/**
 * Idempotence guard: if the most-recent line is already a turn_end for the
 * exact (stage, task_progress) tuple, skip the append. Returns true if a
 * duplicate-append should be suppressed.
 */
function isDuplicateTurnEnd(lastEvent, stage, taskProgress) {
  if (!lastEvent || lastEvent.type !== 'turn_end') return false;
  if (lastEvent.stage !== stage) return false;
  const lastProgress = lastEvent.payload && lastEvent.payload.task_progress;
  return lastProgress === taskProgress;
}

/**
 * Build the user-facing nudge string. `N/N` (numerator==denominator) signals
 * stage-complete; anything else is paused-mid-task.
 */
function buildNudge(stage, taskProgress) {
  const m = taskProgress.match(/^(\d+)\s*\/\s*(\d+)$/);
  const stageComplete = !!(m && m[1] === m[2] && Number(m[2]) > 0);
  return stageComplete
    ? `Stage ${stage} complete — run /gdd:next or /gdd:reflect`
    : `Stage ${stage} paused mid-task — resume with /gdd:resume`;
}

/**
 * Resolve a session id for the appended event. The Stop hook payload may
 * include `session_id`; if absent (older harness or test fixtures) fall back
 * to a synthetic marker so the line still parses against the BaseEvent shape.
 */
function resolveSessionId(payload) {
  return (payload && (payload.session_id || payload.sessionId)) || 'turn-closeout';
}

/**
 * Append a single turn_end event to events.jsonl. Best-effort — any I/O
 * failure is swallowed (the nudge still surfaces; we don't gate on writes).
 */
function appendTurnEnd(eventsPath, stage, taskProgress, sessionId, nowIso) {
  const event = {
    type: 'turn_end',
    timestamp: nowIso,
    sessionId,
    stage,
    payload: { task_progress: taskProgress },
    _meta: { source: 'gdd-turn-closeout' },
  };
  try {
    const dir = path.dirname(eventsPath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.appendFileSync(eventsPath, JSON.stringify(event) + '\n', { flag: 'a' });
  } catch {
    /* swallow — non-blocking */
  }
}

function emitContinue(additionalContext) {
  const out = additionalContext
    ? { continue: true, hookSpecificOutput: { hookEventName: 'Stop', additionalContext } }
    : { continue: true };
  try { process.stdout.write(JSON.stringify(out)); } catch { /* swallow */ }
}

async function main() {
  // Drain stdin even if we don't end up using it; the harness sends a JSON
  // payload and orphaned EPIPE on close has bitten other hooks.
  let buf = '';
  try {
    for await (const chunk of process.stdin) buf += chunk;
  } catch { /* swallow */ }

  let payload = {};
  try { payload = buf.trim() ? JSON.parse(buf) : {}; } catch { payload = {}; }

  const cwd = (payload && payload.cwd) || process.cwd();
  const statePath = path.join(cwd, '.design', 'STATE.md');
  const eventsPath = path.join(cwd, '.design', 'telemetry', 'events.jsonl');

  // --- Branch 1: STATE.md missing or unreadable → silent continue.
  let stateMd;
  try { stateMd = fs.readFileSync(statePath, 'utf8'); }
  catch { return emitContinue(null); }

  // --- Branch 2: <position> not parseable or status != in_progress → silent continue.
  const position = parsePosition(stateMd);
  if (!position || position.status !== 'in_progress') return emitContinue(null);

  const nowMs = Date.now();
  const nowIso = new Date(nowMs).toISOString();

  // --- Branch 3: last event is fresh (<60s) → silent continue (no gap).
  const lastLine = tailLastLine(eventsPath);
  const { stale, lastEvent } = classifyLastEvent(lastLine, nowMs);
  if (!stale) return emitContinue(null);

  // --- Branch 4: stale → idempotent append (skip if duplicate) + emit nudge.
  if (!isDuplicateTurnEnd(lastEvent, position.stage, position.task_progress)) {
    appendTurnEnd(
      eventsPath,
      position.stage,
      position.task_progress,
      resolveSessionId(payload),
      nowIso,
    );
  }

  emitContinue(buildNudge(position.stage, position.task_progress));
}

main().catch(() => {
  // Never block the user's next turn — even on catastrophic failure.
  try { process.stdout.write(JSON.stringify({ continue: true })); } catch { /* swallow */ }
});

// Exposed for unit tests (Plan 25-09). Intentionally no public runtime surface
// beyond the stdin/stdout contract above.
module.exports = {
  parsePosition,
  tailLastLine,
  classifyLastEvent,
  isDuplicateTurnEnd,
  buildNudge,
  STALE_AFTER_MS,
};
