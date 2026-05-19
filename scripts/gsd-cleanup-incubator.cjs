#!/usr/bin/env node
/**
 * scripts/gsd-cleanup-incubator.cjs — Phase 29 Plan 06 / CONTEXT D-06.
 *
 * Walk `.design/reflections/incubator/<slug>/`, archive slugs whose
 * newest matching `capability_gap` event is older than the TTL
 * (default P=30 days). Archive (not delete) preserves audit trail.
 * Refresh = new `capability_gap` event matching the slug's
 * `context_hash` resets the timer (because newest event timestamp
 * advances).
 *
 * Standalone — no pre-existing `gsd-cleanup` extension point exists
 * in this repo (survey: `find scripts -iname "*cleanup*"` returned
 * only `.git` log noise + a workflow doc, no actual cleanup script).
 *
 * Usage:
 *   node scripts/gsd-cleanup-incubator.cjs [--ttl-days N] [--dry-run] [--base-dir PATH]
 *
 * Library mode (for tests):
 *   const { scanIncubator, archiveSlug, DEFAULT_TTL_DAYS } = require('./gsd-cleanup-incubator.cjs');
 */

'use strict';

const fs = require('node:fs');
const path = require('node:path');

const eventChain = require('./lib/event-chain.cjs');

const DEFAULT_TTL_DAYS = 30; // CONTEXT D-06
const INCUBATOR_DIR = '.design/reflections/incubator';
const ARCHIVE_SUBDIR = 'archive';

/**
 * Tiny YAML-ish frontmatter parser. Match `---\n(.+?)\n---` (multiline,
 * non-greedy), split lines on `\n`, parse `key: value` pairs (string
 * values only, single quotes optional).
 *
 * @param {string} content
 * @returns {Record<string, string>}
 */
function parseFrontmatter(content) {
  if (typeof content !== 'string') return {};
  // Match the leading frontmatter block — must start at the very top
  // (allow a possible BOM/whitespace).
  const m = content.match(/^\s*---\r?\n([\s\S]*?)\r?\n---/);
  if (!m) return {};
  const body = m[1];
  /** @type {Record<string, string>} */
  const out = {};
  for (const line of body.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const idx = trimmed.indexOf(':');
    if (idx < 0) continue;
    const key = trimmed.slice(0, idx).trim();
    let val = trimmed.slice(idx + 1).trim();
    // Strip surrounding quotes (single or double).
    if (
      (val.startsWith("'") && val.endsWith("'")) ||
      (val.startsWith('"') && val.endsWith('"'))
    ) {
      val = val.slice(1, -1);
    }
    out[key] = val;
  }
  return out;
}

/**
 * Find the first `.md` draft file under
 * `<baseDir>/.design/reflections/incubator/<slug>/`. Returns the
 * absolute path, or `null` if the directory or any `.md` is missing.
 *
 * @param {string} baseDir
 * @param {string} slug
 * @returns {string | null}
 */
function findDraft(baseDir, slug) {
  const dir = path.join(baseDir, INCUBATOR_DIR, slug);
  if (!fs.existsSync(dir)) return null;
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return null;
  }
  const mdFiles = entries
    .filter((e) => e.isFile() && e.name.toLowerCase().endsWith('.md'))
    .map((e) => e.name)
    .sort();
  if (mdFiles.length === 0) return null;
  return path.join(dir, mdFiles[0]);
}

/**
 * Read the event chain via `event-chain.cjs.readChain` and return the
 * newest `capability_gap` event timestamp matching `contextHash`, or
 * `null` if none found. Events with invalid `ts` are silently skipped.
 *
 * Recognises both `ev.type === 'capability_gap'` (future field) and
 * `ev.outcome === 'capability_gap'` (existing Phase 22 convention).
 *
 * @param {{baseDir: string, contextHash: string}} input
 * @returns {Date | null}
 */
function computeNewestGapTimestamp(input) {
  const baseDir = input.baseDir;
  const contextHash = input.contextHash;
  let newest = null;
  for (const ev of eventChain.readChain({ baseDir })) {
    if (!isCapabilityGap(ev)) continue;
    if (ev.context_hash !== contextHash) continue;
    if (typeof ev.ts !== 'string') continue;
    const d = new Date(ev.ts);
    if (Number.isNaN(d.getTime())) continue;
    if (newest === null || d.getTime() > newest.getTime()) {
      newest = d;
    }
  }
  return newest;
}

/**
 * Recognise both the future `type` field and the existing
 * `outcome`-as-type convention used by Phase 22's event chain.
 *
 * @param {Record<string, unknown>} ev
 * @returns {boolean}
 */
function isCapabilityGap(ev) {
  return ev && (ev.type === 'capability_gap' || ev.outcome === 'capability_gap');
}

/**
 * Scan `.design/reflections/incubator/<slug>/` and return a status per
 * slug. Pure read — never mutates the filesystem.
 *
 * Status values:
 *   'kept'             — newest matching event is within TTL
 *   'would-archive'    — newest matching event is older than TTL
 *   'no-events'        — no matching `capability_gap` events for the slug
 *   'no-draft'         — slug dir has no `.md` files
 *   'no-context-hash'  — draft frontmatter missing `context_hash`
 *
 * @param {{baseDir: string, ttlDays?: number, now?: Date}} input
 * @returns {Array<{slug: string, status: string, newestEvent: Date | null, ageDays: number | null, contextHash: string | null}>}
 */
function scanIncubator(input) {
  const baseDir = input.baseDir;
  const ttlDays = typeof input.ttlDays === 'number' ? input.ttlDays : DEFAULT_TTL_DAYS;
  const now = input.now instanceof Date ? input.now : new Date();
  const incubatorRoot = path.join(baseDir, INCUBATOR_DIR);

  if (!fs.existsSync(incubatorRoot)) return [];

  let entries;
  try {
    entries = fs.readdirSync(incubatorRoot, { withFileTypes: true });
  } catch {
    return [];
  }

  /** @type {Array<{slug: string, status: string, newestEvent: Date | null, ageDays: number | null, contextHash: string | null}>} */
  const results = [];
  for (const e of entries) {
    if (!e.isDirectory()) continue;
    if (e.name === ARCHIVE_SUBDIR) continue;
    const slug = e.name;

    const draftPath = findDraft(baseDir, slug);
    if (!draftPath) {
      results.push({ slug, status: 'no-draft', newestEvent: null, ageDays: null, contextHash: null });
      continue;
    }

    let fm;
    try {
      const content = fs.readFileSync(draftPath, 'utf8');
      fm = parseFrontmatter(content);
    } catch {
      results.push({ slug, status: 'no-draft', newestEvent: null, ageDays: null, contextHash: null });
      continue;
    }

    const contextHash = fm.context_hash;
    if (!contextHash) {
      results.push({ slug, status: 'no-context-hash', newestEvent: null, ageDays: null, contextHash: null });
      continue;
    }

    const newest = computeNewestGapTimestamp({ baseDir, contextHash });
    if (newest === null) {
      results.push({ slug, status: 'no-events', newestEvent: null, ageDays: null, contextHash });
      continue;
    }

    const ageMs = now.getTime() - newest.getTime();
    const ageDays = ageMs / 86_400_000;
    const status = ageDays > ttlDays ? 'would-archive' : 'kept';
    results.push({ slug, status, newestEvent: newest, ageDays, contextHash });
  }
  // Sort for determinism.
  results.sort((a, b) => a.slug.localeCompare(b.slug));
  return results;
}

/**
 * Move `<baseDir>/.design/reflections/incubator/<slug>/` to
 * `<baseDir>/.design/reflections/incubator/archive/<slug>/`. On
 * collision, append a `-YYYYMMDD-HHMMSS` suffix derived from `now`.
 *
 * @param {{baseDir: string, slug: string, now?: Date}} input
 * @returns {{srcPath: string, archivePath: string}}
 */
function archiveSlug(input) {
  const baseDir = input.baseDir;
  const slug = input.slug;
  const now = input.now instanceof Date ? input.now : new Date();
  const src = path.join(baseDir, INCUBATOR_DIR, slug);
  const archiveRoot = path.join(baseDir, INCUBATOR_DIR, ARCHIVE_SUBDIR);
  fs.mkdirSync(archiveRoot, { recursive: true });
  let dest = path.join(archiveRoot, slug);
  if (fs.existsSync(dest)) {
    const stamp = formatTimestamp(now);
    dest = path.join(archiveRoot, `${slug}-${stamp}`);
  }
  fs.renameSync(src, dest);
  return { srcPath: src, archivePath: dest };
}

/**
 * Convert a Date to a `YYYYMMDD-HHMMSS` string. Deterministic for tests.
 *
 * @param {Date} date
 * @returns {string}
 */
function formatTimestamp(date) {
  const iso = date.toISOString();
  // '2026-05-19T22:53:11.123Z' → '20260519-225311'
  return iso
    .replace(/\.\d{3}Z$/, '')
    .replace(/[-:]/g, '')
    .replace('T', '-');
}

/**
 * CLI arg parser. Supports:
 *   --ttl-days N
 *   --dry-run
 *   --base-dir PATH
 *   --help
 *
 * @param {string[]} argv
 * @returns {{help?: boolean, error?: string, ttlDays?: number, dryRun?: boolean, baseDir?: string}}
 */
function parseArgs(argv) {
  /** @type {{help?: boolean, error?: string, ttlDays?: number, dryRun?: boolean, baseDir?: string}} */
  const out = {
    ttlDays: DEFAULT_TTL_DAYS,
    dryRun: false,
    baseDir: process.cwd(),
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--help' || a === '-h') {
      out.help = true;
      return out;
    } else if (a === '--dry-run') {
      out.dryRun = true;
    } else if (a === '--ttl-days') {
      const v = argv[++i];
      if (v === undefined) return { error: '--ttl-days requires an integer argument' };
      const n = Number.parseInt(v, 10);
      if (!Number.isFinite(n) || n < 0) {
        return { error: `--ttl-days requires a non-negative integer (got ${v})` };
      }
      out.ttlDays = n;
    } else if (a === '--base-dir') {
      const v = argv[++i];
      if (v === undefined) return { error: '--base-dir requires a path argument' };
      out.baseDir = v;
    } else if (a.startsWith('--')) {
      return { error: `unknown flag: ${a}` };
    } else {
      return { error: `unexpected positional argument: ${a}` };
    }
  }
  return out;
}

function printUsage() {
  const lines = [
    'Usage: node scripts/gsd-cleanup-incubator.cjs [options]',
    '',
    'Options:',
    '  --ttl-days N        Override TTL (default: 30, per CONTEXT D-06).',
    '  --dry-run           Log actions without mutating filesystem.',
    '  --base-dir PATH     Override project root (for tests). Default: process.cwd().',
    '  --help              Print usage and exit.',
    '',
    'Exit codes:',
    '  0  success (may include "no archives needed")',
    '  1  filesystem error (incubator dir unreadable, archive dir create failed)',
    '  2  invalid CLI args',
  ];
  console.log(lines.join('\n'));
}

/**
 * @param {string[]} argv — argv slice excluding `node` + script path
 * @returns {number} exit code
 */
function main(argv) {
  const args = parseArgs(argv);
  if (args.help) {
    printUsage();
    return 0;
  }
  if (args.error) {
    console.error(args.error);
    printUsage();
    return 2;
  }
  try {
    const results = scanIncubator({
      baseDir: args.baseDir,
      ttlDays: args.ttlDays,
      now: new Date(),
    });
    for (const r of results) {
      if (r.status === 'would-archive') {
        if (args.dryRun) {
          console.log(`[dry-run] would archive: ${r.slug} (age ${r.ageDays.toFixed(1)}d)`);
        } else {
          const { archivePath } = archiveSlug({ baseDir: args.baseDir, slug: r.slug });
          console.log(`archived: ${r.slug} → ${path.relative(args.baseDir, archivePath)}`);
        }
      } else {
        console.log(`skipped: ${r.slug} (${r.status})`);
      }
    }
    return 0;
  } catch (err) {
    console.error(`error: ${err && err.message ? err.message : String(err)}`);
    return 1;
  }
}

if (require.main === module) {
  process.exit(main(process.argv.slice(2)));
}

module.exports = {
  scanIncubator,
  archiveSlug,
  computeNewestGapTimestamp,
  findDraft,
  parseFrontmatter,
  formatTimestamp,
  isCapabilityGap,
  parseArgs,
  main,
  DEFAULT_TTL_DAYS,
  INCUBATOR_DIR,
  ARCHIVE_SUBDIR,
};
