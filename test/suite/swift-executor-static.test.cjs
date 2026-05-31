'use strict';
/**
 * Plan 34.1-02 — swift-executor + xcode-simulator static validation (RED→GREEN).
 *
 * Locks SC#2 (Swift executor) + SC#7-partial (xcode-simulator connection):
 *
 *  - agents/swift-executor.md is an agent-prompt (D-04 — generates native code
 *    when an LLM invokes it, mirroring design-executor.md; NOT a bundled
 *    compiler) with VALID frontmatter mirroring design-executor.md's shape
 *    (name/description/tools/color) AND — critically (D-09) — a size_budget that
 *    is a recognized tier key, so the agent stays within its declared line
 *    budget (the same gate agent-size-budget.test.cjs applies).
 *  - Its body CONSUMES the 34.1-01 token-bridge (reference/native-platforms.md /
 *    emitSwift) rather than re-deriving the token→SwiftUI mapping, AND cites
 *    reference/platforms.md as the authoritative iOS-convention source.
 *  - connections/xcode-simulator.md mirrors connections/preview.md — a Probe
 *    section + a Fallback that degrades to CODE-ONLY when no simulator is
 *    present (D-03 — NEVER hard-requires a simulator).
 *
 * HERMETIC (D-10): fs reads + frontmatter parse ONLY. NO Xcode, NO simulator,
 * NO child-process spawn of any simulator tool, NO network. The default
 * `npm test` runs this anywhere. Wave-B disjointness: this test touches only
 * the swift-executor agent + the xcode-simulator connection doc; it does NOT
 * reference the connection capability matrix (34.1-06 owns those rows).
 */

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { readFrontmatter, countLines } = require('./helpers.ts');

const REPO_ROOT = path.resolve(__dirname, '../..');
const SWIFT_EXECUTOR = path.join(REPO_ROOT, 'agents', 'swift-executor.md');
const XCODE_SIMULATOR = path.join(REPO_ROOT, 'connections', 'xcode-simulator.md');

// Mirror of agent-size-budget.test.cjs TIER_LIMITS (the size_budget value must
// be one of these keys). XS is included as an accepted lean tier; the live
// agent-size-budget gate only scans `design-*.md`, so this is the local
// pre-check that catches drift for the swift-executor too (the plan's
// size-budget guard).
const TIER_LIMITS = {
  XXL: 700,
  XL: 500,
  LARGE: 350,
  M: 300,
  DEFAULT: 250,
  S: 150,
  XS: 100,
};

/** Read the agent body (everything after the closing frontmatter fence). */
function readAgentBody(filePath) {
  const content = fs.readFileSync(filePath, 'utf8').replace(/\r\n/g, '\n');
  const m = content.match(/^---\n[\s\S]*?\n---\n?([\s\S]*)$/);
  return m ? m[1] : content;
}

test('34.1-02: swift-executor.md has valid frontmatter with design-executor-required fields', () => {
  assert.ok(fs.existsSync(SWIFT_EXECUTOR), 'agents/swift-executor.md must exist');
  const fm = readFrontmatter(SWIFT_EXECUTOR);
  for (const field of ['name', 'description', 'tools', 'color']) {
    assert.ok(
      field in fm && fm[field] !== '' && fm[field] !== undefined,
      `agents/swift-executor.md frontmatter missing required field "${field}"`,
    );
  }
  assert.equal(
    fm.name,
    'swift-executor',
    `agents/swift-executor.md frontmatter name must be "swift-executor", got "${String(fm.name)}"`,
  );
});

test('34.1-02: swift-executor.md declares a recognized size_budget tier (D-09)', () => {
  const fm = readFrontmatter(SWIFT_EXECUTOR);
  const tier = typeof fm.size_budget === 'string' ? fm.size_budget.toUpperCase() : undefined;
  assert.ok(
    tier !== undefined,
    'agents/swift-executor.md frontmatter must declare a size_budget (D-09)',
  );
  assert.ok(
    Object.prototype.hasOwnProperty.call(TIER_LIMITS, tier),
    `agents/swift-executor.md size_budget "${tier}" is not a recognized tier. Valid: ${Object.keys(TIER_LIMITS).join(', ')}`,
  );
});

test('34.1-02: swift-executor.md body references the token-bridge AND platforms', () => {
  const body = readAgentBody(SWIFT_EXECUTOR);
  assert.match(
    body,
    /native-platforms|emitSwift|token-bridge/,
    'agents/swift-executor.md must reference the 34.1-01 token-bridge (reference/native-platforms.md / emitSwift) — it consumes the bridge, does not re-derive the mapping',
  );
  assert.match(
    body,
    /platforms/,
    'agents/swift-executor.md must cite reference/platforms.md as the iOS-convention source',
  );
});

test('34.1-02: swift-executor.md line count within its declared size_budget', () => {
  const fm = readFrontmatter(SWIFT_EXECUTOR);
  const tier = typeof fm.size_budget === 'string' ? fm.size_budget.toUpperCase() : 'DEFAULT';
  const limit = TIER_LIMITS[tier];
  assert.ok(limit !== undefined, `unknown size_budget tier "${tier}"`);
  const lines = countLines(SWIFT_EXECUTOR);
  assert.ok(
    lines <= limit,
    `agents/swift-executor.md: ${lines} lines exceeds ${tier} budget of ${limit} lines (D-09 — trim by delegating detail to reference/platforms.md + reference/native-platforms.md, do not raise the tier beyond XXL)`,
  );
});

test('34.1-02: connections/xcode-simulator.md has a probe section', () => {
  assert.ok(fs.existsSync(XCODE_SIMULATOR), 'connections/xcode-simulator.md must exist');
  const doc = fs.readFileSync(XCODE_SIMULATOR, 'utf8');
  assert.match(
    doc,
    /probe/i,
    'connections/xcode-simulator.md must have a probe section (mirror connections/preview.md)',
  );
});

test('34.1-02: connections/xcode-simulator.md degrades to code-only (D-03)', () => {
  const doc = fs.readFileSync(XCODE_SIMULATOR, 'utf8');
  assert.match(
    doc,
    /fallback/i,
    'connections/xcode-simulator.md must have a Fallback section (mirror connections/preview.md)',
  );
  assert.match(
    doc,
    /code-only|degrade|no simulator|without a simulator/i,
    'connections/xcode-simulator.md Fallback must degrade to code-only when no simulator is present (D-03 — never hard-requires a simulator)',
  );
});
