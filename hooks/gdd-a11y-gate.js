#!/usr/bin/env node
'use strict';
/**
 * hooks/gdd-a11y-gate.js — advisory PostToolUse hook for accessibility failures.
 *
 * Phase 48 (A11Y-GATE). The quality-gate skill classifies failed command runs
 * into buckets {lint, type, test, visual, a11y}. When a tool response carries
 * classified_failures with a non-empty `a11y` bucket, this hook surfaces an
 * advisory note so the accessibility failures are visible without being buried
 * in the gate's JSON, and appends a `quality_gate_a11y` event to the cycle's
 * events.jsonl for observability.
 *
 * Contract (mirrors gdd-mcp-circuit-breaker.js):
 *   - Read stdin JSON (the PostToolUse payload).
 *   - Inspect payload.tool_response for quality-gate classified_failures.a11y.
 *   - If present and non-empty: emit an advisory note + append one events.jsonl row.
 *   - ALWAYS write {continue:true} to stdout and exit 0. This hook never blocks.
 *
 * Advisory only: accessibility findings route to design-fixer through the gate's
 * own fix loop, not through this hook. The hook is observability, not a gate.
 * Dependency-free Node (fs + path only).
 */

const fs = require('fs');
const path = require('path');

/**
 * Pull the `a11y` bucket out of a tool response, tolerating both the shape
 * where classified_failures sits at the top level and the shape where it is
 * nested under a `quality_gate` / `result` wrapper. Returns an array of
 * summary strings (possibly empty) or null when no a11y bucket is present.
 */
function extractA11yFailures(toolResponse) {
  if (!toolResponse || typeof toolResponse !== 'object') return null;

  const candidates = [
    toolResponse.classified_failures,
    toolResponse.quality_gate && toolResponse.quality_gate.classified_failures,
    toolResponse.result && toolResponse.result.classified_failures,
  ];

  for (const cf of candidates) {
    if (cf && typeof cf === 'object' && Object.prototype.hasOwnProperty.call(cf, 'a11y')) {
      const bucket = cf.a11y;
      if (Array.isArray(bucket)) return bucket;
      // Tolerate a non-array truthy value by coercing to a single-element list.
      if (bucket) return [String(bucket)];
      return [];
    }
  }
  return null;
}

/** Append one JSONL event row; best-effort, never throws on the persist path. */
function appendEvent(cwd, row) {
  try {
    const eventsPath = path.join(cwd, '.design', 'events.jsonl');
    fs.mkdirSync(path.dirname(eventsPath), { recursive: true });
    fs.appendFileSync(eventsPath, JSON.stringify(row) + '\n', 'utf8');
  } catch {
    /* observability is best-effort — swallow */
  }
}

/**
 * Core hook logic. Accepts a parsed payload and returns the decision object
 * to write to stdout. Exported for unit testing without spawning a process.
 * Always returns an object whose `continue` field is true.
 */
function evaluate(payload, opts = {}) {
  const cwd = (payload && payload.cwd) || opts.cwd || process.cwd();
  const toolResponse = payload && payload.tool_response;
  const a11y = extractA11yFailures(toolResponse);

  if (!a11y || a11y.length === 0) {
    return { continue: true };
  }

  const count = a11y.length;
  const note =
    `gdd-a11y-gate: quality gate reported ${count} accessibility ` +
    `failure${count === 1 ? '' : 's'} in the a11y bucket. These route to ` +
    `design-fixer like lint/type/test/visual failures. Findings: ` +
    a11y.slice(0, 5).join('; ');

  appendEvent(cwd, {
    ts: new Date().toISOString(),
    event: 'quality_gate_a11y',
    a11y_failure_count: count,
    a11y_failures: a11y.slice(0, 20),
  });

  // continue:true keeps this advisory — systemMessage surfaces the note.
  return { continue: true, systemMessage: note };
}

async function main(stdin = process.stdin, stdout = process.stdout) {
  let buf = '';
  for await (const chunk of stdin) buf += chunk;
  let payload;
  try {
    payload = JSON.parse(buf || '{}');
  } catch {
    stdout.write(JSON.stringify({ continue: true }));
    return;
  }
  const decision = evaluate(payload);
  stdout.write(JSON.stringify(decision));
}

// Run as a CLI only when invoked directly; tests require() this module and
// call evaluate()/main() against mock payloads without triggering stdin reads.
if (require.main === module) {
  main().catch(() => {
    process.stdout.write(JSON.stringify({ continue: true }));
  });
}

module.exports = { main, evaluate, extractA11yFailures, appendEvent };
