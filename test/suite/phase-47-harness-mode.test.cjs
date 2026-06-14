'use strict';
// Phase 47 (Live Mode) — harness-mode capability gate.
// liveModeFor maps mcp_support:true -> 'puppeteer' and everything else -> 'degraded';
// degradedHarnesses lists the screenshot-only harnesses. The mode is the live-mode
// capability signal because /hone:live drives the Preview MCP at runtime.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const LIB = path.resolve(__dirname, '..', '..', 'scripts', 'lib', 'live', 'harness-mode.cjs');
const { liveModeFor, degradedHarnesses, isMcpSupported, MODE_FULL, MODE_DEGRADED } = require(LIB);
const harnesses = require('../../scripts/lib/manifest/harnesses.cjs');

test('47-harness-mode: claude (mcp_support:true) resolves to puppeteer', () => {
  assert.equal(liveModeFor('claude'), 'puppeteer');
  assert.equal(liveModeFor('claude'), MODE_FULL);
  assert.equal(isMcpSupported('claude'), true);
});

test('47-harness-mode: a known mcp_support:false harness resolves to degraded', () => {
  // qwen carries mcp_support:false in the canonical matrix.
  const qwen = harnesses.find((h) => h.id === 'qwen');
  assert.ok(qwen, 'qwen must exist in the harness manifest');
  assert.equal(qwen.capability_matrix.mcp_support, false, 'fixture assumption: qwen has mcp_support:false');
  assert.equal(liveModeFor('qwen'), 'degraded');
  assert.equal(liveModeFor('qwen'), MODE_DEGRADED);
  assert.equal(isMcpSupported('qwen'), false);
});

test('47-harness-mode: an unknown harness id fails safe to degraded', () => {
  assert.equal(liveModeFor('does-not-exist'), 'degraded');
  assert.equal(isMcpSupported('does-not-exist'), false);
});

test('47-harness-mode: degradedHarnesses is non-empty and excludes mcp-capable harnesses', () => {
  const degraded = degradedHarnesses();
  assert.ok(Array.isArray(degraded), 'degradedHarnesses returns an array');
  assert.ok(degraded.length > 0, 'at least one harness must be in degraded mode');
  assert.ok(degraded.includes('qwen'), 'qwen (mcp_support:false) must be degraded');
  assert.ok(!degraded.includes('claude'), 'claude (mcp_support:true) must NOT be degraded');
  // Every degraded id genuinely lacks mcp_support.
  for (const id of degraded) assert.equal(isMcpSupported(id), false, `${id} listed degraded but reports mcp_support`);
});

test('47-harness-mode: every manifest harness resolves to exactly one of the two modes', () => {
  for (const h of harnesses) {
    const mode = liveModeFor(h.id);
    assert.ok(mode === MODE_FULL || mode === MODE_DEGRADED, `${h.id} -> unexpected mode ${mode}`);
    const expected = h.capability_matrix && h.capability_matrix.mcp_support === true ? MODE_FULL : MODE_DEGRADED;
    assert.equal(mode, expected, `${h.id} mode disagrees with its mcp_support flag`);
  }
});

test('47-harness-mode: an injected fixture list overrides the default manifest', () => {
  const fixture = [
    { id: 'fake-full', capability_matrix: { mcp_support: true } },
    { id: 'fake-degraded', capability_matrix: { mcp_support: false } },
  ];
  assert.equal(liveModeFor('fake-full', fixture), 'puppeteer');
  assert.equal(liveModeFor('fake-degraded', fixture), 'degraded');
  assert.deepEqual(degradedHarnesses(fixture), ['fake-degraded']);
});
