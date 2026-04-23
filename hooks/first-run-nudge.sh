#!/usr/bin/env bash
# get-design-done — first-run nudge (Phase 14.7)
# SessionStart hook. Silent-on-failure by policy: exits 0 on every error path.
# Prints exactly one restrained line pointing at /gdd:start when all gates pass,
# and nothing otherwise.

set -u  # intentionally no -e: we want to fall through to exit 0

# Silent logger — writes nothing by default. Set GDD_NUDGE_DEBUG=1 to enable stderr.
log() {
  if [ "${GDD_NUDGE_DEBUG:-0}" = "1" ]; then
    printf '[gdd first-run-nudge] %s\n' "$*" >&2
  fi
}

DESIGN_DIR="$(pwd)/.design"
STATE="${DESIGN_DIR}/STATE.md"
CONFIG="${DESIGN_DIR}/config.json"
DISMISS_FLAG="${HOME:-$USERPROFILE}/.claude/gdd-nudge-dismissed"

# Gate 1 — repo already has GDD state, suppress.
has_design_state() {
  [ -f "${CONFIG}" ] || [ -f "${STATE}" ]
}

# Gate 2 — per-install dismissal flag.
is_dismissed() {
  [ -f "${DISMISS_FLAG}" ]
}

# Gate 3 — STATE.md stage belongs to an active pipeline window.
# Inherits the shape used by Phase 13.3 update-check.sh.
read_state_stage() {
  [ -f "${STATE}" ] || { printf ''; return; }
  grep -E '^stage:' "${STATE}" 2>/dev/null | head -n1 | \
    sed -E 's/^stage:[[:space:]]*"?([^"[:space:]]+)"?.*/\1/'
}

is_active_stage() {
  local s
  s="$(read_state_stage)"
  case "${s}" in
    plan|design|verify|executing|discussing) return 0 ;;
    *) return 1 ;;
  esac
}

# Gate 4 — recent session history has a gdd:* command. We cannot reliably read
# session history from a hook in all runtimes; when the signal is unavailable,
# treat it as "unknown → not suppressed". This preserves the nudge's
# usefulness without creating false suppression.
has_recent_gdd_command() {
  # Placeholder: no portable transcript path exposed to SessionStart hooks today.
  # Keep the function for future wiring; for now always returns non-zero (unknown).
  return 1
}

# MANDATORY sourcing guard: unit tests source this script to test the helper
# functions without executing the main flow. Non-negotiable.
if [ "${BASH_SOURCE[0]}" = "$0" ]; then
  if has_design_state; then
    log "design state present — suppress"
    exit 0
  fi
  if is_dismissed; then
    log "dismissal flag present — suppress"
    exit 0
  fi
  if is_active_stage; then
    log "active stage — suppress"
    exit 0
  fi
  if has_recent_gdd_command; then
    log "recent gdd:* command detected — suppress"
    exit 0
  fi
  # All gates passed — emit the locked one-line nudge.
  printf 'Tip: run /gdd:start to let GDD inspect this codebase and suggest one first fix.\n'
  exit 0
fi
# When sourced (BASH_SOURCE != $0), fall through with function definitions loaded
# and without side effects.
