#!/usr/bin/env bash
# Phase 41 — opt-in pre-commit hook: run gdd-detect on staged HTML/CSS/JSX and block the commit on
# any finding. INSTALL (opt-in, never auto-wired):
#
#   ln -sf ../../scripts/hooks/pre-commit-detect.sh .git/hooks/pre-commit
#
# Or call it from an existing .git/hooks/pre-commit. Offline + dep-free (regex-fast).
set -euo pipefail

ROOT="$(git rev-parse --show-toplevel)"
DETECT="$ROOT/bin/gdd-detect"

# Staged, added/copied/modified files with a scannable extension.
mapfile -t FILES < <(git diff --cached --name-only --diff-filter=ACM \
  | grep -E '\.(html?|css|scss|jsx|tsx|js|ts|vue|svelte)$' || true)

if [ "${#FILES[@]}" -eq 0 ]; then
  exit 0
fi

status=0
for f in "${FILES[@]}"; do
  [ -f "$ROOT/$f" ] || continue
  if ! node "$DETECT" "$ROOT/$f" --fast >/dev/null 2>&1; then
    rc=$?
    if [ "$rc" -eq 2 ]; then
      echo "gdd-detect: anti-pattern(s) in $f" >&2
      node "$DETECT" "$ROOT/$f" --fast >&2 || true
      status=2
    fi
  fi
done

if [ "$status" -ne 0 ]; then
  echo "" >&2
  echo "Commit blocked by gdd-detect. Fix the findings above, or commit with --no-verify to bypass." >&2
  exit 1
fi
exit 0
