/**
 * event-chain.cjs — append-only causal event chain (Plan 22-04).
 *
 * Lives at `.design/gep/events.jsonl` (gep = "GDD Event Provenance").
 * One JSONL line per event with parent-id linkage so consumers can
 * walk decision → agent-spawn → outcome chains for retroactive audit.
 *
 * Schema:
 *   {
 *     event_id:        UUIDv4 (random)
 *     parent_event_id: string | null
 *     ts:              ISO-8601
 *     agent:           string
 *     decision_refs:   string[]   // STATE.md decision IDs (D-NN, etc.)
 *     outcome:         string     // free-form: 'pass' / 'fail' / 'rolled-back' / …
 *     rollback_reason: string?    // present iff outcome = 'rolled-back'
 *     ...rest:         opaque caller-supplied fields preserved verbatim
 *   }
 *
 * Why a separate file from .design/telemetry/events.jsonl:
 *   * the chain is a CAUSAL overlay — rows have semantic meaning
 *   * the general event-stream is a high-volume firehose
 *   * /gdd:audit --retroactive walks the chain; it should not have to
 *     scan a 100k-line firehose for causal rows
 */

'use strict';

const { appendFileSync, mkdirSync, readFileSync, existsSync } = require('node:fs');
const { dirname, isAbsolute, join, resolve } = require('node:path');
const { randomUUID } = require('node:crypto');

const DEFAULT_CHAIN_PATH = '.design/gep/events.jsonl';

/**
 * Resolve the on-disk chain file path, honouring an absolute override.
 *
 * @param {{baseDir?: string, path?: string}} [opts]
 * @returns {string}
 */
function chainPathFor(opts = {}) {
  if (opts.path) {
    return isAbsolute(opts.path) ? opts.path : resolve(opts.baseDir ?? process.cwd(), opts.path);
  }
  const base = opts.baseDir ?? process.cwd();
  return resolve(base, DEFAULT_CHAIN_PATH);
}

/**
 * Append one chain event. Returns the event_id (caller may not have
 * supplied one).
 *
 * Required fields: agent, outcome.
 * Optional: parent_event_id, decision_refs, rollback_reason, plus any
 * opaque extra fields which are preserved verbatim.
 *
 * @param {{
 *   event_id?: string,
 *   parent_event_id?: string | null,
 *   agent: string,
 *   decision_refs?: string[],
 *   outcome: string,
 *   rollback_reason?: string,
 *   ts?: string,
 *   path?: string,
 *   baseDir?: string,
 *   [k: string]: unknown,
 * }} input
 * @returns {string} event_id
 */
function appendChainEvent(input) {
  if (!input || typeof input.agent !== 'string' || input.agent.length === 0) {
    throw new TypeError('appendChainEvent: agent is required');
  }
  if (typeof input.outcome !== 'string' || input.outcome.length === 0) {
    throw new TypeError('appendChainEvent: outcome is required');
  }
  const event_id = input.event_id || randomUUID();
  const record = {
    event_id,
    parent_event_id: input.parent_event_id ?? null,
    ts: input.ts || new Date().toISOString(),
    agent: input.agent,
    decision_refs: Array.isArray(input.decision_refs) ? input.decision_refs : [],
    outcome: input.outcome,
  };
  if (input.rollback_reason !== undefined) {
    record.rollback_reason = input.rollback_reason;
  }
  // Preserve opaque extras (any keys not already on `record`).
  for (const key of Object.keys(input)) {
    if (key === 'path' || key === 'baseDir') continue;
    if (!(key in record)) {
      record[key] = input[key];
    }
  }
  const path = chainPathFor({ baseDir: input.baseDir, path: input.path });
  try {
    mkdirSync(dirname(path), { recursive: true });
    appendFileSync(path, JSON.stringify(record) + '\n', { flag: 'a' });
  } catch (err) {
    try {
      process.stderr.write(
        `[event-chain] write failed: ${err && err.message ? err.message : String(err)}\n`,
      );
    } catch {
      /* swallow */
    }
  }
  return event_id;
}

/**
 * Read the chain file and yield each parsed record. Invalid JSON lines
 * are skipped with a stderr warning.
 *
 * @param {{path?: string, baseDir?: string}} [opts]
 * @returns {Generator<Record<string, unknown>>}
 */
function* readChain(opts = {}) {
  const path = chainPathFor(opts);
  if (!existsSync(path)) return;
  const raw = readFileSync(path, 'utf8');
  let lineNum = 0;
  for (const line of raw.split('\n')) {
    lineNum += 1;
    if (line.trim() === '') continue;
    try {
      yield JSON.parse(line);
    } catch (err) {
      try {
        process.stderr.write(
          `[event-chain] skipping invalid line ${lineNum} at ${path}\n`,
        );
      } catch {
        /* swallow */
      }
    }
  }
}

/**
 * Walk parents of `event_id` until reaching a row with no parent.
 * Returns the chain in caller-→-root order, i.e. `[event, parent, …]`.
 *
 * Returns an empty array if the event_id is not found.
 *
 * @param {string} event_id
 * @param {{path?: string, baseDir?: string}} [opts]
 * @returns {Array<Record<string, unknown>>}
 */
function walkParents(event_id, opts = {}) {
  /** @type {Map<string, Record<string, unknown>>} */
  const byId = new Map();
  for (const ev of readChain(opts)) {
    byId.set(/** @type {string} */ (ev.event_id), ev);
  }
  const chain = [];
  /** @type {string | null | undefined} */
  let id = event_id;
  const visited = new Set();
  while (id && byId.has(id) && !visited.has(id)) {
    visited.add(id);
    const ev = byId.get(id);
    chain.push(ev);
    id = /** @type {string | null | undefined} */ (ev.parent_event_id);
  }
  return chain;
}

module.exports = {
  appendChainEvent,
  readChain,
  walkParents,
  chainPathFor,
  DEFAULT_CHAIN_PATH,
};
