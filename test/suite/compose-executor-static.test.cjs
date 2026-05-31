'use strict';
/**
 * Plan 34.1-03 — compose-executor + android-emulator static validation.
 *
 * Locks SC#3 (Compose executor) + SC#7-partial (android-emulator connection),
 * AS AMENDED by:
 *   - D-04: executors are AGENT-PROMPT definitions (agents/*.md) that generate
 *     native code when an LLM invokes them — NOT a bundled compiler. So this
 *     test validates the agent's STRUCTURE (frontmatter + body references),
 *     never the Kotlin it would emit.
 *   - D-09: the new agent carries an honest `size_budget` tier (mirroring
 *     design-executor.md) so the agent-size-budget contract stays green; this
 *     test re-asserts the line-count <= tier limit invariant locally.
 *   - D-03: the android-emulator connection NEVER hard-requires an emulator —
 *     it must document a probe AND a degrade-to-code-only fallback.
 *   - D-10: HERMETIC. fs reads + frontmatter parse only. NO Android SDK, NO
 *     emulator, NO subprocess of adb/emulator, NO network. The default
 *     `npm test` runs this on any machine with zero native toolchain.
 *
 * Disjointness (Wave B): this test deliberately does NOT reference the
 * connection capability-matrix index — 34.1-06 owns those rows. It only reads
 * the THREE files this plan owns (the agent, the connection doc, and itself).
 *
 * Idiom mirrored from report-issue-destination-static.test.cjs: REPO_ROOT via
 * the helpers facade, fs reads, node:test + node:assert/strict, deterministic.
 */

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { REPO_ROOT, readFrontmatter, countLines } = require('./helpers.ts');

const AGENT_PATH = path.join(REPO_ROOT, 'agents', 'compose-executor.md');
const CONNECTION_PATH = path.join(REPO_ROOT, 'connections', 'android-emulator.md');

// Mirror of agent-size-budget.test.cjs TIER_LIMITS (the size_budget tier → max
// line-count map). Kept in lockstep with that file: an XL/XXL executor is the
// expected tier for a native code generator (design-executor.md is XXL).
const TIER_LIMITS = {
  XXL: 700,
  XL: 500,
  LARGE: 350,
  M: 300,
  DEFAULT: 250,
  S: 150,
  XS: 100,
};

// Frontmatter fields the design-executor.md shape requires (the validator's
// REQUIRED_FIELDS subset that matters for executor identity).
const REQUIRED_FRONTMATTER_FIELDS = ['name', 'description', 'tools', 'color'];

test('34.1-03: compose-executor.md exists', () => {
  assert.ok(
    fs.existsSync(AGENT_PATH),
    `expected agent-prompt at ${AGENT_PATH} (D-04 — agent generates Compose, not a compiler)`
  );
});

test('34.1-03: compose-executor.md has valid frontmatter with design-executor-required fields', () => {
  const fm = readFrontmatter(AGENT_PATH);
  assert.ok(
    Object.keys(fm).length > 0,
    'compose-executor.md must have a YAML frontmatter block'
  );
  for (const field of REQUIRED_FRONTMATTER_FIELDS) {
    assert.ok(
      field in fm && fm[field] !== '' && fm[field] !== undefined,
      `compose-executor.md frontmatter missing required field "${field}" (mirror design-executor.md)`
    );
  }
  assert.equal(
    fm.name,
    'compose-executor',
    `compose-executor.md frontmatter name must be "compose-executor", got "${fm.name}"`
  );
});

test('34.1-03: compose-executor.md declares a recognized size_budget tier (D-09)', () => {
  const fm = readFrontmatter(AGENT_PATH);
  assert.ok(
    'size_budget' in fm && fm.size_budget !== '',
    'compose-executor.md must declare a size_budget (D-09 — keeps the agent-size-budget contract honest)'
  );
  const tier = String(fm.size_budget).toUpperCase();
  assert.ok(
    Object.prototype.hasOwnProperty.call(TIER_LIMITS, tier),
    `compose-executor.md size_budget "${fm.size_budget}" is not a recognized tier. ` +
      `Valid: ${Object.keys(TIER_LIMITS).join(', ')}`
  );
});

test('34.1-03: compose-executor.md body references the token-bridge AND platforms', () => {
  const body = fs.readFileSync(AGENT_PATH, 'utf8');
  assert.match(
    body,
    /native-platforms|emitCompose|token-bridge/,
    'compose-executor.md must reference the 34.1-01 token-bridge ' +
      '(reference/native-platforms.md OR emitCompose) — it CONSUMES the mapping, does not re-derive it'
  );
  assert.match(
    body,
    /platforms/,
    'compose-executor.md must cite reference/platforms.md (Android conventions: edge-to-edge, back gesture, Material 3 type scale)'
  );
});

test('34.1-03: compose-executor.md references Material 3 conventions', () => {
  const body = fs.readFileSync(AGENT_PATH, 'utf8');
  assert.match(
    body,
    /Material 3|Material3|MaterialTheme/i,
    'compose-executor.md must reference Material 3 (the Compose theming system the tokens feed)'
  );
});

test('34.1-03: compose-executor.md line count within its declared size_budget (D-09)', () => {
  const fm = readFrontmatter(AGENT_PATH);
  const tier = String(fm.size_budget || 'DEFAULT').toUpperCase();
  const limit = TIER_LIMITS[tier];
  assert.ok(limit !== undefined, `unknown size_budget tier "${tier}"`);
  const lineCount = countLines(AGENT_PATH);
  assert.ok(
    lineCount <= limit,
    `compose-executor.md: ${lineCount} lines exceeds ${tier} budget of ${limit}. ` +
      `Delegate detail to reference/platforms.md + reference/native-platforms.md to stay under the cap.`
  );
});

test('34.1-03: connections/android-emulator.md exists', () => {
  assert.ok(
    fs.existsSync(CONNECTION_PATH),
    `expected connection spec at ${CONNECTION_PATH} (mirror connections/preview.md)`
  );
});

test('34.1-03: connections/android-emulator.md has a probe section', () => {
  const body = fs.readFileSync(CONNECTION_PATH, 'utf8');
  assert.match(
    body,
    /probe/i,
    'android-emulator.md must document an availability probe (mirror preview.md)'
  );
});

test('34.1-03: connections/android-emulator.md documents the three-value status schema', () => {
  const body = fs.readFileSync(CONNECTION_PATH, 'utf8');
  for (const verdict of ['available', 'unavailable', 'not_configured']) {
    assert.match(
      body,
      new RegExp(verdict, 'i'),
      `android-emulator.md should document status "${verdict}" (three-value schema, mirror preview.md)`
    );
  }
});

test('34.1-03: connections/android-emulator.md degrades to code-only (D-03)', () => {
  const body = fs.readFileSync(CONNECTION_PATH, 'utf8');
  assert.match(
    body,
    /fallback/i,
    'android-emulator.md must have a Fallback section (the D-03 guarantee)'
  );
  assert.match(
    body,
    /code-only|degrade|no emulator|without an emulator/i,
    'android-emulator.md Fallback must degrade to CODE-ONLY when no emulator is present ' +
      '(D-03 — NEVER hard-requires an emulator)'
  );
});
