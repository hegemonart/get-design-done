/**
 * touches-pattern-miner.cjs — auto-crystallization PROPOSALS only
 * (Plan 23-06).
 *
 * Scans archived task markdown across cycles, normalizes their
 * `Touches:` signatures, and emits a JSON proposal file when a
 * signature recurs in ≥ minTasks tasks across ≥ minCycles cycles.
 *
 * NEVER auto-applies. The reflector + `/gdd:apply-reflections`
 * pipeline consumes the proposal JSON separately and asks the user
 * before materializing anything.
 *
 * Reads:  cwd/cycleDir/cycle-{slug}/tasks/{name}.md
 *         (cycleDir defaults to .design/archive)
 * Writes: cwd/.design/learnings/touches-patterns.json
 *         (atomic via .tmp sibling + rename)
 */

'use strict';

const fs = require('node:fs');
const path = require('node:path');

const { parseTouches } = require('./touches-analyzer/index.cjs');

const DEFAULT_CYCLE_DIR = '.design/archive';
const DEFAULT_OUT_PATH = '.design/learnings/touches-patterns.json';
const DEFAULT_MIN_TASKS = 3;
const DEFAULT_MIN_CYCLES = 2;

const CYCLE_DATED_RE = /^cycle-\d{4}-\d{2}-\d{2}.*/i;
const CYCLE_SLUG_RE = /^cycle-[a-z0-9-]+$/i;

/**
 * Canonicalize a glob list into a stable signature string.
 *
 * @param {string[]} globs
 * @returns {string}
 */
function canonicalize(globs) {
  if (!Array.isArray(globs) || globs.length === 0) return '';
  const norm = globs
    .map((g) => stripCycleSlugs(String(g).replace(/\\/g, '/').toLowerCase()))
    .filter((g) => g.length > 0);
  const dedup = Array.from(new Set(norm));
  dedup.sort();
  return dedup.join(',');
}

/**
 * Replace `cycle-2026-04-01` / `cycle-foo-bar` segments with `<cycle>`.
 *
 * @param {string} normalizedPath
 * @returns {string}
 */
function stripCycleSlugs(normalizedPath) {
  return normalizedPath
    .split('/')
    .map((seg) => (CYCLE_DATED_RE.test(seg) || CYCLE_SLUG_RE.test(seg) ? '<cycle>' : seg))
    .join('/');
}

/**
 * @typedef {Object} TouchesSignature
 * @property {string} signature
 * @property {string[]} globs
 * @property {Array<{cycle: string, task: string}>} occurrences
 * @property {number} cycleCount
 * @property {number} taskCount
 */

/**
 * @typedef {Object} MinerProposal
 * @property {string} schema_version
 * @property {string} generated_at
 * @property {{minTasks: number, minCycles: number}} thresholds
 * @property {TouchesSignature[]} proposals
 */

/**
 * Walk archived cycles and tally signature occurrences.
 *
 * @param {{cwd?: string, cycleDir?: string, minTasks?: number, minCycles?: number}} [opts]
 * @returns {Promise<MinerProposal>}
 */
async function mine(opts = {}) {
  const cwd = opts.cwd ?? process.cwd();
  const cycleDir = opts.cycleDir ?? DEFAULT_CYCLE_DIR;
  const minTasks = opts.minTasks ?? DEFAULT_MIN_TASKS;
  const minCycles = opts.minCycles ?? DEFAULT_MIN_CYCLES;

  const archiveRoot = path.isAbsolute(cycleDir) ? cycleDir : path.join(cwd, cycleDir);
  /** @type {Map<string, {globs: string[], occurrences: Array<{cycle: string, task: string}>, cycleSet: Set<string>}>} */
  const byKey = new Map();

  let entries = [];
  try {
    entries = fs.readdirSync(archiveRoot, { withFileTypes: true });
  } catch {
    // Archive dir missing → empty proposal envelope.
  }

  for (const ent of entries) {
    if (!ent.isDirectory()) continue;
    if (!ent.name.toLowerCase().startsWith('cycle-')) continue;
    const cycleId = ent.name;
    const tasksDir = path.join(archiveRoot, cycleId, 'tasks');
    let taskFiles = [];
    try {
      taskFiles = fs
        .readdirSync(tasksDir, { withFileTypes: true })
        .filter((d) => d.isFile() && d.name.toLowerCase().endsWith('.md'))
        .map((d) => d.name);
    } catch {
      continue;
    }
    for (const taskName of taskFiles) {
      const taskPath = path.join(tasksDir, taskName);
      let md;
      try {
        md = fs.readFileSync(taskPath, 'utf8');
      } catch {
        continue;
      }
      const globs = parseTouches(md);
      if (globs.length === 0) continue;
      const sig = canonicalize(globs);
      if (sig.length === 0) continue;
      let bucket = byKey.get(sig);
      if (!bucket) {
        bucket = {
          globs: sig.split(','),
          occurrences: [],
          cycleSet: new Set(),
        };
        byKey.set(sig, bucket);
      }
      bucket.occurrences.push({ cycle: cycleId, task: taskName });
      bucket.cycleSet.add(cycleId);
    }
  }

  /** @type {TouchesSignature[]} */
  const proposals = [];
  for (const [signature, bucket] of byKey) {
    if (bucket.occurrences.length < minTasks) continue;
    if (bucket.cycleSet.size < minCycles) continue;
    proposals.push({
      signature,
      globs: bucket.globs,
      occurrences: bucket.occurrences.slice(),
      cycleCount: bucket.cycleSet.size,
      taskCount: bucket.occurrences.length,
    });
  }
  proposals.sort((a, b) => {
    if (a.taskCount !== b.taskCount) return b.taskCount - a.taskCount;
    return a.signature < b.signature ? -1 : a.signature > b.signature ? 1 : 0;
  });

  return {
    schema_version: '1.0.0',
    generated_at: new Date().toISOString(),
    thresholds: { minTasks, minCycles },
    proposals,
  };
}

/**
 * Atomic write of the proposal envelope. Returns the absolute path
 * written.
 *
 * @param {MinerProposal} proposal
 * @param {{cwd?: string, outPath?: string}} [opts]
 * @returns {string}
 */
function writeProposals(proposal, opts = {}) {
  const cwd = opts.cwd ?? process.cwd();
  const outRel = opts.outPath ?? DEFAULT_OUT_PATH;
  const out = path.isAbsolute(outRel) ? outRel : path.join(cwd, outRel);
  fs.mkdirSync(path.dirname(out), { recursive: true });
  const tmp = out + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(proposal, null, 2));
  fs.renameSync(tmp, out);
  return out;
}

module.exports = {
  mine,
  writeProposals,
  canonicalize,
  stripCycleSlugs,
  DEFAULT_CYCLE_DIR,
  DEFAULT_OUT_PATH,
};
