'use strict';

// Phase 33.5 — Plan 01 — STRIDE runtime threat-model structural baseline.
//
// Hermetic (D-10): reads ONLY reference/hone-threat-model.md from disk — no
// network, no live peer, no API key — so the default `npm test` stays green.
//
// Asserts the SC#1 deliverable is present and structurally complete:
//   1. The threat-model doc exists at the D-05 path (reference/).
//   2. All 5 in-scope components have a recognizable section:
//      hooks / hone-state(MCP) / peer-CLI / WebSocket(ws.cjs) / issue-reporter.
//   3. All 6 STRIDE categories are referenced (case-insensitive, >=1 each):
//      Spoofing / Tampering / Repudiation / Information(disclosure) /
//      Denial(of service) / Elevation(of privilege).
//   4. Every residual risk is routed to a closing 33.5 plan — the tokens
//      33.5-02 / 33.5-03 / 33.5-04 / 33.5-05 / 33.5-06 are all present.
//
// Mirrors the house "read the shipped file + assert structural tokens" idiom
// (cf. test/suite/phase-33-baseline.test.cjs). Every test name is tagged
// `33.5-01:`.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const REPO_ROOT = path.resolve(__dirname, '../..');
const DOC_REL = 'reference/hone-threat-model.md';
const DOC_ABS = path.join(REPO_ROOT, DOC_REL);

/** Read the threat-model doc once; null if absent. */
function readDoc() {
  return fs.existsSync(DOC_ABS) ? fs.readFileSync(DOC_ABS, 'utf8') : null;
}

// ── 1. doc exists ───────────────────────────────────────────────────────────

test('33.5-01: threat model doc exists at the D-05 path (reference/)', () => {
  assert.ok(
    fs.existsSync(DOC_ABS),
    `${DOC_REL} must exist (SC#1 deliverable, D-05 corrected path)`,
  );
});

// ── 2. all 5 component sections present ─────────────────────────────────────

test('33.5-01: all 5 components have a section', () => {
  const body = readDoc();
  assert.ok(body !== null, `${DOC_REL} must exist before asserting sections`);

  /** @type {Array<[string, RegExp]>} */
  const components = [
    ['hooks (SessionStart + budget/context-monitor)', /hook/i],
    ['MCP servers (hone-state / hone-mcp)', /hone-state|MCP/i],
    ['peer-CLI broker (acp + asp)', /peer-cli/i],
    ['WebSocket event-stream transport', /websocket|ws\.cjs/i],
    ['issue-reporter outbound (gh)', /issue-reporter/i],
  ];

  for (const [label, re] of components) {
    assert.match(body, re, `threat model must reference component: ${label}`);
  }
});

// ── 3. all 6 STRIDE categories present ──────────────────────────────────────

test('33.5-01: all 6 STRIDE categories are present', () => {
  const body = readDoc();
  assert.ok(body !== null, `${DOC_REL} must exist before asserting STRIDE`);

  /** @type {Array<[string, RegExp]>} */
  const stride = [
    ['Spoofing', /spoof/i],
    ['Tampering', /tamper/i],
    ['Repudiation', /repudiat/i],
    ['Information disclosure', /information|info-disclosure|disclosure/i],
    ['Denial of service', /denial|\bdos\b/i],
    ['Elevation of privilege', /elevation|privilege/i],
  ];

  for (const [label, re] of stride) {
    assert.match(body, re, `threat model must reference STRIDE category: ${label}`);
  }
});

// ── 4. every residual risk maps to a closing 33.5 plan ──────────────────────

test('33.5-01: every residual risk maps to a closing 33.5 plan', () => {
  const body = readDoc();
  assert.ok(body !== null, `${DOC_REL} must exist before asserting plan tokens`);

  // Each downstream plan that must be referenced as a residual-risk closer.
  const closingPlans = ['33.5-02', '33.5-03', '33.5-04', '33.5-05', '33.5-06'];

  for (const plan of closingPlans) {
    assert.ok(
      body.includes(plan),
      `threat model must route a residual risk to closing plan ${plan}`,
    );
  }
});
