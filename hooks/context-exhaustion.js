#!/usr/bin/env node
/**
 * context-exhaustion.js — PostToolUse hook
 *
 * Monitors context usage reported in the tool_response. When usage exceeds
 * THRESHOLD (default 85%), writes a <paused> resumption block to
 * .design/STATE.md so the next session can resume without losing context.
 *
 * Hook type: PostToolUse (any tool)
 * Input:  JSON on stdin { tool_name, tool_input, tool_response }
 * Output: JSON on stdout { continue, suppressOutput, message } or nothing
 */

'use strict';

const fs = require('fs');
const path = require('path');
const readline = require('readline');

const THRESHOLD = parseFloat(process.env.GDD_CONTEXT_THRESHOLD || '0.85');
const STATE_PATH = path.join(process.cwd(), '.design', 'STATE.md');

function now() {
  return new Date().toISOString();
}

function extractContextUsage(toolResponse) {
  // Claude Code injects context usage as a field in the tool response envelope.
  // Try common field names used across Claude Code versions.
  if (typeof toolResponse !== 'object' || toolResponse === null) return null;

  // Direct field
  if (typeof toolResponse.context_usage === 'number') return toolResponse.context_usage;
  if (typeof toolResponse.contextUsage === 'number') return toolResponse.contextUsage;

  // Nested under metadata
  const meta = toolResponse.metadata || toolResponse.meta || {};
  if (typeof meta.context_usage === 'number') return meta.context_usage;
  if (typeof meta.contextUsage === 'number') return meta.contextUsage;

  // Fraction string "0.87" or percentage "87%"
  const raw = toolResponse.context_usage || toolResponse.contextUsage
    || meta.context_usage || meta.contextUsage;
  if (typeof raw === 'string') {
    if (raw.endsWith('%')) return parseFloat(raw) / 100;
    const n = parseFloat(raw);
    if (!isNaN(n)) return n > 1 ? n / 100 : n;
  }

  return null;
}

function buildPausedBlock(toolName, usage) {
  const pct = Math.round(usage * 100);
  return `
<paused>
recorded: ${now()}
trigger: context-exhaustion-hook
context_usage: ${pct}%
last_tool: ${toolName}

## Resumption instructions

Context reached ${pct}% during the previous session (threshold: ${Math.round(THRESHOLD * 100)}%).
The session was auto-paused to preserve quality.

To resume:
1. Run \`/gdd:resume\` — it will read this block and restore working context
2. If mid-plan: check .design/STATE.md for the last completed task
3. Re-read the active PLAN.md to orient before continuing

Intel store status at pause time:
  ls .design/intel/files.json 2>/dev/null && echo "present" || echo "missing"
</paused>
`;
}

function stateFileHasPausedBlock() {
  if (!fs.existsSync(STATE_PATH)) return false;
  const content = fs.readFileSync(STATE_PATH, 'utf8');
  return content.includes('<paused>') && content.includes('context-exhaustion-hook');
}

function appendPausedBlock(block) {
  if (!fs.existsSync(path.dirname(STATE_PATH))) {
    fs.mkdirSync(path.dirname(STATE_PATH), { recursive: true });
  }
  if (!fs.existsSync(STATE_PATH)) {
    fs.writeFileSync(STATE_PATH, '# Design State\n\n', 'utf8');
  }
  fs.appendFileSync(STATE_PATH, block, 'utf8');
}

async function main() {
  const rl = readline.createInterface({ input: process.stdin });
  let inputData = '';
  for await (const line of rl) inputData += line + '\n';

  let parsed;
  try { parsed = JSON.parse(inputData); } catch { process.exit(0); }

  const toolName = parsed?.tool_name || 'unknown';
  const toolResponse = parsed?.tool_response || {};

  const usage = extractContextUsage(toolResponse);

  // No usage data — cannot act
  if (usage === null) process.exit(0);

  // Below threshold — do nothing
  if (usage < THRESHOLD) process.exit(0);

  // At or above threshold — write paused block (only once per session)
  if (stateFileHasPausedBlock()) process.exit(0);

  const block = buildPausedBlock(toolName, usage);
  appendPausedBlock(block);

  const response = {
    continue: true,
    suppressOutput: false,
    message: `gdd-context-exhaustion: Context at ${Math.round(usage * 100)}% — auto-recorded <paused> block in .design/STATE.md. Run /gdd:resume in the next session to continue.`,
  };
  process.stdout.write(JSON.stringify(response));
}

main().catch(err => { console.error('context-exhaustion hook error:', err); process.exit(0); });
