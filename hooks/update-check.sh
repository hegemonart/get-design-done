#!/usr/bin/env bash
# get-design-done — update check (Phase 13.3)
# SessionStart hook. Silent-on-failure by policy (D-04): exits 0 on every error path.
# 24h-cached unauthenticated GET of /releases/latest. Renders .design/update-available.md
# only when a newer version exists AND it is not dismissed AND stage-guard allows.

set -u  # intentionally no -e: we want to fall through to exit 0

PLUGIN_ROOT="${CLAUDE_PLUGIN_ROOT:-$(cd "$(dirname "$0")/.." && pwd)}"
PLUGIN_ROOT="${PLUGIN_ROOT//\\//}"  # Windows → POSIX slashes

DESIGN_DIR="$(pwd)/.design"
CACHE="${DESIGN_DIR}/update-cache.json"
BANNER="${DESIGN_DIR}/update-available.md"
CONFIG="${DESIGN_DIR}/config.json"
STATE="${DESIGN_DIR}/STATE.md"
CACHE_TTL_SECONDS=86400  # 24h

# Silent logger — writes nothing by default. Set GDD_UPDATE_DEBUG=1 to enable stderr.
log() {
  if [ "${GDD_UPDATE_DEBUG:-0}" = "1" ]; then
    printf '[gdd update-check] %s\n' "$*" >&2
  fi
}

# Ensure .design/ exists (bootstrap normally creates it; belt+suspenders).
mkdir -p "${DESIGN_DIR}" 2>/dev/null || exit 0

# ---- Read current plugin version (no jq) ----
PLUGIN_JSON="${PLUGIN_ROOT}/.claude-plugin/plugin.json"

read_current_tag() {
  [ -f "${PLUGIN_JSON}" ] || return 1
  grep -E '^[[:space:]]*"version"[[:space:]]*:' "${PLUGIN_JSON}" | head -n1 | \
    sed -E 's/.*"version"[[:space:]]*:[[:space:]]*"([^"]+)".*/\1/'
}

# ---- Semver normalizer: "v1.0.7" -> "1 0 7 0"; "v1.0.7.3" -> "1 0 7 3" ----
normalize_semver() {
  local t="${1#v}"
  # strip any -pre/-beta suffix after first hyphen (unauth'd API rarely surfaces these, best-effort)
  t="${t%%-*}"
  # Replace dots with spaces; pad to 4 segments
  # shellcheck disable=SC2086
  set -- $(printf '%s' "${t}" | tr '.' ' ')
  local a="${1:-0}" b="${2:-0}" c="${3:-0}" d="${4:-0}"
  # Sanitize to digits only (POSIX: tr -cd 0-9 — BSD+GNU safe)
  a="$(printf '%s' "$a" | tr -cd '0-9')"; a="${a:-0}"
  b="$(printf '%s' "$b" | tr -cd '0-9')"; b="${b:-0}"
  c="$(printf '%s' "$c" | tr -cd '0-9')"; c="${c:-0}"
  d="$(printf '%s' "$d" | tr -cd '0-9')"; d="${d:-0}"
  printf '%s %s %s %s' "$a" "$b" "$c" "$d"
}

# ---- Classify delta: compare 4-segment tuples ----
# Args: current_tag latest_tag
# Prints: "newer|same|older|invalid" + "major|minor|patch|off-cadence|none"
classify_delta() {
  local cur lat
  cur="$(normalize_semver "$1")" || { printf 'invalid none'; return; }
  lat="$(normalize_semver "$2")" || { printf 'invalid none'; return; }
  # shellcheck disable=SC2086
  set -- $cur; local ca="$1" cb="$2" cc="$3" cd="$4"
  # shellcheck disable=SC2086
  set -- $lat; local la="$1" lb="$2" lc="$3" ld="$4"

  # Per-segment integer compare (lexicographic per segment by numeric value)
  if   [ "$la" -gt "$ca" ]; then printf 'newer major'; return
  elif [ "$la" -lt "$ca" ]; then printf 'older major'; return
  fi
  if   [ "$lb" -gt "$cb" ]; then printf 'newer minor'; return
  elif [ "$lb" -lt "$cb" ]; then printf 'older minor'; return
  fi
  if   [ "$lc" -gt "$cc" ]; then printf 'newer patch'; return
  elif [ "$lc" -lt "$cc" ]; then printf 'older patch'; return
  fi
  if   [ "$ld" -gt "$cd" ]; then printf 'newer off-cadence'; return
  elif [ "$ld" -lt "$cd" ]; then printf 'older off-cadence'; return
  fi
  printf 'same none'
}

# ---- Cache freshness check: returns 0 if fresh (<24h old), 1 if stale or missing ----
is_cache_fresh() {
  [ -f "${CACHE}" ] || return 1
  local now mtime age
  now="$(date +%s)"
  # BSD date -r on macOS; GNU stat -c on Linux; fall back to perl then python.
  if mtime="$(date -r "${CACHE}" +%s 2>/dev/null)"; then :
  elif mtime="$(stat -c %Y "${CACHE}" 2>/dev/null)"; then :
  elif mtime="$(perl -e 'print((stat shift)[9])' "${CACHE}" 2>/dev/null)"; then :
  else return 1
  fi
  [ -n "${mtime:-}" ] || return 1
  age=$((now - mtime))
  [ "${age}" -lt "${CACHE_TTL_SECONDS}" ]
}

# ---- Fetch latest release. Writes raw body to stdout on success, nothing on failure. ----
fetch_latest() {
  command -v curl >/dev/null 2>&1 || { log "no curl"; return 1; }
  local url="https://api.github.com/repos/hegemonart/get-design-done/releases/latest"
  curl -sf --max-time 3 -H 'Accept: application/vnd.github+json' "${url}" 2>/dev/null || return 1
}

# ---- Extract fields from the release JSON (no jq). Robust to whitespace; fails soft. ----
extract_tag() {
  grep -E '"tag_name"[[:space:]]*:' | head -n1 | sed -E 's/.*"tag_name"[[:space:]]*:[[:space:]]*"([^"]+)".*/\1/'
}
# Body extraction: python3-only. If python3 is absent, we intentionally return empty
# (D-04 silent-on-failure posture). No awk/sed fallback — JSON string decoding in pure
# bash is fragile and untested; empty excerpt is the correct degraded state.
extract_body() {
  command -v python3 >/dev/null 2>&1 || return 0
  python3 -c 'import json,sys
try:
  d=json.load(sys.stdin)
  b=d.get("body","") or ""
  print(b[:500])
except Exception:
  pass' 2>/dev/null
}

# ---- Read .design/STATE.md stage field. Returns "brief"|"explore"|"plan"|"design"|"verify"|"" ----
# Schema source: reference/STATE-TEMPLATE.md — `stage:` lives in both the frontmatter
# and the <position> block with identical values per the write contract. We take the
# first occurrence (head -n1), which is the frontmatter line.
read_state_stage() {
  [ -f "${STATE}" ] || { printf ''; return; }
  grep -E '^stage:' "${STATE}" 2>/dev/null | head -n1 | sed -E 's/^stage:[[:space:]]*"?([^"[:space:]]+)"?.*/\1/'
}

# ---- Read .design/config.json for update_dismissed. Returns tag or empty. ----
read_dismissed() {
  [ -f "${CONFIG}" ] || { printf ''; return; }
  grep -E '"update_dismissed"[[:space:]]*:' "${CONFIG}" 2>/dev/null | head -n1 | \
    sed -E 's/.*"update_dismissed"[[:space:]]*:[[:space:]]*"([^"]+)".*/\1/'
}

# ---- Main control flow ----
# MANDATORY sourcing guard: wrap the entire main flow so that `source update-check.sh`
# (used by unit tests and interactive debugging) loads the function definitions without
# executing steps 1-6 and exiting the sourcing shell. This is non-negotiable — the
# semver self-test acceptance criterion sources this script.
if [ "${BASH_SOURCE[0]}" = "$0" ]; then

  CURRENT_TAG="$(read_current_tag)" || { log "no plugin.json"; exit 0; }
  [ -n "${CURRENT_TAG:-}" ] || { log "no current version parsed"; exit 0; }
  # Normalize to "vX.Y.Z" shape for display (plugin.json stores bare "1.0.7")
  DISPLAY_CURRENT="v${CURRENT_TAG#v}"

  # Optional --refresh forces a fresh fetch (called by plan 13.3-04's /gdd:check-update --refresh).
  FORCE_REFRESH=0
  for arg in "$@"; do
    case "$arg" in
      --refresh) FORCE_REFRESH=1 ;;
    esac
  done

  # 1. Populate cache if missing/stale or forced.
  if [ "${FORCE_REFRESH}" -eq 1 ] || ! is_cache_fresh; then
    RAW="$(fetch_latest)" || RAW=""
    if [ -n "${RAW}" ]; then
      LATEST_TAG="$(printf '%s' "${RAW}" | extract_tag)"
      BODY_EXCERPT="$(printf '%s' "${RAW}" | extract_body)"
      # Strip control chars defensively (T-13.3-03)
      BODY_EXCERPT="$(printf '%s' "${BODY_EXCERPT}" | tr -d '\000-\010\013\014\016-\037')"
      # Strip double-quotes so the JSON round-trip sed read-back cannot be injected via a
      # crafted release body. Body is display-only — losing quotes is acceptable.
      BODY_EXCERPT="$(printf '%s' "${BODY_EXCERPT}" | tr -d '"')"
      # Validate LATEST_TAG is a safe semver string before trusting it (CR-02).
      if ! printf '%s' "${LATEST_TAG}" | grep -qE '^v?[0-9]+\.[0-9]+(\.[0-9]+)*$'; then
        log "LATEST_TAG '${LATEST_TAG}' failed semver safety check — aborting cache write"
        LATEST_TAG=""
      fi
      if [ -n "${LATEST_TAG}" ]; then
        read -r DELTA_STATE DELTA_KIND <<EOF
$(classify_delta "${DISPLAY_CURRENT}" "${LATEST_TAG}")
EOF
        IS_NEWER=false
        [ "${DELTA_STATE}" = "newer" ] && IS_NEWER=true
        CHECKED_AT="$(date +%s)"
        # Write cache atomically (write-to-tmp + rename) — T-13.3-04 mitigation
        TMP="${CACHE}.tmp.$$"
        {
          printf '{\n'
          printf '  "checked_at": %s,\n' "${CHECKED_AT}"
          printf '  "current_tag": "%s",\n' "${DISPLAY_CURRENT}"
          printf '  "latest_tag": "%s",\n' "${LATEST_TAG}"
          printf '  "delta": "%s",\n' "${DELTA_KIND}"
          printf '  "is_newer": %s,\n' "${IS_NEWER}"
          # Escape the body for JSON — backslashes first, then quotes, then newlines.
          ESC="$(printf '%s' "${BODY_EXCERPT}" | sed -e 's/\\/\\\\/g' -e 's/"/\\"/g' | awk '{printf "%s\\n", $0}')"
          printf '  "changelog_excerpt": "%s"\n' "${ESC}"
          printf '}\n'
        } > "${TMP}" 2>/dev/null && mv "${TMP}" "${CACHE}" 2>/dev/null || rm -f "${TMP}" 2>/dev/null
      fi
    fi
  fi

  # 2. Read cache (whether freshly written or still valid).
  [ -f "${CACHE}" ] || exit 0  # no cache, nothing to do — silent exit

  C_LATEST="$(grep -E '"latest_tag"' "${CACHE}" 2>/dev/null | head -n1 | sed -E 's/.*"latest_tag"[[:space:]]*:[[:space:]]*"([^"]+)".*/\1/')"
  C_DELTA="$(grep -E '"delta"' "${CACHE}" 2>/dev/null | head -n1 | sed -E 's/.*"delta"[[:space:]]*:[[:space:]]*"([^"]+)".*/\1/')"
  # Allowlist-gate C_DELTA before it reaches any shell context (WR-04).
  case "${C_DELTA:-}" in
    major|minor|patch|off-cadence|none) : ;;
    *) C_DELTA="unknown" ;;
  esac
  C_NEWER="$(grep -E '"is_newer"' "${CACHE}" 2>/dev/null | head -n1 | sed -E 's/.*"is_newer"[[:space:]]*:[[:space:]]*(true|false).*/\1/')"
  C_BODY="$(grep -E '"changelog_excerpt"' "${CACHE}" 2>/dev/null | head -n1 | sed -E 's/.*"changelog_excerpt"[[:space:]]*:[[:space:]]*"(.*)".*/\1/' | sed -E 's/\\n/\n/g')"

  # 3. Gate: if cache says not newer, remove any stale banner and exit.
  if [ "${C_NEWER:-false}" != "true" ]; then
    rm -f "${BANNER}" 2>/dev/null
    exit 0
  fi

  # 4. Dismissal gate (D-13): if user already dismissed this exact tag, suppress.
  DISMISSED="$(read_dismissed)"
  if [ -n "${DISMISSED}" ] && [ "${DISMISSED}" = "${C_LATEST}" ]; then
    rm -f "${BANNER}" 2>/dev/null
    exit 0
  fi

  # 5. State-machine guard (D-11/D-12): suppress during plan|design|verify.
  STAGE="$(read_state_stage)"
  case "${STAGE}" in
    plan|design|verify)
      rm -f "${BANNER}" 2>/dev/null
      exit 0
      ;;
  esac

  # 6. All gates passed — render the banner atomically.
  TMP="${BANNER}.tmp.$$"
  {
    printf '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n'
    printf ' 📦 Plugin update: %s → %s (%s)\n' "${DISPLAY_CURRENT}" "${C_LATEST}" "${C_DELTA}"
    if [ -n "${C_BODY}" ]; then
      printf '%s\n' "${C_BODY}"
    fi
    printf ' Install: /gdd:update   Dismiss: /gdd:check-update --dismiss\n'
    printf '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n'
  } > "${TMP}" 2>/dev/null && mv "${TMP}" "${BANNER}" 2>/dev/null || rm -f "${TMP}" 2>/dev/null

  exit 0
fi
# When sourced (BASH_SOURCE != $0), fall through with function definitions loaded
# and without side effects. Sourcing callers must invoke functions explicitly.
