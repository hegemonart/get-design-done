'use strict';
// Phase 50 (Authoring Contract v3) — CONTRACT-v3 + COMPOSITION unit.
//
// Covers the three new SoT-driven scripts plus the schema documentation:
//   1. validate-skill-frontmatter.cjs — findClusters flags a synthetic 3-share opening AND a
//      3-share Use-when cluster, and passes the real (cluster-free) corpus.
//   2. validate-composition-graph.cjs — buildGraph/findCycles detect a synthetic cycle,
//      findDangling detects a dangling ref, edges parse from both native fields and
//      extra_frontmatter passthrough, and the real (edge-free) corpus is a valid DAG.
//   3. generate-skill-graph.cjs --check passes against the committed reference/skill-graph.md.
//   4. scripts/lib/manifest/schemas/skills.schema.json documents composes_with + next_skills.
//
// Pure: reads the live SoT + reference file via fs; no fixtures, no spawning beyond the
// in-process --check path which only reads files.

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '../..');
const SKILLS_JSON = path.join(ROOT, 'scripts/lib/manifest/skills.json');
const SCHEMA = path.join(ROOT, 'scripts/lib/manifest/schemas/skills.schema.json');

const vf = require('../../scripts/validate-skill-frontmatter.cjs');
const vc = require('../../scripts/validate-composition-graph.cjs');
const gg = require('../../scripts/generate-skill-graph.cjs');

const readJ = (p) => JSON.parse(fs.readFileSync(p, 'utf8'));
const realSkills = () => readJ(SKILLS_JSON).skills;

// --------------------------------------------------------------------------
// 1. validate-skill-frontmatter.cjs — boilerplate-cohort lint
// --------------------------------------------------------------------------

test('50-comp-01: findClusters flags a synthetic 3-share opening-sentence cluster', () => {
  const synthetic = [
    { name: 'a', description: 'Does a thing. Use when alpha happens.' },
    { name: 'b', description: 'Does a thing. Use when beta happens.' },
    { name: 'c', description: 'Does a thing. Use when gamma happens.' },
    { name: 'd', description: 'Something else entirely. Use when delta happens.' },
  ];
  const { opening } = vf.findClusters(synthetic, vf.CLUSTER_THRESHOLD);
  assert.equal(opening.length, 1, 'exactly one opening-sentence cluster');
  assert.deepEqual(opening[0].skills, ['a', 'b', 'c']);
  assert.match(opening[0].clause, /does a thing/);
});

test('50-comp-02: findClusters flags a synthetic 3-share Use-when cluster', () => {
  const synthetic = [
    { name: 'a', description: 'First distinct opener. Use when the user asks to score.' },
    { name: 'b', description: 'Second distinct opener. Use when the user asks to score.' },
    { name: 'c', description: 'Third distinct opener. Use when the user asks to score.' },
  ];
  const { opening, useWhen } = vf.findClusters(synthetic, vf.CLUSTER_THRESHOLD);
  assert.equal(opening.length, 0, 'openers are distinct — no opening cluster');
  assert.equal(useWhen.length, 1, 'one shared Use-when cluster');
  assert.deepEqual(useWhen[0].skills, ['a', 'b', 'c']);
  assert.match(useWhen[0].clause, /use when the user asks to score/);
});

test('50-comp-03: a 2-share cohort stays under the threshold (no false positive)', () => {
  const synthetic = [
    { name: 'a', description: 'Shared opener. Use when x.' },
    { name: 'b', description: 'Shared opener. Use when y.' },
  ];
  const { opening } = vf.findClusters(synthetic, vf.CLUSTER_THRESHOLD);
  assert.equal(opening.length, 0);
});

test('50-comp-04: clustering is case- and whitespace-insensitive', () => {
  const synthetic = [
    { name: 'a', description: 'Render  the chart. Use when asked.' },
    { name: 'b', description: 'render the chart. Use when asked.' },
    { name: 'c', description: 'RENDER THE CHART. Use when asked.' },
  ];
  const { opening } = vf.findClusters(synthetic, vf.CLUSTER_THRESHOLD);
  assert.equal(opening.length, 1, 'casing/spacing variants collapse into one cluster');
  assert.equal(opening[0].skills.length, 3);
});

test('50-comp-05: useWhenClause returns null when no Use-when sentence is present', () => {
  assert.equal(vf.useWhenClause('Just a bare description with no trigger sentence.'), null);
  assert.match(vf.useWhenClause('Foo. Use when bar baz. Activates for x.'), /use when bar baz/);
});

test('50-comp-06: the real corpus has ZERO opening + Use-when clusters at threshold 3', () => {
  const { opening, useWhen } = vf.findClusters(realSkills(), vf.CLUSTER_THRESHOLD);
  assert.equal(opening.length, 0, `unexpected opening clusters: ${JSON.stringify(opening)}`);
  assert.equal(useWhen.length, 0, `unexpected Use-when clusters: ${JSON.stringify(useWhen)}`);
});

test('50-comp-07: validate-skill-frontmatter main() exits 0 on the real corpus', () => {
  // Suppress stdout chatter during the run.
  const orig = process.stdout.write;
  process.stdout.write = () => true;
  let code;
  try {
    code = vf.main(['node', 'validate-skill-frontmatter.cjs']);
  } finally {
    process.stdout.write = orig;
  }
  assert.equal(code, 0);
});

// --------------------------------------------------------------------------
// 2. validate-composition-graph.cjs — composition DAG gate
// --------------------------------------------------------------------------

test('50-comp-08: buildGraph + findCycles detect a synthetic cycle', () => {
  const synthetic = [
    { name: 'a', composes_with: ['b'] },
    { name: 'b', composes_with: ['c'] },
    { name: 'c', composes_with: ['a'] },
  ];
  const graph = vc.buildGraph(synthetic);
  const cycles = vc.findCycles(graph);
  assert.equal(cycles.length, 1, 'one cycle detected');
  // The reported path closes the loop (first node repeated at the end).
  assert.equal(cycles[0][0], cycles[0][cycles[0].length - 1]);
  assert.deepEqual(new Set(cycles[0].slice(0, -1)), new Set(['a', 'b', 'c']));
});

test('50-comp-09: findDangling detects an edge to a non-existent skill', () => {
  const synthetic = [
    { name: 'a', composes_with: ['ghost'] },
    { name: 'b', next_skills: ['a'] },
  ];
  const dangling = vc.findDangling(synthetic);
  assert.equal(dangling.length, 1);
  assert.deepEqual(dangling[0], { from: 'a', to: 'ghost', field: 'composes_with' });
});

test('50-comp-10: edges parse from BOTH native fields and extra_frontmatter passthrough', () => {
  // inline flow form
  const inline = vc.edgesForRecord({
    name: 'a',
    extra_frontmatter: ['composes_with: [scan, audit]', 'color: amber'],
  });
  assert.deepEqual(inline.composes_with, ['scan', 'audit']);
  // block sequence form
  const block = vc.edgesForRecord({
    name: 'b',
    extra_frontmatter: ['next_skills:', '  - reflect', '  - report-issue', 'model: inherit'],
  });
  assert.deepEqual(block.next_skills, ['reflect', 'report-issue']);
  // native field union with passthrough, de-duplicated, first-seen order
  const merged = vc.edgesForRecord({
    name: 'c',
    composes_with: ['scan'],
    extra_frontmatter: ['composes_with: [scan, plan]'],
  });
  assert.deepEqual(merged.composes_with, ['scan', 'plan']);
});

test('50-comp-11: a valid synthetic DAG has no cycles and no dangling refs', () => {
  const synthetic = [
    { name: 'a', composes_with: ['b'], next_skills: ['c'] },
    { name: 'b', composes_with: ['c'] },
    { name: 'c' },
  ];
  const graph = vc.buildGraph(synthetic);
  assert.equal(vc.findCycles(graph).length, 0);
  assert.equal(vc.findDangling(synthetic).length, 0);
});

test('50-comp-12: the real corpus is a valid DAG (acyclic, no dangling refs)', () => {
  const skills = realSkills();
  const graph = vc.buildGraph(skills);
  const edgeCount = [...graph.edges.values()].reduce((n, t) => n + t.length, 0);
  // v1.50.1 seeded the pipeline next_skills chain (new-project -> brief -> explore
  // -> plan -> design -> verify -> ship). The corpus is no longer edge-free; the
  // load-bearing contract is that it stays acyclic with no dangling references.
  assert.ok(edgeCount >= 6, `real corpus carries the seeded pipeline edges (got ${edgeCount})`);
  assert.equal(vc.findCycles(graph).length, 0, 'composition graph must be acyclic');
  assert.equal(vc.findDangling(skills).length, 0, 'no composition edge may point at a missing skill');
});

test('50-comp-13: validate-composition-graph main() exits 0 on the real corpus', () => {
  const orig = process.stdout.write;
  process.stdout.write = () => true;
  let code;
  try {
    code = vc.main(['node', 'validate-composition-graph.cjs']);
  } finally {
    process.stdout.write = orig;
  }
  assert.equal(code, 0);
});

// --------------------------------------------------------------------------
// 3. generate-skill-graph.cjs --check drift gate
// --------------------------------------------------------------------------

test('50-comp-14: generate-skill-graph --check passes against the committed reference', () => {
  const orig = process.stdout.write;
  const origErr = process.stderr.write;
  process.stdout.write = () => true;
  process.stderr.write = () => true;
  let code;
  try {
    code = gg.main(['node', 'generate-skill-graph.cjs', '--check']);
  } finally {
    process.stdout.write = orig;
    process.stderr.write = origErr;
  }
  assert.equal(code, 0, 'committed reference/skill-graph.md must match the generator output');
});

test('50-comp-15: render() is idempotent and groups every skill into a stage subgraph', () => {
  const skills = realSkills();
  const a = gg.render(skills);
  const b = gg.render(skills);
  assert.equal(a, b, 'render is a pure fixed point');
  // Every skill name appears as a mermaid node label.
  for (const s of skills) {
    assert.ok(a.includes(`["${s.name}"]`), `missing node for ${s.name}`);
  }
  assert.ok(a.includes('```mermaid'), 'fenced mermaid block present');
  assert.ok(a.includes('flowchart TD'), 'mermaid flowchart declared');
});

// --------------------------------------------------------------------------
// 4. schema documents composes_with + next_skills
// --------------------------------------------------------------------------

test('50-comp-16: skills.schema.json documents composes_with + next_skills as string arrays', () => {
  const schema = readJ(SCHEMA);
  const props = schema.properties.skills.items.properties;
  for (const field of ['composes_with', 'next_skills']) {
    assert.ok(props[field], `${field} must be a documented property`);
    assert.equal(props[field].type, 'array', `${field} is an array`);
    assert.equal(props[field].items.type, 'string', `${field} items are strings`);
    assert.ok(props[field].description && props[field].description.length > 0, `${field} documented`);
  }
  // additionalProperties stays true so passthrough authoring keeps working.
  assert.equal(schema.properties.skills.items.additionalProperties, true);
});
