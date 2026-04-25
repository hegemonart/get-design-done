/**
 * visual-baseline/index.cjs — baseline manager for PNG drift checks
 * (Plan 23-07).
 *
 * Reads/writes `.design/baselines/<key>.png`. Compare delegates to
 * `./diff.cjs#diff`. Atomic write via `.tmp` sibling + rename.
 *
 * Defers Playwright/Preview MCP screenshot capture orchestration to a
 * later phase — this module only handles "given a PNG buffer, compare it
 * / save it as the baseline".
 */

'use strict';

const fs = require('node:fs');
const path = require('node:path');

const { diff, DEFAULT_THRESHOLD, DEFAULT_TOLERANCE } = require('./diff.cjs');

const DEFAULT_BASELINE_DIR = '.design/baselines';
const SAFE_KEY_RE = /^[a-z0-9][a-z0-9._-]{0,127}$/i;

/**
 * @typedef {Object} CompareOutcome
 * @property {boolean} drifted
 * @property {number} ratio
 * @property {boolean} baselineExists
 * @property {string} baselinePath
 * @property {'pixel'|'bytewise'|'absent'} mode
 * @property {number} [diffPixels]
 * @property {number} [totalPixels]
 * @property {string} [reason]
 */

/**
 * Validate a baseline key. Rejects path separators, '..', and unsafe
 * characters that could traverse outside the baseline dir.
 *
 * @param {string} key
 * @returns {string}
 */
function validateKey(key) {
  if (typeof key !== 'string' || key.length === 0) {
    throw new TypeError('visual-baseline: key must be a non-empty string');
  }
  if (key.includes('..') || key.includes('/') || key.includes('\\')) {
    throw new RangeError(
      `visual-baseline: key "${key}" contains illegal characters (/, \\, ..)`,
    );
  }
  if (!SAFE_KEY_RE.test(key)) {
    throw new RangeError(
      `visual-baseline: key "${key}" must match /^[a-z0-9][a-z0-9._-]{0,127}$/i`,
    );
  }
  return key;
}

/**
 * Resolve baseline file path.
 *
 * @param {string} key
 * @param {{cwd?: string, baselineDir?: string}} [opts]
 * @returns {string}
 */
function baselinePathFor(key, opts = {}) {
  validateKey(key);
  const cwd = opts.cwd ?? process.cwd();
  const dir = opts.baselineDir ?? DEFAULT_BASELINE_DIR;
  const root = path.isAbsolute(dir) ? dir : path.join(cwd, dir);
  return path.join(root, `${key}.png`);
}

/**
 * Compare a PNG buffer to the on-disk baseline.
 *
 * @param {string} key
 * @param {Buffer} pngBuffer
 * @param {{cwd?: string, threshold?: number, tolerance?: number, baselineDir?: string}} [opts]
 * @returns {CompareOutcome}
 */
function compareToBaseline(key, pngBuffer, opts = {}) {
  if (!Buffer.isBuffer(pngBuffer)) {
    throw new TypeError('visual-baseline: pngBuffer must be a Buffer');
  }
  const baselinePath = baselinePathFor(key, opts);
  if (!fs.existsSync(baselinePath)) {
    return {
      drifted: true,
      ratio: NaN,
      baselineExists: false,
      baselinePath,
      mode: 'absent',
      reason: 'baseline-not-found',
    };
  }
  const a = fs.readFileSync(baselinePath);
  const r = diff(a, pngBuffer, opts);
  return {
    drifted: r.drifted,
    ratio: r.ratio,
    baselineExists: true,
    baselinePath,
    mode: r.mode,
    diffPixels: r.diffPixels,
    totalPixels: r.totalPixels,
    reason: r.reason,
  };
}

/**
 * Persist a PNG buffer as the baseline. Atomic write (.tmp + rename).
 *
 * @param {string} key
 * @param {Buffer} pngBuffer
 * @param {{cwd?: string, baselineDir?: string}} [opts]
 * @returns {string} absolute path written
 */
function applyBaseline(key, pngBuffer, opts = {}) {
  if (!Buffer.isBuffer(pngBuffer)) {
    throw new TypeError('visual-baseline: pngBuffer must be a Buffer');
  }
  const out = baselinePathFor(key, opts);
  fs.mkdirSync(path.dirname(out), { recursive: true });
  const tmp = out + '.tmp';
  fs.writeFileSync(tmp, pngBuffer);
  fs.renameSync(tmp, out);
  return out;
}

module.exports = {
  compareToBaseline,
  applyBaseline,
  baselinePathFor,
  validateKey,
  DEFAULT_BASELINE_DIR,
  DEFAULT_THRESHOLD,
  DEFAULT_TOLERANCE,
};
