#!/usr/bin/env bash
set -e

# Provenance test: verifies RN-MIT attribution is present in all motion files
# and that no file contains incorrect "Remotion/" provenance.
#
# Run from the project root:
#   bash scripts/tests/test-motion-provenance.sh

PASS_COUNT=0
FAIL_COUNT=0

check_attribution() {
  local file="$1"
  local needle="React Native"

  if grep -q "$needle" "$file"; then
    echo "PASS: $file contains RN-MIT attribution"
    PASS_COUNT=$((PASS_COUNT + 1))
  else
    echo "FAIL: $file is missing RN-MIT attribution (expected: '$needle')"
    FAIL_COUNT=$((FAIL_COUNT + 1))
  fi
}

check_no_remotion() {
  local file="$1"

  if grep -q "Remotion/" "$file"; then
    echo "FAIL: $file contains wrong provenance string 'Remotion/'"
    FAIL_COUNT=$((FAIL_COUNT + 1))
  else
    echo "PASS: $file does not contain 'Remotion/'"
    PASS_COUNT=$((PASS_COUNT + 1))
  fi
}

FILES=(
  "reference/motion-easings.md"
  "reference/motion-interpolate.md"
  "reference/motion-spring.md"
  "scripts/lib/easings.cjs"
  "scripts/lib/spring.cjs"
)

echo "=== Attribution checks ==="
for f in "${FILES[@]}"; do
  check_attribution "$f"
done

echo ""
echo "=== Provenance contamination checks ==="
for f in "${FILES[@]}"; do
  check_no_remotion "$f"
done

echo ""
echo "=== Results: $PASS_COUNT passed, $FAIL_COUNT failed ==="

if [ "$FAIL_COUNT" -gt 0 ]; then
  exit 1
fi

exit 0
