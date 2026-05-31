'use strict';
/**
 * Plan 34.1-04 — flutter-executor agent static-validation test (SC#4).
 *
 * Locks the Flutter executor agent-prompt (D-04 — an agent that generates
 * native code when an LLM invokes it, mirroring design-executor.md; NOT a
 * bundled compiler) and its distinctive MULTI-TARGET requirement.
 *
 * Asserts, purely from disk (D-10 — fs reads + frontmatter parse ONLY; no
 * Flutter SDK, no simulator/emulator, no spawn of flutter/dart, no network):
 *   1. agents/flutter-executor.md has valid frontmatter with the
 *      design-executor-required fields (name/description/tools/color) AND
 *      name === 'flutter-executor'.
 *   2. It declares a recognized size_budget tier (a TIER_LIMITS key) — D-09,
 *      so agent-size-budget.test.cjs stays green.
 *   3. Its body references the token-bridge (native-platforms / emitFlutter /
 *      token-bridge) AND reference/platforms.md — it CONSUMES the 34.1-01
 *      bridge rather than re-deriving the mapping.
 *   4. Its body asserts the MULTI-TARGET surface (the SC#4 distinctive that
 *      separates flutter from swift/compose): Material 3 AND Cupertino, across
 *      the web / iOS / Android target set.
 *   5. Its line count is within the declared size_budget tier limit.
 *
 * Hermetic + deterministic. No fs writes, no spawn, no network (D-10).
 * The agent ships NO connection doc (its native targets reuse the
 * xcode-simulator/android-emulator/Preview connections from 34.1-02/03), so
 * this test asserts ONLY the two 34.1-04 files and reads no connection index
 * (the connection capability matrix is 34.1-06 owned — Wave-B disjointness).
 */

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { REPO_ROOT, readFrontmatter, countLines } = require('./helpers.ts');

const AGENT_PATH = path.join(REPO_ROOT, 'agents', 'flutter-executor.md');

// Mirror the canonical tier map from agent-size-budget.test.cjs (D-09).
const TIER_LIMITS = {
  XXL: 700,
  XL: 500,
  LARGE: 350,
  M: 300,
  DEFAULT: 250,
  S: 150,
  XS: 100,
};

/** Read the raw agent body (CRLF-normalized) once per call. */
function readAgent() {
  return fs.readFileSync(AGENT_PATH, 'utf8').replace(/\r\n/g, '\n');
}

test('34.1-04: flutter-executor.md exists', () => {
  assert.ok(
    fs.existsSync(AGENT_PATH),
    'agents/flutter-executor.md must exist (D-04 — agent-prompt that generates Flutter code)'
  );
});

test('34.1-04: flutter-executor.md has valid frontmatter with design-executor-required fields', () => {
  const fm = readFrontmatter(AGENT_PATH);
  for (const field of ['name', 'description', 'tools', 'color']) {
    assert.ok(
      fm[field] !== undefined && String(fm[field]).length > 0,
      `frontmatter must carry "${field}" (mirrors design-executor.md)`
    );
  }
  assert.equal(
    fm.name,
    'flutter-executor',
    "frontmatter name must be 'flutter-executor'"
  );
});

test('34.1-04: flutter-executor.md declares a recognized size_budget tier', () => {
  const fm = readFrontmatter(AGENT_PATH);
  const tier = String(fm.size_budget || '').toUpperCase();
  assert.ok(
    Object.prototype.hasOwnProperty.call(TIER_LIMITS, tier),
    `size_budget must be a recognized tier (one of ${Object.keys(TIER_LIMITS).join(', ')}); got "${fm.size_budget}" (D-09)`
  );
});

test('34.1-04: flutter-executor.md body references the token-bridge AND platforms', () => {
  const body = readAgent();
  assert.match(
    body,
    /native-platforms|emitFlutter|token-bridge/i,
    'body must reference the 34.1-01 token-bridge (native-platforms / emitFlutter / token-bridge) — it consumes, not re-derives, the token mapping'
  );
  assert.match(
    body,
    /platforms/i,
    'body must reference reference/platforms.md (the iOS + Android + web conventions)'
  );
});

test('34.1-04: flutter-executor.md body asserts the multi-target surface (SC#4)', () => {
  const body = readAgent();
  // Material 3 — the Android/web Material idiom.
  assert.match(
    body,
    /material\s*3/i,
    'body must name Material 3 (the Material target idiom) — SC#4'
  );
  // Cupertino — the iOS idiom. This is the flutter-specific distinctive.
  assert.match(
    body,
    /cupertino/i,
    'body must name Cupertino (the iOS target idiom) — the SC#4 distinctive separating flutter from swift/compose'
  );
  // The web / iOS / Android target set (combined phrase OR all three tokens).
  const hasCombinedPhrase = /web\s*\/\s*ios\s*\/\s*android/i.test(body);
  const hasAllThree =
    /\bweb\b/i.test(body) && /\bios\b/i.test(body) && /\bandroid\b/i.test(body);
  assert.ok(
    hasCombinedPhrase || hasAllThree,
    'body must cover the web/iOS/Android target set (a combined "web/iOS/Android" phrase, or all three named) — SC#4 multi-target'
  );
});

test('34.1-04: flutter-executor.md line count within its declared size_budget', () => {
  const fm = readFrontmatter(AGENT_PATH);
  const tier = String(fm.size_budget || 'DEFAULT').toUpperCase();
  const limit = TIER_LIMITS[tier];
  assert.ok(limit !== undefined, `size_budget tier "${tier}" must be recognized`);
  const lines = countLines(AGENT_PATH);
  assert.ok(
    lines <= limit,
    `agents/flutter-executor.md: ${lines} lines exceeds ${tier} budget of ${limit} (delegate per-platform detail to reference/platforms.md + reference/native-platforms.md)`
  );
});
