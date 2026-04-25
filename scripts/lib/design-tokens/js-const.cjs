/**
 * design-tokens/js-const.cjs — load token modules via spawned-node
 * subprocess (Plan 23-08).
 *
 * Why subprocess: the project may use ESM, CJS, or .ts (with type-strip
 * runtimes); evaluating user JS in-process risks side effects + version
 * skew. Fork a child node with a tiny harness that requires/imports the
 * target file and prints its tokens as JSON.
 *
 * Recognised export shapes (in priority order):
 *   1. `module.exports.tokens = { … }` (CJS named)
 *   2. `module.exports = { tokens: { … } }` (CJS object with `tokens`)
 *   3. `module.exports = { … }` (CJS bag — direct map of name→value)
 *   4. `export const tokens = { … }` (ESM named) — handled via dynamic import in harness
 *   5. `export default { tokens: { … } }` (ESM default) — same
 *
 * Returns flat `{name: value}` map. Nested objects flattened with `.`
 * separator (e.g. `{color: {primary: '#abc'}}` → `color.primary`).
 *
 * Values are stringified via `String(value)`; arrays JSON-encoded.
 */

'use strict';

const { spawnSync } = require('node:child_process');
const path = require('node:path');
const fs = require('node:fs');

const HARNESS_PATH = require('node:path').join(__dirname, '_js-harness.cjs');

/**
 * Flatten a nested object into dotted keys.
 *
 * @param {unknown} val
 * @param {string} prefix
 * @param {Record<string, string>} out
 */
function flatten(val, prefix, out) {
  if (val === null || val === undefined) return;
  if (typeof val === 'string' || typeof val === 'number' || typeof val === 'boolean') {
    out[prefix] = String(val);
    return;
  }
  if (Array.isArray(val)) {
    out[prefix] = JSON.stringify(val);
    return;
  }
  if (typeof val === 'object') {
    for (const k of Object.keys(val)) {
      const next = prefix ? `${prefix}.${k}` : k;
      flatten(val[k], next, out);
    }
    return;
  }
  out[prefix] = String(val);
}

/**
 * Read tokens from a JS/CJS/MJS module file.
 *
 * @param {string} filePath
 * @returns {{tokens: Record<string, string>, source: string, format: 'js-const', warnings: string[]}}
 */
function readJsConst(filePath) {
  const abs = path.resolve(filePath);
  if (!fs.existsSync(abs)) {
    throw new Error(`js-const: file not found: ${abs}`);
  }
  if (!fs.existsSync(HARNESS_PATH)) {
    throw new Error(`js-const: harness missing at ${HARNESS_PATH}`);
  }
  const r = spawnSync(process.execPath, [HARNESS_PATH, abs], {
    encoding: 'utf8',
    timeout: 15_000,
  });
  /** @type {string[]} */
  const warnings = [];
  if (r.status !== 0) {
    return {
      tokens: {},
      source: abs,
      format: 'js-const',
      warnings: [
        `harness-exit-${r.status}: ${(r.stderr || '').slice(0, 400)}`,
      ],
    };
  }
  /** @type {{tokens?: unknown, error?: string}} */
  let parsed;
  try {
    parsed = JSON.parse(r.stdout);
  } catch (err) {
    return {
      tokens: {},
      source: abs,
      format: 'js-const',
      warnings: [`harness-output-parse-failed: ${err.message}`],
    };
  }
  if (parsed.error) warnings.push(parsed.error);
  /** @type {Record<string, string>} */
  const flat = {};
  flatten(parsed.tokens, '', flat);
  return { tokens: flat, source: abs, format: 'js-const', warnings };
}

module.exports = { readJsConst, _flatten: flatten };
