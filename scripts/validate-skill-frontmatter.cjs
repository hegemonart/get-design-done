#!/usr/bin/env node
'use strict';
/**
 * scripts/validate-skill-frontmatter.cjs — Phase 50 (Authoring Contract v3) boilerplate-cohort lint.
 *
 * The v3 description form is `<what>. Use when <triggers>. Activates for requests
 * involving <kw1>, <kw2>, <kw3>.` (see reference/skill-authoring-contract.md). A retrieval
 * router degrades when many skills open with the SAME boilerplate sentence or the SAME
 * "Use when ..." clause, because the discriminating signal collapses. This validator is the
 * anti-boilerplate gate: it reads the skill SoT (scripts/lib/manifest/skills.json) and FAILS
 * when N or more skills share an identical opening sentence OR an identical "Use when" clause.
 *
 * Two clause extractors per description:
 *   - opening sentence: the text up to (not including) the FIRST period.
 *   - "Use when" clause: the sentence that starts at "Use when" and runs to its terminating
 *     period. Absent on skills that have not adopted the v2/v3 trigger form yet — those skills
 *     simply do not participate in the use-when clustering.
 *
 * Comparison is case-insensitive and whitespace-collapsed, so trivial casing/spacing drift does
 * not let a real boilerplate cohort slip the gate.
 *
 * Threshold: a cluster of CLUSTER_THRESHOLD (=3) or more skills sharing a clause FAILS the run.
 * Research confirmed the live corpus has ZERO 3+ clusters, so this passes today; it is a forward
 * guard against future copy-paste authoring.
 *
 * Exit codes:
 *   0  no cluster reached the threshold (clean).
 *   1  at least one opening-sentence or use-when cluster reached the threshold (blockers).
 *   2  internal error (I/O failure, parse exception, bad CLI arg).
 *
 * CLI:
 *   node scripts/validate-skill-frontmatter.cjs            # lint the live SoT
 *   node scripts/validate-skill-frontmatter.cjs --json     # machine-readable cluster report
 *   node scripts/validate-skill-frontmatter.cjs --help     # usage
 *
 * Exports (for tests):
 *   findClusters(skills, n) -> { opening: Cluster[], useWhen: Cluster[] }
 *       where Cluster = { clause: string, skills: string[] }
 *   openingSentence(description) -> string
 *   useWhenClause(description) -> string|null
 *   main(argv) -> exit code (pure — does NOT call process.exit)
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const SKILLS_JSON = path.join(ROOT, 'scripts', 'lib', 'manifest', 'skills.json');

// A cohort of this many skills sharing one clause is a boilerplate failure.
const CLUSTER_THRESHOLD = 3;

/** Collapse whitespace + lowercase so casing / spacing drift does not split a real cluster. */
function normalize(s) {
  return String(s).replace(/\s+/g, ' ').trim().toLowerCase();
}

/**
 * The opening sentence = text up to the first period (exclusive). A description with no period
 * yields the whole (normalized) string. Empty / missing descriptions yield ''.
 */
function openingSentence(description) {
  if (!description) return '';
  const idx = description.indexOf('.');
  const head = idx === -1 ? description : description.slice(0, idx);
  return normalize(head);
}

/**
 * The "Use when ..." clause = from the literal "Use when" up to its terminating period
 * (exclusive). Case-insensitive on the "Use when" anchor. Returns null when the description has
 * no such clause (e.g. v1 descriptions that never adopted the trigger sentence).
 */
function useWhenClause(description) {
  if (!description) return null;
  const m = /\buse when\b([^.]*)/i.exec(description);
  if (!m) return null;
  return normalize(`use when ${m[1]}`);
}

/**
 * Group skills by identical opening sentence and by identical use-when clause, then keep only the
 * groups whose size is >= n. Deterministic ordering: clusters sorted by descending size then by
 * clause text; members sorted by skill name.
 *
 * @param {Array<{name:string, description?:string}>} skills
 * @param {number} n threshold (cluster size at or above which it is reported)
 * @returns {{ opening: Array<{clause:string, skills:string[]}>, useWhen: Array<{clause:string, skills:string[]}> }}
 */
function findClusters(skills, n) {
  const byOpening = new Map();
  const byUseWhen = new Map();
  for (const s of skills || []) {
    if (!s || !s.description) continue;
    const open = openingSentence(s.description);
    if (open) {
      if (!byOpening.has(open)) byOpening.set(open, []);
      byOpening.get(open).push(s.name);
    }
    const uw = useWhenClause(s.description);
    if (uw) {
      if (!byUseWhen.has(uw)) byUseWhen.set(uw, []);
      byUseWhen.get(uw).push(s.name);
    }
  }
  const collect = (map) =>
    [...map.entries()]
      .filter(([, names]) => names.length >= n)
      .map(([clause, names]) => ({ clause, skills: names.slice().sort((a, b) => a.localeCompare(b)) }))
      .sort((a, b) => b.skills.length - a.skills.length || a.clause.localeCompare(b.clause));
  return { opening: collect(byOpening), useWhen: collect(byUseWhen) };
}

function readSkills() {
  const json = JSON.parse(fs.readFileSync(SKILLS_JSON, 'utf8'));
  return Array.isArray(json.skills) ? json.skills : [];
}

function printHelp(out) {
  out.write(
    [
      'validate-skill-frontmatter.cjs — Phase 50 boilerplate-cohort lint',
      '',
      'Fails when >=3 skills in scripts/lib/manifest/skills.json share an identical opening',
      'sentence or an identical "Use when ..." clause (collapsed boilerplate hurts retrieval).',
      '',
      'Usage: node scripts/validate-skill-frontmatter.cjs [--json] [--help]',
      '',
      'Exit codes: 0=clean, 1=cluster(s) at/over threshold, 2=internal error.',
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
    else { err.write(`validate-skill-frontmatter: unknown flag: ${a}\n`); return 2; }
  }

  let skills;
  try {
    skills = readSkills();
  } catch (e) {
    err.write(`validate-skill-frontmatter: cannot read skills.json (${e && e.message ? e.message : e})\n`);
    return 2;
  }

  const clusters = findClusters(skills, CLUSTER_THRESHOLD);
  const total = clusters.opening.length + clusters.useWhen.length;

  if (json) {
    out.write(JSON.stringify({ threshold: CLUSTER_THRESHOLD, total, clusters }, null, 2) + '\n');
  } else {
    for (const c of clusters.opening) {
      out.write(`BLOCK opening-sentence shared by ${c.skills.length} skills: "${c.clause}"\n`);
      out.write(`  ${c.skills.join(', ')}\n`);
    }
    for (const c of clusters.useWhen) {
      out.write(`BLOCK use-when clause shared by ${c.skills.length} skills: "${c.clause}"\n`);
      out.write(`  ${c.skills.join(', ')}\n`);
    }
    out.write(
      `validate-skill-frontmatter: ${skills.length} skills scanned, ${total} boilerplate cluster(s) at/over threshold ${CLUSTER_THRESHOLD}\n`,
    );
  }

  return total > 0 ? 1 : 0;
}

if (require.main === module) process.exit(main(process.argv));

module.exports = { findClusters, openingSentence, useWhenClause, normalize, main, CLUSTER_THRESHOLD };
