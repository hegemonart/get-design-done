'use strict';

/**
 * scripts/lib/install/runtime-homes.cjs — Phase 28.7 (Plan 28.7-01).
 *
 * Pure config-dir + skills-base resolver per runtime. Returns absolute paths
 * to each runtime's global config directory and global skills directory,
 * respecting env-var overrides + XDG conventions.
 *
 * Architecture ported from gsd-build/get-shit-done (MIT) — per Phase 28.7 D-02
 * (port architecture, not source). See NOTICE for upstream attribution.
 *
 * Scope: the 14 GDD runtimes locked by Phase 24 D-02. Phase 28.7 D-03 + D-10
 * keep `hermes` OUT of scope; the upstream `hermes` and `grok` branches are
 * deliberately NOT ported.
 *
 * Pure / side-effect-free: no `fs.*` calls at any time, no `process.env`
 * writes, no top-level work beyond `require('os')` + `require('path')`.
 * Safe to require() at module-load time.
 *
 * Runtime-specific notes:
 *   opencode + kilo — XDG: honor `XDG_CONFIG_HOME` when the runtime's own
 *                     env var is unset. Default: `~/.config/<runtime>`.
 *   antigravity   — Nested under Gemini's home (`~/.gemini/antigravity`).
 *   windsurf      — Nested under Codeium's home (`~/.codeium/windsurf`).
 *   cline         — Rules-based runtime (D-09). `getGlobalSkillsBase('cline')`
 *                   returns `null` so callers can route to the `.clinerules`
 *                   embedding path instead of a skills/ tree.
 */

const os = require('os');
const path = require('path');

/**
 * Expand a leading `~` to `os.homedir()`. Returns the input unchanged if no
 * leading tilde is present (including `null`/`undefined`/empty).
 *
 * @param {string} p
 * @returns {string}
 */
function expandTilde(p) {
  if (!p) return p;
  if (p === '~') return os.homedir();
  if (p.startsWith('~/') || p.startsWith('~\\')) {
    return path.join(os.homedir(), p.slice(2));
  }
  return p;
}

/**
 * Return the global config base directory for the given runtime.
 *
 * Precedence per branch:
 *   1. Runtime's dedicated env var (e.g. `CLAUDE_CONFIG_DIR`, `CODEX_HOME`),
 *      tilde-expanded if present.
 *   2. XDG path for opencode + kilo (when `XDG_CONFIG_HOME` is set).
 *   3. Home-relative default (`~/.claude`, `~/.codex`, etc.).
 *
 * Throws `RangeError` on unknown runtime IDs (loud-fail — typos in caller
 * code should fail at the resolver, not silently fall back to Claude paths).
 *
 * @param {string} runtime
 * @returns {string} Absolute path to the runtime's global config directory.
 */
function getGlobalConfigDir(runtime) {
  const home = os.homedir();
  const env = process.env;

  switch (runtime) {
    // ── Claude Code ──────────────────────────────────────────────────────────
    case 'claude':
      return env.CLAUDE_CONFIG_DIR
        ? expandTilde(env.CLAUDE_CONFIG_DIR)
        : path.join(home, '.claude');

    // ── OpenCode (XDG) ───────────────────────────────────────────────────────
    case 'opencode': {
      if (env.OPENCODE_CONFIG_DIR) return expandTilde(env.OPENCODE_CONFIG_DIR);
      if (env.XDG_CONFIG_HOME) return path.join(expandTilde(env.XDG_CONFIG_HOME), 'opencode');
      return path.join(home, '.config', 'opencode');
    }

    // ── Gemini CLI ───────────────────────────────────────────────────────────
    case 'gemini':
      return env.GEMINI_CONFIG_DIR
        ? expandTilde(env.GEMINI_CONFIG_DIR)
        : path.join(home, '.gemini');

    // ── Kilo Code (XDG) ──────────────────────────────────────────────────────
    case 'kilo': {
      if (env.KILO_CONFIG_DIR) return expandTilde(env.KILO_CONFIG_DIR);
      if (env.XDG_CONFIG_HOME) return path.join(expandTilde(env.XDG_CONFIG_HOME), 'kilo');
      return path.join(home, '.config', 'kilo');
    }

    // ── Codex ────────────────────────────────────────────────────────────────
    case 'codex':
      return env.CODEX_HOME
        ? expandTilde(env.CODEX_HOME)
        : path.join(home, '.codex');

    // ── Copilot (VS Code / CLI) ──────────────────────────────────────────────
    case 'copilot':
      return env.COPILOT_CONFIG_DIR
        ? expandTilde(env.COPILOT_CONFIG_DIR)
        : path.join(home, '.copilot');

    // ── Cursor ───────────────────────────────────────────────────────────────
    case 'cursor':
      return env.CURSOR_CONFIG_DIR
        ? expandTilde(env.CURSOR_CONFIG_DIR)
        : path.join(home, '.cursor');

    // ── Windsurf (nested under Codeium home) ─────────────────────────────────
    case 'windsurf':
      return env.WINDSURF_CONFIG_DIR
        ? expandTilde(env.WINDSURF_CONFIG_DIR)
        : path.join(home, '.codeium', 'windsurf');

    // ── Antigravity (nested under Gemini home) ───────────────────────────────
    case 'antigravity':
      return env.ANTIGRAVITY_CONFIG_DIR
        ? expandTilde(env.ANTIGRAVITY_CONFIG_DIR)
        : path.join(home, '.gemini', 'antigravity');

    // ── Augment ──────────────────────────────────────────────────────────────
    case 'augment':
      return env.AUGMENT_CONFIG_DIR
        ? expandTilde(env.AUGMENT_CONFIG_DIR)
        : path.join(home, '.augment');

    // ── Trae ─────────────────────────────────────────────────────────────────
    case 'trae':
      return env.TRAE_CONFIG_DIR
        ? expandTilde(env.TRAE_CONFIG_DIR)
        : path.join(home, '.trae');

    // ── Qwen Code ────────────────────────────────────────────────────────────
    case 'qwen':
      return env.QWEN_CONFIG_DIR
        ? expandTilde(env.QWEN_CONFIG_DIR)
        : path.join(home, '.qwen');

    // ── CodeBuddy ────────────────────────────────────────────────────────────
    case 'codebuddy':
      return env.CODEBUDDY_CONFIG_DIR
        ? expandTilde(env.CODEBUDDY_CONFIG_DIR)
        : path.join(home, '.codebuddy');

    // ── Cline (rules-based — see getGlobalSkillsBase) ────────────────────────
    case 'cline':
      return env.CLINE_CONFIG_DIR
        ? expandTilde(env.CLINE_CONFIG_DIR)
        : path.join(home, '.cline');

    // ── Unknown ──────────────────────────────────────────────────────────────
    default:
      throw new RangeError(
        `Unknown runtime "${runtime}". Known: claude, opencode, gemini, kilo, ` +
          'codex, copilot, cursor, windsurf, antigravity, augment, trae, qwen, ' +
          'codebuddy, cline.'
      );
  }
}

/**
 * Return the global skills base directory for the given runtime.
 *
 * - `cline` → `null` (Phase 28.7 D-09: rules-based, no skills dir; caller
 *             routes to the `.clinerules` embedding path).
 * - All other 13 runtimes → `<configDir>/skills`.
 *
 * Note: gsd-build's upstream nests Hermes skills under `skills/gsd/<name>/`
 * (their #2841). Hermes is NOT in our 14-runtime set (D-03 + D-10), so the
 * nested layout is NOT ported.
 *
 * @param {string} runtime
 * @returns {string|null} Absolute path to skills base, or `null` for cline.
 */
function getGlobalSkillsBase(runtime) {
  if (runtime === 'cline') return null;
  const configDir = getGlobalConfigDir(runtime);
  return path.join(configDir, 'skills');
}

/**
 * Return the full path to a specific skill's directory for the given runtime.
 * Returns `null` for runtimes that don't use a skills directory (cline).
 *
 * @param {string} runtime
 * @param {string} skillName e.g. `'gdd-executor'`.
 * @returns {string|null}
 */
function getGlobalSkillDir(runtime, skillName) {
  const base = getGlobalSkillsBase(runtime);
  if (base === null) return null;
  return path.join(base, skillName);
}

/**
 * Return a human-readable display path for a global skill (for log messages).
 * Replaces the home-directory prefix with `~` for readability.
 *
 * @param {string} runtime
 * @param {string} skillName
 * @returns {string}
 */
function getGlobalSkillDisplayPath(runtime, skillName) {
  const dir = getGlobalSkillDir(runtime, skillName);
  if (!dir) return `(${runtime} does not use a skills directory)`;
  const home = os.homedir();
  if (dir === home) return '~';
  if (dir.startsWith(home + path.sep)) {
    return '~' + dir.slice(home.length);
  }
  return dir;
}

module.exports = {
  expandTilde,
  getGlobalConfigDir,
  getGlobalSkillsBase,
  getGlobalSkillDir,
  getGlobalSkillDisplayPath,
};
