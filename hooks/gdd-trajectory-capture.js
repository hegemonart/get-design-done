#!/usr/bin/env node
/**
 * gdd-trajectory-capture.js — PostToolUse:Agent hook (Plan 22-03).
 *
 * Reads the standard Claude Code hook JSON from stdin:
 *   { tool_name, tool_input, tool_response, session_id, ... }
 *
 * Writes one JSONL line to `.design/telemetry/trajectories/<cycle>.jsonl`
 * via `scripts/lib/trajectory/index.cjs`. Silent-on-failure: telemetry
 * never blocks the parent agent's tool call.
 *
 * Cycle resolution:
 *   * env var GDD_CYCLE wins (used by Phase 21 pipeline runner)
 *   * fallback: 'current'
 */

'use strict';

const { recordCall } = require('../scripts/lib/trajectory/index.cjs');

let raw = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (chunk) => {
  raw += chunk;
});
process.stdin.on('end', () => {
  try {
    const input = raw.trim() ? JSON.parse(raw) : {};
    const toolName = input.tool_name || input.toolName || 'unknown';
    const toolInput = input.tool_input ?? input.toolInput ?? null;
    const toolResponse = input.tool_response ?? input.toolResponse ?? null;
    const sessionId = input.session_id ?? input.sessionId ?? null;
    const status =
      toolResponse && typeof toolResponse === 'object' && toolResponse.is_error === true
        ? 'error'
        : 'ok';
    const latency = typeof input.latency_ms === 'number' ? input.latency_ms : 0;

    recordCall({
      cycle: process.env.GDD_CYCLE || 'current',
      session_id: sessionId,
      agent: input.agent || process.env.GDD_AGENT || 'unknown',
      tool: toolName,
      args: toolInput,
      result: toolResponse,
      latency_ms: latency,
      status,
    });
  } catch (err) {
    try {
      process.stderr.write(
        `[gdd-trajectory] hook failed: ${err && err.message ? err.message : String(err)}\n`,
      );
    } catch {
      /* swallow */
    }
  }
  // Always emit a non-blocking continue verdict.
  try {
    process.stdout.write(JSON.stringify({ continue: true, suppressOutput: true }));
  } catch {
    /* swallow */
  }
});
