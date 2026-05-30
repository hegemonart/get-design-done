#!/usr/bin/env bash
# hooks/inject-using-gdd.sh — SessionStart per-harness context injector (D-07).
#
# The forcing function GDD lacked: on every session start / /clear / compact this
# reads skills/using-gdd/SKILL.md (the bootstrap discipline contract) and emits it
# as the host harness's SessionStart "additionalContext" shape so the agent is
# primed with the 1%-rule + red-flags + skill-priority before it acts.
#
# Ported MECHANISM (not content) from obra/superpowers (MIT): one polyglot script,
# env-var branch, pure-bash escape_for_json (no jq/python dependency). See NOTICE.
#
# Three emitted shapes (ONE JSON object on stdout, nothing else):
#   Cursor       (CURSOR_PLUGIN_ROOT set)        -> {"additional_context": "<escaped>"}
#   Claude Code  (CLAUDE_PLUGIN_ROOT set, no Cursor)
#                                                -> {"hookSpecificOutput":
#                                                     {"hookEventName":"SessionStart",
#                                                      "additionalContext":"<escaped>"}}
#   SDK-standard (neither; e.g. COPILOT_CLI)     -> {"additionalContext": "<escaped>"}
#
# Branch order: check Cursor BEFORE Claude Code — a Cursor session may also export
# CLAUDE_PLUGIN_ROOT, and Cursor's own var must win.
#
# NO-CASCADE (D-06): this script is wired ONLY under the SessionStart hook event in
# hooks/hooks.json. Subagent spawns do not fire SessionStart, so the inject cannot
# cascade into a subagent's context. (Structural guarantee; behavioral proof = P33.)

set -u

# --- Resolve the plugin root so we can locate skills/using-gdd/SKILL.md ---------
# Prefer the harness-provided roots; fall back to this script's parent dir so the
# emitter is runnable straight from hooks/ in tests and in bare shells.
SELF_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT="${CURSOR_PLUGIN_ROOT:-${CLAUDE_PLUGIN_ROOT:-${SELF_DIR}/..}}"
ROOT="${ROOT//\\//}"  # normalize Windows backslashes to forward slashes
SKILL="${ROOT}/skills/using-gdd/SKILL.md"

# Defensive: if the skill file is missing we must STILL emit a syntactically valid
# JSON object (an empty additionalContext) so the SessionStart pipeline never
# breaks on a partial install. Never crash the session start.
if [[ -r "${SKILL}" ]]; then
  CONTENT="$(cat "${SKILL}")"
else
  CONTENT=""
fi

# --- escape_for_json (superpowers pattern; pure bash param-substitution) --------
# Order matters: backslash FIRST (so escapes we add next aren't re-escaped), then
# double-quote, then the control chars newline / tab / carriage-return. Emits the
# value WITH surrounding double-quotes so callers can splice it directly.
escape_for_json() {
  local s="$1"
  s="${s//\\/\\\\}"   # \  -> \\
  s="${s//\"/\\\"}"   # "  -> \"
  s="${s//$'\t'/\\t}" # tab -> \t
  s="${s//$'\r'/\\r}" # CR  -> \r
  s="${s//$'\n'/\\n}" # LF  -> \n  (do last: newlines are the record separator)
  printf '"%s"' "$s"
}

ESCAPED="$(escape_for_json "${CONTENT}")"

# --- Branch on harness env vars and emit the matching single JSON object --------
if [[ -n "${CURSOR_PLUGIN_ROOT:-}" ]]; then
  # Cursor: top-level additional_context.
  printf '{"additional_context": %s}\n' "${ESCAPED}"
elif [[ -n "${CLAUDE_PLUGIN_ROOT:-}" ]]; then
  # Claude Code: hookSpecificOutput envelope (mirrors hooks/gdd-decision-injector.js).
  printf '{"hookSpecificOutput": {"hookEventName": "SessionStart", "additionalContext": %s}}\n' "${ESCAPED}"
else
  # SDK-standard (COPILOT_CLI or none): top-level additionalContext.
  printf '{"additionalContext": %s}\n' "${ESCAPED}"
fi
