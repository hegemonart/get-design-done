'use strict';
// Phase 47 (Live Mode) — browser-side runtime contract.
// RUNTIME_JS is the IIFE the skill injects via preview_eval: it must be a non-empty
// string carrying the data-hone-variant marker and a pick (click) handler. buildSelector
// is a pure selector strategy preferring id over class; pickReportShape documents the
// live_pick payload fields the skill reads back.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const LIB = path.resolve(__dirname, '..', '..', 'scripts', 'lib', 'live', 'runtime.cjs');
const { RUNTIME_JS, pickReportShape, buildSelector, DATA_ATTR, GLOBAL_KEY } = require(LIB);

test('47-runtime: RUNTIME_JS is a non-empty string', () => {
  assert.equal(typeof RUNTIME_JS, 'string');
  assert.ok(RUNTIME_JS.length > 0, 'RUNTIME_JS must be non-empty');
});

test('47-runtime: RUNTIME_JS carries the data-hone-variant marker', () => {
  assert.equal(DATA_ATTR, 'data-hone-variant');
  assert.ok(RUNTIME_JS.includes('data-hone-variant'), 'RUNTIME_JS must reference the data-hone-variant attribute');
});

test('47-runtime: RUNTIME_JS installs a click-based pick handler', () => {
  assert.match(RUNTIME_JS, /addEventListener\(\s*['"]click['"]/, 'expected a click listener for picking');
});

test('47-runtime: RUNTIME_JS is an IIFE that binds the window singleton (idempotent re-inject)', () => {
  assert.ok(RUNTIME_JS.includes(GLOBAL_KEY), `RUNTIME_JS must reference the singleton key ${GLOBAL_KEY}`);
  assert.match(RUNTIME_JS, /^\s*\(function\s*\(\)\s*\{/, 'RUNTIME_JS should be an IIFE');
  assert.ok(RUNTIME_JS.includes('__installed'), 'RUNTIME_JS must guard re-injection via an __installed flag');
});

test('47-runtime: buildSelector prefers id over class', () => {
  assert.equal(buildSelector({ id: 'submit', tagName: 'BUTTON', classList: ['btn', 'primary'] }), '#submit');
});

test('47-runtime: buildSelector prefers a data-testid over a class path', () => {
  assert.equal(buildSelector({ dataTestId: 'save', tagName: 'button', classList: ['btn'] }), '[data-testid="save"]');
});

test('47-runtime: buildSelector falls back to tag + (<=2) classes + nth-of-type', () => {
  assert.equal(
    buildSelector({ tagName: 'DIV', classList: ['card', 'elevated', 'extra'], nthOfType: 2 }),
    'div.card.elevated:nth-of-type(2)',
  );
  // No classes, no nth -> bare lowercased tag.
  assert.equal(buildSelector({ tagName: 'SECTION' }), 'section');
});

test('47-runtime: pickReportShape documents the live_pick payload fields', () => {
  assert.equal(typeof pickReportShape, 'object');
  for (const field of ['selector', 'tagName', 'classList', 'boundingRect', 'computedStyle', 'variant']) {
    assert.ok(field in pickReportShape, `pickReportShape must document the "${field}" field`);
  }
});
