---
phase: 7
slug: claude-design-integration
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-04-18
---

# Phase 7 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | grep / bash / file-existence checks (no test runner — plugin is markdown + SKILL.md files) |
| **Config file** | none — validation is structural/grep-based |
| **Quick run command** | `ls connections/claude-design.md connections/pinterest.md 2>/dev/null && echo OK` |
| **Full suite command** | See Per-Task Verification Map below |
| **Estimated runtime** | ~5 seconds |

---

## Sampling Rate

- **After every task commit:** Run the task's `File Exists` check
- **After every plan:** Run all checks for that plan
- **Before `/gsd:verify-work`:** All checks must be green
- **Max feedback latency:** ~5 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 06-01-01 | 01 | 1 | CDES-01 | file-exists | `test -f connections/claude-design.md && echo OK` | ✅ | ⬜ pending |
| 06-01-02 | 01 | 1 | PINS-01 | file-exists | `test -f connections/pinterest.md && echo OK` | ✅ | ⬜ pending |
| 06-01-03 | 01 | 1 | PINS-01 | grep | `grep -q "pinterest" connections/connections.md && echo OK` | ✅ | ⬜ pending |
| 06-01-04 | 01 | 1 | CDES-01 | grep | `grep -q "claude-design" connections/connections.md && echo OK` | ✅ | ⬜ pending |
| 06-02-01 | 02 | 2 | CDES-02 | grep | `grep -q "Step 0B" agents/design-context-builder.md && echo OK` | ✅ | ⬜ pending |
| 06-02-02 | 02 | 2 | CDES-02 | grep | `grep -q "handoff_source" agents/design-context-builder.md && echo OK` | ✅ | ⬜ pending |
| 06-02-03 | 02 | 2 | CDES-03 | grep | `grep -q "handoff_source" reference/STATE-TEMPLATE.md && echo OK` | ✅ | ⬜ pending |
| 06-03-01 | 03 | 2 | CDES-04 | grep | `grep -q "handoff" SKILL.md && echo OK` | ✅ | ⬜ pending |
| 06-03-02 | 03 | 2 | CDES-04 | grep | `grep -q "from-handoff\|handoff" SKILL.md && echo OK` | ✅ | ⬜ pending |
| 06-03-03 | 03 | 2 | CDES-05 | grep | `grep -qi "post-handoff\|post_handoff" skills/verify/SKILL.md && echo OK` | ✅ | ⬜ pending |
| 06-03-04 | 03 | 2 | CDES-05 | grep | `grep -qi "handoff faithfulness\|Handoff Faithfulness" skills/verify/SKILL.md && echo OK` | ✅ | ⬜ pending |
| 06-04-01 | 04 | 3 | PINS-01 | grep | `grep -q "pinterest\|Pinterest" agents/design-context-builder.md && echo OK` | ✅ | ⬜ pending |
| 06-04-02 | 04 | 3 | PINS-01 | grep | `grep -q "pinterest\|Pinterest" skills/discover/SKILL.md && echo OK` | ✅ | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

Existing infrastructure covers all phase requirements — this phase adds markdown documentation files and extends existing SKILL.md + agent files. No test framework setup needed.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| `handoff` sub-command routes to verify without running scan/discover | CDES-04 | Requires live Claude Code session | Run `/ultimate-design handoff` on a project with no prior pipeline state; confirm verify stage starts |
| Pinterest MCP probe returns correct status | PINS-01 | Requires live Pinterest MCP server | Configure Pinterest MCP, run `/ultimate-design discover`, check STATE.md `<connections>` for `pinterest: available` |
| Handoff bundle HTML parsing extracts D-XX decisions | CDES-02 | Requires Claude Design HTML export | Export a design from claude.ai/design, run handoff command, verify DESIGN-CONTEXT.md contains pre-populated D-XX decisions tagged `(source: claude-design-handoff)` |
| Handoff Faithfulness section appears in verification output | CDES-05 | Requires full handoff workflow | Complete post-handoff verify run; confirm DESIGN-VERIFICATION.md contains `## Handoff Faithfulness` section with color/typography/spacing fidelity scores |

---

## Validation Sign-Off

- [ ] All tasks have file-exists or grep verify
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0: not needed (no new test infrastructure required)
- [ ] No watch-mode flags
- [ ] Feedback latency < 5s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
