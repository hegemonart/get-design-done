'use strict';
/**
 * Plan 34.2-03 — email routing + verify adaptation (static).
 *
 * The email continuation of native-routing-static.test.cjs (the DIRECT analog).
 * Hermetic static validation (D-10): fs reads + text/frontmatter parse ONLY.
 * NO project scaffolding, NO simulator, NO Litmus, NO mjml, NO child_process,
 * NO network. Default `npm test` runs it on any machine.
 *
 * Wave-B disjointness: this suite touches ONLY agents/design-context-builder.md
 * + agents/design-verifier.md. It does NOT read or assert anything about the
 * connections matrix (that row is 34.2-04's job) or agents/email-executor.md /
 * connections/litmus.md (34.2-02's files).
 *
 * Locks two ADDITIVE agent extensions (the email half of the 34.1 seam):
 *
 *   agents/design-context-builder.md — project-type detection (SC#8-email, D-06):
 *     `email` is appended to the enum + routed `email` → `email-executor` AT the
 *     34.1 seam (line ~243 marker). The seam marker SURVIVES (so 34.3 can append
 *     `print` the same way) and there is NO active `print` enum value /
 *     `print-executor` route — print stays deferred to 34.3 (D-06/D-07). This is
 *     the inverse of native-routing-static.test.cjs's "34.1 must NOT add email":
 *     34.2 flips ONLY the email half.
 *
 *   agents/design-verifier.md — email-verify branch (SC#7-verify, D-03):
 *     when `<project_type>` is `email`, an email-constraint audit BY DELEGATION
 *     to reference/email-design.md + the static validator
 *     (scripts/lib/email/validate-email-html.cjs), with optional Litmus
 *     cross-client screenshots as a degrade-able enhancement (NEVER hard-required
 *     — the Phase-4D native-branch precedent). The branch is a terse delegated
 *     pointer — the ~30 constraints are NOT inlined.
 *
 * Both edited agents must stay <= 700 lines (D-09 — the verifier is the tight
 * one, ~692/700 XXL after 34.1's native branch).
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

test('34.2-03: context-builder detects an `email` project type', () => {
  assert.match(contextBuilder, /\bemail\b/i, 'project-type enum must include email');
});

test('34.2-03: context-builder routes email → email-executor (paired in the routing table)', () => {
  assert.ok(
    contextBuilder.includes('email-executor'),
    'routing table must map the email project type to email-executor',
  );
  // Type<->executor pairing: `email` sits near `email-executor` (same table row),
  // mirroring native-routing-static.test.cjs's pairing assertion.
  assert.match(
    contextBuilder,
    /email[\s\S]{0,160}email-executor|email-executor[\s\S]{0,160}email/i,
    'email must be paired with email-executor in the routing table',
  );
});

test('34.2-03: the 34.1 seam marker survives (so 34.3 can append print)', () => {
  assert.match(
    contextBuilder,
    /append .*(email|print)|34\.3|intentionally open|extensible|add .* rows? here/i,
    'the 34.1 append-seam marker must survive so 34.3 can append print the same way',
  );
});

test('34.2-03: 34.2 does NOT add a `print` enum value / print-executor route (D-06/D-07 — print is 34.3)', () => {
  // The seam MAY still MENTION print as FUTURE work — that is allowed (it mirrors
  // how 34.1's test allowed email/print in the seam but not routed). What is NOT
  // allowed is an ACTIVE print-executor routing row shipped in 34.2.
  assert.doesNotMatch(
    contextBuilder,
    /print-executor/i,
    'D-06/D-07: 34.2 must not add a print-executor routing row — print lands in 34.3',
  );
});

test('34.2-03: design-verifier has an email-verify branch (delegates to email-design.md + validate-email-html)', () => {
  assert.match(verifier, /\bemail\b/i, 'verifier must document an email-verify branch');
  assert.match(
    verifier,
    /email-design|validate-email-html/,
    'email branch must delegate to reference/email-design.md + the static validator (not inline the constraints)',
  );
});

test('34.2-03: design-verifier email branch degrades for Litmus (never hard-requires it — D-03)', () => {
  assert.match(verifier, /litmus/i, 'email branch must name the optional Litmus connection');
  assert.match(
    verifier,
    /degrade|optional|code-only|never (?:requires|hard-requires)|enhancement/i,
    'email branch must degrade — Litmus is an enhancement, never hard-required (D-03)',
  );
});

test('34.2-03: both edited agents stay <= 700 lines (D-09 — the verifier is the tight one)', () => {
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
