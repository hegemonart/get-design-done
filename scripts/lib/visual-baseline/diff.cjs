/**
 * visual-baseline/diff.cjs — pixel-diff primitive (Plan 23-07).
 *
 * Compares two PNG buffers. With `pngjs` installed (probeOptional),
 * decodes both and counts pixels whose R/G/B/A channels differ beyond
 * the tolerance. Without `pngjs`, falls back to bytewise equality
 * (SHA-256 hash compare) — ratio is `equal ? 0 : 1`.
 *
 * Dimension mismatch in pixel mode → ratio=1, drifted=true,
 * reason='dimension-mismatch'. Never throws on shape mismatch.
 */

'use strict';

const { createHash } = require('node:crypto');
const { probeOptional } = require('../probe-optional.cjs');

const _pngjs = probeOptional('pngjs');

const DEFAULT_THRESHOLD = 0.005;
const DEFAULT_TOLERANCE = 4;

/**
 * @typedef {Object} DiffResult
 * @property {boolean} drifted
 * @property {number} ratio
 * @property {number} diffPixels
 * @property {number} totalPixels
 * @property {'pixel'|'bytewise'} mode
 * @property {string} [reason]
 */

function bytewiseDiff(a, b, threshold) {
  const ha = createHash('sha256').update(a).digest('hex');
  const hb = createHash('sha256').update(b).digest('hex');
  const equal = ha === hb;
  const ratio = equal ? 0 : 1;
  return {
    drifted: ratio > threshold,
    ratio,
    diffPixels: equal ? 0 : 1,
    totalPixels: 1,
    mode: 'bytewise',
    reason: 'pngjs-not-available',
  };
}

function pixelDiff(a, b, threshold, tolerance) {
  const { PNG } = _pngjs;
  let pa;
  let pb;
  try {
    pa = PNG.sync.read(a);
  } catch (err) {
    return {
      drifted: true,
      ratio: 1,
      diffPixels: 0,
      totalPixels: 0,
      mode: 'pixel',
      reason: `decode-a-failed: ${err && err.message ? err.message : String(err)}`,
    };
  }
  try {
    pb = PNG.sync.read(b);
  } catch (err) {
    return {
      drifted: true,
      ratio: 1,
      diffPixels: 0,
      totalPixels: 0,
      mode: 'pixel',
      reason: `decode-b-failed: ${err && err.message ? err.message : String(err)}`,
    };
  }
  if (pa.width !== pb.width || pa.height !== pb.height) {
    return {
      drifted: true,
      ratio: 1,
      diffPixels: 0,
      totalPixels: 0,
      mode: 'pixel',
      reason: 'dimension-mismatch',
    };
  }
  const total = pa.width * pa.height;
  const A = pa.data;
  const B = pb.data;
  let diffPx = 0;
  for (let i = 0; i < A.length; i += 4) {
    const dr = Math.abs(A[i] - B[i]);
    const dg = Math.abs(A[i + 1] - B[i + 1]);
    const db = Math.abs(A[i + 2] - B[i + 2]);
    const da = Math.abs(A[i + 3] - B[i + 3]);
    if (dr > tolerance || dg > tolerance || db > tolerance || da > tolerance) {
      diffPx += 1;
    }
  }
  const ratio = total > 0 ? diffPx / total : 0;
  return {
    drifted: ratio > threshold,
    ratio,
    diffPixels: diffPx,
    totalPixels: total,
    mode: 'pixel',
  };
}

/**
 * Compare two PNG buffers.
 *
 * @param {Buffer} a
 * @param {Buffer} b
 * @param {{threshold?: number, tolerance?: number}} [opts]
 * @returns {DiffResult}
 */
function diff(a, b, opts = {}) {
  if (!Buffer.isBuffer(a) || !Buffer.isBuffer(b)) {
    throw new TypeError('visual-baseline/diff: both inputs must be Buffers');
  }
  const threshold = typeof opts.threshold === 'number' ? opts.threshold : DEFAULT_THRESHOLD;
  const tolerance = typeof opts.tolerance === 'number' ? opts.tolerance : DEFAULT_TOLERANCE;
  if (!_pngjs) return bytewiseDiff(a, b, threshold);
  return pixelDiff(a, b, threshold, tolerance);
}

/** Test-only: report whether pngjs is available. */
function pngjsAvailable() {
  return _pngjs !== null && _pngjs !== undefined;
}

module.exports = {
  diff,
  pngjsAvailable,
  DEFAULT_THRESHOLD,
  DEFAULT_TOLERANCE,
};
