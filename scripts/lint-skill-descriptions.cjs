#!/usr/bin/env node
'use strict';
/**
 * scripts/lint-skill-descriptions.cjs — Phase 32 Plan 09 (D-02) description-drift detector.
 *
 * MAINTAINER SCRIPT — NOT shipped to npm. Stays in scripts/. CI-usable.
 *
 * For each skills/*'/'SKILL.md, use git history to find the commit at which the
 * frontmatter `description:` line last changed, then count how many commits
 * changed the skill BODY *after* that point. FLAG a skill when its description
 * is stale while the body changed >= 3 times since the description last changed
 * (the D-02 heuristic) — a signal the one-line description may no longer reflect
 * a repeatedly-reworked body.
 *
 *   descriptionChangedAt = most-recent commit touching the `description:` line
 *                          (falls back to the file's FIRST/creation commit when
 *                          the description was never explicitly changed).
 *   bodyChangesSince     = count of commits NEWER than descriptionChangedAt that
 *                          touched the file but NOT its description line.
 *   FLAG iff bodyChangesSince >= threshold (default 3).
 *     - exactly 2 -> NOT flagged (boundary); exactly 3 -> flagged.
 *     - description changed after the last body change -> since 0 -> not flagged.
 *     - single-commit file -> since 0 -> not flagged.
 *
 * SEAMABLE GIT BOUNDARY (so tests need no crafted commits):
 *   - analyzeDrift(records, {threshold})            — pure threshold core.
 *   - collectRecords({git, skills, skillsDir})      — adapter; `git` is an
 *       injectable function (skill -> `git log -p --follow` text). Default shells
 *       real git. Tests pass a stub returning canned log output.
 *   main() wires real git -> collectRecords -> analyzeDrift -> print + exit.
 *
 * Exit codes (CI-usable):
 *   0  no skill flagged (clean)
 *   1  >= 1 skill flagged (prints each flagged skill + its body-change count)
 *   2  usage / internal error
 *
 * Env:
 *   SKILLS_DIR=<path>     Override skills directory (default: ./skills).
 *   LINT_SELFTEST=clean   Force an in-memory all-in-sync record set (CLI smoke).
 *   LINT_SELFTEST=drift   Force a record set with one drifted skill (CLI smoke).
 */

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const DEFAULT_THRESHOLD = 3;
const COMMIT_MARKER = '__COMMIT__';

/**
 * Pure threshold core. Flags any record whose bodyChangesSince meets the
 * threshold. Records: [{ skill, bodyChangesSince, descriptionChangedAt? }].
 */
function analyzeDrift(records, { threshold = DEFAULT_THRESHOLD } = {}) {
  const flagged = [];
  const clean = [];
  for (const r of records) {
    if (typeof r.bodyChangesSince === 'number' && r.bodyChangesSince >= threshold) {
      flagged.push(r);
    } else {
      clean.push(r);
    }
  }
  return { flagged, clean };
}

/**
 * Does a single diff line touch the frontmatter `description:` field?
 * Matches added/removed lines like `+description: "..."` or `-  description: x`.
 * (Not `+++ b/file` / `--- a/file` header lines — those start with `+++`/`---`.)
 */
function isDescriptionDiffLine(line) {
  if (line.startsWith('+++') || line.startsWith('---')) return false;
  if (line[0] !== '+' && line[0] !== '-') return false;
  return /^[+-]\s*description\s*:/.test(line);
}

/**
 * Parse `git log -p --follow --format=__COMMIT__%H` output into per-commit
 * records, NEWEST first. Each commit is classified:
 *   kind 'desc' if any diff line touches the description: field, else 'body'.
 * Returns [{ hash, kind }] newest-first.
 */
function parseLog(logText) {
  const commits = [];
  let current = null;
  const lines = String(logText).split(/\r?\n/);
  for (const line of lines) {
    if (line.startsWith(COMMIT_MARKER)) {
      if (current) commits.push(current);
      current = { hash: line.slice(COMMIT_MARKER.length).trim(), kind: 'body' };
      continue;
    }
    if (!current) continue;
    if (isDescriptionDiffLine(line)) current.kind = 'desc';
  }
  if (current) commits.push(current);
  return commits;
}

/**
 * Derive a single skill's record from its parsed (newest-first) commit list.
 *   descriptionChangedAt = newest commit with kind 'desc'; if none, the OLDEST
 *     (creation) commit — a never-changed description anchors at file birth.
 *   bodyChangesSince     = body commits strictly NEWER (earlier in the list)
 *     than descriptionChangedAt.
 */
function recordFromCommits(skill, commits) {
  if (!commits.length) {
    return { skill, descriptionChangedAt: null, bodyChangesSince: 0 };
  }
  const oldest = commits[commits.length - 1];
  let descIdx = commits.findIndex((c) => c.kind === 'desc');
  let descriptionChangedAt;
  if (descIdx === -1) {
    // Description never explicitly changed -> anchor at creation (oldest).
    descIdx = commits.length - 1;
    descriptionChangedAt = oldest.hash;
  } else {
    descriptionChangedAt = commits[descIdx].hash;
  }
  // Body commits newer than the anchor = indices [0, descIdx) that are 'body'.
  let bodyChangesSince = 0;
  for (let i = 0; i < descIdx; i++) {
    if (commits[i].kind === 'body') bodyChangesSince++;
  }
  return { skill, descriptionChangedAt, bodyChangesSince };
}

/** Default git boundary: shells `git log -p --follow` for one skill's SKILL.md. */
function defaultGitLog(skill, { skillsDir }) {
  const file = path.join(skillsDir, skill, 'SKILL.md');
  return execFileSync(
    'git',
    ['log', '-p', '--follow', `--format=${COMMIT_MARKER}%H`, '--', file],
    { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }
  );
}

/**
 * Seamable adapter. For each skill, call git(skill, ctx) to get log text, parse
 * it, and derive the record. `git` is injectable; default shells real git.
 *   - skills: explicit skill-name list (tests pass this).
 *   - skillsDir: used by the default git boundary + to discover skills when
 *     `skills` is omitted.
 */
function collectRecords({ git = defaultGitLog, skills, skillsDir } = {}) {
  const dir = skillsDir || path.join(process.cwd(), 'skills');
  const names = skills || discoverSkills(dir);
  const records = [];
  for (const skill of names) {
    const logText = git(skill, { skillsDir: dir });
    const commits = parseLog(logText);
    records.push(recordFromCommits(skill, commits));
  }
  return records;
}

/** Discover skill folders that contain a SKILL.md (sorted, deterministic). */
function discoverSkills(skillsDir) {
  if (!fs.existsSync(skillsDir)) return [];
  const out = [];
  for (const entry of fs.readdirSync(skillsDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    if (fs.existsSync(path.join(skillsDir, entry.name, 'SKILL.md'))) out.push(entry.name);
  }
  return out.sort((a, b) => a.localeCompare(b));
}

/** Self-test record sets so the CLI exit-code path is stubbable without git. */
function selftestRecords(mode) {
  if (mode === 'clean') {
    return [
      { skill: 'selftest-a', descriptionChangedAt: 'x', bodyChangesSince: 0 },
      { skill: 'selftest-b', descriptionChangedAt: 'y', bodyChangesSince: 2 },
    ];
  }
  if (mode === 'drift') {
    return [
      { skill: 'selftest-clean', descriptionChangedAt: 'x', bodyChangesSince: 1 },
      { skill: 'selftest-drift', descriptionChangedAt: 'z', bodyChangesSince: 3 },
    ];
  }
  return null;
}

function main() {
  const skillsDir = process.env.SKILLS_DIR || path.join(process.cwd(), 'skills');
  let records;
  const selftest = selftestRecords(process.env.LINT_SELFTEST);
  if (selftest) {
    records = selftest;
  } else {
    try {
      records = collectRecords({ skillsDir });
    } catch (e) {
      process.stderr.write(`lint-skill-descriptions: failed to read git history: ${e.message}\n`);
      process.exit(2);
      return;
    }
  }

  const { flagged } = analyzeDrift(records);
  if (flagged.length === 0) {
    process.stdout.write(`All skill descriptions in sync (${records.length} skills, threshold ${DEFAULT_THRESHOLD}).\n`);
    process.exit(0);
    return;
  }

  process.stdout.write(`Description drift detected (body changed >= ${DEFAULT_THRESHOLD}x since description last changed):\n`);
  for (const r of flagged.sort((a, b) => b.bodyChangesSince - a.bodyChangesSince)) {
    process.stdout.write(`  ${r.skill}: ${r.bodyChangesSince} body changes since description last changed\n`);
  }
  process.stdout.write(`\n${flagged.length} skill(s) flagged.\n`);
  process.exit(1);
}

if (require.main === module) main();

module.exports = {
  analyzeDrift,
  collectRecords,
  parseLog,
  recordFromCommits,
  isDescriptionDiffLine,
  discoverSkills,
  defaultGitLog,
  DEFAULT_THRESHOLD,
};
