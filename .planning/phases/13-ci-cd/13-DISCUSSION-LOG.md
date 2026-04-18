# Phase 13: CI/CD - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-04-18
**Phase:** 13-ci-cd
**Mode:** --auto (recommended defaults auto-selected, no interactive prompts)
**Areas discussed:** Workflow structure, Lint tooling, Plugin validation, Security gates, PR/branch hygiene, Release automation, README + docs

---

## Workflow structure

| Option | Description | Selected |
|--------|-------------|----------|
| Extend existing `ci.yml` | Add jobs to the Phase 12 file | ✓ (recommended) |
| Split across many workflow files | One file per concern (lint.yml, test.yml, etc.) | |
| Matrix-only in ci.yml, everything else inline in test job | Flatten all checks into the matrix | |

**Auto-selection:** Extend `ci.yml` with new jobs + separate `release.yml` for version-triggered release.
**Why recommended:** roadmap design note "CI/CD extends Phase 12's workflow file".

---

## Lint tooling

| Option | Description | Selected |
|--------|-------------|----------|
| markdownlint-cli2 + lychee + ajv-cli | Mature, widely-adopted stack | ✓ (recommended) |
| remark-lint + markdown-link-check + jsonschema (Python) | Alternative stack | |
| Custom homegrown | Write it all ourselves | |

**Auto-selection:** markdownlint-cli2 + lychee + ajv-cli.
**Why recommended:** active maintenance, GitHub Action availability, GSD precedent.

---

## Frontmatter + stale-ref validation

| Option | Description | Selected |
|--------|-------------|----------|
| Custom Node scripts reusing test logic | Port `tests/frontmatter.test.cjs` to CLI mode | ✓ (recommended) |
| External tool (frontmatter-validator npm) | Rely on external package | |
| Keep as test-only; no CI-specific script | Run the `.test.cjs` files directly | |

**Auto-selection:** Custom Node scripts at `scripts/validate-frontmatter.cjs` + `scripts/detect-stale-refs.cjs`.
**Why recommended:** repo-specific contracts already encoded in tests; CI-friendly output (line-per-finding) is a 30-line port.

---

## Secrets scanning

| Option | Description | Selected |
|--------|-------------|----------|
| gitleaks | Named in roadmap; standard tool | ✓ (recommended) |
| trufflehog | Comparable; higher false-positive rate | |
| GitHub secret-scanning (native) | Free on public repos, no config | |

**Auto-selection:** gitleaks via `gitleaks/gitleaks-action@v2`.
**Why recommended:** named in roadmap; well-maintained; config-driven.

---

## Branch protection rollout

| Option | Description | Selected |
|--------|-------------|----------|
| Advisory first, enforcing after first clean tag | Two-phase rollout | ✓ (recommended) |
| Enforcing from day one | All checks block merges immediately | |
| Documentation only, no enforcement | User applies protection themselves | |

**Auto-selection:** Two-phase — advisory checks on initial setup, enforcing after the first release smoke test passes cleanly.
**Why recommended:** roadmap says "can start advisory ... and tighten later"; matches user's direct-to-main workflow.

---

## Release automation

| Option | Description | Selected |
|--------|-------------|----------|
| Triggered by plugin.json version diff on main | Detect version change, tag + release | ✓ (recommended) |
| Triggered by manual `workflow_dispatch` | User clicks button each release | |
| Tag-first (user tags manually, workflow creates release) | Reverse order | |

**Auto-selection:** `push: main` trigger + `git diff HEAD^ HEAD -- plugin.json` version check.
**Why recommended:** zero-friction; version field is already the source of truth per roadmap.

---

## Release body source

| Option | Description | Selected |
|--------|-------------|----------|
| CHANGELOG.md section parser | Read `## [<version>]` section | ✓ (recommended) |
| Commits since last tag | Auto-generate from git log | |
| Manual release notes file | User writes release-notes/<version>.md | |

**Auto-selection:** Custom `scripts/extract-changelog-section.cjs` that greps the matching section.
**Why recommended:** single source of truth; CHANGELOG is already updated per phase closeout.

---

## Release-time smoke test rollback

| Option | Description | Selected |
|--------|-------------|----------|
| Documented manual rollback script | `scripts/rollback-release.sh` + docs | ✓ (recommended) |
| Fully automated rollback | CI deletes tag + release on failure | |
| No rollback (just alert) | Fail the job, humans decide | |

**Auto-selection:** Documented manual rollback.
**Why recommended:** deleting tags + releases automatically is risky for clones; human-in-the-loop is safer for v1.

---

## Claude's Discretion

- Exact `markdownlint-cli2` rule set (start permissive)
- Exact lychee retry/timeout/ignore config
- Exact `.gitleaks.toml` rule overrides (default ruleset first)
- README badge order and style
- Schema layout in `reference/schemas/` (one file per manifest)
- Commit messages and CHANGELOG phrasing

## Deferred Ideas

- Multi-runtime CI (Codex/Cline/Cursor)
- Real MCP calls in CI (keep mocks from Phase 12)
- Fully automated release rollback
- Real marketplace publish (placeholder job only)
- Token-cost regression gate (may land as soft-warn in 13-05 or defer to 13.1)
- Performance benchmarks
- Dependabot / Renovate
