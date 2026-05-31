'use strict';
/**
 * Plan 34.3-03 — print routing + non-web-verify CONSOLIDATION (static).
 *
 * The print continuation of email-routing-static.test.cjs (the DIRECT analog),
 * with the CONSOLIDATION twist. Hermetic static validation (D-10): fs reads +
 * text/frontmatter parse ONLY. NO project scaffolding, NO simulator, NO
 * print-render, NO pdfkit/paged/puppeteer/playwright, NO child_process,
 * NO network. Default `npm test` runs it on any machine.
 *
 * Wave-B disjointness: this suite touches ONLY agents/design-context-builder.md
 * + agents/design-verifier.md. It does NOT read or assert anything about the
 * connections matrix (the connections registry — 34.3-04's job) or
 * agents/pdf-executor.md / connections/print-renderer.md (34.3-02's files).
 *
 * Locks the print half of the 34.1 seam + the verifier consolidation:
 *
 *   agents/design-context-builder.md — project-type detection (SC#8-print, D-06):
 *     `print` is appended to the enum + routed `print` → `pdf-executor` AT the
 *     34.1/34.2 seam (line ~245 marker), and the seam is then CLOSED — print is
 *     the FINAL Phase-34 output type, so the open-append "34.3 appends HERE"
 *     invitation is REPLACED with a completion note. This is the INVERSE of
 *     native-routing-static.test.cjs / email-routing-static.test.cjs which kept
 *     the marker OPEN; 34.3 ties it off.
 *
 *   agents/design-verifier.md — ONE consolidated "Non-Web Verify (no-DOM
 *     targets)" section (SC#7-verify, D-03/D-07): the separate Phase-4D (Native)
 *     + Phase-4E (Email) branches are MERGED into ONE parameterized section that
 *     routes by `<project_type>` — native→reference/native-platforms.md,
 *     email→reference/email-design.md + validate-email-html, print→
 *     reference/print-design.md + validate-print-css — each with its optional
 *     render-connection that degrades to a static/code-only audit (NEVER
 *     hard-required). The consolidation NET-REDUCES lines while adding print so
 *     the verifier stays <= 700 (it is at ~698/700 — appending a third
 *     near-identical branch would overflow; consolidation is MANDATORY).
 *
 * This plan ALSO re-runs native-routing-static.test.cjs + email-routing-static.
 * test.cjs in its verify command to confirm the consolidation did NOT drop the
 * native / email verify behaviors those suites assert (the consolidated section
 * preserves every token they match). NOTE: both of those suites assert
 * doesNotMatch(/print-executor/i) — that stays GREEN because 34.3's executor is
 * `pdf-executor` (D-05), NOT `print-executor`.
 *
 * Both edited agents must stay <= 700 lines (D-07 — the verifier is the tight
 * one, ~698/700 XXL before the consolidation).
 */

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { REPO_ROOT, readFrontmatter, countLines } = require('./helpers.ts');

// TIER_LIMITS mirrored from agent-size-budget.test.cjs (the D-07 guard source).
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

test('34.3-03: context-builder detects a `print` project type', () => {
  assert.match(contextBuilder, /\bprint\b/i, 'project-type enum must include print');
});

test('34.3-03: context-builder routes print → pdf-executor (paired in the routing table)', () => {
  assert.ok(
    contextBuilder.includes('pdf-executor'),
    'routing table must map the print project type to pdf-executor',
  );
  // Type<->executor pairing: `print` sits near `pdf-executor` (same table row),
  // mirroring email-routing-static.test.cjs's pairing assertion.
  assert.match(
    contextBuilder,
    /print[\s\S]{0,160}pdf-executor|pdf-executor[\s\S]{0,160}print/i,
    'print must be paired with pdf-executor in the routing table',
  );
});

test('34.3-03: the seam is CLOSED — print is the final Phase-34 output type (closing note present + open-append marker gone)', () => {
  // CLOSING note present — print is the last Phase-34 output type; the enum +
  // routing table now carry the full set (native + email + print).
  assert.match(
    contextBuilder,
    /Phase 34 output types complete|no further Phase-34|full set/i,
    'the seam must be CLOSED with a completion note (print is the final Phase-34 output type)',
  );
  // Open-append invitation GONE — the "34.3 appends HERE" / "append its project
  // type" marker must NOT remain (this is the inverse of 34.1/34.2's open seam).
  assert.doesNotMatch(
    contextBuilder,
    /34\.3 (?:append|appends)|append .* HERE|append its project type/i,
    'the open-append "34.3 appends HERE" invitation must be REMOVED — the seam is tied off',
  );
});

test('34.3-03: design-verifier has ONE consolidated Non-Web Verify section routing native + email + print', () => {
  assert.match(
    verifier,
    /Non-?Web Verify/i,
    'verifier must have a consolidated "Non-Web Verify (no-DOM targets)" section',
  );
  // The ONE consolidated section routes all three non-web types by reference.
  assert.match(verifier, /native-platforms/, 'consolidated section must route native → reference/native-platforms.md');
  assert.match(
    verifier,
    /email-design|validate-email-html/,
    'consolidated section must route email → reference/email-design.md + the static validator',
  );
  assert.match(
    verifier,
    /print-design|validate-print-css/,
    'consolidated section must route print → reference/print-design.md + the static validator',
  );
});

test('34.3-03: the consolidated section preserves each type degrade posture (D-03)', () => {
  // Each type names its optional render-connection class…
  assert.match(verifier, /no-?DOM|native/i, 'native row must be present (no-DOM/native)');
  assert.match(verifier, /litmus/i, 'email row must name the optional Litmus connection');
  assert.match(verifier, /print-render|print-renderer/i, 'print row must name the optional print-render(er) connection');
  // …and a SHARED degrade clause covers all three (render-connection optional,
  // never hard-required — D-03).
  assert.match(
    verifier,
    /degrade|optional|code-only|never (?:requires|hard-requires)|enhancement/i,
    'the consolidated section must degrade — the render-connection is an enhancement, never hard-required (D-03)',
  );
});

test('34.3-03: native + email verify behaviors survive the consolidation (the routing-test tokens)', () => {
  // The native half of native-routing-static.test.cjs must stay satisfiable.
  assert.match(
    verifier,
    /snapshot|code-only|structural/i,
    'native branch must keep its snapshot / code-only / structural audit (native-routing-static asserts it)',
  );
  // The email half of email-routing-static.test.cjs must stay satisfiable.
  assert.match(verifier, /\bemail\b/i, 'email branch must survive the consolidation');
  assert.match(
    verifier,
    /email-design|validate-email-html/,
    'email branch must keep its delegation to email-design.md + validate-email-html (email-routing-static asserts it)',
  );
});

test('34.3-03: both edited agents stay <= 700 lines (D-07 — the verifier is the tight one)', () => {
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
