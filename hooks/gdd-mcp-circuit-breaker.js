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

function classifyOutcome(toolResponse) {
  if (!toolResponse || typeof toolResponse !== 'object') return 'error';
  const text = JSON.stringify(toolResponse).slice(0, 4000).toLowerCase();
  // Check timeout FIRST — a timed-out call may also set is_error, but we want
  // to classify it as "timeout" so consecutive_timeouts advances correctly.
  if (text.includes('timeout') || text.includes('timed out') || text.includes('deadline exceeded')) return 'timeout';
  if (toolResponse.is_error) return 'error';
  if (text.includes('"error"') || text.includes('failed')) return 'error';
  return 'success';
}

function readJsonlTail(filePath) {
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
  if (!fs.existsSync(statePath)) return; // silent if STATE missing
  const line = `\n<!-- mcp-circuit-breaker: ${new Date().toISOString()} --> 🛑 BLOCKER: ${message}\n`;
  try { fs.appendFileSync(statePath, line, 'utf8'); } catch { /* best-effort */ }
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

  const prior = readJsonlTail(ledgerPath);
  const outcome = classifyOutcome(payload?.tool_response);
  const total_calls = prior.total_calls + 1;
  const consecutive_timeouts = outcome === 'timeout'
    ? prior.consecutive_timeouts + 1
    : (budget.reset_on_success && outcome === 'success' ? 0 : prior.consecutive_timeouts);

  const row = {
    ts: new Date().toISOString(),
    tool,
    outcome,
    consecutive_timeouts,
    total_calls,
  };
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
