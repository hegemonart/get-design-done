#!/usr/bin/env bash
# rollback-release.sh — manually delete a tag + GitHub Release. NOT called from CI.
# Usage: bash scripts/rollback-release.sh <version>
# Example: bash scripts/rollback-release.sh 1.0.7

set -euo pipefail

VERSION="${1:-}"
if [ -z "$VERSION" ]; then
  echo "Usage: $0 <version>"
  echo "Example: $0 1.0.7"
  exit 1
fi

TAG="v${VERSION}"
REPO="${GITHUB_REPOSITORY:-hegemonart/get-design-done}"

if ! command -v gh >/dev/null 2>&1; then
  echo "ERROR: gh CLI not found."
  exit 1
fi

echo "About to delete release + tag $TAG on $REPO."
echo "This is a DESTRUCTIVE operation. Confirm (y/N): "
read -r CONFIRM
if [ "$CONFIRM" != "y" ]; then
  echo "Aborted."
  exit 0
fi

# Delete the GitHub Release (this also deletes the tag ref on github.com).
gh release delete "$TAG" --repo "$REPO" --yes --cleanup-tag || {
  echo "Release delete failed or no release existed; attempting tag-only delete."
  gh api -X DELETE "repos/${REPO}/git/refs/tags/${TAG}" || true
}

# Also delete locally if the user has the tag.
git tag -d "$TAG" 2>/dev/null || true

echo "Rollback complete for $TAG."
echo "Note: clones that already pulled the tag retain it. Consider posting"
echo "      a deprecation note in the next CHANGELOG entry."
