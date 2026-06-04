#!/usr/bin/env node
'use strict';

/**
 * get-design-done — first-run nudge (Phase 14.7)
 *
 * Port of hooks/first-run-nudge.sh to pure Node CommonJS (Phase 28.x).
 * SessionStart hook. Silent-on-failure by policy: exits 0 on every error path.
 * Prints exactly one restrained line pointing at /gdd:start when all gates
 * pass, and nothing otherwise.
 *
 * Non-obvious behavior preserved:
 *  - Logger is silent unless GDD_NUDGE_DEBUG=1 (matches bash `${VAR:-0}`).
 *  - HOME falls back to USERPROFILE (Windows). Mirrors bash `${HOME:-$USERPROFILE}`.
 *  - read_state_stage uses the same regex shape as the bash sed: drops an
 *    optional surrounding double-quote and stops at the first whitespace.
 *  - has_recent_gdd_command is a placeholder that always returns false (matches
 *    the bash `return 1` → `is_active` boolean false).
 *  - Sourcing guard: helpers are exported on module.exports; main() only runs
 *    when invoked as the entry point (require.main === module).
 *  - Always exit 0 — every error path is swallowed.
 *  - The locked nudge copy appears exactly once in this file (test asserts
 *    the nudge string occurs exactly once in the hook source).
 */

const fs = require('node:fs');
const path = require('node:path');

const NUDGE_LINE =
  'Tip: run /gdd:start to let GDD inspect this codebase and suggest one first fix.\n';

function log(msg) {
  if (process.env.GDD_NUDGE_DEBUG === '1') {
    process.stderr.write(`[gdd first-run-nudge] ${msg}\n`);
  }
}

/**
 * Gate 1 — repo already has GDD state, suppress.
 * @param {string} designDir absolute path to <cwd>/.design
 * @returns {boolean}
 */
function hasDesignState(designDir) {
  try {
    const config = path.join(designDir, 'config.json');
    const state = path.join(designDir, 'STATE.md');
    return isFile(config) || isFile(state);
  } catch (_e) {
    return false;
  }
}

/**
 * Gate 2 — per-install dismissal flag.
 * @param {string} homeDir resolved HOME (or USERPROFILE on Windows)
 * @returns {boolean}
 */
function isDismissed(homeDir) {
  try {
    if (!homeDir) return false;
    return isFile(path.join(homeDir, '.claude', 'gdd-nudge-dismissed'));
  } catch (_e) {
    return false;
  }
}

/**
 * Reads the first `stage:` line out of STATE.md and strips surrounding quoting
 * the way the bash sed expression does (drops an optional surrounding double
 * quote, captures non-quote/non-whitespace chars, ignores any trailing text).
 *
 * @param {string} stateFilePath absolute path to STATE.md
 * @returns {string} the captured stage value, or '' if unavailable
 */
function readStateStage(stateFilePath) {
  try {
    if (!isFile(stateFilePath)) return '';
    const text = fs.readFileSync(stateFilePath, 'utf8');
    const lines = text.split(/\r?\n/);
    for (const line of lines) {
      if (/^stage:/.test(line)) {
        const m = line.match(/^stage:[ \t]*"?([^"\s]+)"?.*/);
        if (m && m[1]) return m[1];
        return '';
      }
    }
    return '';
  } catch (_e) {
    return '';
  }
}

const ACTIVE_STAGES = new Set(['plan', 'design', 'verify', 'executing', 'discussing']);

/**
 * Gate 3 — STATE.md stage belongs to an active pipeline window.
 * @param {string} stateFilePath absolute path to STATE.md
 * @returns {boolean}
 */
function isActiveStage(stateFilePath) {
  const s = readStateStage(stateFilePath);
  return ACTIVE_STAGES.has(s);
}

/**
 * Gate 4 — recent session history has a gdd:* command.
 * Placeholder: no portable transcript path exposed to SessionStart hooks today.
 * Mirrors the bash version's `return 1` (false) so we never falsely suppress.
 * @returns {boolean}
 */
function hasRecentGddCommand() {
  return false;
}

function isFile(p) {
  try {
    const st = fs.statSync(p);
    return st.isFile();
  } catch (_e) {
    return false;
  }
}

function resolveHomeDir() {
  // bash: ${HOME:-$USERPROFILE} — HOME wins if set (even on Windows), else USERPROFILE.
  return process.env.HOME || process.env.USERPROFILE || '';
}

function main() {
  try {
    const cwd = process.cwd();
    const designDir = path.join(cwd, '.design');
    const stateFile = path.join(designDir, 'STATE.md');
    const homeDir = resolveHomeDir();

    if (hasDesignState(designDir)) {
      log('design state present — suppress');
      process.exit(0);
    }
    if (isDismissed(homeDir)) {
      log('dismissal flag present — suppress');
      process.exit(0);
    }
    if (isActiveStage(stateFile)) {
      log('active stage — suppress');
      process.exit(0);
    }
    if (hasRecentGddCommand()) {
      log('recent gdd:* command detected — suppress');
      process.exit(0);
    }
    // All gates passed — emit the locked one-line nudge.
    process.stdout.write(NUDGE_LINE);
    process.exit(0);
  } catch (_e) {
    // Silent-on-failure: every error path exits 0.
    process.exit(0);
  }
}

module.exports = {
  hasDesignState,
  isDismissed,
  readStateStage,
  isActiveStage,
  hasRecentGddCommand,
};

if (require.main === module) {
  main();
}
