/**
 * stub-invoker.cjs — deterministic, scenario-keyed agent invoker (Plan 33-01).
 *
 * The DEFAULT invokeAgent seam for `runner.cjs` (D-03): the runner is
 * invoker-agnostic and exposes an injectable `invokeAgent(prompt, opts) ->
 * { text }` seam. A maintainer later wires a REAL invoker (a peer-CLI ACP
 * spawn of a local `claude`/`codex`, or a thin keyed SDK adapter); this stub
 * is what every Phase-33 CI/structural test drives so runs are reproducible
 * with NO API key and NO network.
 *
 * Determinism contract:
 *   * NO randomness, NO network, NO @anthropic-ai/sdk.
 *   * A canned response is resolved by a KEY derived from
 *     opts.scenario || opts.stubKey, falling back to scanning `prompt` for a
 *     registered key marker.
 *   * An UNKNOWN key returns a neutral { text: '' } so the runner never throws.
 *
 * Tests MAY instead pass their own inline invokeAgent to runScenario — both
 * paths are valid (D-03). This module is the no-arg default.
 */

'use strict';

// Internal canned-response table: key -> response text. Seeded with one
// illustrative scenario; callers extend it via register().
const TABLE = new Map([
  // A neutral, compliance-shaped sample so the default stub is non-empty for a
  // known demo key. Real scenarios register their own canned text.
  [
    'runner-demo',
    'A <HARD-GATE> blocks me — I must write the brief before any other stage.',
  ],
]);

/**
 * Seed or overwrite a canned response for a scenario key.
 *
 * @param {string} key   scenario name / stub key
 * @param {string} text  canned response text the stub returns for that key
 * @returns {void}
 */
function register(key, text) {
  if (typeof key !== 'string' || key.length === 0) {
    throw new TypeError('register: key must be a non-empty string');
  }
  TABLE.set(key, typeof text === 'string' ? text : String(text == null ? '' : text));
}

/**
 * Resolve a response key from opts, then (as a fallback) by scanning the
 * prompt for any registered key as a substring marker.
 *
 * @param {string} prompt
 * @param {{scenario?: string, stubKey?: string} | undefined} opts
 * @returns {string | undefined}
 */
function resolveKey(prompt, opts) {
  if (opts && typeof opts.scenario === 'string' && opts.scenario.length > 0) {
    return opts.scenario;
  }
  if (opts && typeof opts.stubKey === 'string' && opts.stubKey.length > 0) {
    return opts.stubKey;
  }
  if (typeof prompt === 'string' && prompt.length > 0) {
    for (const key of TABLE.keys()) {
      if (prompt.includes(key)) return key;
    }
  }
  return undefined;
}

/**
 * Deterministic invokeAgent-shaped function. Returns a canned { text } for a
 * known scenario key, or a neutral { text: '' } for an unknown key (so the
 * runner can score it as a compliance-miss without throwing).
 *
 * @param {string} prompt
 * @param {{scenario?: string, stubKey?: string}} [opts]
 * @returns {{ text: string }}
 */
function invokeAgent(prompt, opts) {
  const key = resolveKey(prompt, opts);
  if (key !== undefined && TABLE.has(key)) {
    return { text: TABLE.get(key) };
  }
  // Unknown key -> neutral default; never throw.
  return { text: '' };
}

module.exports = {
  invokeAgent,
  register,
  // Exposed for advanced callers/tests that want to inspect or reset seeds.
  _table: TABLE,
};
