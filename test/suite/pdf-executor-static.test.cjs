'use strict';
/**
 * Plan 34.3-02 — pdf-executor + print-renderer connection static validation (RED→GREEN).
 *
 * Locks SC#6 (PDF executor) + SC#7-print (print-render connection):
 *
 *  - agents/pdf-executor.md is an agent-prompt (D-04 — generates print-ready output
 *    when an LLM invokes it, mirroring design-executor.md / email-executor.md /
 *    flutter-executor.md; NOT a bundled pdfkit/Paged.js compiler) with VALID
 *    frontmatter mirroring email-executor.md's shape (name/description/tools/color)
 *    AND — critically (D-09) — a size_budget that is a recognized tier key with an
 *    HONEST rationale, so the agent stays within its declared line budget (the same
 *    gate agent-size-budget.test.cjs applies).
 *  - It carries a `## Record` section FROM THE START (D-04/D-09 — the 34.1-02 /
 *    34.2-02 record-contract miss where executors shipped without it and tripped
 *    record-contract.test.cjs).
 *  - Its body DELEGATES the print constraints to reference/print-design.md (does
 *    not re-derive them), RUNS the static validator
 *    (scripts/lib/print/validate-print-css.cjs → validatePrintCss) on its generated
 *    print CSS/HTML, states the D-02 Paged.js-compatible print HTML/CSS + @page
 *    contract (with a PDFKit-fallback note for Chrome-less runtimes; NO pdfkit/paged
 *    build step), and treats the print-render as OPTIONAL / degrade (D-03).
 *  - connections/print-renderer.md mirrors connections/preview.md (a render/visual
 *    truth service) — a Probe section + a Fallback that DEGRADES to the static
 *    validator / code-only when the renderer is absent (D-03 — NEVER hard-required).
 *  - NO `pdfkit`/`paged`/`puppeteer`/`playwright` runtime dependency exists in
 *    package.json (D-02/D-10).
 *
 * HERMETIC (D-10): fs reads + frontmatter parse ONLY. NO pdfkit, NO paged, NO
 * puppeteer, NO playwright, NO headless Chrome, NO network, NO child-process spawn.
 * The default `npm test` runs this anywhere.
 *
 * Wave-B disjointness: this test touches ONLY agents/pdf-executor.md +
 * connections/print-renderer.md (+ a package.json read). It does NOT reference the
 * connection index / Capability-Matrix file (the connections/ index) — the
 * print-renderer index rows are added by 34.3-04 at closeout (the 34.1/34.2
 * disjointness pattern).
 */

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { readFrontmatter, countLines } = require('./helpers.ts');

const REPO_ROOT = path.resolve(__dirname, '../..');
const PDF_EXECUTOR = path.join(REPO_ROOT, 'agents', 'pdf-executor.md');
const PRINT_RENDERER = path.join(REPO_ROOT, 'connections', 'print-renderer.md');
const PACKAGE_JSON = path.join(REPO_ROOT, 'package.json');

// Mirror of agent-size-budget.test.cjs TIER_LIMITS (the size_budget value must be
// one of these keys). The live agent-size-budget gate only scans `design-*.md`,
// so this is the local pre-check that catches drift for the pdf-executor too
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

test('34.3-02: pdf-executor.md has valid frontmatter with design-executor-required fields', () => {
  assert.ok(fs.existsSync(PDF_EXECUTOR), 'agents/pdf-executor.md must exist');
  const fm = readFrontmatter(PDF_EXECUTOR);
  for (const field of ['name', 'description', 'tools', 'color']) {
    assert.ok(
      field in fm && fm[field] !== '' && fm[field] !== undefined,
      `agents/pdf-executor.md frontmatter missing required field "${field}"`,
    );
  }
  assert.equal(
    fm.name,
    'pdf-executor',
    `agents/pdf-executor.md frontmatter name must be "pdf-executor", got "${String(fm.name)}"`,
  );
});

test('34.3-02: pdf-executor.md declares a recognized size_budget tier (D-09)', () => {
  const fm = readFrontmatter(PDF_EXECUTOR);
  const tier = typeof fm.size_budget === 'string' ? fm.size_budget.toUpperCase() : undefined;
  assert.ok(
    tier !== undefined,
    'agents/pdf-executor.md frontmatter must declare a size_budget (D-09)',
  );
  assert.ok(
    Object.prototype.hasOwnProperty.call(TIER_LIMITS, tier),
    `agents/pdf-executor.md size_budget "${tier}" is not a recognized tier. Valid: ${Object.keys(TIER_LIMITS).join(', ')}`,
  );
});

test('34.3-02: pdf-executor.md line count within its declared size_budget', () => {
  const fm = readFrontmatter(PDF_EXECUTOR);
  const tier = typeof fm.size_budget === 'string' ? fm.size_budget.toUpperCase() : 'DEFAULT';
  const limit = TIER_LIMITS[tier];
  assert.ok(limit !== undefined, `unknown size_budget tier "${tier}"`);
  const lines = countLines(PDF_EXECUTOR);
  assert.ok(
    lines <= limit,
    `agents/pdf-executor.md: ${lines} lines exceeds ${tier} budget of ${limit} lines (D-09 — trim by delegating per-press/per-RIP detail to reference/print-design.md, do not inflate the tier)`,
  );
});

test('34.3-02: pdf-executor.md has a `## Record` section (the 34.1-02/34.2-02 record-contract lesson)', () => {
  const body = readAgentBody(PDF_EXECUTOR);
  assert.match(
    body,
    /##\s*Record/,
    'agents/pdf-executor.md must carry a `## Record` section FROM THE START (record-contract.test.cjs gates every agent)',
  );
  assert.match(
    body,
    /insights\.jsonl/,
    'agents/pdf-executor.md `## Record` must append one JSONL line to .design/intel/insights.jsonl',
  );
  assert.match(
    body,
    /insight-line\.schema\.json/,
    'agents/pdf-executor.md `## Record` must cite reference/schemas/insight-line.schema.json',
  );
});

test('34.3-02: pdf-executor.md delegates constraints to reference/print-design.md', () => {
  const body = readAgentBody(PDF_EXECUTOR);
  assert.match(
    body,
    /print-design/,
    'agents/pdf-executor.md must name reference/print-design.md as the authoritative constraint source (delegate, do not re-derive — the email-executor->email-design / flutter-executor->native-platforms precedent)',
  );
});

test('34.3-02: pdf-executor.md runs the static validator on its output', () => {
  const body = readAgentBody(PDF_EXECUTOR);
  assert.match(
    body,
    /validate-print-css|validatePrintCss|scripts\/lib\/print/,
    'agents/pdf-executor.md must run scripts/lib/print/validate-print-css.cjs (validatePrintCss) on its generated print CSS/HTML as its self-check against the catalogue before completing',
  );
});

test('34.3-02: pdf-executor.md states the Paged.js-compatible print HTML/CSS + @page contract (D-02)', () => {
  const body = readAgentBody(PDF_EXECUTOR);
  assert.match(
    body,
    /paged\.?js/i,
    'agents/pdf-executor.md must name Paged.js (the canonical print HTML/CSS output target, D-02)',
  );
  assert.match(
    body,
    /@page/i,
    'agents/pdf-executor.md must name the @page rule (the print box model contract, D-02)',
  );
});

test('34.3-02: pdf-executor.md notes a PDFKit fallback for Chrome-less runtimes (D-02)', () => {
  const body = readAgentBody(PDF_EXECUTOR);
  assert.match(
    body,
    /pdfkit/i,
    'agents/pdf-executor.md must name PDFKit (the documented Chrome-less fallback construction path, D-02)',
  );
  assert.match(
    body,
    /fallback|chrome-?less|without (?:a )?(?:headless )?chrome/i,
    'agents/pdf-executor.md must frame PDFKit as a FALLBACK for Chrome-less runtimes (D-02)',
  );
});

test('34.3-02: pdf-executor.md treats the print-render as optional / degrade (D-03)', () => {
  const body = readAgentBody(PDF_EXECUTOR);
  assert.match(
    body,
    /print-render|print-renderer/i,
    'agents/pdf-executor.md must point at the optional print-render (connections/print-renderer.md)',
  );
  assert.match(
    body,
    /optional|degrade|never (?:requires|hard-requires|a precondition)|enhancement/i,
    'agents/pdf-executor.md must treat the print-render as an ENHANCEMENT that degrades — NEVER a precondition (D-03)',
  );
});

test('34.3-02: connections/print-renderer.md has a probe + degrade-to-static-validator/code-only fallback (mirror preview.md)', () => {
  assert.ok(fs.existsSync(PRINT_RENDERER), 'connections/print-renderer.md must exist');
  const doc = fs.readFileSync(PRINT_RENDERER, 'utf8');
  assert.match(
    doc,
    /probe/i,
    'connections/print-renderer.md must have a Probe/Availability section (mirror connections/preview.md)',
  );
  assert.match(
    doc,
    /fallback/i,
    'connections/print-renderer.md must have a Fallback section (mirror connections/preview.md)',
  );
  assert.match(
    doc,
    /validate-print-css|static validator|code-only|degrade/i,
    'connections/print-renderer.md Fallback must degrade to the static validator / code-only when the renderer is absent (D-03 — never hard-required)',
  );
});

test('34.3-02: NO pdfkit/paged/puppeteer/playwright dependency in package.json (D-02/D-10)', () => {
  const pkg = JSON.parse(fs.readFileSync(PACKAGE_JSON, 'utf8'));
  const buckets = [pkg.dependencies, pkg.devDependencies, pkg.optionalDependencies];
  for (const forbidden of ['pdfkit', 'paged', 'puppeteer', 'playwright']) {
    for (const bucket of buckets) {
      assert.ok(
        !(bucket && Object.prototype.hasOwnProperty.call(bucket, forbidden)),
        `package.json must NOT depend on "${forbidden}" — the pdf-executor generates Paged.js-compatible print HTML/CSS directly (D-02, no runtime pdfkit/paged/puppeteer/playwright); rendering is the optional print-render connection's job (D-03/D-10)`,
      );
    }
  }
});
