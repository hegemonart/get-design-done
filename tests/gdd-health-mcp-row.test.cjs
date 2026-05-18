'use strict';
// tests/gdd-health-mcp-row.test.cjs
// ---------------------------------------------------------------------------
// Plan 27.7-04 — structural assertions for the gdd-health SKILL's
// check-mcp-registration step block. Verifies the row strings and the
// .design/config.json#mcp_nudge=false dismissal hook landed in
// skills/health/SKILL.md (NOT a fictitious scripts/cli/gsd-health.cjs).
//
// All tests tagged "27.7-04:".

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const REPO_ROOT = path.resolve(__dirname, '..');
const SKILL_PATH = path.join(REPO_ROOT, 'skills', 'health', 'SKILL.md');
// Phase 28.5-06 (D-10) moved the verbatim MCP-row procedure detail
// (dismissal check, detection, row rendering, fallback) to
// reference/health-mcp-detection.md per the <=100-line SKILL.md
// authoring contract. The SKILL keeps the section header + one-paragraph
// summary + cross-link; the verbatim row strings + settings-file path
// live in the reference file.
const HEALTH_MCP_REF_PATH = path.join(
  REPO_ROOT,
  'reference',
  'health-mcp-detection.md',
);

describe('27.7-04: gdd-health SKILL MCP-row block', () => {
  const SKILL = fs.readFileSync(SKILL_PATH, 'utf8');
  const HEALTH_MCP_REF = fs.existsSync(HEALTH_MCP_REF_PATH)
    ? fs.readFileSync(HEALTH_MCP_REF_PATH, 'utf8')
    : '';
  // Combined surface: SKILL + linked reference. Post-Phase-28.5-06 this
  // is the canonical "MCP-row block" content graph; assertions must
  // resolve content from either source.
  const SURFACE = SKILL + '\n\n' + HEALTH_MCP_REF;

  test('27.7-04: skills/health/SKILL.md contains the check-mcp-registration step block', () => {
    const hasBlock =
      SKILL.includes('Check MCP registration') ||
      SKILL.includes('check-mcp-registration');
    assert.ok(hasBlock, 'SKILL must contain the MCP registration step block');
  });

  test('27.7-04: SKILL step references harness settings file + mcp_nudge dismissal', () => {
    // Phase 28.5-06 (D-10): the verbatim settings-file path lives in
    // reference/health-mcp-detection.md; SKILL keeps the mcp_nudge flag
    // + cross-link summary. Assert against the combined surface.
    assert.match(
      SURFACE,
      /\.claude\/settings\.local\.json|claude mcp list|codex mcp list/,
      'SKILL + reference must reference harness settings detection',
    );
    assert.match(
      SKILL,
      /mcp_nudge/,
      'SKILL must reference the mcp_nudge dismissal flag inline',
    );
    // Also verify the SKILL cross-links to the reference file (one level
    // deep per Phase 28.5 progressive-disclosure rule).
    assert.match(
      SKILL,
      /health-mcp-detection\.md/,
      'SKILL must cross-link to reference/health-mcp-detection.md (Phase 28.5 progressive disclosure)',
    );
  });

  test('27.7-04: SKILL contains at least 4 of 5 expected row strings verbatim', () => {
    // Phase 28.5-06 (D-10): the verbatim row strings live in
    // reference/health-mcp-detection.md per progressive-disclosure rule.
    // Assert against the combined SKILL + reference surface.
    const expected = [
      'MCP server: registered with claude+codex',
      'MCP server: registered with claude',
      'MCP server: registered with codex',
      'MCP server: not registered',
      'MCP server: unknown',
    ];
    const found = expected.filter((s) => SURFACE.includes(s));
    assert.ok(
      found.length >= 4,
      'expected >= 4 row strings in SKILL + reference/health-mcp-detection.md, found ' + found.length + ': ' + found.join(' | '),
    );
  });

  test('27.7-04: mcp-register.cjs exports detectMcpRegistration (referenced by SKILL)', () => {
    const m = require('../scripts/lib/install/mcp-register.cjs');
    assert.equal(
      typeof m.detectMcpRegistration,
      'function',
      'detectMcpRegistration must be exported for SKILL invocation',
    );
  });

  test('27.7-04: SKILL contains no dead reference to scripts/cli/gsd-health.cjs (Blocker #3)', () => {
    assert.ok(
      !SKILL.includes('scripts/cli/gsd-health'),
      'SKILL must not reference the non-existent scripts/cli/gsd-health.cjs',
    );
  });

  test('27.7-04: SKILL step is marked non-blocking (fail-safe on parse errors)', () => {
    // Step instructions should indicate the SKILL does NOT crash when
    // .design/config.json is malformed or harness settings are missing.
    const hasFailSafeLanguage =
      /non-blocking|fail-safe|MUST NOT crash|skip.*silently|fallback/i.test(SKILL);
    assert.ok(
      hasFailSafeLanguage,
      'SKILL step must declare non-blocking / fallback semantics',
    );
  });
});
