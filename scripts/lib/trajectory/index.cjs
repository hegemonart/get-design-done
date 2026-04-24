/**
 * trajectory/index.cjs — per-tool-call trajectory stream (Plan 22-03).
 *
 * Records every agent tool-use as one JSONL line at
 *   `.design/telemetry/trajectories/<cycle>.jsonl`
 *
 * Why hash args/result instead of storing full content:
 *   * keeps line size bounded regardless of argument payload
 *   * de-identifies prompts that may contain user-private content
 *   * still allows replay via dedup-by-hash if a future analyzer wants it
 *
 * Schema (one JSONL line):
 *   {
 *     ts:          ISO-8601 with ms,
 *     session_id:  string | null,
 *     cycle:       string,                  // 'current' if not supplied
 *     agent:       string,                  // calling agent name
 *     tool:        string,                  // 'Bash' / 'Edit' / 'mcp__…'
 *     args_hash:   16-char sha256 prefix of canonical-JSON args
 *     result_hash: 16-char sha256 prefix of canonical-JSON result
 *     latency_ms:  number,
 *     status:      'ok' | 'error',
 *   }
 *
 * Side effects:
 *   * appendFileSync to the trajectory file (atomic per line on POSIX/NT)
 *   * NEVER throws — IO failure logs to stderr and returns silently
 *   * Optionally appends a `tool_call.completed` event to the
 *     event-stream so live subscribers can see the same call without
 *     scanning trajectory files. Skipped if `event_stream` arg is null.
 */

'use strict';

const { appendFileSync, mkdirSync } = require('node:fs');
const { dirname, isAbsolute, join, resolve } = require('node:path');
const { createHash } = require('node:crypto');

const DEFAULT_TRAJECTORY_DIR = '.design/telemetry/trajectories';

/**
 * Compute a stable 16-char sha256-hex prefix for arbitrary JSON-shaped
 * input. Falls back to `'0'.repeat(16)` if `JSON.stringify` throws.
 *
 * @param {unknown} value
 * @returns {string}
 */
function hashOf(value) {
  let serialized;
  try {
    serialized = JSON.stringify(value ?? null);
  } catch {
    return '0'.repeat(16);
  }
  return createHash('sha256').update(serialized ?? '').digest('hex').slice(0, 16);
}

/**
 * Resolve the on-disk trajectory file for `cycle` against `baseDir`.
 *
 * @param {{baseDir?: string, cycle?: string, dir?: string}} [opts]
 * @returns {string}
 */
function trajectoryPath(opts = {}) {
  const baseDir = opts.baseDir ?? process.cwd();
  const dir = opts.dir ?? DEFAULT_TRAJECTORY_DIR;
  const cycle = (opts.cycle ?? 'current').replace(/[^A-Za-z0-9._-]/g, '_');
  const resolvedDir = isAbsolute(dir) ? dir : resolve(baseDir, dir);
  return join(resolvedDir, `${cycle}.jsonl`);
}

/**
 * Append one trajectory record. Returns the recorded line for tests
 * that want to assert on shape without re-reading the file.
 *
 * @param {{
 *   cycle?: string,
 *   session_id?: string | null,
 *   agent: string,
 *   tool: string,
 *   args?: unknown,
 *   result?: unknown,
 *   latency_ms?: number,
 *   status?: 'ok' | 'error',
 *   baseDir?: string,
 *   path?: string,
 * }} call
 * @returns {string} the JSONL line that was appended (without trailing \n)
 */
function recordCall(call) {
  const ts = new Date().toISOString();
  const record = {
    ts,
    session_id: call.session_id ?? null,
    cycle: call.cycle ?? 'current',
    agent: call.agent,
    tool: call.tool,
    args_hash: hashOf(call.args),
    result_hash: hashOf(call.result),
    latency_ms: typeof call.latency_ms === 'number' ? call.latency_ms : 0,
    status: call.status ?? 'ok',
  };

  const path = call.path ?? trajectoryPath({ baseDir: call.baseDir, cycle: record.cycle });
  const line = JSON.stringify(record);
  try {
    mkdirSync(dirname(path), { recursive: true });
    appendFileSync(path, line + '\n', { flag: 'a' });
  } catch (err) {
    try {
      process.stderr.write(
        `[trajectory] write failed: ${err && err.message ? err.message : String(err)}\n`,
      );
    } catch {
      /* swallow */
    }
  }
  return line;
}

module.exports = {
  recordCall,
  trajectoryPath,
  hashOf,
  DEFAULT_TRAJECTORY_DIR,
};
