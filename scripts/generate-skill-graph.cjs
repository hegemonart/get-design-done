#!/usr/bin/env node
'use strict';
/**
 * scripts/generate-skill-graph.cjs — Phase 50 (Authoring Contract v3) skill-graph generator.
 *
 * Reads the skill SoT (scripts/lib/manifest/skills.json) and emits reference/skill-graph.md: a
 * mermaid flowchart of every skill plus its composition edges (composes_with -> solid arrow,
 * next_skills -> dotted arrow). Skills are grouped into mermaid subgraphs by an inferred lifecycle
 * stage (intake -> explore -> decide -> build -> verify -> operate), with everything that does not
 * match a stage keyword grouped under "utility". Stage inference is a deterministic keyword map; it
 * is best-effort ("where inferable") and never throws.
 *
 * Maintainer-only tooling (NOT shipped). The mermaid block is fenced, so reference prose lint and
 * markdownlint treat it as a code block.
 *
 * Modes:
 *   (no flag)   regenerate reference/skill-graph.md from skills.json.
 *   --check     regenerate into memory and compare to the committed file; exit 1 on drift (CI gate).
 *   --help      usage.
 *
 * Idempotent: running with no flag twice produces a byte-identical file; --check after a no-flag
 * run is always OK.
 *
 * Exit codes: 0 ok / 1 drift (--check) / 2 error.
 *
 * Exports (for tests):
 *   render(skills) -> string            full skill-graph.md content.
 *   inferStage(skill) -> string         the lifecycle stage id for one skill.
 *   buildSections(skills) -> Map        stage id -> sorted skill names.
 *   main(argv) -> exit code (pure — does NOT call process.exit).
 */

const fs = require('fs');
const path = require('path');
const { edgesForRecord } = require('./validate-composition-graph.cjs');

const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(ROOT, 'reference', 'skill-graph.md');
const SKILLS_JSON = path.join(ROOT, 'scripts', 'lib', 'manifest', 'skills.json');

// Lifecycle stages in pipeline order. `id` is the mermaid subgraph id (no spaces); `label` is the
// human title; `match` is an explicit name set OR a predicate over the skill name. Stage assignment
// picks the FIRST stage (in this array order) whose matcher accepts the skill, so order encodes
// precedence. Anything unmatched lands in `utility`.
const STAGES = [
  { id: 'intake', label: 'Intake', names: ['new-project', 'new-cycle', 'brief', 'discover', 'start'] },
  { id: 'explore', label: 'Explore', names: ['explore', 'sketch', 'sketch-wrap-up', 'spike', 'spike-wrap-up', 'benchmark', 'compare', 'map'] },
  { id: 'decide', label: 'Decide', names: ['discuss', 'plan', 'review-decisions', 'unlock-decision', 'list-assumptions'] },
  { id: 'build', label: 'Build', names: ['design', 'do', 'bootstrap-ds', 'darkmode', 'migrate', 'optimize', 'figma-write', 'export', 'codemod'] },
  { id: 'verify', label: 'Verify', names: ['verify', 'audit', 'quality-gate', 'scan', 'review-backlog', 'complete-cycle', 'turn-closeout'] },
  { id: 'operate', label: 'Operate', names: ['report-issue', 'rollout-status', 'roi', 'live', 'watch-authorities', 'rollout'] },
];
const STAGE_BY_ID = new Map(STAGES.map((s) => [s.id, s]));
const UTILITY = { id: 'utility', label: 'Utility' };

/** The lifecycle stage id for one skill, or 'utility' when no stage keyword matches. */
function inferStage(skill) {
  const name = skill && skill.name ? skill.name : '';
  for (const stage of STAGES) {
    if (stage.names.includes(name)) return stage.id;
  }
  return UTILITY.id;
}

/**
 * Group skill names by inferred stage. Returns a Map keyed in pipeline order (intake..operate, then
 * utility), each value a name[] sorted ascending. Empty stages are dropped so the diagram only shows
 * stages that actually contain skills.
 *
 * @param {Array<{name:string}>} skills
 * @returns {Map<string, string[]>}
 */
function buildSections(skills) {
  const buckets = new Map();
  for (const stage of STAGES) buckets.set(stage.id, []);
  buckets.set(UTILITY.id, []);
  for (const s of skills || []) {
    if (!s || !s.name) continue;
    buckets.get(inferStage(s)).push(s.name);
  }
  const out = new Map();
  for (const [id, names] of buckets) {
    if (!names.length) continue;
    out.set(id, names.slice().sort((a, b) => a.localeCompare(b)));
  }
  return out;
}

/** A mermaid-safe node id for a skill name (alnum + underscore). */
function nodeId(name) {
  return 'n_' + String(name).replace(/[^A-Za-z0-9]/g, '_');
}

/** Collect every composition edge as {from, to, kind} where kind is 'composes' or 'next'. */
function collectEdges(skills) {
  const edges = [];
  for (const s of skills || []) {
    if (!s || !s.name) continue;
    const e = edgesForRecord(s);
    for (const to of e.composes_with) edges.push({ from: s.name, to, kind: 'composes' });
    for (const to of e.next_skills) edges.push({ from: s.name, to, kind: 'next' });
  }
  edges.sort(
    (a, b) => a.from.localeCompare(b.from) || a.kind.localeCompare(b.kind) || a.to.localeCompare(b.to),
  );
  return edges;
}

/** Render the full reference/skill-graph.md content from the skill records. Deterministic. */
function render(skills) {
  const sections = buildSections(skills);
  const edges = collectEdges(skills);

  const mermaid = ['```mermaid', 'flowchart TD'];
  for (const [id, names] of sections) {
    const stage = STAGE_BY_ID.get(id) || UTILITY;
    mermaid.push(`  subgraph ${id}["${stage.label}"]`);
    for (const name of names) {
      mermaid.push(`    ${nodeId(name)}["${name}"]`);
    }
    mermaid.push('  end');
  }
  if (edges.length) {
    mermaid.push('');
    for (const e of edges) {
      const arrow = e.kind === 'composes' ? '-->' : '-.->';
      mermaid.push(`  ${nodeId(e.from)} ${arrow} ${nodeId(e.to)}`);
    }
  }
  mermaid.push('```');

  const totalSkills = (skills || []).filter((s) => s && s.name).length;
  const composesCount = edges.filter((e) => e.kind === 'composes').length;
  const nextCount = edges.filter((e) => e.kind === 'next').length;

  const lines = [
    '# Skill Composition Graph',
    '',
    '> GENERATED FILE. Do not edit by hand. Source: scripts/lib/manifest/skills.json.',
    '> Regenerate: `node scripts/generate-skill-graph.cjs`; CI drift-gates it with `--check`.',
    '',
    'This graph visualizes every skill grouped by inferred lifecycle stage, plus the skill',
    'composition edges declared in v3 frontmatter (see skill-authoring-contract.md). A solid arrow',
    'is a `composes_with` edge (the source calls the target as sub-orchestration); a dotted arrow is',
    'a `next_skills` edge (a pipeline hint for what runs next). Stage grouping is best-effort and',
    'inferred from the skill name; skills with no stage keyword fall under Utility.',
    '',
    `Skills: ${totalSkills}. Composition edges: ${composesCount} composes_with, ${nextCount} next_skills.`,
    '',
    ...mermaid,
    '',
  ];
  return lines.join('\n');
}

function readSkills() {
  const json = JSON.parse(fs.readFileSync(SKILLS_JSON, 'utf8'));
  return Array.isArray(json.skills) ? json.skills : [];
}

function printHelp(out) {
  out.write(
    [
      'generate-skill-graph.cjs — Phase 50 skill-graph generator',
      '',
      'Emits reference/skill-graph.md (a mermaid flowchart of skills + composition edges) from',
      'scripts/lib/manifest/skills.json.',
      '',
      'Usage: node scripts/generate-skill-graph.cjs [--check] [--help]',
      '',
      'Modes: (no flag) regenerate · --check exit 1 on drift (CI gate).',
      '',
    ].join('\n'),
  );
}

function main(argv) {
  const args = argv.slice(2);
  const out = process.stdout;
  const err = process.stderr;
  let check = false;
  for (const a of args) {
    if (a === '--check') check = true;
    else if (a === '--help' || a === '-h') { printHelp(out); return 0; }
    else { err.write(`generate-skill-graph: unknown flag: ${a}\n`); return 2; }
  }

  let skills;
  try {
    skills = readSkills();
  } catch (e) {
    err.write(`generate-skill-graph: cannot read skills.json (${e && e.message ? e.message : e})\n`);
    return 2;
  }

  const generated = render(skills);

  if (check) {
    const current = fs.existsSync(OUT) ? fs.readFileSync(OUT, 'utf8').replace(/\r\n/g, '\n') : '';
    if (current !== generated) {
      err.write('generate-skill-graph --check: reference/skill-graph.md is stale. Run `node scripts/generate-skill-graph.cjs`.\n');
      return 1;
    }
    out.write('generate-skill-graph --check: OK — reference/skill-graph.md matches skills.json.\n');
    return 0;
  }

  fs.writeFileSync(OUT, generated);
  out.write(`generate-skill-graph: wrote reference/skill-graph.md (${generated.split('\n').length} lines)\n`);
  return 0;
}

if (require.main === module) process.exit(main(process.argv));

module.exports = { render, inferStage, buildSections, collectEdges, nodeId, main };
