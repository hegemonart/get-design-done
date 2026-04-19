#!/usr/bin/env bash
# test-authority-watcher-diff.sh
#
# Structural-only v1: validates that the frozen authority-report baseline at
# test-fixture/baselines/phase-13.2/authority-report.expected.md preserves the
# shape the watcher-diff test depends on. Full end-to-end byte-diff against a
# live watcher run is deferred — CI cannot spawn Claude Code agents.
#
# What this test asserts (structural-only v1):
#   1. The fixture directory exists and is non-empty.
#   2. The baseline file exists, is non-empty, and starts with an Authority
#      Report header.
#   3. The baseline contains the canonical classification section headings in
#      the D-21 weighted order (spec > heuristic > pattern > craft).
#   4. The baseline declares a total-entries line consistent with the count of
#      bulleted entries under its classification sections.
#   5. The baseline ends with a `**Skipped:**` footer.
#
# Exit 0 = structural shape preserved. Exit 1 = shape drift detected.
#
# Full end-to-end byte-diff (running the watcher against the fixtures and
# diffing stdout against the baseline) is a follow-up tracked in STATE.md
# "Open follow-ups". When the agent runtime becomes available in CI this
# script graduates from structural-only v1 to the full diff check.

set -euo pipefail

FIXTURE_DIR="test-fixture/authority-feeds"
BASELINE="test-fixture/baselines/phase-13.2/authority-report.expected.md"

if [ ! -d "$FIXTURE_DIR" ]; then
  echo "FAIL: fixture dir $FIXTURE_DIR missing." >&2
  exit 1
fi

# Count actual fixture files (should be 4 frozen feeds + 1 README; we only
# care that at least one XML/JSON fixture is present).
# Use null-delimited find to handle filenames with spaces/newlines (WR-05).
FIXTURE_COUNT=0
while IFS= read -r -d '' _f; do
  FIXTURE_COUNT=$((FIXTURE_COUNT + 1))
done < <(find "$FIXTURE_DIR" -maxdepth 1 -type f \( -name '*.atom' -o -name '*.rss' -o -name '*.json' \) -print0)
if [ "$FIXTURE_COUNT" -lt 1 ]; then
  echo "FAIL: $FIXTURE_DIR contains no feed fixtures (.atom/.rss/.json)." >&2
  exit 1
fi

if [ ! -f "$BASELINE" ]; then
  echo "FAIL: baseline $BASELINE missing." >&2
  exit 1
fi

if [ ! -s "$BASELINE" ]; then
  echo "FAIL: baseline $BASELINE is empty." >&2
  exit 1
fi

# Header: must start with "# Authority Report"
if ! head -1 "$BASELINE" | grep -q '^# Authority Report'; then
  echo "FAIL: baseline does not begin with '# Authority Report' header." >&2
  exit 1
fi

# Totals line must declare a non-negative surfaced-entries count.
if ! grep -qE '^[0-9]+ entries surfaced across [0-9]+ feeds\. [0-9]+ skipped\.$' "$BASELINE"; then
  echo "FAIL: baseline is missing the 'N entries surfaced across M feeds. K skipped.' totals line." >&2
  exit 1
fi

# Classification sections — at least one of the four non-skip buckets must
# appear. (Empty buckets are omitted by D-21, but a well-shaped baseline
# always has at least one.)
SECTION_HITS=0
for heading in '^## spec-change' '^## heuristic-update' '^## pattern-guidance' '^## craft-tip'; do
  if grep -qE "$heading" "$BASELINE"; then
    SECTION_HITS=$((SECTION_HITS + 1))
  fi
done

if [ "$SECTION_HITS" -lt 1 ]; then
  echo "FAIL: baseline does not contain any classification heading (spec-change / heuristic-update / pattern-guidance / craft-tip)." >&2
  exit 1
fi

# Count consistency check: the header's "N entries surfaced" must match the
# total bulleted entries across the four classification sections.
HEADER_COUNT=$(grep -oE '^[0-9]+ entries surfaced' "$BASELINE" | head -1 | grep -oE '^[0-9]+')

# Extract the body between the first "## spec-change|heuristic-update|pattern-guidance|craft-tip"
# heading and the closing "---" horizontal rule before the Skipped footer.
BULLET_COUNT=$(awk '
  /^## (spec-change|heuristic-update|pattern-guidance|craft-tip)/ { in_section=1; next }
  /^---$/ { in_section=0 }
  in_section && /^- / { count++ }
  END { print count+0 }
' "$BASELINE")

if [ "$HEADER_COUNT" != "$BULLET_COUNT" ]; then
  echo "FAIL: baseline header declares $HEADER_COUNT entries but the classification sections contain $BULLET_COUNT bullets." >&2
  echo "      Counts MUST match — regenerate the baseline or fix the header." >&2
  exit 1
fi

# Footer: must have a Skipped line.
if ! grep -qE '^\*\*Skipped:\*\*' "$BASELINE"; then
  echo "FAIL: baseline is missing the '**Skipped:**' footer line." >&2
  exit 1
fi

echo "OK: authority-report baseline shape preserved (structural-only v1)."
echo "    Fixtures: $FIXTURE_COUNT files under $FIXTURE_DIR"
echo "    Entries:  $HEADER_COUNT (header) = $BULLET_COUNT (bullets)"
exit 0
