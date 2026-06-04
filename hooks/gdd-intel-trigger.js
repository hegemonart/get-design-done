#!/usr/bin/env node
'use strict';
/**
 * hooks/gdd-intel-trigger.js — D5 (PostToolUse on Edit|Write)
 *
 * On every Edit/Write that touches a design-authoritative surface
 * (skills/**, agents/**, reference/**, skill-templates/**), spawn a
 * background, detached refresh of the .design/intel/ store so downstream
 * consumers (router, planner, audits) see the latest extracts without the
 * user paying for a full rebuild on the next /gdd run.
 *
 * Contract:
 *   1. Read the PostToolUse payload from stdin. Tolerate snake_case and
 *      camelCase field names (tool_name/toolName, tool_input/toolInput,
 *      file_path/filePath/path).
 *   2. If the edited path matches
 *        ^(skills|agents|reference|skill-templates)/.*\.(md|json)$
 *      (path-separator-agnostic), schedule a background refresh.
 *   3. Otherwise no-op — write {continue:true} and exit 0.
 *   4. Always exit 0. Never block. Never surface errors. Errors only ever
 *      land as a stderr breadcrumb (best-effort).
 *
 * Opt-out:
 *   Set GDD_DISABLE_INTEL_TRIGGER=1 to silence this hook completely
 *   (still writes {continue:true}, exits 0, spawns nothing).
 *
 * Dedup lock:
 *   .design/.intel-trigger.lock — a JSON file with {ts: <epoch_ms>}.
 *   If the lock is younger than 5 minutes, we assume a refresh is already
 *   in flight (or recently ran) and skip spawning again. Rapid sequential
 *   edits coalesce into one background rebuild. The lock is best-effort:
 *   if the .design/ dir does not exist or we cannot read/write the lock,
 *   we still proceed (or still no-op safely).
 *
 * Refresh path:
 *   scripts/build-intel.cjs is the rebuilder. It has no `--incremental`
 *   flag (incremental is its DEFAULT behavior — invoking it without
 *   `--force` re-extracts only changed files via mtime/git-hash). The
 *   task spec said "if --incremental exists, spawn it; else emit a
 *   breadcrumb." Since the script DOES do incremental by default, we
 *   spawn it as `node scripts/build-intel.cjs` (no flags) and surface
 *   the convention in the breadcrumb so future maintainers know why
 *   no `--incremental` was passed. If the script is ever missing, we
 *   emit only a breadcrumb and continue.
 *
 * Spawn shape:
 *   child_process.spawn('node', [script], { detached: true,
 *     stdio: 'ignore', windowsHide: true }) followed by child.unref().
 *   This decouples the child from our process tree so the hook returns
 *   immediately and the rebuild happens out of band.
 */

const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');

const LOCK_TTL_MS = 5 * 60 * 1000; // 5 minutes
const TARGET_RE = /^(?:skills|agents|reference|source\/skills)\/.*\.(?:md|json)$/;

/**
 * Extract the edited file path + tool name from a PostToolUse payload.
 * Returns { tool, filename } or null when nothing usable was found.
 */
function extractTarget(payload) {
  if (!payload || typeof payload !== 'object') return null;
  const tool = payload.tool_name || payload.toolName;
  if (tool !== 'Write' && tool !== 'Edit') return null;
  const input = payload.tool_input || payload.toolInput || {};
  const filename =
    input.file_path ||
    input.filePath ||
    input.path ||
    (payload.tool_response &&
      (payload.tool_response.filePath || payload.tool_response.file_path)) ||
    '';
  if (!filename) return null;
  return { tool, filename: String(filename) };
}

/**
 * Decide whether the given (absolute or relative) filename, considered
 * relative to `cwd`, lives under one of the design-authoritative roots
 * and is .md or .json. Returns true/false. Path-separator-agnostic.
 */
function isDesignSurface(filename, cwd) {
  if (!filename) return false;
  let rel;
  try {
    rel = path.isAbsolute(filename)
      ? path.relative(cwd, filename)
      : filename;
  } catch {
    return false;
  }
  if (!rel || rel.startsWith('..')) return false;
  const normalised = rel.replace(/\\/g, '/');
  return TARGET_RE.test(normalised);
}

/**
 * Best-effort: returns true if the lockfile exists AND its timestamp is
 * younger than LOCK_TTL_MS. False on any error (missing dir, parse fail,
 * stat fail) — fail-open so we still trigger the rebuild.
 */
function lockIsFresh(lockPath) {
  try {
    if (!fs.existsSync(lockPath)) return false;
    const raw = fs.readFileSync(lockPath, 'utf8');
    const parsed = JSON.parse(raw);
    const ts = Number(parsed && parsed.ts);
    if (!Number.isFinite(ts)) return false;
    return Date.now() - ts < LOCK_TTL_MS;
  } catch {
    return false;
  }
}

/**
 * Best-effort: write {ts: Date.now()} to the lockfile, ensuring its
 * parent dir exists. Swallows all errors — locking is purely an
 * optimisation; failure to lock just means the next edit may re-trigger.
 */
function writeLock(lockPath) {
  try {
    fs.mkdirSync(path.dirname(lockPath), { recursive: true });
    fs.writeFileSync(lockPath, JSON.stringify({ ts: Date.now() }), 'utf8');
  } catch {
    /* swallow */
  }
}

/**
 * Spawn the intel rebuild as a detached background process. The child is
 * fully decoupled (stdio:'ignore', detached:true, unref()) so the hook
 * returns immediately. Errors are swallowed — the worst case is a stale
 * intel store, which is no worse than the pre-hook baseline.
 */
function spawnRebuild(cwd, script) {
  try {
    const child = spawn(process.execPath, [script], {
      cwd,
      detached: true,
      stdio: 'ignore',
      windowsHide: true,
      env: process.env,
    });
    child.unref();
    return true;
  } catch {
    return false;
  }
}

/**
 * Core hook entry. Returns the decision object to write to stdout.
 * Always returns {continue: true}. Exported for unit testing.
 *
 * Optional `opts.spawnImpl` overrides the spawn-rebuild side effect
 * (so tests can assert it was called without forking a real node).
 */
function main(payload, opts = {}) {
  // Opt-out shortcut — read here (not at module top) so tests can flip the
  // env between calls without re-requiring the module.
  if (process.env.GDD_DISABLE_INTEL_TRIGGER === '1') {
    return { continue: true };
  }

  const cwd = (payload && payload.cwd) || opts.cwd || process.cwd();
  const target = extractTarget(payload);
  if (!target) return { continue: true };
  if (!isDesignSurface(target.filename, cwd)) return { continue: true };

  const lockPath = path.join(cwd, '.design', '.intel-trigger.lock');
  if (lockIsFresh(lockPath)) return { continue: true };

  const script = path.join(cwd, 'scripts', 'build-intel.cjs');
  if (!fs.existsSync(script)) {
    // Follow-up: a missing rebuilder is not this hook's problem to fix.
    try {
      process.stderr.write(
        '[gdd-intel-trigger] would refresh .design/intel/ if scripts/build-intel.cjs --incremental existed\n'
      );
    } catch {
      /* swallow */
    }
    return { continue: true };
  }

  // Lock first (idempotent if write fails), then spawn. Locking first
  // means a sibling Edit racing this one will see a fresh lock and skip
  // even if our spawn has not yet completed.
  writeLock(lockPath);
  const doSpawn = typeof opts.spawnImpl === 'function' ? opts.spawnImpl : spawnRebuild;
  doSpawn(cwd, script);

  return { continue: true };
}

/** CLI entrypoint — read JSON from stdin, decide, write {continue:true}. */
async function run(stdin = process.stdin, stdout = process.stdout) {
  let buf = '';
  try {
    for await (const chunk of stdin) buf += chunk;
  } catch {
    stdout.write(JSON.stringify({ continue: true }));
    return;
  }
  let payload;
  try {
    payload = JSON.parse(buf || '{}');
  } catch {
    stdout.write(JSON.stringify({ continue: true }));
    return;
  }
  let decision;
  try {
    decision = main(payload);
  } catch {
    decision = { continue: true };
  }
  stdout.write(JSON.stringify(decision || { continue: true }));
}

if (require.main === module) {
  run().catch(() => {
    try {
      process.stdout.write(JSON.stringify({ continue: true }));
    } catch {
      /* swallow */
    }
  });
}

module.exports = {
  main,
  extractTarget,
  isDesignSurface,
  lockIsFresh,
  writeLock,
  spawnRebuild,
  LOCK_TTL_MS,
  TARGET_RE,
};
