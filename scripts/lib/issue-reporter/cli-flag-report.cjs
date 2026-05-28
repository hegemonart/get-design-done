'use strict';
/**
 * cli-flag-report.cjs — Plan 30-04 D-11 `--report` flag plumbing.
 *
 * The `--report` flag is intentionally NOT available on every command.
 * Per D-11 it is whitelisted to specific failure modes catalogued in
 * `reference/known-failure-modes.md` with `propose_report: true`. The
 * matcher (30-03) does not act on this flag; this module is where it
 * gates which commands get the flag at all.
 *
 * The schema for known-failure-modes.md does NOT include a per-mode
 * `command` field — the catalogue is regex-based, not command-keyed.
 * The whitelist therefore lives here as an explicit set of command
 * names whose plausible failures map to one or more propose_report=true
 * entries. Adding a command to the whitelist is a deliberate maintainer
 * choice; we do not auto-derive it to avoid surprising users with new
 * `--report` flags appearing as the catalogue grows.
 *
 * Today (matching KFM-008 MCP unreachable + KFM-009 plugin file missing):
 *   - `gdd:plan-phase`  — typically the first MCP-touching command
 *   - `gdd:execute-phase` — typically the first plugin-file-touching command
 *   - `gdd:report-issue` — the flag is meaningful on itself (force flow)
 *
 * Commands NOT on the whitelist silently do not see the flag —
 * non-whitelisted argv parsing returns `{ report: false }` regardless
 * of whether the user typed --report.
 */

const { listProposeReportModes } = require('./triage-matcher.cjs');

/**
 * Command whitelist — derived from CONTEXT D-11 + KFM-008/KFM-009 modes.
 * Frozen to prevent accidental mutation at runtime.
 *
 * The intersection with listProposeReportModes() is checked at
 * isReportFlagWhitelisted call time: if the catalogue is missing
 * propose_report=true entries entirely, the flag is unavailable
 * everywhere (defensive default).
 */
const COMMAND_WHITELIST = Object.freeze(new Set([
  'gdd:plan-phase',
  'gdd:execute-phase',
  'gdd:report-issue',
]));

/**
 * @param {string} commandName
 * @param {{ listFn?: typeof listProposeReportModes }} [opts]
 * @returns {boolean}
 */
function isReportFlagWhitelisted(commandName, opts) {
  if (typeof commandName !== 'string' || commandName.length === 0) return false;
  if (!COMMAND_WHITELIST.has(commandName)) return false;
  const listFn = (opts && opts.listFn) || listProposeReportModes;
  let modes;
  try {
    modes = listFn();
  } catch {
    modes = [];
  }
  // Defensive: if the catalogue lost all propose_report=true entries,
  // the flag is unavailable everywhere.
  return Array.isArray(modes) && modes.length > 0;
}

/**
 * Install --report on the given command-line parser ONLY if the command
 * is whitelisted. The function adapts to two parser shapes:
 *
 *   yargs-style: parser.option('report', { type: 'boolean', describe: ... })
 *   commander-style: parser.option('--report', '...', false)
 *
 * Non-whitelisted commands → no-op. Returns true if the flag was
 * installed, false otherwise.
 *
 * @param {object} parser
 * @param {string} commandName
 * @param {{ listFn?: typeof listProposeReportModes }} [opts]
 * @returns {boolean}
 */
function installReportFlagOn(parser, commandName, opts) {
  if (!isReportFlagWhitelisted(commandName, opts)) {
    return false;
  }
  if (parser == null) return false;
  // Try yargs-style first (named option with a config object).
  if (typeof parser.option === 'function') {
    try {
      parser.option('report', {
        type: 'boolean',
        default: false,
        describe:
          'Propose a GitHub issue draft after a failure (D-11 whitelisted; consent required — no auto-submit).',
      });
      return true;
    } catch {
      // fall through to commander-style
    }
    try {
      parser.option(
        '--report',
        'Propose a GitHub issue draft after a failure (D-11 whitelisted; consent required — no auto-submit).',
        false
      );
      return true;
    } catch {
      // fall through
    }
  }
  return false;
}

/**
 * Parse `--report` out of an argv array.
 *
 * Cheap parser used by tests and by any caller that just wants to know
 * whether the flag was passed. Non-whitelisted commands ALWAYS return
 * `false` regardless of what's in argv — the flag is unavailable to them.
 *
 * @param {string} commandName
 * @param {string[]} argv
 * @param {{ listFn?: typeof listProposeReportModes }} [opts]
 * @returns {{ report: boolean, forceReport: boolean }}
 */
function parseReportFlag(commandName, argv, opts) {
  const whitelisted = isReportFlagWhitelisted(commandName, opts);
  let report = false;
  let forceReport = false;
  if (Array.isArray(argv)) {
    for (const a of argv) {
      if (a === '--report') report = true;
      else if (a === '--force-report') forceReport = true;
      else if (typeof a === 'string' && a.startsWith('--report=')) {
        const v = a.slice('--report='.length).toLowerCase();
        report = v === 'true' || v === '1' || v === 'yes';
      }
    }
  }
  if (!whitelisted) {
    // Whitelist gate: even if the user typed --report, the command does
    // not expose it. Force-report is independent: it's a global modifier
    // for the explicit /gdd:report-issue command path.
    return { report: false, forceReport: forceReport && commandName === 'gdd:report-issue' };
  }
  return { report, forceReport };
}

module.exports = {
  installReportFlagOn,
  isReportFlagWhitelisted,
  parseReportFlag,
  COMMAND_WHITELIST,
};
