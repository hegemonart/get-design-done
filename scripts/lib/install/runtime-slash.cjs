'use strict';

/**
 * scripts/lib/install/runtime-slash.cjs — Phase 28.7 (Plan 28.7-03).
 *
 * Per-runtime slash-command surface emitter. Maps a bare command name
 * (e.g. `'explore'`) to the runtime's expected slash-command shape:
 *   codex → `$gdd-explore`     (shell-variable form)
 *   all other 13 runtimes → `/gdd-explore`
 *
 * The legacy colon form `/gdd:explore` is NEVER emitted — Phase 28.7
 * standardizes on the dash form across the GDD brand. Inputs in legacy
 * colon shape are accepted (and normalized) for backward compatibility.
 *
 * Architecture ported from gsd-build/get-shit-done (MIT) — per Phase
 * 28.7 D-02 (port architecture, not source). See NOTICE for upstream
 * attribution. Per Phase 28.7 D-11 this is the v1 surface; future
 * per-runtime variations beyond codex shell-var may extend the switch.
 *
 * Idempotency: any prior shape (`/gdd-x`, `gdd-x`, `/gdd:x`, `gdd:x`,
 * `$gdd-x`, `$gdd:x`) is stripped and re-emitted in canonical form for
 * the target runtime. Argument tails (whitespace + remainder) round-trip
 * untouched — this preserves Windows paths verbatim (Phase 28.6 lesson).
 *
 * Pure / side-effect-free at module load: only `require('fs')` and
 * `require('path')` are taken at top level. `fs.readFileSync` is the
 * sole `fs.*` caller, invoked exclusively from `resolveRuntime` when a
 * project directory is provided — and wrapped in try/catch so malformed
 * `.planning/config.json` cannot throw.
 */

const fs = require('fs');
const path = require('path');

// ---------------------------------------------------------------------------
// formatGddSlash — pure rewrite of a single command token
// ---------------------------------------------------------------------------

/**
 * Strip any known GDD prefix from the head of `s`.
 *
 * Matches (case-insensitive):
 *   `/gdd-`, `/gdd:`, `gdd-`, `gdd:`, `$gdd-`, `$gdd:`
 *
 * Returns the substring after the matched prefix, or the original string
 * unchanged if no prefix matches.
 *
 * @param {string} s
 * @returns {string}
 */
function stripGddPrefix(s) {
  const m = s.match(/^[/$]?gdd[-:]/i);
  if (m) return s.slice(m[0].length);
  return s;
}

/**
 * Rewrite a command name to the slash-command shape for `runtime`.
 *
 * Behavior:
 *   - Non-string `commandName` returned unchanged (type-guard).
 *   - Empty string returned as `''`.
 *   - Any of `/gdd-`, `/gdd:`, `gdd-`, `gdd:`, `$gdd-`, `$gdd:` is
 *     stripped first (case-insensitive). Bare names pass through.
 *   - If the stripped result is empty / whitespace-only, return `''`
 *     (never re-emit `/gdd-` or `$gdd-` with no token — degenerate input).
 *   - Split on the first whitespace: the leading token is rewritten,
 *     everything after the first space (the argument tail) round-trips
 *     untouched. This preserves Windows paths in argument position.
 *   - codex → `$gdd-<token-lowercased><tail>`
 *   - all other runtimes → `/gdd-<token><tail>`
 *   - Unknown / falsy runtime → defaults to `'claude'` shape (`/gdd-`).
 *
 * @param {string} commandName  e.g. `'explore'`, `'/gdd-debug'`, `'do x y'`.
 * @param {string} [runtime]    runtime ID; defaults to `'claude'`.
 * @returns {string}
 */
function formatGddSlash(commandName, runtime) {
  // Type-guard: only operate on strings; pass everything else through.
  if (typeof commandName !== 'string') return commandName;
  if (commandName === '') return '';

  // 1. Strip any prior GDD prefix (idempotent normalization).
  const bare = stripGddPrefix(commandName);

  // 2. Defensive: empty / whitespace-only token → empty (never `/gdd-`).
  if (bare === '' || /^\s+$/.test(bare)) return '';

  // 3. Split into leading token + argument tail. The tail (including its
  //    leading whitespace) round-trips untouched for Windows-path safety.
  const m = bare.match(/^(\S+)(\s[\s\S]*)?$/);
  /* istanbul ignore next — `bare` is non-empty + non-whitespace-only, so
     this regex always matches; defensive fallback only. */
  if (!m) return '';
  const token = m[1];
  const tail = m[2] || '';

  // 4. Runtime-specific emission.
  const rt = String(runtime || 'claude').toLowerCase();
  if (rt === 'codex') {
    return '$gdd-' + token.toLowerCase() + tail;
  }
  return '/gdd-' + token + tail;
}

// ---------------------------------------------------------------------------
// resolveRuntime — read-only runtime ID resolution
// ---------------------------------------------------------------------------

/**
 * Resolve the active runtime ID for the given project directory.
 *
 * Precedence:
 *   1. `process.env.GDD_RUNTIME` (lowercased) if truthy.
 *   2. `<projectDir>/.planning/config.json#runtime` (lowercased) if the
 *      file exists, parses as JSON, and contains a non-empty `runtime`
 *      string. Malformed JSON, missing file, or missing key all fall
 *      through silently — this function MUST NOT throw on bad config.
 *   3. Default `'claude'`.
 *
 * Side-effect-free: only `fs.readFileSync` (wrapped in try/catch), no
 * env mutation, no writes.
 *
 * @param {string} [projectDir]  absolute path to project root.
 * @returns {string}  runtime ID, always lowercase.
 */
function resolveRuntime(projectDir) {
  // 1. Env-var override
  if (process.env.GDD_RUNTIME) {
    return String(process.env.GDD_RUNTIME).toLowerCase();
  }

  // 2. .planning/config.json#runtime
  if (projectDir) {
    try {
      const cfgPath = path.join(projectDir, '.planning', 'config.json');
      const raw = fs.readFileSync(cfgPath, 'utf8');
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed.runtime === 'string' && parsed.runtime) {
        return String(parsed.runtime).toLowerCase();
      }
    } catch {
      /* fall through — malformed JSON / missing file / missing key */
    }
  }

  // 3. Default
  return 'claude';
}

// ---------------------------------------------------------------------------
// formatGddSlashFor — convenience that combines the two
// ---------------------------------------------------------------------------

/**
 * Resolve the runtime for `projectDir` and rewrite `commandName` accordingly.
 * Convenience wrapper for callers that already have a project directory in
 * hand and don't want to wire `resolveRuntime` themselves.
 *
 * @param {string} projectDir
 * @param {string} commandName
 * @returns {string}
 */
function formatGddSlashFor(projectDir, commandName) {
  return formatGddSlash(commandName, resolveRuntime(projectDir));
}

module.exports = {
  formatGddSlash,
  resolveRuntime,
  formatGddSlashFor,
};
