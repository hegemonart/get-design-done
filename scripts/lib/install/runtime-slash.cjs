'use strict';

/**
 * scripts/lib/install/runtime-slash.cjs — Phase 28.7 (Plan 28.7-03).
 *
 * Per-runtime slash-command surface emitter. Maps a bare command name
 * (e.g. `'explore'`) to the runtime's expected slash-command shape:
 *   codex → `$hone-explore`     (shell-variable form)
 *   all other 13 runtimes → `/hone-explore`
 *
 * The colon form `/hone:explore` is NEVER emitted — Phase 28.7
 * standardizes on the dash form across the brand. Inputs in colon
 * shape are accepted (and normalized) for backward compatibility.
 *
 * Phase 61 rebrand (REBRAND-08): the canonical brand is now `hone`. The
 * deprecated `gdd` command alias (sourced from the seam's COMMAND_ALIAS /
 * BACK_COMPAT) is still ACCEPTED as input and forwards to the same `hone`
 * skill, emitting a one-time deprecation notice. The alias will be removed
 * in a future version.
 *
 * Architecture ported from gsd-build/get-shit-done (MIT) — per Phase
 * 28.7 D-02 (port architecture, not source). See NOTICE for upstream
 * attribution. Per Phase 28.7 D-11 this is the v1 surface; future
 * per-runtime variations beyond codex shell-var may extend the switch.
 *
 * Idempotency: any prior shape — canonical (`/hone-x`, `hone-x`, `/hone:x`,
 * `$hone-x`, …) or the BACK_COMPAT deprecated alias (`/gdd-x`, `gdd-x`,
 * `/gdd:x`, `$gdd-x`, …) — is stripped and re-emitted in canonical `hone`
 * form for the target runtime. Argument tails (whitespace + remainder)
 * round-trip untouched — this preserves Windows paths verbatim (Phase 28.6 lesson).
 *
 * Pure / side-effect-free at module load: only `require('fs')` and
 * `require('path')` are taken at top level. `fs.readFileSync` is the
 * sole `fs.*` caller, invoked exclusively from `resolveRuntime` when a
 * project directory is provided — and wrapped in try/catch so malformed
 * `.planning/config.json` cannot throw.
 */

const fs = require('fs');
const path = require('path');
// Phase 61 rebrand (REBRAND-08): canonical command identity is sourced from the
// frozen seam so the runtime slash surface cannot drift from the primary brand.
const { COMMAND_ALIAS, BACK_COMPAT } = require('../pkg-identity.cjs');

// ---------------------------------------------------------------------------
// Deprecated gdd→hone command alias (REBRAND-08)
// ---------------------------------------------------------------------------
// BACK_COMPAT: `gdd` is the deprecated legacy command alias (renamed from gdd →
// hone in v2.0.0). It forwards to the SAME canonical skill — no separate
// behavior — and is kept for 1-2 versions. The alias prefix is data-driven from
// the seam (COMMAND_ALIAS / BACK_COMPAT.LEGACY_COMMAND_PREFIX*) so there is no
// second hardcoded 'gdd' literal. The Wave-5 brand-residual gate (B4) allowlists
// these BACK_COMPAT-annotated lines as the intentional legacy residual.
const LEGACY_ALIAS = COMMAND_ALIAS; // BACK_COMPAT: 'gdd' — deprecated, renamed from gdd→hone
// One-time process-scoped guard so the deprecation notice prints once per run.
let _gddDeprecationWarned = false;

/**
 * Emit the one-time deprecation notice when a caller used the legacy `gdd`
 * command prefix. Mirrors deprecation-registry's message shape. Idempotent:
 * prints at most once per process. Never throws.
 * @param {string} token  the bare command token (for a precise message)
 */
function warnLegacyGddAlias(token) {
  if (_gddDeprecationWarned) return;
  _gddDeprecationWarned = true;
  // BACK_COMPAT: deprecation notice for the renamed gdd→hone command alias.
  const x = token || '<x>';
  try {
    process.stderr.write(
      `/${LEGACY_ALIAS}:${x} is deprecated since v2.0.0; use /hone:${x}. ` +
        `The alias will be removed in a future version.\n`,
    );
  } catch {
    /* never let a logging failure break command resolution */
  }
}

// ---------------------------------------------------------------------------
// formatGddSlash — pure rewrite of a single command token
// ---------------------------------------------------------------------------

/**
 * Strip any known command prefix from the head of `s` — both the canonical
 * `hone` forms and the deprecated legacy `gdd` alias forms.
 *
 * Matches (case-insensitive):
 *   canonical: `/hone-`, `/hone:`, `hone-`, `hone:`, `$hone-`, `$hone:`
 *   BACK_COMPAT (deprecated gdd alias): `/gdd-`, `/gdd:`, `gdd-`, `gdd:`,
 *     `$gdd-`, `$gdd:`
 *
 * Returns `{ rest, legacy }` where `rest` is the substring after the matched
 * prefix (or the original string if no prefix matched) and `legacy` is true
 * when the matched prefix was the deprecated `gdd` alias.
 *
 * @param {string} s
 * @returns {{ rest: string, legacy: boolean }}
 */
function stripCommandPrefix(s) {
  // BACK_COMPAT: the alias literal in this matcher comes from the seam — the
  // deprecated `gdd` prefix is accepted (renamed from gdd→hone) and flagged.
  const legacyRe = new RegExp('^[/$]?' + LEGACY_ALIAS + '[-:]', 'i');
  const lm = s.match(legacyRe);
  if (lm) return { rest: s.slice(lm[0].length), legacy: true };
  const hm = s.match(/^[/$]?hone[-:]/i);
  if (hm) return { rest: s.slice(hm[0].length), legacy: false };
  return { rest: s, legacy: false };
}

/**
 * Rewrite a command name to the slash-command shape for `runtime`.
 *
 * Behavior:
 *   - Non-string `commandName` returned unchanged (type-guard).
 *   - Empty string returned as `''`.
 *   - Canonical `hone` prefixes and the deprecated `gdd` alias prefixes
 *     (`/hone-`, `/hone:`, `hone-`, `$hone-`, … and the BACK_COMPAT
 *     `/gdd-`, `/gdd:`, `gdd-`, `$gdd-`, …) are stripped first
 *     (case-insensitive). Bare names pass through. When the input used the
 *     deprecated `gdd` alias, a one-time deprecation notice is emitted and
 *     the command still resolves to the canonical `/hone-` skill.
 *   - If the stripped result is empty / whitespace-only, return `''`
 *     (never re-emit `/hone-` or `$hone-` with no token — degenerate input).
 *   - Split on the first whitespace: the leading token is rewritten,
 *     everything after the first space (the argument tail) round-trips
 *     untouched. This preserves Windows paths in argument position.
 *   - codex → `$hone-<token-lowercased><tail>`
 *   - all other runtimes → `/hone-<token><tail>`
 *   - Unknown / falsy runtime → defaults to `'claude'` shape (`/hone-`).
 *
 * @param {string} commandName  e.g. `'explore'`, `'/hone-debug'`, `'/gdd-debug'`, `'do x y'`.
 * @param {string} [runtime]    runtime ID; defaults to `'claude'`.
 * @returns {string}
 */
function formatGddSlash(commandName, runtime) {
  // Type-guard: only operate on strings; pass everything else through.
  if (typeof commandName !== 'string') return commandName;
  if (commandName === '') return '';

  // 1. Strip any prior command prefix (idempotent normalization). The
  //    deprecated `gdd` alias is accepted here and flagged for a one-time warning.
  const { rest: bare, legacy } = stripCommandPrefix(commandName);

  // 2. Defensive: empty / whitespace-only token → empty (never `/hone-`).
  if (bare === '' || /^\s+$/.test(bare)) return '';

  // 3. Split into leading token + argument tail. The tail (including its
  //    leading whitespace) round-trips untouched for Windows-path safety.
  const m = bare.match(/^(\S+)(\s[\s\S]*)?$/);
  /* istanbul ignore next — `bare` is non-empty + non-whitespace-only, so
     this regex always matches; defensive fallback only. */
  if (!m) return '';
  const token = m[1];
  const tail = m[2] || '';

  // 3b. BACK_COMPAT: the deprecated gdd→hone alias still resolves to the
  //     canonical skill; emit the one-time deprecation notice on legacy input.
  if (legacy) warnLegacyGddAlias(token.toLowerCase());

  // 4. Runtime-specific emission — always canonical `hone`, even for a legacy alias input.
  const rt = String(runtime || 'claude').toLowerCase();
  if (rt === 'codex') {
    return '$hone-' + token.toLowerCase() + tail;
  }
  return '/hone-' + token + tail;
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
  // REBRAND-08: deprecated gdd→hone alias surface (data-driven from the seam).
  stripCommandPrefix,
  warnLegacyGddAlias,
  LEGACY_ALIAS, // BACK_COMPAT: 'gdd' — the deprecated command alias, renamed from gdd→hone
};
