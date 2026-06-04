#!/usr/bin/env node
/**
 * hooks/inject-using-gdd.cjs — SessionStart per-harness context injector (D-07).
 *
 * Node CommonJS port of hooks/inject-using-gdd.sh. Written so it runs natively on
 * Windows (where bash is often absent or stubbed) without spawning a subshell.
 *
 * The forcing function GDD lacked: on every session start / /clear / compact this
 * reads skills/using-gdd/SKILL.md (the bootstrap discipline contract) and emits
 * it as the host harness's SessionStart "additionalContext" shape so the agent is
 * primed with the 1%-rule + red-flags + skill-priority before it acts.
 *
 * Three emitted shapes (ONE JSON object on stdout, terminated by "\n"):
 *   Cursor       (CURSOR_PLUGIN_ROOT set)        -> {"additional_context": "<escaped>"}
 *   Claude Code  (CLAUDE_PLUGIN_ROOT set, no Cursor)
 *                                                -> {"hookSpecificOutput":
 *                                                     {"hookEventName": "SessionStart",
 *                                                      "additionalContext": "<escaped>"}}
 *   SDK-standard (neither; e.g. COPILOT_CLI)     -> {"additionalContext": "<escaped>"}
 *
 * Branch order: check Cursor BEFORE Claude Code — a Cursor session may also export
 * CLAUDE_PLUGIN_ROOT, and Cursor's own var must win.
 *
 * Byte-format preserved: the original bash uses `printf '{"key": %s}\n' "$ESCAPED"`,
 * which yields a single space after each colon and a trailing newline. We build the
 * envelope by hand (using JSON.stringify only for the escaped string value) so the
 * stdout bytes match the bash original. JSON.parse is whitespace-insensitive, so
 * tests pass either way, but matching the wire format keeps any downstream
 * byte-sensitive consumer happy.
 *
 * Silent-on-failure: every error path exits 0 (matching the bash defensive contract
 * — a partial install or missing SKILL.md must still produce a syntactically valid
 * JSON envelope). The bash never had non-zero exits, so neither do we.
 *
 * Sourcing guard: helpers are exported via module.exports; main() runs only when
 * this file is the entry point (require.main === module). Mirrors the bash
 * `[ "${BASH_SOURCE[0]}" = "$0" ]` pattern so tests can require this module and
 * exercise helpers without firing the emit side-effect.
 *
 * NO-CASCADE (D-06): wired ONLY under SessionStart in hooks/hooks.json. Subagent
 * spawns do not fire SessionStart, so the inject cannot cascade into a subagent's
 * context. (Structural guarantee; behavioral proof = P33.)
 */

'use strict';

const fs = require('node:fs');
const path = require('node:path');

/**
 * Resolve the plugin root the same way the bash original does:
 *   CURSOR_PLUGIN_ROOT -> CLAUDE_PLUGIN_ROOT -> dirname(__file__)/..
 * Then normalize Windows backslashes to forward slashes (matching the bash
 * `"${ROOT//\\//}"` parameter substitution) so downstream path joins are stable.
 *
 * @param {NodeJS.ProcessEnv} env  Environment (defaults to process.env).
 * @param {string} selfDir         Directory of this script (defaults to __dirname).
 * @returns {string}               Plugin root, forward-slash normalized.
 */
function resolveRoot(env, selfDir) {
  const e = env || process.env;
  const sd = selfDir || __dirname;
  // Bash: ROOT="${CURSOR_PLUGIN_ROOT:-${CLAUDE_PLUGIN_ROOT:-${SELF_DIR}/..}}"
  // The :- operator treats both unset AND empty as "use the fallback". Match that
  // by treating empty strings as absent here too.
  const cursor = e.CURSOR_PLUGIN_ROOT;
  const claude = e.CLAUDE_PLUGIN_ROOT;
  let root;
  if (cursor && cursor.length > 0) {
    root = cursor;
  } else if (claude && claude.length > 0) {
    root = claude;
  } else {
    root = path.join(sd, '..');
  }
  // Normalize backslashes -> forward slashes (Windows). Matches bash ${ROOT//\\//}.
  return root.replace(/\\/g, '/');
}

/**
 * Read the SKILL.md bootstrap contract. Defensive: never throw — return '' on any
 * read failure so the emitted JSON envelope is still well-formed. Matches the
 * bash `[[ -r "${SKILL}" ]]` guard (returns "" on missing / unreadable).
 *
 * Bash `CONTENT="$(cat "${SKILL}")"` strips ALL trailing newlines from the file —
 * that's a fundamental POSIX command-substitution rule. To stay byte-identical
 * with the original on every emitted JSON envelope, we replicate that here: trim
 * the trailing run of LF/CRLF after reading. Interior newlines are untouched (so
 * the multi-line round-trip the tests check still works).
 *
 * @param {string} root  Plugin root (already normalized).
 * @returns {string}     File contents, or '' if missing/unreadable.
 */
function readSkill(root) {
  const skillPath = `${root}/skills/using-gdd/SKILL.md`;
  let raw;
  try {
    raw = fs.readFileSync(skillPath, 'utf8');
  } catch {
    return '';
  }
  // Match bash $() trailing-newline stripping. /(\r?\n)+$/ also handles CRLF
  // line endings on Windows checkouts so a single CRLF tail strips to ''.
  return raw.replace(/(?:\r?\n)+$/, '');
}

/**
 * JSON-escape a string and wrap it in double-quotes — the bash original was
 * hand-rolled in pure parameter substitution because the script must run with no
 * jq/python dependency. In Node, JSON.stringify handles every code-point the bash
 * version handled (backslash, double-quote, \t, \r, \n) AND the ones it didn't
 * (other C0 controls, lone surrogates) more correctly. Output includes the
 * surrounding quotes so callers can splice the value directly into a JSON object
 * literal — matching the bash `printf '"%s"' "$s"` contract.
 *
 * @param {string} s
 * @returns {string}  e.g. `"hello\nworld"`
 */
function escapeForJson(s) {
  return JSON.stringify(String(s == null ? '' : s));
}

/**
 * Build the harness-specific JSON envelope as the exact byte sequence the bash
 * `printf` produces — single space after each colon, trailing `\n`. Branch order
 * matches the bash: Cursor BEFORE Claude Code so a Cursor session that also
 * exports CLAUDE_PLUGIN_ROOT still gets the Cursor shape.
 *
 * @param {string} escapedJsonValue  Already JSON-encoded string including quotes.
 * @param {NodeJS.ProcessEnv} env    Environment (defaults to process.env).
 * @returns {string}                 The full stdout payload, terminated by '\n'.
 */
function buildEnvelope(escapedJsonValue, env) {
  const e = env || process.env;
  const cursor = e.CURSOR_PLUGIN_ROOT;
  const claude = e.CLAUDE_PLUGIN_ROOT;
  if (cursor && cursor.length > 0) {
    // Cursor: top-level additional_context.
    return `{"additional_context": ${escapedJsonValue}}\n`;
  }
  if (claude && claude.length > 0) {
    // Claude Code: hookSpecificOutput envelope (mirrors gdd-decision-injector.js).
    return `{"hookSpecificOutput": {"hookEventName": "SessionStart", "additionalContext": ${escapedJsonValue}}}\n`;
  }
  // SDK-standard (COPILOT_CLI or none): top-level additionalContext.
  return `{"additionalContext": ${escapedJsonValue}}\n`;
}

/**
 * End-to-end main: resolve root, read skill, escape, emit, exit 0. All error
 * paths swallow and still emit a well-formed envelope (silent-on-failure).
 *
 * @returns {number}  Always 0.
 */
function main() {
  let payload;
  try {
    const root = resolveRoot(process.env, __dirname);
    const content = readSkill(root);
    const escaped = escapeForJson(content);
    payload = buildEnvelope(escaped, process.env);
  } catch {
    // Belt-and-braces: if anything above unexpectedly throws (e.g. JSON.stringify
    // on a hostile input — shouldn't happen with a string), still emit a valid
    // empty envelope so the SessionStart pipeline never breaks.
    payload = buildEnvelope('""', process.env);
  }
  // Use process.stdout.write so we don't get a console.log-added newline on top
  // of the one already in the payload. Matches bash printf '...\n' exactly.
  process.stdout.write(payload);
  return 0;
}

module.exports = {
  resolveRoot,
  readSkill,
  escapeForJson,
  buildEnvelope,
  main,
};

// Sourcing guard: only run main() when invoked as the entry point. Tests can
// `require('./inject-using-gdd.cjs')` to exercise helpers in isolation without
// firing the emit side-effect — mirrors the bash `[ "${BASH_SOURCE[0]}" = "$0" ]`
// pattern.
if (require.main === module) {
  process.exit(main());
}
