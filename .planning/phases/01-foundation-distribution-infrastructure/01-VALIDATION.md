---
phase: 1
slug: foundation-distribution-infrastructure
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-04-17
---

# Phase 1 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | bash smoke tests (no unit test runner) |
| **Config file** | none — manual checks and git operations |
| **Quick run command** | `bash scripts/bootstrap.sh` + `git status` + `claude plugin validate .` |
| **Full suite command** | Platform matrix: run quick on macOS + Windows Git Bash + Linux |
| **Estimated runtime** | ~15 seconds per platform |

---

## Sampling Rate

- **After every task commit:** Run the affected check (see Per-Task Verification Map)
- **After every plan wave:** `claude plugin validate .` + `git status`
- **Before `/gsd:verify-work`:** Full platform matrix must be green on at least one platform (Linux CI); macOS/Windows smoke-tested manually
- **Max feedback latency:** 15 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 01-01-01 | 01 | 1 | DIST-01 | manual | `grep -E "^\.planning/$" .gitignore` | ❌ W0 | ⬜ pending |
| 01-01-02 | 01 | 1 | DIST-02 | manual | `git ls-files .planning/ \| wc -l` returns 0 | ❌ W0 | ⬜ pending |
| 01-01-03 | 01 | 1 | DIST-03 | manual | `grep -E "Distribution" README.md` finds section | ❌ W0 | ⬜ pending |
| 01-02-01 | 02 | 1 | PLAT-01 | smoke | `grep -rn "\\\\|" skills/` returns 0 results | ❌ W0 | ⬜ pending |
| 01-02-02 | 02 | 1 | PLAT-02 | smoke | Grep match counts identical on macOS/Linux test project | ❌ W0 | ⬜ pending |
| 01-02-03 | 02 | 1 | PLAT-03 | manual | `cat .gitattributes` shows `*.md text eol=lf` | ❌ W0 | ⬜ pending |
| 01-02-04 | 02 | 1 | PLAT-04 | smoke | `bash scripts/bootstrap.sh` succeeds on Windows path with spaces | ❌ W0 | ⬜ pending |
| 01-02-05 | 02 | 1 | SCAN-04 | smoke | scan/SKILL.md fallback logic tried on no-src project returns matched path | ❌ W0 | ⬜ pending |
| 01-03-01 | 03 | 2 | STATE-01 | manual | `test -f .design/STATE.md` (template) returns 0 | ❌ W0 | ⬜ pending |
| 01-03-02 | 03 | 2 | STATE-02 | manual | Template documents read/write contract in comment/section | ❌ W0 | ⬜ pending |
| 01-03-03 | 03 | 2 | STATE-03 | manual | Template has `<position>` section with wave + task_progress fields | ❌ W0 | ⬜ pending |
| 01-04-01 | 04 | 2 | AGENT-00 | manual | `test -f agents/README.md` + grep for frontmatter, markers, required_reading | ❌ W0 | ⬜ pending |
| 01-04-02 | 04 | 2 | CONN-00 | manual | `test -f connections/connections.md` + grep for capability matrix | ❌ W0 | ⬜ pending |
| 01-04-03 | 04 | 2 | CONN-00 | manual | `test -f connections/refero.md` + `! test -f reference/refero.md` (git mv completed) | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] No test stubs needed — Phase 1 is infrastructure (files, config, git operations), not code logic
- [ ] Shared fixtures: none
- [ ] Manual verification checklist assembled in 01-02-PLAN.md for platform smoke tests

---

## Nyquist Compliance

Phase 1 has no automated unit tests — validation is:
- **Static checks:** grep/find commands confirm file presence and content (automatable)
- **Smoke tests:** `claude plugin validate .` + bootstrap execution (automatable on Linux CI)
- **Platform matrix:** manual verification on macOS + Windows Git Bash (one-time per phase)

This is appropriate for an infrastructure phase. Phase 2+ (agent work) may introduce testable logic.
