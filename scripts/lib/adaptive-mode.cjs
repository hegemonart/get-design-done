/**
 * adaptive-mode.cjs — feature-flag ladder facade for the Phase 23.5
 * no-regret stack (Plan 23.5-04).
 *
 * Three modes, ladder-shaped:
 *
 *   "static"  — Phase 10.1 behaviour. Static tier_overrides map applies;
 *               no posterior writes; no hedge weight updates; no MMR.
 *               Default for all installs.
 *
 *   "hedge"   — Adds AdaNormalHedge consensus thresholding to verifier
 *               + checker pools. Routing still static. Safest intro
 *               level — bandit routing is NOT enabled, so the model
 *               choice for any agent is unchanged.
 *
 *   "full"    — Adds bandit Thompson-sampling routing on top of hedge.
 *               Both posterior + hedge weights persist. Reflector
 *               proposals based on confidence intervals enabled.
 *
 * The ladder is read from `.design/budget.json.adaptive_mode`. Fallback
 * default = "static". Unknown values clamp to "static" with a stderr
 * warning (silent if `quiet: true`).
 *
 * This module owns the SINGLE source of truth for "is bandit on / is
 * hedge on" — every consumer (router, hedge, MMR, reflector, the
 * Phase 22 budget-enforcer hook) reads from `getMode(opts)`.
 *
 * No external deps. CommonJS.
 */

'use strict';

const fs = require('node:fs');
const path = require('node:path');

const DEFAULT_BUDGET_PATH = '.design/budget.json';
const VALID_MODES = Object.freeze(['static', 'hedge', 'full']);
const DEFAULT_MODE = 'static';

/** Capability matrix per mode — consumed by callers as a boolean check. */
const MODE_CAPS = Object.freeze({
  static: Object.freeze({ bandit: false, hedge: false, mmr: false, reflector_proposals: false }),
  hedge: Object.freeze({ bandit: false, hedge: true, mmr: true, reflector_proposals: false }),
  full: Object.freeze({ bandit: true, hedge: true, mmr: true, reflector_proposals: true }),
});

function resolveBudgetPath(opts = {}) {
  if (opts.budgetPath) {
    return path.isAbsolute(opts.budgetPath)
      ? opts.budgetPath
      : path.resolve(opts.baseDir ?? process.cwd(), opts.budgetPath);
  }
  return path.resolve(opts.baseDir ?? process.cwd(), DEFAULT_BUDGET_PATH);
}

/**
 * Read the current adaptive_mode from .design/budget.json. Falls back
 * to "static" when the file is absent, malformed, or holds an
 * unrecognised value.
 *
 * @param {{baseDir?: string, budgetPath?: string, quiet?: boolean}} [opts]
 * @returns {'static'|'hedge'|'full'}
 */
function getMode(opts = {}) {
  const p = resolveBudgetPath(opts);
  if (!fs.existsSync(p)) return DEFAULT_MODE;
  /** @type {{adaptive_mode?: string}} */
  let cfg;
  try {
    cfg = JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch {
    return DEFAULT_MODE;
  }
  const m = cfg && typeof cfg.adaptive_mode === 'string' ? cfg.adaptive_mode : null;
  if (!m) return DEFAULT_MODE;
  if (!VALID_MODES.includes(m)) {
    if (!opts.quiet) {
      try {
        process.stderr.write(
          `[adaptive-mode] unknown adaptive_mode "${m}" in ${p}; falling back to "static"\n`,
        );
      } catch {
        /* swallow */
      }
    }
    return DEFAULT_MODE;
  }
  return /** @type {'static'|'hedge'|'full'} */ (m);
}

/**
 * Convenience: capability matrix for the current mode.
 *
 * @param {{baseDir?: string, budgetPath?: string, quiet?: boolean}} [opts]
 * @returns {{bandit: boolean, hedge: boolean, mmr: boolean, reflector_proposals: boolean}}
 */
function caps(opts = {}) {
  return MODE_CAPS[getMode(opts)];
}

/**
 * Set the adaptive_mode on disk. Atomic write (.tmp + rename). Creates
 * the budget.json file if missing — the rest of the budget config
 * defaults to {} so other readers see "no caps configured".
 *
 * @param {'static'|'hedge'|'full'} mode
 * @param {{baseDir?: string, budgetPath?: string}} [opts]
 * @returns {string} absolute path written
 */
function setMode(mode, opts = {}) {
  if (!VALID_MODES.includes(mode)) {
    throw new RangeError(
      `adaptive-mode.setMode: mode must be one of [${VALID_MODES.join('|')}], got ${JSON.stringify(mode)}`,
    );
  }
  const p = resolveBudgetPath(opts);
  /** @type {Record<string, unknown>} */
  let cfg = {};
  if (fs.existsSync(p)) {
    try {
      cfg = JSON.parse(fs.readFileSync(p, 'utf8'));
    } catch {
      cfg = {};
    }
  }
  cfg.adaptive_mode = mode;
  fs.mkdirSync(path.dirname(p), { recursive: true });
  const tmp = p + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(cfg, null, 2));
  fs.renameSync(tmp, p);
  return p;
}

/**
 * High-level "should bandit route this agent?" predicate. Replaces ad-
 * hoc `if (mode === 'full' || …)` checks across the codebase.
 *
 * @param {{baseDir?: string, budgetPath?: string}} [opts]
 * @returns {boolean}
 */
function isBanditEnabled(opts = {}) {
  return caps(opts).bandit;
}

function isHedgeEnabled(opts = {}) {
  return caps(opts).hedge;
}

function isMmrEnabled(opts = {}) {
  return caps(opts).mmr;
}

function isReflectorProposalsEnabled(opts = {}) {
  return caps(opts).reflector_proposals;
}

module.exports = {
  getMode,
  setMode,
  caps,
  isBanditEnabled,
  isHedgeEnabled,
  isMmrEnabled,
  isReflectorProposalsEnabled,
  resolveBudgetPath,
  DEFAULT_BUDGET_PATH,
  DEFAULT_MODE,
  VALID_MODES,
  MODE_CAPS,
};
