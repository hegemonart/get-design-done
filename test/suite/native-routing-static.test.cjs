'use strict';
/**
 * Plan 34.1-05 — native verify adaptation + project-type routing (static).
 *
 * Hermetic static validation (D-10): fs reads + text/frontmatter parse ONLY.
 * NO project scaffolding, NO simulator, NO emulator, NO spawn, NO network.
 * Default `npm test` runs it on any machine.
 *
 * Locks two ADDITIVE agent extensions:
 *
 *   agents/design-context-builder.md — project-type detection (SC#8, D-06):
 *     the 4-value enum web (default) / native-ios / native-android / flutter,
 *     each routed to its executor (web→design-executor, native-ios→swift-executor,
 *     native-android→compose-executor, flutter→flutter-executor) via a routing
 *     table left EXTENSIBLE with a documented append-seam for 34.2 (email) /
 *     34.3 (print). 34.1 adds ONLY the 4 web/native types — NO active email/print
 *     enum value or routing row (D-06).
 *
 *   agents/design-verifier.md — native verify branch (SC#7-verify, D-03):
 *     a no-DOM / native path that runs a snapshot-based audit when a simulator
 *     screenshot is supplied and a code-only structural audit otherwise, and
 *     NEVER hard-requires a simulator (degrades gracefully — the Phase-4B
 *     "enhancement, not a requirement" precedent).
 *
 * Both edited agents must stay within their declared size_budget tier (D-09 —
 * the verifier is the tight one, ~696/700 XXL).
 *
 * Mirrors the report-issue-destination-static.test.cjs hermetic idiom; reuses
 * helpers.ts countLines + the agent-size-budget.test.cjs TIER_LIMITS.
 */

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { REPO_ROOT, readFrontmatter, countLines } = require('./helpers.ts');

// TIER_LIMITS mirrored from agent-size-budget.test.cjs (the D-09 guard source).
const TIER_LIMITS = {
  XXL: 700,
  XL: 500,
  LARGE: 350,
  M: 300,
  DEFAULT: 250,
  S: 150,
};

const CONTEXT_BUILDER = path.join(REPO_ROOT, 'agents', 'design-context-builder.md');
const VERIFIER = path.join(REPO_ROOT, 'agents', 'design-verifier.md');

const contextBuilder = fs.readFileSync(CONTEXT_BUILDER, 'utf8');
const verifier = fs.readFileSync(VERIFIER, 'utf8');

test('34.1-05: context-builder detects all four project types (web/native-ios/native-android/flutter)', () => {
  assert.match(contextBuilder, /\bweb\b/i, 'project-type enum must include web (default)');
  assert.match(contextBuilder, /native-ios/, 'project-type enum must include native-ios');
  assert.match(contextBuilder, /native-android/, 'project-type enum must include native-android');
  assert.match(contextBuilder, /\bflutter\b/i, 'project-type enum must include flutter');
});

test('34.1-05: context-builder routes each type to its executor (routing table)', () => {
  // Each of the four executors the routing table maps to must appear by name.
  for (const executor of ['design-executor', 'swift-executor', 'compose-executor', 'flutter-executor']) {
    assert.ok(
      contextBuilder.includes(executor),
      `routing table must map a project type to ${executor}`,
    );
  }
  // Type<->executor pairing: native-ios sits near swift-executor (same table
  // row), native-android near compose-executor, flutter near flutter-executor.
  assert.match(
    contextBuilder,
    /native-ios[\s\S]{0,120}swift-executor|swift-executor[\s\S]{0,120}native-ios/,
    'native-ios must be paired with swift-executor in the routing table',
  );
  assert.match(
    contextBuilder,
    /native-android[\s\S]{0,120}compose-executor|compose-executor[\s\S]{0,120}native-android/,
    'native-android must be paired with compose-executor in the routing table',
  );
  assert.match(
    contextBuilder,
    /flutter[\s\S]{0,120}flutter-executor|flutter-executor[\s\S]{0,120}flutter/i,
    'flutter must be paired with flutter-executor in the routing table',
  );
});

test('34.1-05: routing table is append-shaped with a documented extensibility seam (D-06)', () => {
  assert.match(
    contextBuilder,
    /append .*(email|print)|34\.2|34\.3|intentionally open|extensible|add .* rows? here/i,
    'routing table must carry a documented append-seam so 34.2/34.3 extend it cleanly',
  );
});

test('34.1-05: 34.1 does NOT add email/print enum values yet (D-06 — native only)', () => {
  // The seam may MENTION email/print as FUTURE work — that is allowed. What is
  // NOT allowed is an ACTIVE email/print routing row (an email-executor /
  // print-executor mapping) shipped in 34.1.
  assert.doesNotMatch(
    contextBuilder,
    /email-executor|print-executor/i,
    'D-06: 34.1 must not add an email/print executor routing row — those land in 34.2/34.3',
  );
});

test('34.1-05: design-verifier has a native / no-DOM verify branch', () => {
  assert.match(
    verifier,
    /no-?DOM|native/i,
    'verifier must document a native / no-DOM verify branch',
  );
  assert.match(
    verifier,
    /snapshot|code-only|structural/i,
    'native branch must describe snapshot-based and/or code-only structural audit',
  );
});

test('34.1-05: design-verifier native branch degrades (never hard-requires a simulator — D-03)', () => {
  assert.match(
    verifier,
    /degrade|without a simulator|optional|never requires|never hard-requires|enhancement, not a requirement/i,
    'native branch must degrade gracefully — the simulator/emulator is optional (D-03)',
  );
});

test('34.1-05: both edited agents stay within their size_budget tier (D-09)', () => {
  for (const filePath of [VERIFIER, CONTEXT_BUILDER]) {
    const fm = readFrontmatter(filePath);
    const tier = String(fm.size_budget || 'DEFAULT').toUpperCase();
    const limit = TIER_LIMITS[tier];
    assert.ok(limit !== undefined, `unknown size_budget tier "${tier}" in ${path.basename(filePath)}`);
    const lines = countLines(filePath);
    assert.ok(
      lines <= limit,
      `${path.basename(filePath)}: ${lines} lines exceeds ${tier} budget of ${limit}`,
    );
  }
});
