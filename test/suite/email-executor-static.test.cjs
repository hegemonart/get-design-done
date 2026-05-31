'use strict';
/**
 * Plan 34.2-02 — email-executor + litmus connection static validation (RED→GREEN).
 *
 * Locks SC#5 (email executor) + SC#7-email (Litmus render-test connection):
 *
 *  - agents/email-executor.md is an agent-prompt (D-04 — generates email when an
 *    LLM invokes it, mirroring design-executor.md / flutter-executor.md; NOT a
 *    bundled mjml compiler) with VALID frontmatter mirroring design-executor.md's
 *    shape (name/description/tools/color) AND — critically (D-09) — a size_budget
 *    that is a recognized tier key with an HONEST rationale, so the agent stays
 *    within its declared line budget (the same gate agent-size-budget.test.cjs
 *    applies).
 *  - It carries a `## Record` section FROM THE START (D-04/D-09 — the 34.1-02/03
 *    record-contract miss where executors shipped without it and tripped
 *    record-contract.test.cjs).
 *  - Its body DELEGATES the email constraints to reference/email-design.md (does
 *    not re-derive them), RUNS the static validator
 *    (scripts/lib/email/validate-email-html.cjs → validateEmailHtml) on its
 *    derived HTML, states the D-02 MJML-canonical + HTML-derived contract (NO
 *    mjml build step), and treats Litmus as OPTIONAL / degrade (D-03).
 *  - connections/litmus.md mirrors connections/chromatic.md (a render-test/visual
 *    service) — a Probe section + a Fallback that DEGRADES to the static validator
 *    / code-only when Litmus is absent (D-03 — NEVER hard-requires Litmus).
 *  - NO `mjml` runtime dependency exists in package.json (D-02/D-10).
 *
 * HERMETIC (D-10): fs reads + frontmatter parse ONLY. NO mjml, NO Litmus, NO
 * network, NO child-process spawn. The default `npm test` runs this anywhere.
 *
 * Wave-B disjointness: this test touches ONLY agents/email-executor.md +
 * connections/litmus.md (+ a package.json read). It does NOT reference the
 * connection index / Capability-Matrix file — the litmus index rows are added by
 * 34.2-04 at closeout (the 34.1 disjointness pattern).
 */

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { readFrontmatter, countLines } = require('./helpers.ts');

const REPO_ROOT = path.resolve(__dirname, '../..');
const EMAIL_EXECUTOR = path.join(REPO_ROOT, 'agents', 'email-executor.md');
const LITMUS = path.join(REPO_ROOT, 'connections', 'litmus.md');
const PACKAGE_JSON = path.join(REPO_ROOT, 'package.json');

// Mirror of agent-size-budget.test.cjs TIER_LIMITS (the size_budget value must be
// one of these keys). The live agent-size-budget gate only scans `design-*.md`,
// so this is the local pre-check that catches drift for the email-executor too
// (the plan's D-09 size-budget guard).
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

test('34.2-02: email-executor.md has valid frontmatter with design-executor-required fields', () => {
  assert.ok(fs.existsSync(EMAIL_EXECUTOR), 'agents/email-executor.md must exist');
  const fm = readFrontmatter(EMAIL_EXECUTOR);
  for (const field of ['name', 'description', 'tools', 'color']) {
    assert.ok(
      field in fm && fm[field] !== '' && fm[field] !== undefined,
      `agents/email-executor.md frontmatter missing required field "${field}"`,
    );
  }
  assert.equal(
    fm.name,
    'email-executor',
    `agents/email-executor.md frontmatter name must be "email-executor", got "${String(fm.name)}"`,
  );
});

test('34.2-02: email-executor.md declares a recognized size_budget tier (D-09)', () => {
  const fm = readFrontmatter(EMAIL_EXECUTOR);
  const tier = typeof fm.size_budget === 'string' ? fm.size_budget.toUpperCase() : undefined;
  assert.ok(
    tier !== undefined,
    'agents/email-executor.md frontmatter must declare a size_budget (D-09)',
  );
  assert.ok(
    Object.prototype.hasOwnProperty.call(TIER_LIMITS, tier),
    `agents/email-executor.md size_budget "${tier}" is not a recognized tier. Valid: ${Object.keys(TIER_LIMITS).join(', ')}`,
  );
});

test('34.2-02: email-executor.md line count within its declared size_budget', () => {
  const fm = readFrontmatter(EMAIL_EXECUTOR);
  const tier = typeof fm.size_budget === 'string' ? fm.size_budget.toUpperCase() : 'DEFAULT';
  const limit = TIER_LIMITS[tier];
  assert.ok(limit !== undefined, `unknown size_budget tier "${tier}"`);
  const lines = countLines(EMAIL_EXECUTOR);
  assert.ok(
    lines <= limit,
    `agents/email-executor.md: ${lines} lines exceeds ${tier} budget of ${limit} lines (D-09 — trim by delegating per-client quirk detail to reference/email-design.md, do not inflate the tier)`,
  );
});

test('34.2-02: email-executor.md has a `## Record` section (the 34.1-02/03 record-contract lesson)', () => {
  const body = readAgentBody(EMAIL_EXECUTOR);
  assert.match(
    body,
    /##\s*Record/,
    'agents/email-executor.md must carry a `## Record` section FROM THE START (record-contract.test.cjs gates every agent)',
  );
  assert.match(
    body,
    /insights\.jsonl/,
    'agents/email-executor.md `## Record` must append one JSONL line to .design/intel/insights.jsonl',
  );
  assert.match(
    body,
    /insight-line\.schema\.json/,
    'agents/email-executor.md `## Record` must cite reference/schemas/insight-line.schema.json',
  );
});

test('34.2-02: email-executor.md delegates constraints to reference/email-design.md', () => {
  const body = readAgentBody(EMAIL_EXECUTOR);
  assert.match(
    body,
    /email-design/,
    'agents/email-executor.md must name reference/email-design.md as the authoritative constraint source (delegate, do not re-derive — the flutter-executor->native-platforms precedent)',
  );
});

test('34.2-02: email-executor.md runs the static validator on its output', () => {
  const body = readAgentBody(EMAIL_EXECUTOR);
  assert.match(
    body,
    /validate-email-html|validateEmailHtml|scripts\/lib\/email/,
    'agents/email-executor.md must run scripts/lib/email/validate-email-html.cjs (validateEmailHtml) on its derived HTML as its self-check against the catalogue before completing',
  );
});

test('34.2-02: email-executor.md states the MJML-canonical + HTML-derived contract (D-02)', () => {
  const body = readAgentBody(EMAIL_EXECUTOR);
  assert.match(
    body,
    /mjml/i,
    'agents/email-executor.md must name MJML (the canonical artifact, D-02)',
  );
  assert.match(
    body,
    /html/i,
    'agents/email-executor.md must name HTML (the derived artifact, D-02)',
  );
  assert.match(
    body,
    /canonical/i,
    'agents/email-executor.md must state which artifact is canonical (MJML, D-02)',
  );
  assert.match(
    body,
    /deriv/i,
    'agents/email-executor.md must state which artifact is derived (HTML, D-02)',
  );
});

test('34.2-02: email-executor.md treats Litmus as optional / degrade (D-03)', () => {
  const body = readAgentBody(EMAIL_EXECUTOR);
  assert.match(
    body,
    /litmus/i,
    'agents/email-executor.md must point at the optional Litmus render-test (connections/litmus.md)',
  );
  assert.match(
    body,
    /optional|degrade|never (?:requires|hard-requires|a precondition)|enhancement/i,
    'agents/email-executor.md must treat Litmus as an ENHANCEMENT that degrades — NEVER a precondition (D-03)',
  );
});

test('34.2-02: connections/litmus.md has a probe + degrade-to-static-validator/code-only fallback (mirror chromatic.md)', () => {
  assert.ok(fs.existsSync(LITMUS), 'connections/litmus.md must exist');
  const doc = fs.readFileSync(LITMUS, 'utf8');
  assert.match(
    doc,
    /probe/i,
    'connections/litmus.md must have a Probe/Availability section (mirror connections/chromatic.md)',
  );
  assert.match(
    doc,
    /fallback/i,
    'connections/litmus.md must have a Fallback section (mirror connections/chromatic.md)',
  );
  assert.match(
    doc,
    /validate-email-html|static validator|code-only|degrade/i,
    'connections/litmus.md Fallback must degrade to the static validator / code-only when Litmus is absent (D-03 — never hard-required)',
  );
  assert.match(
    doc,
    /email-on-acid/i,
    'connections/litmus.md must document Email-on-Acid as the alternative render-test service',
  );
});

test('34.2-02: NO mjml dependency in package.json (D-02/D-10)', () => {
  const pkg = JSON.parse(fs.readFileSync(PACKAGE_JSON, 'utf8'));
  const inDeps = pkg.dependencies && Object.prototype.hasOwnProperty.call(pkg.dependencies, 'mjml');
  const inDevDeps = pkg.devDependencies && Object.prototype.hasOwnProperty.call(pkg.devDependencies, 'mjml');
  assert.ok(
    !inDeps,
    'package.json dependencies must NOT contain "mjml" — the email-executor generates MJML+HTML directly (D-02, no runtime mjml compile step)',
  );
  assert.ok(
    !inDevDeps,
    'package.json devDependencies must NOT contain "mjml" — MJML compilation is the agent\'s contract, not a bundled tool (D-02/D-10)',
  );
});
