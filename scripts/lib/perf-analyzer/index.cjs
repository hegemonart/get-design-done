/**
 * scripts/lib/perf-analyzer/index.cjs — Plan 27.6-01
 *
 * Telemetry reader for the Phase 27.6 perf-analyzer reflector agent.
 * Reads `.design/telemetry/costs.jsonl` (cost rows, Phase 10.1) and
 * `.design/telemetry/trajectories/<cycle>.jsonl` files (agent trace
 * lines per Phase 22).
 *
 * JSONL discipline (same as scripts/lib/event-stream/reader.ts):
 *   - One JSON object per line.
 *   - Blank lines / whitespace-only lines ignored silently.
 *   - Malformed lines tolerated — counted in skipped_count, NOT thrown.
 *
 * No external deps. Stateless. Safe to require from CommonJS callers
 * (agents, hooks, CI gates) without dragging the gdd-state MCP graph.
 */
'use strict';

const fs = require('node:fs');
const path = require('node:path');

const DEFAULT_COSTS_PATH = '.design/telemetry/costs.jsonl';
const DEFAULT_TRAJECTORIES_DIR = '.design/telemetry/trajectories';

/**
 * Resolve a path against an optional baseDir. Absolute paths win.
 * @param {string} p
 * @param {string|undefined} baseDir
 * @returns {string}
 */
function resolvePath(p, baseDir) {
  if (path.isAbsolute(p)) return p;
  if (baseDir) return path.join(baseDir, p);
  return p;
}

/**
 * Parse a JSONL file tolerantly: blank lines silently skipped,
 * malformed lines counted in skipped_count without throwing.
 *
 * @param {string} contents - raw file contents (utf-8)
 * @returns {{ rows: object[], skipped: number }}
 */
function parseJsonl(contents) {
  const rows = [];
  let skipped = 0;
  const lines = contents.split(/\r?\n/);
  for (const line of lines) {
    if (line.trim() === '') continue;
    try {
      const obj = JSON.parse(line);
      rows.push(obj);
    } catch {
      skipped += 1;
    }
  }
  return { rows, skipped };
}

/**
 * Read `.design/telemetry/costs.jsonl` (or override) into row objects.
 *
 * @param {object} [opts]
 * @param {string} [opts.path]       Override (default: DEFAULT_COSTS_PATH)
 * @param {string} [opts.sinceCycle] Drop rows with row.cycle < this string (lex)
 * @param {string} [opts.baseDir]    Resolve relative paths against this dir
 * @returns {{ rows: object[], parsed_count: number, skipped_count: number }}
 */
function loadCosts(opts) {
  const o = opts || {};
  const rawPath = o.path !== undefined ? o.path : DEFAULT_COSTS_PATH;
  const targetPath = resolvePath(rawPath, o.baseDir);

  if (!fs.existsSync(targetPath)) {
    return { rows: [], parsed_count: 0, skipped_count: 0 };
  }

  const contents = fs.readFileSync(targetPath, 'utf8');
  const { rows: parsed, skipped: skipped_count } = parseJsonl(contents);

  let rows = parsed;
  if (o.sinceCycle !== undefined) {
    const since = o.sinceCycle;
    rows = parsed.filter(
      (row) => row && typeof row.cycle === 'string' && row.cycle >= since,
    );
  }

  return { rows, parsed_count: rows.length, skipped_count };
}

/**
 * Read `.design/telemetry/trajectories/<cycle>.jsonl` files (or override
 * directory) into a per-cycle map keyed by basename-without-extension.
 *
 * @param {object} [opts]
 * @param {string} [opts.dir]     Override (default: DEFAULT_TRAJECTORIES_DIR)
 * @param {string} [opts.baseDir] Resolve relative paths against this dir
 * @returns {{ byCycle: Record<string, object[]>, files_read: number }}
 */
function loadTrajectories(opts) {
  const o = opts || {};
  const rawDir = o.dir !== undefined ? o.dir : DEFAULT_TRAJECTORIES_DIR;
  const targetDir = resolvePath(rawDir, o.baseDir);

  if (!fs.existsSync(targetDir)) {
    return { byCycle: {}, files_read: 0 };
  }

  /** @type {Record<string, object[]>} */
  const byCycle = {};
  let files_read = 0;

  const entries = fs.readdirSync(targetDir);
  for (const entry of entries) {
    if (!entry.endsWith('.jsonl')) continue;
    const filePath = path.join(targetDir, entry);
    let contents;
    try {
      contents = fs.readFileSync(filePath, 'utf8');
    } catch {
      // Permission / IO error on one file should not abort the whole read.
      continue;
    }
    const cycleSlug = path.basename(entry, '.jsonl');
    const { rows } = parseJsonl(contents);
    byCycle[cycleSlug] = rows;
    files_read += 1;
  }

  return { byCycle, files_read };
}

module.exports = {
  loadCosts,
  loadTrajectories,
  DEFAULT_COSTS_PATH,
  DEFAULT_TRAJECTORIES_DIR,
};
