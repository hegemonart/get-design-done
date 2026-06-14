#!/usr/bin/env node
'use strict';
/**
 * hooks/gdd-mcp-circuit-breaker.js — PostToolUse counter for mutation-side
 * MCP calls (use_figma / use_paper / use_pencil).
 *
 * Responsibilities:
 *   - Parse tool outcome: success | timeout | error
 *   - Append one JSONL row to .design/telemetry/mcp-budget.jsonl:
 *       { ts, tool, outcome, consecutive_timeouts, total_calls }
 *   - After the append, if consecutive_timeouts ≥ max OR total_calls > max_calls_per_task,
 *     emit {continue:false, stopReason:"..."} and append a STATE.md blocker line.
 *
 * Defaults live in reference/mcp-budget.default.json; overrides merge from
 * .design/config.json.mcp_budget.
 *
 * Exit code always 0 (advisory + JSON-on-stdout pattern).
 */

const fs = require('fs');
const path = require('path');

const REPO_ROOT = path.resolve(__dirname, '..');
const DEFAULT_FILE = path.join(REPO_ROOT, 'reference', 'mcp-budget.default.json');

const TRACKED_TOOL_RE = /^mcp__.*use_(figma|paper|pencil)$/;

// Bounded fallback window (ms) for counting volume when no session id is
// available on the payload. Without this, `total_calls` would count every row
// ever appended to the ledger — so after `max_calls_per_task` cumulative calls
// across ALL sessions for the lifetime of the file, every mutation is blocked
// forever (and a BLOCKER is appended to STATE.md each time). The volume gate is
// meant to be PER-TASK; this window keeps the fallback path per-task-ish so a
// long-lived user is never permanently locked out.
const SESSIONLESS_WINDOW_MS = 6 * 60 * 60 * 1000; // 6 hours

/**
 * Resolve the current session id from the hook payload (Claude Code passes
 * `session_id`; tolerate `sessionId`), falling back to GDD_SESSION_ID, else
 * null. A non-null id makes the volume window exact (count only this session's
 * rows); null falls back to the bounded time window.
 *
 * @param {any} payload
 * @returns {string|null}
 */
function resolveSessionId(payload) {
  const fromPayload = payload && (payload.session_id || payload.sessionId);
  if (typeof fromPayload === 'string' && fromPayload.length > 0) return fromPayload;
  const fromEnv = process.env.GDD_SESSION_ID;
  if (typeof fromEnv === 'string' && fromEnv.length > 0) return fromEnv;
  return null;
}

function loadBudget(cwd) {
  let defaults = { max_calls_per_task: 30, max_consecutive_timeouts: 3, reset_on_success: true };
  try {
    const d = JSON.parse(fs.readFileSync(DEFAULT_FILE, 'utf8'));
    defaults = { ...defaults, ...d };
  } catch { /* fall back */ }
  try {
    const cfg = JSON.parse(fs.readFileSync(path.join(cwd, '.design', 'config.json'), 'utf8'));
    if (cfg && typeof cfg.mcp_budget === 'object') {
      return { ...defaults, ...cfg.mcp_budget };
    }
  } catch { /* no user overrides */ }
  return defaults;
}

/**
 * Classify the outcome of an MCP tool call as 'success' | 'timeout' | 'error'.
 *
 * The previous implementation substring-matched 'timeout' / 'failed' against
 * the ENTIRE JSON-stringified response. That fired false positives on legit
 * successful payloads whose content happens to mention those words — e.g. a
 * Figma node literally named "TimeoutBanner", or a summary line "2 of 5 nodes
 * failed to update, retrying...". When the breaker false-positives, it
 * advances consecutive_timeouts and eventually trips on healthy traffic.
 *
 * The fix: use the structured isError / is_error envelope as the primary
 * signal. MCP tool results carry isError=true|false. Anything without an
 * explicit error flag is treated as success — full stop. Only when the
 * envelope says "error" do we then inspect the ERROR-message fields
 * (content[*].text + error.message + error.code + top-level message) to
 * decide between 'timeout' and generic 'error'. Arbitrary content text is
 * never scanned.
 */
function classifyOutcome(toolResponse) {
  if (!toolResponse || typeof toolResponse !== 'object') return 'error';

  // MCP standard envelope: isError (camelCase). Claude Code historically
  // passes is_error (snake_case). Accept either; treat absence as success.
  const isError =
    toolResponse.isError === true || toolResponse.is_error === true;

  if (!isError) return 'success';

  // Error path: classify timeout vs generic by reading ONLY the dedicated
  // error-message fields, not the entire payload.
  const messageBits = [];

  // content[] may be a string (legacy) or an array of {type,text} (spec).
  if (typeof toolResponse.content === 'string') {
    messageBits.push(toolResponse.content);
  } else if (Array.isArray(toolResponse.content)) {
    for (const c of toolResponse.content) {
      if (c && typeof c.text === 'string') messageBits.push(c.text);
    }
  }

  if (toolResponse.error && typeof toolResponse.error === 'object') {
    if (typeof toolResponse.error.message === 'string') {
      messageBits.push(toolResponse.error.message);
    }
    if (typeof toolResponse.error.code === 'string') {
      messageBits.push(toolResponse.error.code);
    }
  }
  if (typeof toolResponse.message === 'string') {
    messageBits.push(toolResponse.message);
  }

  const combined = messageBits.join(' ').toLowerCase();
  // \btimeout\b matches "timeout" and "request timeout"; \btimed?\s*out\b
  // matches "timed out"; deadline exceeded is gRPC; etimedout is Node fs.
  if (
    /\btimeout\b|\btimed?\s*out\b|\bdeadline\s+exceeded\b|\betimedout\b/.test(
      combined,
    )
  ) {
    return 'timeout';
  }
  return 'error';
}

/**
 * Read the ledger and compute the prior volume + consecutive-timeout state
 * for the CURRENT task window only — not the whole-file lifetime.
 *
 * Window membership for a row:
 *   - If a current session id is known AND the row carries a `session` field:
 *     the row counts iff `row.session === sessionId`.
 *   - Otherwise (sessionless harness/tests, or legacy rows without `session`):
 *     the row counts iff its timestamp is within SESSIONLESS_WINDOW_MS of now.
 *
 * This bounds the volume count so a long-lived ledger can never permanently
 * trip `volumeBreak`, while keeping rapid same-task calls (the common case and
 * the existing test scenario) counted together.
 *
 * @param {string} filePath
 * @param {string|null} sessionId
 * @param {number} nowMs
 */
function readJsonlTail(filePath, sessionId, nowMs) {
  if (!fs.existsSync(filePath)) return { lastRow: null, total_calls: 0, consecutive_timeouts: 0 };
  let total = 0;
  let lastTimeoutsChain = 0;
  let lastRow = null;
  try {
    const text = fs.readFileSync(filePath, 'utf8');
    for (const line of text.split(/\r?\n/)) {
      const t = line.trim();
      if (!t) continue;
      let row;
      try { row = JSON.parse(t); } catch { continue; }

      // Decide whether this row belongs to the current task window.
      let inWindow;
      if (sessionId !== null && typeof row.session === 'string' && row.session.length > 0) {
        inWindow = row.session === sessionId;
      } else {
        const rowMs = typeof row.ts === 'string' ? Date.parse(row.ts) : NaN;
        // Unparseable timestamps fall back to "in window" so we never
        // under-count; a malformed-ts row is treated as recent.
        inWindow = Number.isNaN(rowMs) ? true : (nowMs - rowMs) <= SESSIONLESS_WINDOW_MS;
      }

      if (!inWindow) {
        // Out-of-window rows reset the streak — a new task/session must not
        // inherit a stale consecutive-timeout chain.
        lastTimeoutsChain = 0;
        continue;
      }

      total++;
      if (row.outcome === 'timeout') lastTimeoutsChain++;
      else lastTimeoutsChain = 0;
      lastRow = row;
    }
  } catch { /* unreadable ledger → start fresh */ }
  return { lastRow, total_calls: total, consecutive_timeouts: lastTimeoutsChain };
}

function appendJsonl(filePath, row) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.appendFileSync(filePath, JSON.stringify(row) + '\n', 'utf8');
}

function appendStateBlocker(cwd, message) {
  const statePath = path.join(cwd, '.design', 'STATE.md');
  const line = `\n<!-- mcp-circuit-breaker: ${new Date().toISOString()} --> 🛑 BLOCKER: ${message}\n`;
  // Open with 'r+' (no-create) so we append ONLY to an already-existing STATE
  // and never create it — opening fails with ENOENT when STATE is missing,
  // which we swallow as "silent if STATE missing". This collapses the old
  // existsSync→appendFileSync TOCTOU race into a single atomic open.
  let fd;
  try {
    fd = fs.openSync(statePath, 'r+');
  } catch {
    return; // STATE missing (ENOENT) or otherwise unopenable — best-effort, stay silent
  }
  try {
    fs.writeSync(fd, line, fs.fstatSync(fd).size, 'utf8');
  } catch {
    /* best-effort */
  } finally {
    try { fs.closeSync(fd); } catch { /* best-effort */ }
  }
}

async function main() {
  let buf = '';
  for await (const chunk of process.stdin) buf += chunk;
  let payload;
  try { payload = JSON.parse(buf || '{}'); } catch {
    process.stdout.write(JSON.stringify({ continue: true }));
    return;
  }

  const tool = payload?.tool_name || '';
  if (!TRACKED_TOOL_RE.test(tool)) {
    process.stdout.write(JSON.stringify({ continue: true }));
    return;
  }

  const cwd = payload?.cwd || process.cwd();
  const budget = loadBudget(cwd);
  const ledgerPath = path.join(cwd, '.design', 'telemetry', 'mcp-budget.jsonl');

  const sessionId = resolveSessionId(payload);
  const nowMs = Date.now();
  const prior = readJsonlTail(ledgerPath, sessionId, nowMs);
  const outcome = classifyOutcome(payload?.tool_response);
  const total_calls = prior.total_calls + 1;
  const consecutive_timeouts = outcome === 'timeout'
    ? prior.consecutive_timeouts + 1
    : (budget.reset_on_success && outcome === 'success' ? 0 : prior.consecutive_timeouts);

  const row = {
    ts: new Date(nowMs).toISOString(),
    tool,
    outcome,
    consecutive_timeouts,
    total_calls,
  };
  // Stamp the session id so future calls can scope the volume window exactly.
  // Omitted when unknown (keeps the row schema stable for the sessionless path,
  // which relies on the time window instead).
  if (sessionId !== null) row.session = sessionId;
  appendJsonl(ledgerPath, row);

  const timeoutBreak = consecutive_timeouts >= budget.max_consecutive_timeouts;
  const volumeBreak = budget.max_calls_per_task > 0 && total_calls > budget.max_calls_per_task;

  if (timeoutBreak || volumeBreak) {
    const reason = timeoutBreak
      ? `${consecutive_timeouts} consecutive MCP timeouts on ${tool} (≥${budget.max_consecutive_timeouts}). Likely the sandbox hill-climb failure mode. Stop and redirect.`
      : `MCP call count for this task is ${total_calls}, above max_calls_per_task=${budget.max_calls_per_task}. Stop and redirect.`;
    const msg = `${reason} For authoring new Figma content, use figma:figma-generate-design. For decision-writing, use /gdd:figma-write. See reference/figma-sandbox.md.`;
    appendStateBlocker(cwd, msg);
    process.stdout.write(JSON.stringify({ continue: false, stopReason: `gdd-mcp-circuit-breaker: ${msg}` }));
    return;
  }

  process.stdout.write(JSON.stringify({ continue: true }));
}

main().catch(() => {
  process.stdout.write(JSON.stringify({ continue: true }));
});
