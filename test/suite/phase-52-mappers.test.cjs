'use strict';

// Phase 52 (KEYSTONE) — mapper + synthesizer migration to the typed DesignContext graph.
// Structural / prose assertions only (no agent execution): each of the 5 mappers must
// document a "## Graph fragment emission" section, cite its matching extract-<x>.mjs,
// write .design/fragments/<mapper>.json, and list that fragment in its writes: frontmatter.
// The synthesizer must cite merge-fragments.mjs + validate-design-context.cjs and emit
// .design/context-graph.json. All 6 agents must stay within their size_budget tier.
// Dual-emit is intentional (CONTEXT D4): the legacy .design/map/*.md outputs are KEPT for
// one minor, so the tests also confirm the markdown outputs are still declared.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { REPO_ROOT, readFrontmatter, countLines } = require('./helpers.ts');

const AGENTS_DIR = path.join(REPO_ROOT, 'agents');

// Mirror of TIER_LIMITS in agent-size-budget.test.cjs. Kept in sync deliberately so a
// budget regression on a non-"design-"-prefixed mapper (which that suite does not glob)
// is still caught here.
const TIER_LIMITS = {
  XXL: 700,
  XL: 500,
  LARGE: 350,
  M: 300,
  DEFAULT: 250,
  S: 150,
};

// mapper file (no extension) -> matching extractor basename the prose must cite.
const MAPPERS = {
  'token-mapper': 'extract-tokens.mjs',
  'component-taxonomy-mapper': 'extract-components.mjs',
  'motion-mapper': 'extract-motion.mjs',
  'a11y-mapper': 'extract-a11y.mjs',
  'visual-hierarchy-mapper': 'extract-visual-hierarchy.mjs',
};

const SYNTHESIZER = 'design-research-synthesizer';

function readAgent(name) {
  const filePath = path.join(AGENTS_DIR, `${name}.md`);
  return { filePath, body: fs.readFileSync(filePath, 'utf8') };
}

function writesList(name) {
  const fm = readFrontmatter(path.join(AGENTS_DIR, `${name}.md`));
  const w = fm.writes;
  if (!Array.isArray(w)) return [];
  // readFrontmatter's block-array parser keeps surrounding quotes on list items
  // (it strips only the "- " prefix), so normalize them here.
  return w.map((entry) => String(entry).trim().replace(/^['"]|['"]$/g, ''));
}

// --- Per-mapper structural assertions ---------------------------------------

for (const [mapper, extractor] of Object.entries(MAPPERS)) {
  test(`phase-52: ${mapper} documents a Graph fragment emission section`, () => {
    const { body } = readAgent(mapper);
    assert.match(
      body,
      /^##\s+Graph fragment emission\s*$/m,
      `agents/${mapper}.md: missing "## Graph fragment emission" section heading`
    );
  });

  test(`phase-52: ${mapper} cites its extractor ${extractor}`, () => {
    const { body } = readAgent(mapper);
    assert.ok(
      body.includes(`scripts/lib/design-context/${extractor}`),
      `agents/${mapper}.md: must cite scripts/lib/design-context/${extractor} (cite by name, do not reimplement)`
    );
  });

  test(`phase-52: ${mapper} writes .design/fragments/${mapper}.json in prose`, () => {
    const { body } = readAgent(mapper);
    assert.ok(
      body.includes(`.design/fragments/${mapper}.json`),
      `agents/${mapper}.md: must reference its fragment path .design/fragments/${mapper}.json`
    );
  });

  test(`phase-52: ${mapper} lists the fragment in writes: frontmatter`, () => {
    const w = writesList(mapper);
    assert.ok(
      w.includes(`.design/fragments/${mapper}.json`),
      `agents/${mapper}.md: writes: must include .design/fragments/${mapper}.json (got ${JSON.stringify(w)})`
    );
  });

  test(`phase-52: ${mapper} keeps its legacy .design/map output (dual-emit)`, () => {
    const w = writesList(mapper);
    const hasMap = w.some((p) => p.startsWith('.design/map/') && p.endsWith('.md'));
    assert.ok(
      hasMap,
      `agents/${mapper}.md: dual-emit requires keeping the .design/map/*.md output in writes: (got ${JSON.stringify(w)})`
    );
  });

  test(`phase-52: ${mapper} instructs filling summary, tags, and complexity`, () => {
    const { body } = readAgent(mapper);
    // The LLM phase must fill the three non-structural Node fields the extractor stubs.
    assert.ok(body.includes('summary'), `agents/${mapper}.md: must instruct filling node summary`);
    assert.ok(body.includes('tags'), `agents/${mapper}.md: must instruct filling node tags`);
    assert.ok(
      body.includes('complexity'),
      `agents/${mapper}.md: must instruct filling node complexity`
    );
  });

  test(`phase-52: ${mapper} points at the tag vocab for tags[]`, () => {
    const { body } = readAgent(mapper);
    assert.ok(
      body.includes('reference/design-context-tag-vocab.md'),
      `agents/${mapper}.md: tags[] must be drawn from reference/design-context-tag-vocab.md`
    );
  });

  test(`phase-52: ${mapper} cites the schema reference`, () => {
    const { body } = readAgent(mapper);
    assert.ok(
      body.includes('reference/design-context-schema.md'),
      `agents/${mapper}.md: must cite reference/design-context-schema.md for the Fragment shape`
    );
  });
}

// --- Synthesizer structural assertions --------------------------------------

test('phase-52: synthesizer cites merge-fragments.mjs', () => {
  const { body } = readAgent(SYNTHESIZER);
  assert.ok(
    body.includes('scripts/lib/design-context/merge-fragments.mjs'),
    `agents/${SYNTHESIZER}.md: must invoke scripts/lib/design-context/merge-fragments.mjs`
  );
});

test('phase-52: synthesizer cites validate-design-context.cjs and hard-blocks', () => {
  const { body } = readAgent(SYNTHESIZER);
  assert.ok(
    body.includes('scripts/validate-design-context.cjs'),
    `agents/${SYNTHESIZER}.md: must run scripts/validate-design-context.cjs`
  );
  assert.match(
    body,
    /hard block/i,
    `agents/${SYNTHESIZER}.md: validation failure must be a documented hard block`
  );
});

test('phase-52: synthesizer emits .design/context-graph.json in prose and writes:', () => {
  const { body } = readAgent(SYNTHESIZER);
  assert.ok(
    body.includes('.design/context-graph.json'),
    `agents/${SYNTHESIZER}.md: must reference .design/context-graph.json`
  );
  const w = writesList(SYNTHESIZER);
  assert.ok(
    w.includes('.design/context-graph.json'),
    `agents/${SYNTHESIZER}.md: writes: must include .design/context-graph.json (got ${JSON.stringify(w)})`
  );
});

test('phase-52: synthesizer keeps emitting DESIGN-CONTEXT.md (dual-emit)', () => {
  const w = writesList(SYNTHESIZER);
  assert.ok(
    w.includes('.design/DESIGN-CONTEXT.md'),
    `agents/${SYNTHESIZER}.md: dual-emit requires keeping .design/DESIGN-CONTEXT.md in writes: (got ${JSON.stringify(w)})`
  );
});

test('phase-52: synthesizer derives DESIGN-CONTEXT.md from the graph', () => {
  const { body } = readAgent(SYNTHESIZER);
  // The human view is auto-derived FROM the graph, keeping the existing section structure.
  for (const section of [
    '<token_system>',
    '<component_inventory>',
    '<visual_hierarchy>',
    '<a11y_baseline>',
    '<motion_system>',
    '<decisions>',
  ]) {
    assert.ok(
      body.includes(section),
      `agents/${SYNTHESIZER}.md: derived DESIGN-CONTEXT.md must retain the ${section} section`
    );
  }
});

test('phase-52: synthesizer routes could-not-fix items to an assemble-review pass', () => {
  const { body } = readAgent(SYNTHESIZER);
  assert.match(
    body,
    /assemble-review/i,
    `agents/${SYNTHESIZER}.md: must hand could-not-fix items to an assemble-review pass`
  );
});

// --- Size-budget guard for all 6 edited agents ------------------------------

const BUDGETED = [...Object.keys(MAPPERS), SYNTHESIZER];

for (const name of BUDGETED) {
  test(`phase-52: ${name} stays within its size_budget tier`, () => {
    const filePath = path.join(AGENTS_DIR, `${name}.md`);
    const fm = readFrontmatter(filePath);
    const tier = String(fm.size_budget || 'DEFAULT').toUpperCase();
    const limit = TIER_LIMITS[tier];
    assert.ok(
      limit !== undefined,
      `agents/${name}.md: unknown size_budget tier "${tier}"`
    );
    const lineCount = countLines(filePath);
    assert.ok(
      lineCount <= limit,
      `agents/${name}.md: ${lineCount} lines exceeds ${tier} budget of ${limit}`
    );
  });
}
