'use strict';
// Phase 37.2 — token-scale unit test. Verifies the pure, dep-free greenfield token generator
// (scripts/lib/ds/token-scale.cjs): OKLCH color stops (native oklch(), anchored at the primary,
// monotonic lightness, damped chroma), modular type scale, 4pt/8pt spacing, radius. Deterministic,
// hermetic (D-06): no I/O, no color library. Every test tagged `37.2-02:`.

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');

const MOD = path.resolve(__dirname, '../../scripts/lib/ds/token-scale.cjs');
const { oklchScale, typeScale, spacingScale, radiusScale, DEFAULT_STOPS } = require(MOD);

const PRIMARY = { l: 0.62, c: 0.19, h: 255 };

test('37.2-02: oklchScale emits 9 native oklch() stops anchored at the primary', () => {
  const s = oklchScale(PRIMARY);
  assert.equal(s.length, 9, '9 stops');
  assert.deepEqual(s.map((x) => x.stop), DEFAULT_STOPS, 'stop labels 100..900');
  const at500 = s.find((x) => x.stop === 500);
  assert.equal(at500.oklch, 'oklch(0.62 0.19 255)', '500 == the primary exactly');
  for (const x of s) {
    assert.match(x.oklch, /^oklch\(\d(\.\d+)? \d(\.\d+)? \d+(\.\d+)?\)$/, `${x.stop} is a valid oklch() string`);
  }
});

test('37.2-02: lightness is monotonic light→dark; chroma damped at the extremes', () => {
  const s = oklchScale(PRIMARY);
  const L = s.map((x) => Number(x.oklch.match(/oklch\(([\d.]+)/)[1]));
  for (let i = 1; i < L.length; i++) assert.ok(L[i] <= L[i - 1], `L decreases at stop ${s[i].stop}`);
  const C = s.map((x) => Number(x.oklch.match(/oklch\([\d.]+ ([\d.]+)/)[1]));
  assert.ok(C[0] < 0.19, 'lightest stop has damped chroma');
  assert.ok(C[8] < 0.19, 'darkest stop has damped chroma');
  assert.equal(C[4], 0.19, '500 keeps the full primary chroma');
});

test('37.2-02: hue is preserved across all stops', () => {
  const s = oklchScale(PRIMARY);
  for (const x of s) assert.match(x.oklch, / 255\)$/, `${x.stop} keeps hue 255`);
});

test('37.2-02: typeScale is a modular scale (step 0 = base)', () => {
  const t = typeScale(1, 1.25);
  const base = t.find((x) => x.step === 0);
  assert.equal(base.rem, 1, 'step 0 == base');
  assert.equal(t.find((x) => x.step === 1).rem, 1.25, 'step 1 == base*ratio');
  assert.equal(t.find((x) => x.step === 2).rem, 1.563, 'step 2 == base*ratio^2 (rounded)');
});

test('37.2-02: spacingScale follows a 4pt/8pt baseline', () => {
  assert.deepEqual(spacingScale(4, 8).map((x) => x.px), [4, 8, 12, 16, 24, 32, 48, 64]);
  assert.deepEqual(spacingScale(8, 4).map((x) => x.px), [8, 16, 24, 32]);
  assert.throws(() => spacingScale(5, 8), /4 or 8/, 'rejects non-4/8 baseline');
});

test('37.2-02: radiusScale → sm/md/lg/xl/full', () => {
  assert.deepEqual(radiusScale(8), { sm: 4, md: 8, lg: 16, xl: 24, full: 9999 });
});

test('37.2-02: deterministic + input-guarded', () => {
  assert.deepEqual(oklchScale(PRIMARY), oklchScale(PRIMARY));
  assert.throws(() => oklchScale({ l: 0.6, c: 0.1 }), /l:number/, 'rejects a malformed primary');
  assert.throws(() => typeScale(1, 1), /ratio > 1/, 'rejects ratio <= 1');
});

test('37.2-02: the helper is pure + dep-free (zero require)', () => {
  assert.doesNotMatch(fs.readFileSync(MOD, 'utf8'), /\brequire\s*\(/, 'token-scale.cjs must not require anything');
});
