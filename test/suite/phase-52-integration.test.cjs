'use strict';
/**
 * test/suite/phase-52-integration.test.cjs - Phase 52 (DesignContext graph), executor D.
 *
 * Covers the debt-crawler rewire + INTEGRATION-MAP + migrate-context surface:
 *   1. scripts/lib/design-context/integration-map.mjs render() produces an
 *      Atomic-Design layer-grouped mermaid diagram from a synthetic graph
 *      (subgraphs per tier, composes as a solid arrow, extends as a dotted
 *      arrow), and is non-fatal on an empty graph, an absent file (main()
 *      returns 0), and an undefined input.
 *   2. agents/design-debt-crawler.md documents the dual-mode graph-query path
 *      (Step 0 prefers scripts/lib/design-context-query.cjs when
 *      .design/context-graph.json exists, grep otherwise) AND retains the
 *      unchanged DEBT-CATALOG contract (output path, confidence gate, priority
 *      scoring), staying within the M (300-line) size budget.
 *   3. source/skills/migrate-context/SKILL.md frontmatter is valid (v3
 *      description form, argument-hint, tools) and the body documents the
 *      old-map -> fragments -> merge -> validate flow plus the low-confidence
 *      review gate and the one-minor deprecation banner.
 *   4. source/skills/progress/SKILL.md surfaces the context-graph coverage line
 *      (cites the design-context-query `coverage` helper + the INTEGRATION-MAP
 *      pointer) while preserving the {{command_prefix}} placeholder.
 *
 * Reads source/skills/ (the authored copy) so the suite is green BEFORE
 * `npm run build:skills` and the orchestrator-owned skills.json record. The
 * render() assertions execute the real ESM module; everything else is a
 * structural / prose assertion. Hermetic: the absent-file main() test points at
 * a path under os.tmpdir() that does not exist.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const DC_DIR = path.join(REPO_ROOT, 'scripts', 'lib', 'design-context');
const AGENTS = path.join(REPO_ROOT, 'agents');
const SRC_SKILLS = path.join(REPO_ROOT, 'source', 'skills');

const DEBT_CRAWLER = path.join(AGENTS, 'design-debt-crawler.md');
const MIGRATE_SKILL = path.join(SRC_SKILLS, 'migrate-context', 'SKILL.md');
const PROGRESS_SKILL = path.join(SRC_SKILLS, 'progress', 'SKILL.md');

function read(p) {
  return fs.readFileSync(p, 'utf8').replace(/\r\n/g, '\n');
}
function frontmatter(text) {
  const m = text.match(/^---\n([\s\S]*?)\n---/);
  return m ? m[1] : '';
}
function countBodyLines(text) {
  const lines = text.split('\n');
  if (lines[lines.length - 1] === '') lines.pop();
  return lines.length;
}
function importMap() {
  return import(pathToFileURL(path.join(DC_DIR, 'integration-map.mjs')).href);
}

// A synthetic graph exercising all four tiers + both assembly edge types.
function syntheticGraph() {
  return {
    schema_version: '52.0',
    nodes: [
      { id: 'layer:atomic', type: 'layer', name: 'Atomic', subtype: 'Atomic' },
      { id: 'layer:molecular', type: 'layer', name: 'Molecular', subtype: 'Molecular' },
      { id: 'layer:organism', type: 'layer', name: 'Organism', subtype: 'Organism' },
      { id: 'component:button', type: 'component', name: 'Button' },
      { id: 'component:input', type: 'component', name: 'Input' },
      { id: 'component:field', type: 'component', name: 'Field' },
      { id: 'component:form', type: 'component', name: 'Form' },
      { id: 'variant:button-primary', type: 'variant', name: 'primary' },
      { id: 'token:color:brand', type: 'token', name: 'brand', subtype: 'color' },
    ],
    edges: [
      // layer membership (which tier each entity sits in)
      { source: 'layer:atomic', target: 'component:button', type: 'composes', direction: 'forward', weight: 0.5 },
      { source: 'layer:atomic', target: 'component:input', type: 'composes', direction: 'forward', weight: 0.5 },
      { source: 'layer:molecular', target: 'component:field', type: 'composes', direction: 'forward', weight: 0.5 },
      { source: 'layer:organism', target: 'component:form', type: 'composes', direction: 'forward', weight: 0.5 },
      // assembly between entities
      { source: 'component:field', target: 'component:input', type: 'composes', direction: 'forward', weight: 0.8 },
      { source: 'component:form', target: 'component:field', type: 'composes', direction: 'forward', weight: 0.8 },
      { source: 'variant:button-primary', target: 'component:button', type: 'extends', direction: 'forward', weight: 0.6 },
      // a non-assembly edge that must NOT appear in the map
      { source: 'component:button', target: 'token:color:brand', type: 'uses-token', direction: 'forward', weight: 0.5 },
    ],
  };
}

// ---------------------------------------------------------------------------
// 1. integration-map.render - layer-grouped mermaid + non-fatal
// ---------------------------------------------------------------------------

test('52-int: integration-map.mjs exists and exports render + main', async () => {
  assert.ok(fs.existsSync(path.join(DC_DIR, 'integration-map.mjs')), 'integration-map.mjs present');
  const mod = await importMap();
  assert.equal(typeof mod.render, 'function', 'exports render()');
  assert.equal(typeof mod.main, 'function', 'exports main()');
});

test('52-int: render() emits a mermaid flowchart grouped by Atomic-Design tier', async () => {
  const { render } = await importMap();
  const md = render(syntheticGraph());
  assert.match(md, /```mermaid/, 'opens a fenced mermaid block');
  assert.match(md, /flowchart TD/, 'declares a flowchart');
  // One subgraph per populated tier, in Atomic-Design order.
  assert.match(md, /subgraph Atomic\b/, 'has an Atomic subgraph');
  assert.match(md, /subgraph Molecular\b/, 'has a Molecular subgraph');
  assert.match(md, /subgraph Organism\b/, 'has an Organism subgraph');
  const atomicIdx = md.indexOf('subgraph Atomic');
  const molecularIdx = md.indexOf('subgraph Molecular');
  const organismIdx = md.indexOf('subgraph Organism');
  assert.ok(atomicIdx < molecularIdx && molecularIdx < organismIdx, 'tiers render broad-to-composed');
});

test('52-int: render() draws composes as solid and extends as dotted arrows', async () => {
  const { render } = await importMap();
  const md = render(syntheticGraph());
  // composes -> solid arrow between the two component nodes. Use a literal
  // substring check (not a regex): a RegExp matching the `-->` token trips
  // CodeQL js/bad-tag-filter (it reads as an HTML-comment-end parser that
  // omits `--!>`). This is mermaid output, not HTML filtering, so a plain
  // includes() is both correct and CodeQL-clean.
  assert.ok(md.includes('-->'), 'composes edge is a solid arrow');
  // extends -> dotted "extends" arrow for the variant specialization.
  assert.match(md, /-\.\s*extends\s*\.->/, 'extends edge is a dotted "extends" arrow');
  // The non-assembly uses-token edge target must not be wired in the map body.
  assert.ok(!/uses-token/.test(md), 'uses-token edges are excluded from the map');
});

test('52-int: render() places an unlayered assembly participant in Unlayered', async () => {
  const { render } = await importMap();
  // A graph with NO layer nodes: every composes participant falls to Unlayered.
  const g = {
    schema_version: '52.0',
    nodes: [
      { id: 'component:card', type: 'component', name: 'Card' },
      { id: 'component:button', type: 'component', name: 'Button' },
    ],
    edges: [
      { source: 'component:card', target: 'component:button', type: 'composes', direction: 'forward', weight: 0.7 },
    ],
  };
  const md = render(g);
  assert.match(md, /subgraph Unlayered\b/, 'no-layer graph still renders an Unlayered bucket');
  assert.match(md, /```mermaid/, 'still produces a mermaid diagram');
});

test('52-int: render() is non-fatal on empty / undefined graphs', async () => {
  const { render } = await importMap();
  for (const empty of [{ nodes: [], edges: [] }, {}, undefined, null]) {
    const md = render(empty);
    assert.equal(typeof md, 'string', 'render returns a string');
    assert.match(md, /# Integration Map/, 'still emits the map heading');
    assert.ok(!/```mermaid/.test(md), 'no mermaid block when there is nothing to map');
    assert.ok(!/—/.test(md), 'render output is em-dash-free');
  }
});

test('52-int: main() is non-fatal (returns 0) when the graph file is absent', async () => {
  const { main } = await importMap();
  const absent = path.join(os.tmpdir(), `gdd-no-graph-${process.pid}-${Date.now()}.json`);
  const outPath = path.join(os.tmpdir(), `gdd-map-${process.pid}-${Date.now()}.md`);
  assert.ok(!fs.existsSync(absent), 'precondition: graph path does not exist');
  const code = main([absent, outPath]);
  assert.equal(code, 0, 'main() returns 0 (advisory, non-fatal) on an absent graph');
  assert.ok(!fs.existsSync(outPath), 'main() writes nothing when the graph is absent');
});

test('52-int: main() writes the map for a real graph under tmpdir', async () => {
  const { main } = await importMap();
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gdd-int-map-'));
  try {
    const graphPath = path.join(dir, 'context-graph.json');
    const outPath = path.join(dir, 'INTEGRATION-MAP.md');
    fs.writeFileSync(graphPath, JSON.stringify(syntheticGraph()), 'utf8');
    const code = main([graphPath, outPath]);
    assert.equal(code, 0, 'main() returns 0 on success');
    assert.ok(fs.existsSync(outPath), 'main() wrote the map file');
    const out = read(outPath);
    assert.match(out, /```mermaid/, 'written map carries the mermaid block');
    assert.match(out, /subgraph Atomic\b/, 'written map is tier-grouped');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// 2. design-debt-crawler - dual-mode graph path + unchanged DEBT-CATALOG contract
// ---------------------------------------------------------------------------

test('52-int: debt-crawler documents the Step 0 dual-mode graph-query path', () => {
  const text = read(DEBT_CRAWLER);
  assert.match(text, /^### Step 0: Mode selection/m, 'adds a Step 0 mode-selection section');
  // Prefers the query lib when the graph exists; greps otherwise.
  assert.match(text, /scripts\/lib\/design-context-query\.cjs/, 'cites the query library');
  assert.match(text, /\.design\/context-graph\.json/, 'keys off the context-graph path');
  assert.match(text, /\bPREFER\b/, 'states the preference order (graph first)');
  // The three cleanly-mapped classes are named as the graph-query path.
  assert.match(text, /untokenized/i, 'maps the untokenized-component class');
  assert.match(text, /anti-pattern/i, 'maps the anti-pattern class');
  assert.match(text, /complexity/i, 'maps the complexity-outlier class');
  // The query verbs the crawler invokes against the lib.
  assert.match(text, /nodes --type component/, 'queries component nodes');
  assert.match(text, /edges --type uses-token/, 'queries uses-token edges');
  assert.match(text, /nodes --type anti-pattern/, 'queries anti-pattern nodes');
  assert.match(text, /edges --type conflicts-with/, 'queries conflicts-with edges');
});

test('52-int: debt-crawler retains the unchanged DEBT-CATALOG contract', () => {
  const text = read(DEBT_CRAWLER);
  // Output path + pure-catalog contract.
  assert.match(text, /\.design\/debt\/DEBT-CATALOG\.md/, 'writes the project-scoped DEBT-CATALOG.md');
  // Confidence gate (Step 2.5) is intact.
  assert.match(text, /### Step 2\.5: Pre-Report Gate \+ confidence/, 'keeps the Step 2.5 confidence gate');
  assert.match(text, /four-question Pre-Report Gate/, 'keeps the four-question gate language');
  assert.match(text, /## Tentative/, 'keeps the Tentative low-confidence section');
  // Priority scoring (Step 3) is intact.
  assert.match(text, /priority = visible-delta × effort × prevalence/, 'keeps the priority formula');
  assert.match(text, /visible-delta/, 'keeps the visible-delta factor');
  // The /gdd:fast remediation suggestion convention survives.
  assert.match(text, /\/gdd:fast/, 'keeps the /gdd:fast remediation suggestion');
  // Terminator.
  assert.match(text, /## CRAWL COMPLETE/, 'keeps the CRAWL COMPLETE terminator');
});

test('52-int: debt-crawler dual-mode keeps the contract identical in both modes', () => {
  const text = read(DEBT_CRAWLER);
  const step0 = text.slice(text.indexOf('### Step 0'), text.indexOf('### Step 1'));
  // Step 0 must explicitly say the contract / gate / scoring are unchanged.
  assert.match(step0, /confidence/i, 'Step 0 states the confidence gate still applies');
  assert.match(step0, /priority/i, 'Step 0 states the priority scoring still applies');
  assert.match(step0, /identical in both modes/i, 'Step 0 asserts mode-parity of the contract');
});

test('52-int: debt-crawler stays within the M (300-line) size budget', () => {
  const text = read(DEBT_CRAWLER);
  assert.match(frontmatter(text), /^size_budget: M$/m, 'declares the M size budget');
  const lines = countBodyLines(text);
  assert.ok(lines <= 300, `debt-crawler is ${lines} lines; must stay within the 300-line M budget`);
});

test('52-int: debt-crawler prose is em-dash-free', () => {
  const text = read(DEBT_CRAWLER);
  assert.ok(!/—/.test(text), 'no em dashes');
  assert.ok(!/–/.test(text), 'no en dashes');
});

// ---------------------------------------------------------------------------
// 3. migrate-context SKILL.md - frontmatter + map->fragments->merge->validate flow
// ---------------------------------------------------------------------------

test('52-int: migrate-context SKILL.md exists', () => {
  assert.ok(fs.existsSync(MIGRATE_SKILL), `expected ${MIGRATE_SKILL}`);
});

test('52-int: migrate-context frontmatter is valid v3 form with required fields', () => {
  const fm = frontmatter(read(MIGRATE_SKILL));
  assert.match(fm, /^name: gdd-migrate-context$/m, 'name: gdd-migrate-context');
  assert.match(fm, /^description: ".{20,1024}"$/m, 'quoted 20..1024 description');
  assert.match(fm, /Use when /i, 'v3 "Use when" trigger sentence');
  assert.match(fm, /Activates for requests involving/i, 'v3 "Activates for" sentence');
  assert.match(fm, /^argument-hint: "\[--dry-run\]"$/m, 'argument-hint advertises --dry-run');
  assert.match(fm, /^tools: Read, Write, Bash$/m, 'tools: Read, Write, Bash');
});

test('52-int: migrate-context description stays within the 20..1024 budget', () => {
  const fm = frontmatter(read(MIGRATE_SKILL));
  const m = fm.match(/^description: "([\s\S]*?)"$/m);
  assert.ok(m, 'description present and quoted');
  const len = m[1].length;
  assert.ok(len >= 20 && len <= 1024, `description length ${len} must be within 20..1024`);
});

test('52-int: migrate-context documents the map -> fragments -> merge -> validate flow', () => {
  const text = read(MIGRATE_SKILL);
  // Reads the pre-52 flat map notes.
  assert.match(text, /\.design\/map\/\*\.md/, 'reads the old .design/map/*.md notes');
  // Runs the deterministic extractors to build fragments.
  assert.match(text, /extract-/, 'runs the extract-*.mjs passes');
  assert.match(text, /\.design\/fragments/, 'writes mapper fragments');
  // Merges with merge-fragments.mjs into the canonical graph.
  assert.match(text, /merge-fragments\.mjs/, 'merges via merge-fragments.mjs');
  assert.match(text, /\.design\/context-graph\.json/, 'targets the canonical graph');
  // Validates with validate-design-context.cjs.
  assert.match(text, /validate-design-context\.cjs/, 'validates with validate-design-context.cjs');
});

test('52-int: migrate-context flags low-confidence transforms and notes the deprecation banner', () => {
  const text = read(MIGRATE_SKILL);
  // Low-confidence items are surfaced for human review, never auto-resolved.
  assert.match(text, /could-not-fix:/, 'surfaces could-not-fix merge items');
  assert.match(text, /low-confidence/i, 'flags low-confidence transforms');
  assert.match(text, /review/i, 'routes low-confidence items to human review');
  // The one-minor deprecation banner on the old map notes.
  assert.match(text, /Deprecated:/, 'adds a deprecation banner to the old notes');
  assert.match(text, /one minor version/i, 'notes the one-minor-version read-only window');
  // --dry-run preview path.
  assert.match(text, /--dry-run/, 'documents the --dry-run preview path');
  // Terminator + placeholder.
  assert.match(text, /## MIGRATE-CONTEXT COMPLETE/, 'ends with the COMPLETE terminator');
  assert.match(text, /\{\{command_prefix\}\}/, 'preserves the {{command_prefix}} placeholder');
});

test('52-int: migrate-context body is em-dash-free and within the line cap', () => {
  const text = read(MIGRATE_SKILL);
  assert.ok(!/—/.test(text), 'no em dashes');
  assert.ok(countBodyLines(text) < 200, 'migrate-context body stays under 200 lines');
});

// ---------------------------------------------------------------------------
// 4. progress SKILL.md - context-graph coverage + INTEGRATION-MAP pointer
// ---------------------------------------------------------------------------

test('52-int: progress SKILL.md surfaces context-graph coverage + the integration map', () => {
  const text = read(PROGRESS_SKILL);
  // The new readiness line cites the coverage helper and the map pointer.
  assert.match(text, /design-context-query\.cjs/, 'cites the design-context-query helper');
  assert.match(text, /coverage/, 'cites the coverage report');
  assert.match(text, /\.design\/INTEGRATION-MAP\.md/, 'points at the INTEGRATION-MAP.md');
  assert.match(text, /\.design\/context-graph\.json/, 'keys the line off the graph existing');
  // Placeholder integrity preserved.
  assert.match(text, /\{\{command_prefix\}\}/, 'preserves the {{command_prefix}} placeholder');
});
