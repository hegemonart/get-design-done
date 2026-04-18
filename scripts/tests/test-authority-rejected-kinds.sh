#!/usr/bin/env bash
# test-authority-rejected-kinds.sh
#
# Asserts that reference/authority-feeds.md does NOT contain trend-aggregator
# hosts OUTSIDE the explicit "## Rejected kinds" section. Enforces the anti-slop
# thesis structurally (CONTEXT.md D-08, D-28).
#
# Exit 0 = clean. Exit 1 = at least one rejected host appeared in the active
# whitelist, or the rejected-kinds section itself was removed.

set -euo pipefail

WHITELIST="${WHITELIST:-reference/authority-feeds.md}"

if [ ! -f "$WHITELIST" ]; then
  echo "FAIL: $WHITELIST not found." >&2
  exit 1
fi

# Split the file at the "## Rejected kinds" heading. Everything BEFORE it is
# the active whitelist; everything AFTER is the rejection manifest (which is
# allowed to mention these hosts — that's the whole point).
ACTIVE_SECTION="$(awk '/^## Rejected kinds/{exit} {print}' "$WHITELIST")"

REJECTED_PATTERNS=(
  'dribbble\.com'
  'behance\.net'
  'linkedin\.com'
  'medium\.com/topic'
  'producthunt\.com/posts'
  'top[[:space:]]*10[[:space:]]*ui'
  'trending-ui'
)

FAIL=0
for pat in "${REJECTED_PATTERNS[@]}"; do
  if echo "$ACTIVE_SECTION" | grep -iEq "$pat"; then
    echo "FAIL: rejected pattern '$pat' matched in active whitelist section of $WHITELIST." >&2
    FAIL=1
  fi
done

if [ "$FAIL" -ne 0 ]; then
  echo "" >&2
  echo "The whitelist must not contain trend-aggregator hosts outside the '## Rejected kinds' block." >&2
  echo "See .planning/phases/13.2-external-authority-watcher/13.2-CONTEXT.md §D-08." >&2
  exit 1
fi

# Also assert the rejected-kinds section itself is present — regression against
# someone deleting the section entirely.
if ! grep -q '^## Rejected kinds$' "$WHITELIST"; then
  echo "FAIL: '## Rejected kinds' section is missing from $WHITELIST." >&2
  exit 1
fi

echo "OK: $WHITELIST passes rejected-kinds check."
exit 0
