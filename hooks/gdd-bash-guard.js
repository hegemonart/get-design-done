#!/usr/bin/env node
'use strict';
/**
 * hooks/gdd-bash-guard.js — PreToolUse:Bash guard
 * Blocks ~50 dangerous shell patterns after Unicode NFKC + ANSI-strip normalization.
 * See scripts/lib/dangerous-patterns.cjs for the canonical pattern list.
 *
 * Contract:
 *   Input  (stdin JSON): { tool_name, tool_input: { command } }
 *   Output (stdout JSON):
 *     - match     → { continue: false, stopReason: "..." }
 *     - no match  → { continue: true }
 *   Exit: always 0 (soft failure; the hook never short-circuits the user via exit code).
 */

const path = require('path');
const { match } = require(path.join(__dirname, '..', 'scripts', 'lib', 'dangerous-patterns.cjs'));

async function main() {
  let buf = '';
  for await (const chunk of process.stdin) buf += chunk;

  let payload;
  try { payload = JSON.parse(buf || '{}'); } catch {
    process.stdout.write(JSON.stringify({ continue: true }));
    return;
  }

  if (payload?.tool_name && payload.tool_name !== 'Bash') {
    process.stdout.write(JSON.stringify({ continue: true }));
    return;
  }

  const command = payload?.tool_input?.command ?? '';
  const r = match(command);
  if (r.matched) {
    process.stdout.write(JSON.stringify({
      continue: false,
      stopReason: `gdd-bash-guard: dangerous command blocked (${r.severity}): ${r.description} [${r.pattern}]`,
    }));
    return;
  }

  process.stdout.write(JSON.stringify({ continue: true }));
}

main().catch(() => {
  process.stdout.write(JSON.stringify({ continue: true }));
});
