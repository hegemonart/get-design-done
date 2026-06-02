'use strict';
// Phase 48 — Debt crawler + debt taxonomy contract.
//
// Asserts:
//   1. agents/design-debt-crawler.md exists with the 8 required frontmatter fields
//      (incl. .design/debt/DEBT-CATALOG.md in writes) and the M size budget.
//   2. The crawler body declares PROJECT-WIDE scope: it does NOT read STATE.md
//      completed_tasks, it walks the whole tree, and it writes
//      .design/debt/DEBT-CATALOG.md. It is a pure catalog suggesting /gdd:fast.
//   3. reference/debt-categories.md enumerates the seven debt classes and the
//      priority formula (visible-delta × effort × prevalence).
//
// Read + substring asserts only — no execution.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { REPO_ROOT, readFrontmatter } = require('./helpers.ts');

const CRAWLER = path.join(REPO_ROOT, 'agents', 'design-debt-crawler.md');
const CATEGORIES = path.join(REPO_ROOT, 'reference', 'debt-categories.md');

const REQUIRED_FRONTMATTER = [
  'name',
  'description',
  'tools',
  'color',
  'parallel-safe',
  'typical-duration-seconds',
  'reads-only',
  'writes',
];

const DEBT_CLASSES = [
  'color-literal',
  'untokenized-component',
  'anti-pattern',
  'contrast',
  'density-spacing',
  'typography-drift',
  'a11y-text',
];

// ── 1. crawler agent exists ────────────────────────────────────────────────
test('phase-48-debt: design-debt-crawler.md exists', () => {
  assert.ok(
    fs.existsSync(CRAWLER),
    `expected crawler agent at ${CRAWLER}`,
  );
});

// ── 2. crawler frontmatter has the 8 required fields ───────────────────────
test('phase-48-debt: crawler frontmatter has the 8 required fields', () => {
  const fm = readFrontmatter(CRAWLER);
  for (const field of REQUIRED_FRONTMATTER) {
    assert.ok(
      field in fm && fm[field] !== '' && fm[field] !== null && fm[field] !== undefined,
      `design-debt-crawler.md: required frontmatter field "${field}" is missing or empty`,
    );
  }
});

test('phase-48-debt: crawler name matches filename', () => {
  const fm = readFrontmatter(CRAWLER);
  assert.equal(fm.name, 'design-debt-crawler');
});

test('phase-48-debt: crawler tools include the required toolset', () => {
  const fm = readFrontmatter(CRAWLER);
  const tools = String(fm.tools);
  for (const t of ['Read', 'Bash', 'Grep', 'Glob', 'Write']) {
    assert.ok(tools.includes(t), `crawler tools must include ${t} (got "${tools}")`);
  }
});

test('phase-48-debt: crawler declares the M size budget', () => {
  const fm = readFrontmatter(CRAWLER);
  assert.equal(String(fm.size_budget).toUpperCase(), 'M', 'crawler must carry size_budget: M');
});

test('phase-48-debt: crawler writes the project-scoped catalog path', () => {
  const fm = readFrontmatter(CRAWLER);
  const writes = Array.isArray(fm.writes) ? fm.writes.join(' ') : String(fm.writes);
  assert.ok(
    writes.includes('.design/debt/DEBT-CATALOG.md'),
    `crawler writes must include ".design/debt/DEBT-CATALOG.md" (got "${writes}")`,
  );
});

// ── 3. crawler body asserts PROJECT-WIDE scope ─────────────────────────────
test('phase-48-debt: crawler body declares project-wide scope (NOT cycle-scoped)', () => {
  const body = fs.readFileSync(CRAWLER, 'utf8');

  // Does NOT read STATE.md completed_tasks.
  assert.ok(
    /completed_tasks/.test(body) && /(do not read|does not read|do NOT read)/i.test(body),
    'crawler body must state it does NOT read STATE.md completed_tasks',
  );

  // Walks the whole tree.
  assert.ok(
    /(entire source tree|whole source tree|entire codebase|whole codebase|project-wide)/i.test(body),
    'crawler body must state it walks the entire source tree / whole codebase',
  );

  // Writes the project-scoped catalog.
  assert.ok(
    body.includes('.design/debt/DEBT-CATALOG.md'),
    'crawler body must reference .design/debt/DEBT-CATALOG.md',
  );
  assert.ok(
    /project-scoped/i.test(body),
    'crawler body must describe the catalog as project-scoped',
  );
});

test('phase-48-debt: crawler is a pure catalog that suggests /gdd:fast', () => {
  const body = fs.readFileSync(CRAWLER, 'utf8');
  assert.ok(/pure catalog/i.test(body), 'crawler must declare itself a pure catalog');
  assert.ok(/no auto-fix/i.test(body), 'crawler must declare no auto-fix');
  assert.ok(body.includes('/gdd:fast'), 'crawler must suggest a /gdd:fast command per finding');
});

test('phase-48-debt: crawler leans on gdd-detect for anti-pattern finding', () => {
  const body = fs.readFileSync(CRAWLER, 'utf8');
  assert.ok(body.includes('gdd-detect'), 'crawler should invoke gdd-detect for anti-pattern scanning');
});

// ── 4. debt-categories.md enumerates classes + priority formula ────────────
test('phase-48-debt: debt-categories.md exists', () => {
  assert.ok(fs.existsSync(CATEGORIES), `expected taxonomy at ${CATEGORIES}`);
});

test('phase-48-debt: debt-categories.md enumerates all seven debt classes', () => {
  const text = fs.readFileSync(CATEGORIES, 'utf8');
  for (const cls of DEBT_CLASSES) {
    assert.ok(text.includes(cls), `debt-categories.md must enumerate the "${cls}" debt class`);
  }
});

test('phase-48-debt: debt-categories.md defines the priority formula', () => {
  const text = fs.readFileSync(CATEGORIES, 'utf8');
  for (const factor of ['visible-delta', 'effort', 'prevalence']) {
    assert.ok(text.includes(factor), `priority model must name the "${factor}" factor`);
  }
  // The combine rule is a product of the three factors.
  assert.ok(
    /priority\s*=\s*visible-delta\s*[×x*]\s*effort\s*[×x*]\s*prevalence/i.test(text),
    'debt-categories.md must state priority = visible-delta × effort × prevalence',
  );
});
