'use strict';
/**
 * TST-28 — reflection-proposal
 *
 * Validates that agents/design-reflector.md output is always proposal-shaped
 * (never auto-applied) and /gdd:apply-reflections requires explicit
 * confirmation. Also checks the locked fixture at
 * test-fixture/baselines/current/expected-reflection-proposals.json.
 */

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { REPO_ROOT } = require('./helpers.ts');

const REFLECTOR = path.join(REPO_ROOT, 'agents/design-reflector.md');
const APPLY_SKILL = path.join(REPO_ROOT, 'skills/apply-reflections/SKILL.md');
const FIXTURE = path.join(
  REPO_ROOT,
  'test-fixture/baselines/current/expected-reflection-proposals.json'
);

// All five proposal-type tags declared in the reflector.
const PROPOSAL_TAGS = ['[FRONTMATTER]', '[REFERENCE]', '[BUDGET]', '[QUESTION]', '[GLOBAL-SKILL]'];

test('reflection-proposal: agent declares proposal-only output (no auto-apply path)', () => {
  const body = fs.readFileSync(REFLECTOR, 'utf8');
  const patterns = [
    /never auto-apply/i,
    /always proposal/i,
    /user will review/i,
    /never auto.apply/i,
  ];
  const matched = patterns.some(p => p.test(body));
  assert.ok(
    matched,
    'design-reflector.md must declare a proposal-only guarantee (one of: "never auto-apply", "always proposal", "user will review")'
  );
});

test('reflection-proposal: agent declares all five proposal-type tags', () => {
  const body = fs.readFileSync(REFLECTOR, 'utf8');
  for (const tag of PROPOSAL_TAGS) {
    assert.ok(
      body.includes(tag),
      `design-reflector.md must declare proposal-type tag ${tag}`
    );
  }
});

test('reflection-proposal: agent declares proposal block structure (Why/Change/Risk)', () => {
  const body = fs.readFileSync(REFLECTOR, 'utf8');
  assert.match(body, /\*\*Why\*\*:/, 'agent body should declare "**Why**:" in proposal shape');
  assert.match(body, /\*\*Change\*\*:/, 'agent body should declare "**Change**:" in proposal shape');
  assert.match(body, /\*\*Risk\*\*:/, 'agent body should declare "**Risk**:" in proposal shape');
});

test('reflection-proposal: /gdd:apply-reflections skill requires explicit confirmation', () => {
  const body = fs.readFileSync(APPLY_SKILL, 'utf8');
  // Explicit-confirm gate: offer a (apply) AND s (skip) AND one of e (edit) / q (quit).
  assert.match(body, /\(a\)\s*apply/i, 'apply-reflections should offer (a) apply option');
  assert.match(body, /\(s\)\s*skip/i, 'apply-reflections should offer (s) skip option');
  const hasEditOrQuit = /\(e\)\s*edit/i.test(body) || /\(q\)\s*quit/i.test(body);
  assert.ok(hasEditOrQuit, 'apply-reflections should offer (e) edit or (q) quit option');
});

test('reflection-proposal: validate sample proposal fixture parses to expected shape', () => {
  assert.ok(fs.existsSync(FIXTURE), `expected fixture at ${FIXTURE}`);
  const raw = fs.readFileSync(FIXTURE, 'utf8');
  let parsed;
  assert.doesNotThrow(() => { parsed = JSON.parse(raw); }, 'fixture should be valid JSON');

  assert.equal(typeof parsed.minimum_proposals, 'number', 'minimum_proposals must be a number');
  assert.ok(Array.isArray(parsed.required_types), 'required_types must be an array');
  assert.ok(parsed.required_types.length > 0, 'required_types must be non-empty');
  assert.equal(typeof parsed.frontmatter_target, 'string', 'frontmatter_target must be a string');
  assert.equal(typeof parsed.budget_target, 'string', 'budget_target must be a string');
});

test('reflection-proposal: auto-apply path does not exist in reflector or apply-reflections skill', () => {
  const files = [REFLECTOR, APPLY_SKILL];
  const autoApplyRe = /auto[.-]?apply/gi;
  for (const file of files) {
    const body = fs.readFileSync(file, 'utf8');
    let m;
    while ((m = autoApplyRe.exec(body)) !== null) {
      const idx = m.index;
      const windowStart = Math.max(0, idx - 20);
      const windowText = body.slice(windowStart, idx + m[0].length);
      const negated = /\b(no|never|without|not)\b[\s\w-]*$/i.test(windowText.slice(0, windowText.length - m[0].length));
      assert.ok(
        negated,
        `${path.basename(file)} contains "${m[0]}" without a nearby negation (window: "${windowText}")`
      );
    }
  }
});
