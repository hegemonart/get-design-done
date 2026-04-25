// tests/visual-baseline.test.cjs — Plan 23-07 image diff + baseline manager
'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { mkdtempSync, rmSync, readFileSync, existsSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { join } = require('node:path');

const { probeOptional } = require('../scripts/lib/probe-optional.cjs');
const _pngjs = probeOptional('pngjs');
const PNGJS_AVAILABLE = !!_pngjs;

const {
  diff,
  pngjsAvailable,
  DEFAULT_THRESHOLD,
} = require('../scripts/lib/visual-baseline/diff.cjs');
const {
  compareToBaseline,
  applyBaseline,
  baselinePathFor,
  validateKey,
} = require('../scripts/lib/visual-baseline/index.cjs');

function makePng(width, height, color) {
  if (!_pngjs) return null;
  const { PNG } = _pngjs;
  const png = new PNG({ width, height });
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) << 2;
      png.data[i] = color[0];
      png.data[i + 1] = color[1];
      png.data[i + 2] = color[2];
      png.data[i + 3] = color[3] ?? 255;
    }
  }
  return PNG.sync.write(png);
}

test('23-07: diff equal buffers → ratio 0, not drifted', () => {
  const buf = PNGJS_AVAILABLE
    ? makePng(4, 4, [10, 20, 30])
    : Buffer.from('hello-bytes');
  const r = diff(buf, buf);
  assert.equal(r.drifted, false);
  assert.equal(r.ratio, 0);
});

test('23-07: diff different bytes → ratio 1 in bytewise mode', () => {
  if (PNGJS_AVAILABLE) {
    // Pixel mode: feeding non-PNG bytes makes the decoder throw → ratio 1.
    const a = Buffer.from('not-a-png-a');
    const b = Buffer.from('not-a-png-b');
    const r = diff(a, b);
    assert.equal(r.drifted, true);
    assert.equal(r.ratio, 1);
  } else {
    const r = diff(Buffer.from('hello'), Buffer.from('world'));
    assert.equal(r.mode, 'bytewise');
    assert.equal(r.ratio, 1);
    assert.equal(r.drifted, true);
  }
});

test('23-07: diff with pixel mode reports identical PNGs as ratio=0', { skip: !PNGJS_AVAILABLE }, () => {
  const a = makePng(8, 8, [255, 0, 0]);
  const b = makePng(8, 8, [255, 0, 0]);
  const r = diff(a, b);
  assert.equal(r.mode, 'pixel');
  assert.equal(r.diffPixels, 0);
  assert.equal(r.ratio, 0);
});

test('23-07: diff with pixel mode reports drift over threshold', { skip: !PNGJS_AVAILABLE }, () => {
  const a = makePng(8, 8, [255, 0, 0]);
  const b = makePng(8, 8, [0, 255, 0]); // every pixel differs
  const r = diff(a, b);
  assert.equal(r.mode, 'pixel');
  assert.equal(r.diffPixels, 64);
  assert.equal(r.ratio, 1);
  assert.equal(r.drifted, true);
});

test('23-07: diff dimension mismatch → drifted with reason', { skip: !PNGJS_AVAILABLE }, () => {
  const a = makePng(8, 8, [255, 0, 0]);
  const b = makePng(16, 16, [255, 0, 0]);
  const r = diff(a, b);
  assert.equal(r.drifted, true);
  assert.equal(r.ratio, 1);
  assert.equal(r.reason, 'dimension-mismatch');
});

test('23-07: diff threshold 0.05 keeps small diffs from drifting', { skip: !PNGJS_AVAILABLE }, () => {
  const a = makePng(20, 20, [255, 0, 0]);
  // Build b with 5 differing pixels out of 400 (1.25%) — below 5% threshold
  const { PNG } = _pngjs;
  const png = PNG.sync.read(a);
  for (let i = 0; i < 5; i++) {
    const off = i * 4;
    png.data[off + 1] = 255; // bump green
  }
  const b = PNG.sync.write(png);
  const r = diff(a, b, { threshold: 0.05 });
  assert.equal(r.drifted, false);
  assert.equal(r.diffPixels, 5);
});

test('23-07: diff throws on non-Buffer input', () => {
  assert.throws(() => diff('not-a-buffer', Buffer.from('a')), /Buffer/);
  assert.throws(() => diff(Buffer.from('a'), null), /Buffer/);
});

test('23-07: validateKey accepts safe slugs', () => {
  assert.equal(validateKey('button-01'), 'button-01');
  assert.equal(validateKey('a.b_c-d'), 'a.b_c-d');
});

test('23-07: validateKey rejects path traversal', () => {
  assert.throws(() => validateKey('../etc'), /illegal/);
  assert.throws(() => validateKey('foo/bar'), /illegal/);
  assert.throws(() => validateKey('foo\\bar'), /illegal/);
  assert.throws(() => validateKey(''), /non-empty/);
});

test('23-07: compareToBaseline absent → drifted with mode=absent', () => {
  const dir = mkdtempSync(join(tmpdir(), 'gdd-vbsn-'));
  try {
    const r = compareToBaseline('button', Buffer.from('foo'), { cwd: dir });
    assert.equal(r.drifted, true);
    assert.equal(r.baselineExists, false);
    assert.equal(r.mode, 'absent');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('23-07: applyBaseline + compareToBaseline round-trip', () => {
  const dir = mkdtempSync(join(tmpdir(), 'gdd-vbsn-rt-'));
  try {
    const buf = PNGJS_AVAILABLE
      ? makePng(8, 8, [10, 20, 30])
      : Buffer.from('binary-png-mock');
    const written = applyBaseline('btn', buf, { cwd: dir });
    assert.ok(existsSync(written));
    assert.equal(readFileSync(written).equals(buf), true);
    const r = compareToBaseline('btn', buf, { cwd: dir });
    assert.equal(r.baselineExists, true);
    assert.equal(r.drifted, false);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('23-07: baselinePathFor honors absolute baselineDir', () => {
  const abs = process.platform === 'win32' ? 'C:\\baselines' : '/tmp/baselines';
  const p = baselinePathFor('btn', { baselineDir: abs });
  assert.ok(p.endsWith(`btn.png`));
  assert.ok(p.startsWith(abs));
});

test('23-07: pngjsAvailable reflects probeOptional outcome', () => {
  assert.equal(pngjsAvailable(), PNGJS_AVAILABLE);
});

test('23-07: DEFAULT_THRESHOLD is 0.005', () => {
  assert.equal(DEFAULT_THRESHOLD, 0.005);
});
