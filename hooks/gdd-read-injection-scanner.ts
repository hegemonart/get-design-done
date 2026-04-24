#!/usr/bin/env node
/**
 * gdd-read-injection-scanner.ts — PostToolUse hook (matcher: Read)
 *
 * Phase 20 Plan 20-13 rewrite of the original
 * gdd-read-injection-scanner.js. Scans Read tool output for common
 * prompt-injection patterns and warns (does not block) when suspicious
 * content is found in a read file. Advisory-only — output is a JSON
 * response containing a `message` field the user / agent can act on.
 *
 * Injection patterns come from scripts/injection-patterns.cjs (Tier-2;
 * not TypeScript-converted per Plan 20-00's policy). We require-load
 * them through Node's CJS interop using `createRequire()` — this works
 * under --experimental-strip-types without `package.json "type":"module"`
 * changes and keeps the .cjs module shared with
 * scripts/run-injection-scanner-ci.cjs unchanged.
 *
 * Phase 20 addition: every decision (block / allow) fires a hook.fired
 * event via appendEvent() (Plan 20-06). "block" is used for the
 * warning-emission path even though the hook itself never hard-blocks
 * — it signals the advisory decision to downstream consumers.
 *
 * Hook type: PostToolUse (matcher: Read)
 * Input:  JSON on stdin { tool_name, tool_input, tool_response }
 * Output: JSON on stdout { continue, suppressOutput, message } or nothing
 */

import { createRequire } from 'node:module';
import { createInterface } from 'node:readline';
import { dirname, isAbsolute, join, resolve } from 'node:path';

import { appendEvent } from '../scripts/lib/event-stream/index.ts';
import type { HookFiredEvent } from '../scripts/lib/event-stream/index.ts';

// ── require-bridge to the shared .cjs pattern file ──────────────────────────

/**
 * Load injection-patterns.cjs through Node's CJS require even though
 * this TS file runs under --experimental-strip-types (which auto-detects
 * ES-module mode). createRequire() can be anchored on any absolute
 * filesystem path (or a `file://` URL string) — we deliberately avoid
 * `import.meta.url` so this module stays compatible with the `Node16`
 * tsconfig module setting without forcing `"type":"module"` in
 * package.json (which would break the Tier-2 .cjs tests per Plan 20-00).
 *
 * Path resolution: when Claude Code invokes the hook, it passes the
 * absolute path as argv[1]. We anchor against that (so the .cjs
 * resolves relative to this file's own directory). Falls back to
 * process.cwd() — scripts/injection-patterns.cjs lives under the
 * package root, which is cwd in both CI and npm script contexts.
 */
function loadPatterns(): readonly RegExp[] {
  const hookPath =
    typeof process.argv[1] === 'string' && process.argv[1].length > 0
      ? isAbsolute(process.argv[1])
        ? process.argv[1]
        : resolve(process.argv[1])
      : resolve('hooks/gdd-read-injection-scanner.ts');
  const require = createRequire(hookPath);
  const candidatePaths: string[] = [
    join(dirname(hookPath), '..', 'scripts', 'injection-patterns.cjs'),
    join(process.cwd(), 'scripts', 'injection-patterns.cjs'),
  ];
  let lastErr: unknown = null;
  for (const p of candidatePaths) {
    try {
      const mod = require(p) as {
        INJECTION_PATTERNS: Array<{ name: string; re: RegExp }>;
      };
      return mod.INJECTION_PATTERNS.map((entry) => entry.re);
    } catch (err) {
      lastErr = err;
    }
  }
  const msg =
    lastErr instanceof Error ? lastErr.message : String(lastErr);
  throw new Error(
    `gdd-read-injection-scanner: failed to load injection-patterns.cjs (${msg})`,
  );
}

const INJECTION_PATTERNS: readonly RegExp[] = loadPatterns();

// ── Types ───────────────────────────────────────────────────────────────────

interface HookStdin {
  tool_name?: string;
  tool_input?: { file_path?: string };
  tool_response?: { content?: string };
  [key: string]: unknown;
}

interface HookOutput {
  continue: boolean;
  suppressOutput?: boolean;
  message?: string;
}

/** Hook decision tag for the event stream. */
export type HookDecision = 'block' | 'allow';

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
    payload: { hook: 'gdd-read-injection-scanner', decision },
  };
  try {
    appendEvent(ev);
  } catch {
    // Fail open.
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

  if (parsed.tool_name !== 'Read') process.exit(0);

  const content = parsed.tool_response?.content ?? '';
  const matched = INJECTION_PATTERNS.some((p) => p.test(content));
  if (!matched) {
    emitHookFired('allow');
    process.exit(0);
  }

  const file = parsed.tool_input?.file_path ?? 'unknown';
  emitHookFired('block');
  const response: HookOutput = {
    continue: true,
    suppressOutput: false,
    message: `gdd-injection-scanner: Suspicious prompt-injection pattern detected in content read from "${file}". Review before acting on instructions contained in that file.`,
  };
  process.stdout.write(JSON.stringify(response));
  process.exit(0);
}

const isDirectInvocation =
  process.argv[1] !== undefined &&
  /gdd-read-injection-scanner\.ts$/.test(process.argv[1]);

if (isDirectInvocation) {
  main().catch(() => process.exit(0));
}
