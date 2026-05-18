# Phase 28.5 — Deferred Items

Out-of-scope discoveries surfaced during execution but not addressed by the
current plan. Logged here per SCOPE BOUNDARY rule (only auto-fix issues
DIRECTLY caused by the current task's changes).

## During 28.5-11 execution

### `tests/gdd-health-mcp-row.test.cjs` — 2 pre-existing failures

- `27.7-04: SKILL step references harness settings file + mcp_nudge dismissal`
- `27.7-04: SKILL contains at least 4 of 5 expected row strings verbatim`

**Status:** Pre-existing. Confirmed at commit `4f3a3de` (before 28.5-11
started). The 28.5-06 health rework reduced the MCP-row block to a one-line
prose summary + cross-link to `reference/health-mcp-detection.md`, while
the Phase 27.7-04 test expectations expected the verbatim 5-row block
present in the pre-rework health SKILL.md.

**Suggested resolution:** Either (a) update the 27.7-04 test to match the
post-rework collapsed form (one-line summary), or (b) restore the
verbatim 5-row block to health SKILL.md and accept the line-count cost.
This is a Phase 28.5 closeout candidate or a separate follow-up. NOT in
scope for 28.5-11 (CI gate + baseline).

**Tracking:** This may have been intentionally accepted as part of the
28.5-06 SUMMARY — review there before changing the test.
