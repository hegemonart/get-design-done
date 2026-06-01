'use strict';
// Phase 39.2 — roi.cjs unit test. Verifies the pure ROI join + markdown formatter:
// costPerShipped, stickRate, totals, table formatting, guards, purity. Every test `39.2-03:`.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const MOD = path.resolve(__dirname, '../../scripts/lib/budget/roi.cjs');
const { computeRoi, roiTableMarkdown, usd } = require(MOD);

test('39.2-03: computeRoi — costPerShipped, stickRate, totals', () => {
  const r = computeRoi([
    { cycle: 'c1', costUsd: 20, commitsShipped: 4, commitsReverted: 1 },
    { cycle: 'c2', costUsd: 10, commitsShipped: 0, commitsReverted: 2 },
  ]);
  assert.equal(r.rows[0].costPerShipped, 5, '20/4');
  assert.ok(Math.abs(r.rows[0].stickRate - 0.8) < 1e-9, '4/(4+1)');
  assert.equal(r.rows[1].costPerShipped, 10, 'shipped 0 → divide by max(0,1)=1');
  assert.equal(r.rows[1].stickRate, 0, '0 shipped');
  assert.equal(r.totals.cycle, 'TOTAL');
  assert.equal(r.totals.costUsd, 30);
  assert.equal(r.totals.shipped, 4);
  assert.equal(r.totals.reverted, 3);
  assert.equal(r.totals.costPerShipped, 7.5, '30/4');
});

test('39.2-03: roiTableMarkdown renders a GFM table with header, rows, TOTAL', () => {
  const md = roiTableMarkdown(computeRoi([{ cycle: 'c1', costUsd: 12, commitsShipped: 3, commitsReverted: 0 }]));
  const lines = md.split('\n');
  assert.match(lines[0], /\| Cycle \| Cost \| Shipped \| Reverted \| \$\/shipped \| Stick rate \|/);
  assert.match(lines[1], /\|---\|/, 'separator row');
  assert.match(md, /\| c1 \| \$12\.00 \| 3 \| 0 \| \$4\.00 \| 100% \|/);
  assert.match(md, /\| TOTAL \|/);
  assert.equal(usd(4), '$4.00');
});

test('39.2-03: guards bad input', () => {
  assert.throws(() => computeRoi('nope'), /must be an array/);
  assert.throws(() => computeRoi([null]), /must be an object/);
  assert.throws(() => computeRoi([{ cycle: 'x', costUsd: 'bad', commitsShipped: 1, commitsReverted: 0 }]), /finite/);
  assert.throws(() => roiTableMarkdown({}), /computeRoi/);
});

test('39.2-03: pure + dep-free (zero require)', () => {
  assert.doesNotMatch(fs.readFileSync(MOD, 'utf8'), /\brequire\s*\(/, 'roi.cjs must not require anything');
});
