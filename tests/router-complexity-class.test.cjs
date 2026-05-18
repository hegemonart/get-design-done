'use strict';

// tests/router-complexity-class.test.cjs — Phase 25 Plan 25-09 surface test.
//
// Asserts the router-skill extension landed in 25-02 (commit a239171):
//   * skills/router/SKILL.md JSON example carries `"complexity_class"` next
//     to `"path"` (D-05 — path field unchanged for back-compat; class field
//     additive).
//   * The Path Selection Heuristic table documents all four bucket labels
//     (`S`, `M`, `L`, `XL`).
//   * The canonical mapping rows are present: /gdd:scan→M, /gdd:help→S,
//     /gdd:plan (standalone)→L, /gdd:next (autonomous)→XL.
//
// The router itself is a deterministic skill (no model call) and its
// behavior is purely documented in the SKILL.md; the budget-enforcer
// consumer side is exercised by tests/budget-enforcer-resilience.test.ts
// and tests/hooks-ts-rewrite.test.ts. This file verifies the documented
// contract on the router-side surface — the source of truth other tests
// and downstream consumers point back at.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const REPO_ROOT = path.join(__dirname, '..');
const ROUTER_SKILL = path.join(REPO_ROOT, 'skills', 'router', 'SKILL.md');
// Phase 28.5-06 (Bucket 3 orchestrator rework) moved the
// Path Selection Heuristic table + bucket-assignment signal list +
// S-class short-circuit semantics + cost-estimation algorithm from
// skills/router/SKILL.md to reference/router-rules.md per the
// <=100-line authoring contract. The SKILL keeps the JSON-shape
// declaration + cross-link summary; the verbatim heuristic table lives
// in the reference file. Assertions that scan the heuristic table now
// read SKILL + linked reference together as the canonical surface.
const ROUTER_RULES = path.join(REPO_ROOT, 'skills', 'router', 'router-rules.md');

function readRouter() {
  return fs.readFileSync(ROUTER_SKILL, 'utf8');
}

function readRouterSurface() {
  const skill = fs.readFileSync(ROUTER_SKILL, 'utf8');
  const rules = fs.existsSync(ROUTER_RULES)
    ? fs.readFileSync(ROUTER_RULES, 'utf8')
    : '';
  return skill + '\n\n' + rules;
}

test('25-09 router: skills/router/SKILL.md exists', () => {
  assert.ok(fs.existsSync(ROUTER_SKILL), `expected ${ROUTER_SKILL} to exist`);
});

test('25-09 router: JSON example contains "complexity_class" alongside "path"', () => {
  const md = readRouter();
  assert.ok(
    /"complexity_class"\s*:\s*"[SMLXLsmlxl]+"/.test(md),
    'router JSON example must include a "complexity_class" key with an S|M|L|XL value',
  );
  assert.ok(
    /"path"\s*:\s*"(fast|quick|full)"/.test(md),
    'router JSON example must still include the legacy "path" key for back-compat (D-05)',
  );
});

test('25-09 router: Path Selection Heuristic table contains all four bucket labels', () => {
  // Phase 28.5-06 extracted the table to reference/router-rules.md;
  // assert against the combined SKILL + reference surface.
  const md = readRouterSurface();
  // Table rows look like:  | `S` | `fast` (short-circuited) | …
  // Look for each bucket label as a backtick-quoted token in the table region.
  assert.match(md, /`S`/, 'router heuristic table (SKILL + reference/router-rules.md) must reference the S bucket');
  assert.match(md, /`M`/, 'router heuristic table (SKILL + reference/router-rules.md) must reference the M bucket');
  assert.match(md, /`L`/, 'router heuristic table (SKILL + reference/router-rules.md) must reference the L bucket');
  assert.match(md, /`XL`/, 'router heuristic table (SKILL + reference/router-rules.md) must reference the XL bucket');
});

test('25-09 router: enum is documented as S | M | L | XL', () => {
  const md = readRouter();
  assert.match(
    md,
    /complexity_class[^.\n]*?S\s*\|\s*M\s*\|\s*L\s*\|\s*XL/,
    'complexity_class enum must be documented as the literal "S | M | L | XL" union',
  );
});

test('25-09 router: canonical mapping S→fast, M→fast, L→quick, XL→full is documented', () => {
  // Phase 28.5-06 extracted the mapping table to reference/router-rules.md;
  // assert against the combined SKILL + reference surface.
  const md = readRouterSurface();
  // The mapping table rows look like:  | `S` | `fast` (short-circuited) | …
  // Match each row in the canonical-mapping table by anchoring on the
  // bucket→path pair anywhere in the document.
  assert.match(md, /\|\s*`S`\s*\|\s*`fast`/, 'S must map to fast (short-circuited) — SKILL + reference/router-rules.md');
  assert.match(md, /\|\s*`M`\s*\|\s*`fast`/, 'M must map to fast — SKILL + reference/router-rules.md');
  assert.match(md, /\|\s*`L`\s*\|\s*`quick`/, 'L must map to quick — SKILL + reference/router-rules.md');
  assert.match(md, /\|\s*`XL`\s*\|\s*`full`/, 'XL must map to full — SKILL + reference/router-rules.md');
});

test('25-09 router: bucket assignment lists /gdd:help in S', () => {
  // Phase 28.5-06 extracted bucket-assignment table to reference/router-rules.md.
  const md = readRouterSurface();
  // Find the row that mentions /gdd:help and confirm it tags as S.
  const helpLine = md.split('\n').find((l) => l.includes('/gdd:help'));
  assert.ok(helpLine, 'router heuristic table (SKILL + reference/router-rules.md) must reference /gdd:help');
  assert.match(helpLine, /`S`/, '/gdd:help must be assigned complexity_class S');
});

test('25-09 router: bucket assignment lists /gdd:scan in M', () => {
  const md = readRouterSurface();
  const scanLine = md.split('\n').find((l) => l.includes('/gdd:scan'));
  assert.ok(scanLine, 'router heuristic table (SKILL + reference/router-rules.md) must reference /gdd:scan');
  assert.match(scanLine, /`M`/, '/gdd:scan must be assigned complexity_class M');
});

test('25-09 router: bucket assignment lists /gdd:plan in L', () => {
  const md = readRouterSurface();
  // The L-row mentions standalone /gdd:plan / /gdd:verify / /gdd:explore /
  // /gdd:discover. Match the line that calls out /gdd:plan in the L bucket.
  const planLine = md
    .split('\n')
    .find((l) => /standalone[^|]*\/gdd:plan/.test(l) || (/\/gdd:plan/.test(l) && /`L`/.test(l)));
  assert.ok(planLine, 'router heuristic table (SKILL + reference/router-rules.md) must reference standalone /gdd:plan');
  assert.match(planLine, /`L`/, 'standalone /gdd:plan must be assigned complexity_class L');
});

test('25-09 router: bucket assignment lists /gdd:next in XL', () => {
  const md = readRouterSurface();
  const nextLine = md.split('\n').find((l) => l.includes('/gdd:next'));
  assert.ok(nextLine, 'router heuristic table (SKILL + reference/router-rules.md) must reference /gdd:next');
  assert.match(nextLine, /`XL`/, '/gdd:next must be assigned complexity_class XL');
});

test('25-09 router: S-class short-circuit is documented', () => {
  // SKILL.md retains a one-line summary mentioning the short-circuit;
  // the verbatim details live in the reference. Read the combined
  // surface to accept either source.
  const md = readRouterSurface();
  // D-04 / D-05: S-class short-circuits the router itself + skips
  // cache-manager + skips telemetry write. Document-level assertion that
  // the short-circuit semantics are captured (downstream consumers and
  // budget-enforcer rely on this convention being recorded).
  assert.match(
    md,
    /short-circuit/i,
    'router SKILL.md (or reference/router-rules.md) must document the S-class short-circuit behavior',
  );
});
