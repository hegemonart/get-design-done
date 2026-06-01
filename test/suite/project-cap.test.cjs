'use strict';
// Phase 39.2 — project-cap.cjs unit test. Verifies the pure cap classifier: the 50/80/100
// thresholds, disabled-when-cap<=0 (non-breaking default), shouldHalt mode-gating, the
// hard-halt fire (SC#9), and purity. Every test tagged `39.2-03:`.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const MOD = path.resolve(__dirname, '../../scripts/lib/budget/project-cap.cjs');
const { classifyProjectBudget, shouldHalt, capMessage } = require(MOD);

test('39.2-03: thresholds — 49 ok, 50 warn-50, 80 warn-80, 100 halt', () => {
  assert.equal(classifyProjectBudget(49, 100).level, 'ok');
  assert.equal(classifyProjectBudget(50, 100).level, 'warn-50');
  assert.equal(classifyProjectBudget(79.99, 100).level, 'warn-50');
  assert.equal(classifyProjectBudget(80, 100).level, 'warn-80');
  assert.equal(classifyProjectBudget(99.99, 100).level, 'warn-80');
  assert.equal(classifyProjectBudget(100, 100).level, 'halt');
  assert.equal(classifyProjectBudget(250, 100).level, 'halt', 'over-cap still halts');
});

test('39.2-03: disabled when cap <= 0 / non-finite (non-breaking default)', () => {
  for (const cap of [0, -10, NaN, Infinity]) {
    const c = classifyProjectBudget(500, cap);
    assert.equal(c.enabled, false, `cap ${cap} disabled`);
    assert.equal(c.level, 'ok', `cap ${cap} → ok (no enforcement)`);
  }
  // spend non-finite also disables
  assert.equal(classifyProjectBudget(NaN, 100).enabled, false);
});

test('39.2-03: pct is spend/cap*100', () => {
  assert.equal(classifyProjectBudget(30, 120).pct, 25);
  const c = classifyProjectBudget(60, 100);
  assert.equal(c.pct, 60);
  assert.equal(c.cap, 100);
  assert.equal(c.spend, 60);
});

test('39.2-03: shouldHalt only at halt under enforce (SC#9 hard-halt fire)', () => {
  const halt = classifyProjectBudget(100, 100);
  assert.equal(halt.level, 'halt');
  assert.equal(shouldHalt(halt, 'enforce'), true, 'halt + enforce → block');
  assert.equal(shouldHalt(halt, 'warn'), false, 'warn never blocks');
  assert.equal(shouldHalt(halt, 'log'), false, 'log never blocks');
  assert.equal(shouldHalt(classifyProjectBudget(80, 100), 'enforce'), false, 'warn-80 does not halt');
  assert.equal(shouldHalt(null, 'enforce'), false);
});

test('39.2-03: capMessage — null when ok, descriptive otherwise', () => {
  assert.equal(capMessage(classifyProjectBudget(10, 100)), null, 'ok → no message');
  assert.equal(capMessage(classifyProjectBudget(10, 0)), null, 'disabled → no message');
  assert.match(capMessage(classifyProjectBudget(60, 100)), /60%/);
  assert.match(capMessage(classifyProjectBudget(100, 100)), /halting before the next agent spawn/);
});

test('39.2-03: pure + dep-free (zero require)', () => {
  assert.doesNotMatch(fs.readFileSync(MOD, 'utf8'), /\brequire\s*\(/, 'project-cap.cjs must not require anything');
});
