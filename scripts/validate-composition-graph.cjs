#!/usr/bin/env node
'use strict';
/**
 * scripts/validate-composition-graph.cjs — Phase 50 (Authoring Contract v3) composition DAG gate.
 *
 * v3 introduces two optional skill-composition frontmatter fields (see
 * reference/skill-authoring-contract.md):
 *   - composes_with: [skill, ...]  — skills this one calls as sub-orchestration.
 *   - next_skills:   [skill, ...]  — pipeline hint: what naturally runs after this skill.
 *
 * Both become directed edges (this -> referenced). This validator reads the skill SoT
 * (scripts/lib/manifest/skills.json), builds the directed graph, and FAILS on either:
 *   (a) a cycle — composition must be a DAG, never recursive sub-orchestration; or
 *   (b) a dangling reference — an edge pointing at a skill name that does not exist in the SoT.
 *
 * Edge source is dual: a record may carry composes_with / next_skills as native JSON array fields
 * (managed authoring), OR those fields may live as YAML lines inside the record's
 * `extra_frontmatter` array (passthrough authoring — generate-skill-frontmatter.cjs routes any
 * non-managed key there). Both forms are collected and merged.
 *
 * The live corpus now carries composition edges (~24 directed edges across the 96-skill SoT — a
 * partial ~20% backfill of composes_with / next_skills hints), and the graph validates clean (DAG,
 * no dangling refs). The FULL backfill of composition edges and any runtime consumption of the graph
 * (pipeline-hint surfacing, sub-orchestration dispatch) are owned by a later phase (Phase 58/60).
 * This validator remains a structural guard: it arms on every edge authors wire and fails the build
 * the moment a cycle or dangling reference is introduced.
 *
 * Exit codes:
 *   0  graph is a valid DAG with no dangling references (clean).
 *   1  at least one cycle or dangling reference (blockers).
 *   2  internal error (I/O failure, parse exception, bad CLI arg).
 *
 * CLI:
 *   node scripts/validate-composition-graph.cjs            # validate the live SoT
 *   node scripts/validate-composition-graph.cjs --json     # machine-readable report
 *   node scripts/validate-composition-graph.cjs --help     # usage
 *
 * Exports (for tests):
 *   buildGraph(skills) -> { nodes: Set<string>, edges: Map<string, string[]> }
 *       edges maps each skill name to its sorted, de-duplicated outgoing targets.
 *   findCycles(graph) -> string[][]   each cycle is the node path that closes the loop.
 *   findDangling(skills) -> Array<{ from: string, to: string, field: string }>
 *   edgesForRecord(rec) -> { composes_with: string[], next_skills: string[] }
 *   main(argv) -> exit code (pure — does NOT call process.exit)
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const SKILLS_JSON = path.join(ROOT, 'scripts', 'lib', 'manifest', 'skills.json');

const EDGE_FIELDS = ['composes_with', 'next_skills'];

/** Coerce a value to an array of trimmed non-empty string names. */
function asNameList(v) {
  if (!Array.isArray(v)) return [];
  return v.map((x) => String(x).trim()).filter((x) => x.length > 0);
}

/**
 * Parse a single `key: [a, b]` (inline flow) OR a leading-key of a YAML block sequence out of an
 * extra_frontmatter line array. Supports both:
 *   composes_with: [audit, scan]
 * and the block form:
 *   composes_with:
 *     - audit
 *     - scan
 * Returns the parsed name list for `field`, or [] when the field is absent.
 */
function parseEdgeFieldFromExtra(extraLines, field) {
  if (!Array.isArray(extraLines)) return [];
  const names = [];
  for (let i = 0; i < extraLines.length; i++) {
    const line = extraLines[i];
    const m = new RegExp(`^${field}:\\s*(.*)$`).exec(line);
    if (!m) continue;
    const rest = m[1].trim();
    if (rest.startsWith('[')) {
      // inline flow sequence: [a, b, c] (tolerate a missing closing bracket)
      const inner = rest.replace(/^\[/, '').replace(/\]$/, '');
      for (const part of inner.split(',')) {
        const name = part.trim().replace(/^["']|["']$/g, '');
        if (name) names.push(name);
      }
    } else if (rest === '') {
      // block sequence: subsequent `  - name` lines until a non-item line
      for (let j = i + 1; j < extraLines.length; j++) {
        const item = /^\s*-\s*(.+?)\s*$/.exec(extraLines[j]);
        if (!item) break;
        const name = item[1].replace(/^["']|["']$/g, '').trim();
        if (name) names.push(name);
      }
    }
    // A non-array scalar after the key is ignored (not a valid edge list).
  }
  return names;
}

/**
 * Resolve the composition edges for one record, merging the native array field with any
 * extra_frontmatter passthrough form. Per-field de-duplication preserves first-seen order.
 */
function edgesForRecord(rec) {
  const out = {};
  for (const field of EDGE_FIELDS) {
    const native = asNameList(rec[field]);
    const passthrough = parseEdgeFieldFromExtra(rec.extra_frontmatter, field);
    const seen = new Set();
    const merged = [];
    for (const name of [...native, ...passthrough]) {
      if (seen.has(name)) continue;
      seen.add(name);
      merged.push(name);
    }
    out[field] = merged;
  }
  return out;
}

/**
 * Build the directed composition graph. nodes = every skill name in the SoT. edges = per-skill
 * sorted, de-duplicated union of composes_with + next_skills targets (targets may be dangling —
 * they are NOT pruned here so findDangling can report them; findCycles only walks edges into
 * known nodes).
 *
 * @param {Array<{name:string}>} skills
 * @returns {{ nodes: Set<string>, edges: Map<string, string[]> }}
 */
function buildGraph(skills) {
  const nodes = new Set();
  const edges = new Map();
  for (const s of skills || []) {
    if (!s || !s.name) continue;
    nodes.add(s.name);
  }
  for (const s of skills || []) {
    if (!s || !s.name) continue;
    const e = edgesForRecord(s);
    const targets = new Set([...e.composes_with, ...e.next_skills]);
    edges.set(s.name, [...targets].sort((a, b) => a.localeCompare(b)));
  }
  return { nodes, edges };
}

/**
 * Detect cycles via DFS with a recursion stack. Only edges into KNOWN nodes are traversed
 * (dangling edges are out of scope here — findDangling handles them). Returns one path per
 * distinct cycle found; an empty array means the graph is a DAG.
 *
 * @param {{ nodes: Set<string>, edges: Map<string, string[]> }} graph
 * @returns {string[][]}
 */
function findCycles(graph) {
  const { nodes, edges } = graph;
  const WHITE = 0;
  const GRAY = 1;
  const BLACK = 2;
  const color = new Map();
  for (const n of nodes) color.set(n, WHITE);
  const cycles = [];
  const seenCycleKeys = new Set();
  const stack = [];

  function recordCycle(closingNode) {
    const start = stack.indexOf(closingNode);
    if (start === -1) return;
    const path = stack.slice(start).concat(closingNode);
    // Canonical key: rotate the cycle (excluding the repeated tail) to its lexicographically
    // smallest rotation so the same loop discovered from different entry points dedupes.
    const ring = path.slice(0, -1);
    let best = null;
    for (let i = 0; i < ring.length; i++) {
      const rot = ring.slice(i).concat(ring.slice(0, i)).join('>');
      if (best === null || rot < best) best = rot;
    }
    if (best !== null && !seenCycleKeys.has(best)) {
      seenCycleKeys.add(best);
      cycles.push(path);
    }
  }

  function dfs(node) {
    color.set(node, GRAY);
    stack.push(node);
    for (const next of edges.get(node) || []) {
      if (!nodes.has(next)) continue; // dangling — skip (reported elsewhere)
      const c = color.get(next);
      if (c === GRAY) recordCycle(next);
      else if (c === WHITE) dfs(next);
    }
    stack.pop();
    color.set(node, BLACK);
  }

  for (const n of [...nodes].sort((a, b) => a.localeCompare(b))) {
    if (color.get(n) === WHITE) dfs(n);
  }
  return cycles;
}

/**
 * Collect every composition edge whose target is not a known skill name.
 *
 * @param {Array<{name:string}>} skills
 * @returns {Array<{ from: string, to: string, field: string }>}
 */
function findDangling(skills) {
  const known = new Set((skills || []).filter((s) => s && s.name).map((s) => s.name));
  const dangling = [];
  for (const s of skills || []) {
    if (!s || !s.name) continue;
    const e = edgesForRecord(s);
    for (const field of EDGE_FIELDS) {
      for (const to of e[field]) {
        if (!known.has(to)) dangling.push({ from: s.name, to, field });
      }
    }
  }
  dangling.sort(
    (a, b) => a.from.localeCompare(b.from) || a.field.localeCompare(b.field) || a.to.localeCompare(b.to),
  );
  return dangling;
}

function readSkills() {
  const json = JSON.parse(fs.readFileSync(SKILLS_JSON, 'utf8'));
  return Array.isArray(json.skills) ? json.skills : [];
}

function printHelp(out) {
  out.write(
    [
      'validate-composition-graph.cjs — Phase 50 composition DAG gate',
      '',
      'Reads composes_with / next_skills edges from scripts/lib/manifest/skills.json (native array',
      'fields or extra_frontmatter passthrough) and fails on a cycle or a dangling reference.',
      '',
      'Usage: node scripts/validate-composition-graph.cjs [--json] [--help]',
      '',
      'Exit codes: 0=valid DAG, 1=cycle/dangling, 2=internal error.',
      '',
    ].join('\n'),
  );
}

function main(argv) {
  const args = argv.slice(2);
  const out = process.stdout;
  const err = process.stderr;
  let json = false;
  for (const a of args) {
    if (a === '--json') json = true;
    else if (a === '--help' || a === '-h') { printHelp(out); return 0; }
    else { err.write(`validate-composition-graph: unknown flag: ${a}\n`); return 2; }
  }

  let skills;
  try {
    skills = readSkills();
  } catch (e) {
    err.write(`validate-composition-graph: cannot read skills.json (${e && e.message ? e.message : e})\n`);
    return 2;
  }

  const graph = buildGraph(skills);
  const cycles = findCycles(graph);
  const dangling = findDangling(skills);
  const edgeCount = [...graph.edges.values()].reduce((n, t) => n + t.length, 0);
  const problems = cycles.length + dangling.length;

  if (json) {
    out.write(
      JSON.stringify(
        { nodes: graph.nodes.size, edges: edgeCount, cycles, dangling, problems },
        null,
        2,
      ) + '\n',
    );
  } else {
    for (const c of cycles) out.write(`BLOCK cycle: ${c.join(' -> ')}\n`);
    for (const d of dangling) {
      out.write(`BLOCK dangling: ${d.from} --${d.field}--> ${d.to} (no such skill)\n`);
    }
    out.write(
      `validate-composition-graph: ${graph.nodes.size} skills, ${edgeCount} edge(s), ` +
        `${cycles.length} cycle(s), ${dangling.length} dangling ref(s)\n`,
    );
  }

  return problems > 0 ? 1 : 0;
}

if (require.main === module) process.exit(main(process.argv));

module.exports = {
  buildGraph,
  findCycles,
  findDangling,
  edgesForRecord,
  parseEdgeFieldFromExtra,
  main,
  EDGE_FIELDS,
};
