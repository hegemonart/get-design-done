#!/usr/bin/env bash
# get-design-done bootstrap
# Auto-provisions companion resources that get-design-done references but which
# are not Claude Code plugins (so they cannot be listed in `dependencies`).
#
# Runs on SessionStart. Idempotent: uses a marker in ${CLAUDE_PLUGIN_DATA} so it
# only performs network work on first install or when the bundled manifest changes.
#
# Resources provisioned:
#   - ~/.claude/libs/awesome-design-md  (VoltAgent/awesome-design-md)
#
# Resources NOT provisioned (install separately, see README):
#   - emil-design-eng skill — no canonical upstream
#   - refero MCP — optional, add to your Claude config if you have access

set -u

PLUGIN_DATA="${CLAUDE_PLUGIN_DATA:-$HOME/.claude/plugins/data/get-design-done}"
PLUGIN_DATA="${PLUGIN_DATA//\\//}"  # Normalize Windows backslashes to forward slashes
PLUGIN_ROOT="${CLAUDE_PLUGIN_ROOT:-$(cd "$(dirname "$0")/.." && pwd)}"
PLUGIN_ROOT="${PLUGIN_ROOT//\\//}"  # Normalize Windows backslashes to forward slashes
MANIFEST="${PLUGIN_ROOT}/scripts/bootstrap-manifest.txt"
MARKER="${PLUGIN_DATA}/bootstrap-manifest.txt"

mkdir -p "${PLUGIN_DATA}" "${HOME}/.claude/libs" "${HOME}/.claude/skills"

# Skip if bundled manifest matches the last-run marker (no-op on every other session).
if [[ -f "${MANIFEST}" && -f "${MARKER}" ]] && diff -q "${MANIFEST}" "${MARKER}" >/dev/null 2>&1; then
  exit 0
fi

log() { printf '[get-design-done bootstrap] %s\n' "$*" >&2; }

clone_or_update() {
  local repo_url="$1"
  local target="$2"
  if [[ -d "${target}/.git" ]]; then
    log "updating ${target}"
    git -C "${target}" pull --quiet --ff-only 2>/dev/null || log "pull failed for ${target} (continuing)"
  elif [[ -d "${target}" ]]; then
    log "${target} exists and is not a git checkout — skipping"
  else
    log "cloning ${repo_url} -> ${target}"
    git clone --quiet --depth 1 "${repo_url}" "${target}" || log "clone failed for ${repo_url}"
  fi
}

# Required library: awesome-design-md
clone_or_update "https://github.com/VoltAgent/awesome-design-md.git" "${HOME}/.claude/libs/awesome-design-md"

# Soft notice for companion skills we cannot auto-install.
if [[ ! -d "${HOME}/.claude/skills/emil-design-eng" ]]; then
  log "optional: emil-design-eng skill not found in ~/.claude/skills. See get-design-done README for install options."
fi

# Phase 10.1: ensure .design/budget.json exists with defaults (D-12)
DESIGN_DIR="$(pwd)/.design"
mkdir -p "${DESIGN_DIR}"
if [ ! -f "${DESIGN_DIR}/budget.json" ]; then
  cat > "${DESIGN_DIR}/budget.json" <<'BUDGET_EOF'
{
  "per_task_cap_usd": 2.00,
  "per_phase_cap_usd": 20.00,
  "tier_overrides": {},
  "auto_downgrade_on_cap": true,
  "cache_ttl_seconds": 3600,
  "enforcement_mode": "enforce"
}
BUDGET_EOF
fi

# Phase 10.1: ensure .design/telemetry/ directory is writable
mkdir -p "${DESIGN_DIR}/telemetry"

# Record success so we don't re-run until the bundled manifest changes.
if [[ -f "${MANIFEST}" ]]; then
  cp "${MANIFEST}" "${MARKER}"
fi

exit 0
