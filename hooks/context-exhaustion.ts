#!/usr/bin/env node
/**
 * context-exhaustion.ts — PostToolUse hook
 *
 * Phase 20 Plan 20-13 rewrite of the original context-exhaustion.js.
 * Behavior is byte-equivalent: when tool_response reports context
 * consumption at or above THRESHOLD (default 0.85), the hook writes a
 * <paused> resumption block into .design/STATE.md so the next session
 * can resume with full context. Only writes once per session — if a
 * <paused> block from the same trigger already exists, the hook exits
 * silently.
 *
 * Phase 20 addition: every decision (ok / warn) fires a hook.fired
 * event to .design/telemetry/events.jsonl via appendEvent() (Plan 20-06).
 *
 * Hook type: PostToolUse (any tool)
 * Input:  JSON on stdin { tool_name, tool_input, tool_response }
 * Output: JSON on stdout { continue, suppressOutput, message } or nothing
 */

import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
  appendFileSync,
} from 'node:fs';
import { dirname, join } from 'node:path';
import { createInterface } from 'node:readline';

import { appendEvent } from '../scripts/lib/event-stream/index.ts';
import type { HookFiredEvent } from '../scripts/lib/event-stream/index.ts';

// ── Types ───────────────────────────────────────────────────────────────────

interface ToolResponseMeta {
  context_usage?: number | string;
  contextUsage?: number | string;
}
interface ToolResponse {
  context_usage?: number | string;
  contextUsage?: number | string;
  metadata?: ToolResponseMeta;
  meta?: ToolResponseMeta;
  [key: string]: unknown;
}

interface HookStdin {
  tool_name?: string;
  tool_input?: Record<string, unknown>;
  tool_response?: ToolResponse;
  [key: string]: unknown;
}

interface HookOutput {
  continue: boolean;
  suppressOutput?: boolean;
  message?: string;
}

/** Hook decision emitted on the event stream. */
export type HookDecision = 'ok' | 'warn';

// ── Constants ───────────────────────────────────────────────────────────────

/**
 * Context-usage fraction above which the hook paints a <paused> block.
 * Override via GDD_CONTEXT_THRESHOLD env var (float in [0,1]).
 */
export const THRESHOLD: number = (() => {
  const raw = process.env['GDD_CONTEXT_THRESHOLD'];
  const parsed = raw !== undefined ? Number.parseFloat(raw) : Number.NaN;
  return Number.isFinite(parsed) ? parsed : 0.85;
})();

const STATE_PATH = join(process.cwd(), '.design', 'STATE.md');

// ── helpers ─────────────────────────────────────────────────────────────────

function now(): string {
  return new Date().toISOString();
}

/**
 * Claude Code injects context usage in several shapes across versions.
 * Try direct fields, then metadata.meta alias, then string forms
 * (fraction or percentage). Returns null when no usage data is present.
 */
export function extractContextUsage(
  toolResponse: ToolResponse | null | undefined,
): number | null {
  if (typeof toolResponse !== 'object' || toolResponse === null) return null;

  if (typeof toolResponse.context_usage === 'number') return toolResponse.context_usage;
  if (typeof toolResponse.contextUsage === 'number') return toolResponse.contextUsage;

  const meta: ToolResponseMeta =
    toolResponse.metadata ?? toolResponse.meta ?? {};
  if (typeof meta.context_usage === 'number') return meta.context_usage;
  if (typeof meta.contextUsage === 'number') return meta.contextUsage;

  const raw =
    toolResponse.context_usage ??
    toolResponse.contextUsage ??
    meta.context_usage ??
    meta.contextUsage;
  if (typeof raw === 'string') {
    if (raw.endsWith('%')) return Number.parseFloat(raw) / 100;
    const n = Number.parseFloat(raw);
    if (Number.isFinite(n)) return n > 1 ? n / 100 : n;
  }
  return null;
}

export function buildPausedBlock(toolName: string, usage: number): string {
  const pct = Math.round(usage * 100);
  const thresholdPct = Math.round(THRESHOLD * 100);
  return `
<paused>
recorded: ${now()}
trigger: context-exhaustion-hook
context_usage: ${pct}%
last_tool: ${toolName}

## Resumption instructions

Context reached ${pct}% during the previous session (threshold: ${thresholdPct}%).
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

export function stateFileHasPausedBlock(): boolean {
  if (!existsSync(STATE_PATH)) return false;
  const content = readFileSync(STATE_PATH, 'utf8');
  return (
    content.includes('<paused>') &&
    content.includes('context-exhaustion-hook')
  );
}

function appendPausedBlock(block: string): void {
  if (!existsSync(dirname(STATE_PATH))) {
    mkdirSync(dirname(STATE_PATH), { recursive: true });
  }
  if (!existsSync(STATE_PATH)) {
    writeFileSync(STATE_PATH, '# Design State\n\n', 'utf8');
  }
  appendFileSync(STATE_PATH, block, 'utf8');
}

// ── event-stream emitter ────────────────────────────────────────────────────

let CACHED_SESSION_ID: string | null = null;
function getSessionId(): string {
  if (CACHED_SESSION_ID === null) {
    const iso = new Date().toISOString().replace(/[:.]/g, '-');
    CACHED_SESSION_ID = `gdd-hook-${iso}-${process.pid}`;
  }
  return CACHED_SESSION_ID;
}

function emitHookFired(decision: HookDecision): void {
  const ev: HookFiredEvent = {
    type: 'hook.fired',
    timestamp: new Date().toISOString(),
    sessionId: getSessionId(),
    payload: { hook: 'context-exhaustion', decision },
  };
  try {
    appendEvent(ev);
  } catch {
    // Fail open — event-stream errors must never block the hook.
  }
}

// ── main ────────────────────────────────────────────────────────────────────

async function readStdin(): Promise<string> {
  const rl = createInterface({ input: process.stdin });
  let data = '';
  for await (const line of rl) data += line + '\n';
  return data;
}

export async function main(): Promise<void> {
  const inputData = await readStdin();

  let parsed: HookStdin;
  try {
    parsed = JSON.parse(inputData) as HookStdin;
  } catch {
    process.exit(0);
  }

  const toolName =
    typeof parsed.tool_name === 'string' && parsed.tool_name.length > 0
      ? parsed.tool_name
      : 'unknown';
  const toolResponse: ToolResponse = parsed.tool_response ?? {};

  const usage = extractContextUsage(toolResponse);

  // No usage data — cannot act. Do not emit a hook.fired event; this
  // is a non-decision, not an "ok" outcome.
  if (usage === null) process.exit(0);

  // Below threshold — explicit "ok" decision.
  if (usage < THRESHOLD) {
    emitHookFired('ok');
    process.exit(0);
  }

  // At or above threshold but block already present — emit ok (we did
  // the right thing earlier) and bail.
  if (stateFileHasPausedBlock()) {
    emitHookFired('ok');
    process.exit(0);
  }

  const block = buildPausedBlock(toolName, usage);
  appendPausedBlock(block);
  emitHookFired('warn');

  const response: HookOutput = {
    continue: true,
    suppressOutput: false,
    message: `gdd-context-exhaustion: Context at ${Math.round(usage * 100)}% — auto-recorded <paused> block in .design/STATE.md. Run /gdd:resume in the next session to continue.`,
  };
  process.stdout.write(JSON.stringify(response));
}

const isDirectInvocation =
  process.argv[1] !== undefined &&
  /context-exhaustion\.ts$/.test(process.argv[1]);

if (isDirectInvocation) {
  main().catch((err: unknown) => {
    const msg = err instanceof Error ? err.message : String(err);
    process.stderr.write(`context-exhaustion hook error: ${msg}\n`);
    process.exit(0);
  });
}
