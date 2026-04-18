#!/usr/bin/env bash
# apply-branch-protection.sh — manually apply branch protection to `main`.
# Per D-16: this script is run by the repo admin locally, NOT from CI.
# Usage:
#   bash scripts/apply-branch-protection.sh --advisory
#   bash scripts/apply-branch-protection.sh --enforcing
#   bash scripts/apply-branch-protection.sh --disable

set -euo pipefail

MODE="${1:-}"
REPO="${GITHUB_REPOSITORY:-hegemonart/get-design-done}"

if ! command -v gh >/dev/null 2>&1; then
  echo "ERROR: gh CLI not found. Install from https://cli.github.com/"
  exit 1
fi

case "$MODE" in
  --advisory)
    echo "Applying ADVISORY branch protection to $REPO main..."
    gh api -X PUT "repos/${REPO}/branches/main/protection" \
      -H "Accept: application/vnd.github+json" \
      -f "required_status_checks=null" \
      -F "enforce_admins=false" \
      -f "required_pull_request_reviews=null" \
      -F "restrictions=null" \
      -F "required_linear_history=false" \
      -F "allow_force_pushes=true" \
      -F "allow_deletions=false"
    echo "Advisory mode applied. CI checks will run but not block merges."
    ;;
  --enforcing)
    echo "Applying ENFORCING branch protection to $REPO main..."
    # Status check names must match the `name:` field of each job exactly.
    # See reference/BRANCH-PROTECTION.md §Phase B for the authoritative list.
    gh api -X PUT "repos/${REPO}/branches/main/protection" \
      -H "Accept: application/vnd.github+json" \
      --input - <<'JSON'
{
  "required_status_checks": {
    "strict": true,
    "contexts": [
      "Lint (markdown + frontmatter + stale-refs)",
      "Validate (schemas + plugin + shellcheck)",
      "Test (Node 22 / ubuntu-latest)",
      "Test (Node 22 / macos-latest)",
      "Test (Node 22 / windows-latest)",
      "Test (Node 24 / ubuntu-latest)",
      "Test (Node 24 / macos-latest)",
      "Test (Node 24 / windows-latest)",
      "Security (secrets + injection scan)",
      "Size budget (blocking)"
    ]
  },
  "enforce_admins": false,
  "required_pull_request_reviews": null,
  "restrictions": null,
  "required_linear_history": true,
  "allow_force_pushes": false,
  "allow_deletions": false
}
JSON
    echo "Enforcing mode applied. CI must pass before merge; linear history required."
    ;;
  --disable)
    echo "Removing branch protection from $REPO main..."
    gh api -X DELETE "repos/${REPO}/branches/main/protection" || true
    echo "Protection removed."
    ;;
  *)
    echo "Usage: $0 --advisory | --enforcing | --disable"
    exit 1
    ;;
esac
