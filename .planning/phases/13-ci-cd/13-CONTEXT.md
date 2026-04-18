# Phase 13: CI/CD - Context

**Gathered:** 2026-04-18
**Status:** Ready for planning
**Mode:** --auto (recommended defaults auto-selected)

<domain>
## Phase Boundary

Layer a full CI/CD pipeline on top of Phase 12's basic test-runner. Every push validates markdown + JSON schemas + frontmatter + shell scripts across a Linux/macOS/Windows × Node 22/24 matrix. Every `plugin.json` version bump auto-tags + auto-releases + runs a release-time smoke test. PR template + branch protection enforce version-bump, CHANGELOG, and baseline-relock per phase closeout.

**In scope:** `.github/workflows/*.yml` expansion, `reference/schemas/*.json` schemas, frontmatter validator, stale-ref detector, `shellcheck`, `gitleaks`, injection-scanner CI mode, blocking agent-size-budget gate, PR template, branch protection config, CODEOWNERS, auto-tag + release automation, release-time smoke test, README badges, CONTRIBUTING.md, baseline lock for phase-13.

**Out of scope:** Multi-runtime support (Codex, Cline, Cursor) — deferred per roadmap. Real MCP calls in CI — connections probed via Phase 12's mocked fixtures only. New test infrastructure — CI orchestrates the existing `node --test` suite from Phase 12.

</domain>

<decisions>
## Implementation Decisions

### Workflow file structure
- **D-01:** Extend `.github/workflows/ci.yml` (the Phase 12 file) rather than create a new one. Add new jobs to the existing workflow; keep `test` job as the core matrix. **Why:** single file = easier to reason about, matches "extend not replace" in the roadmap design notes.
- **D-02:** Split validation/lint/security/release across **separate jobs within `ci.yml`** (not separate workflow files), except for the release workflow which is event-triggered (push-to-main + version change) and lives in `.github/workflows/release.yml`. **Why:** PR CI is one logical unit; release is a distinct trigger.
- **D-03:** Use `needs:` dependencies to enforce fast-fail ordering — lint → validate → test → security gates. Expensive matrix only runs after cheap lint passes.

### Markdown + lint tooling
- **D-04:** Markdown lint: **`markdownlint-cli2`** (via `DavidAnson/markdownlint-cli2-action@v16` or npm pin) with a `.markdownlint.jsonc` at repo root. **Why:** widely adopted, fast, configurable per-rule; GSD uses it.
- **D-05:** Link checker: **`lychee`** (via `lycheeverse/lychee-action@v2`) with a `.lycheeignore` for known-unstable external refs. **Why:** fast Rust implementation, handles Markdown + `@file` refs, configurable exclusions.
- **D-06:** JSON schema validation: **`ajv-cli`** pinned via `npx ajv-cli` with schemas authored at `reference/schemas/*.json`. **Why:** Draft-07 support, integrates with `package.json` scripts, reusable across CI + local dev.
- **D-07:** Frontmatter validator: **custom Node script** at `scripts/validate-frontmatter.cjs` reusing the existing `tests/frontmatter.test.cjs` logic. Output CI-friendly (one finding per line, exits nonzero on failure). **Why:** the repo already owns the frontmatter contract — porting is cheaper than bolting on an external tool.
- **D-08:** Stale-ref detector: **custom Node script** at `scripts/detect-stale-refs.cjs` scanning for legacy namespaces (`/design:*`, `design-context-builder`, etc.) across all `.md` files. Uses `reference/DEPRECATIONS.md` as the authoritative list. **Why:** repo-specific rule set; reusing DEPRECATIONS.md means no dual-source drift.

### Plugin validation
- **D-09:** Run `claude plugin validate .` in CI via `anthropic-cc/claude-code-action@v1` if available; otherwise **schema-only fallback**: validate `plugin.json` + `marketplace.json` + `hooks/hooks.json` against `reference/schemas/`. **Why:** CLI support for headless validate is fresh; schema fallback keeps CI green while the CLI matures.
- **D-10:** `shellcheck`: use the **`ludeeus/action-shellcheck@master`** GitHub Action, with `scripts/*.sh` in scope, severity = `error`. **Why:** popular, well-maintained, configurable.
- **D-11:** Hardcoded-path detection: custom `grep -n '/Users/\|/home/\|C:\\\\'` check scoped to `scripts/` + `reference/` + `agents/` + `skills/`. **Why:** we've already standardized on `$HOME` / relative paths in Phase 1; this is a guardrail.

### Security + quality gates
- **D-12:** Secrets scanning: **`gitleaks`** via `gitleaks/gitleaks-action@v2` with a `.gitleaks.toml` config. On first run, scan full git history; thereafter, scan only pushed commits. **Why:** the roadmap names gitleaks directly; zero friction to adopt.
- **D-13:** Injection-scanner in CI: run the existing `gdd-read-injection-scanner` hook (from Phase 7) in a non-interactive mode against all shipped `reference/*`, `skills/**/SKILL.md`, `agents/*.md`. Script: `scripts/run-injection-scanner-ci.cjs`. **Why:** we already have the scanner — just need a CI entry point.
- **D-14:** Agent size-budget — **blocking**. Phase 12's `tests/agent-size-budget.test.cjs` already exists and exits nonzero on overage. CI adds a `size-budget` job that runs only this test separately with a clear failure message + link to the rationale override process in `CONTRIBUTING.md`. **Why:** the roadmap explicitly says "Phase 12 has the test; Phase 13 makes it blocking" and surfacing this as its own job makes failures actionable.

### PR + branch hygiene
- **D-15:** PR template at `.github/pull_request_template.md` with checklist: phase affected / version bumped (Y/N) / CHANGELOG updated (Y/N) / baselines relocked (Y/N) / tests pass. Free-text section for context. **Why:** roadmap names these items; a checklist is the lightest-weight nudge.
- **D-16:** Branch protection: ship config as documentation (`reference/BRANCH-PROTECTION.md` + `scripts/apply-branch-protection.sh` using `gh api`) rather than in-repo automation. **Why:** branch protection is an API call, not a file; the user applies it once via the script. Avoids leaking repo admin credentials into CI.
- **D-17:** Branch protection posture: **advisory on rollout, enforcing after smoke-test of release workflow passes once on a real tag**. Document this two-phase rollout in the README + CONTRIBUTING. **Why:** roadmap explicitly says "can start advisory ... and tighten later" — matches the user's direct-to-main workflow.
- **D-18:** CODEOWNERS at `.github/CODEOWNERS` pinning `hegemonart` as owner for every path. Solo-maintainer default. **Why:** future contributors need a single review gate; solo case is trivial.

### Release automation
- **D-19:** Auto-tag workflow: **`.github/workflows/release.yml`** triggered on `push: branches: [main]`. Detects `plugin.json` version change via `git diff HEAD^ HEAD -- .claude-plugin/plugin.json`. On change: creates git tag `v<version>`, creates GitHub Release with the matching `## [<version>]` section from `CHANGELOG.md` as body. **Why:** simple, hermetic; no external bot accounts needed.
- **D-20:** GitHub Release creation: **`softprops/action-gh-release@v2`** (standard, widely used). **Why:** no-friction, handles tag + release in one step, supports body from file.
- **D-21:** Changelog parsing: **custom Node script** at `scripts/extract-changelog-section.cjs` that greps `CHANGELOG.md` for the `## [<version>]` heading and emits the section body until the next `## [`. **Why:** 20 lines; no dependency needed.
- **D-22:** Release-time smoke test job: on tag creation, `needs: [tag]` job that does `git clone` of the tag, runs `npm install`, runs `/gdd:explore` against `test-fixture/src/`, diffs the resulting `.design/DESIGN.md` against `test-fixture/baselines/phase-13/DESIGN.md`. On diff: the job fails; we document `scripts/rollback-release.sh` for manual tag+release deletion. **Why:** full automation of rollback is risky (deleting tags breaks clones); documented manual rollback is a reasonable v1.
- **D-23:** Marketplace publish webhook: placeholder job `marketplace-publish` that only logs "no-op — marketplace registry pending". **Why:** roadmap item 15 explicitly asks for this placeholder.

### README + docs
- **D-24:** README badges: GitHub Actions build status, Node versions, plugin version (from `plugin.json`), license (MIT). Use **shields.io** for static badges, **github.com/<repo>/actions/workflows/ci.yml/badge.svg** for live build status. **Why:** standard; no custom infra.
- **D-25:** CONTRIBUTING.md lives at repo root. Sections: branch strategy (direct-to-main OK while solo), PR checklist, required checks list, version-bump workflow (edit `plugin.json` → push → release automation does the rest), how to relock baselines (rerun `/gdd:explore` on `test-fixture/`, copy `.design/` output into `test-fixture/baselines/phase-N/`). **Why:** roadmap names these sections.
- **D-26:** Baseline lock: `test-fixture/baselines/phase-13/` contains `DESIGN.md` + `DESIGN-DEBT.md` + `DESIGN-CONTEXT.md` from running `/gdd:explore` on the frozen fixture after all Phase 13 CI lands. **Why:** matches Phase 10/11 pattern in `test-fixture/baselines/`.

### Claude's Discretion
- Exact `markdownlint-cli2` rule set (start permissive, tighten later — Claude can pick a sensible baseline).
- Exact lychee config (Claude can pick reasonable retry/timeout defaults).
- Exact gitleaks rule overrides (Claude can pick — the default ruleset is fine; any false positives get exceptions in `.gitleaks.toml`).
- Exact badge order in README.
- Path/layout of `reference/schemas/` — one file per schema or one combined file.
- Commit messages and CHANGELOG entry phrasing for Phase 13.
</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase 13 spec + dependencies
- `.planning/ROADMAP.md` §Phase 13 — Goal, Depends-on, Requirements, Success Criteria (18 items across Waves A/B/C), 8 plan titles, design notes.
- `.planning/ROADMAP.md` §Version-bump-and-release-cadence — v1.0.7 target, sequential patch bumps.
- `.planning/ROADMAP.md` §Parallelization — Phase 13 is sequential after Phase 12.

### Existing infrastructure this phase layers on
- `.github/workflows/ci.yml` — Phase 12 base CI (matrix already defined; Phase 13 extends with new jobs).
- `tests/agent-size-budget.test.cjs` — exists; Phase 13 wires it into a blocking CI job.
- `tests/frontmatter.test.cjs` — shares logic with `scripts/validate-frontmatter.cjs` (new).
- `tests/regression-baseline.test.cjs` — baseline comparison logic; Phase 13's release smoke test reuses the same diff pattern.
- `package.json` §scripts — `npm test` already runs `node --test tests/**/*.cjs`; new scripts added under `scripts`.
- `.claude-plugin/plugin.json` + `.claude-plugin/marketplace.json` — version fields consumed by release automation.
- `CHANGELOG.md` — section parser reads `## [<version>]` headings.
- `test-fixture/` — fixture root for release-time smoke test; `test-fixture/baselines/phase-*/` is the comparison source.
- `reference/DEPRECATIONS.md` — authoritative list of legacy namespaces for stale-ref detector (if doesn't exist yet, it's created in this phase or inherited from Phase 7 hygiene work).

### Schema sources (to author in this phase)
- `reference/schemas/plugin.schema.json` — validates `.claude-plugin/plugin.json`.
- `reference/schemas/marketplace.schema.json` — validates `.claude-plugin/marketplace.json`.
- `reference/schemas/hooks.schema.json` — validates `hooks/hooks.json`.
- `reference/schemas/config.schema.json` — validates `.design/config.json` (Phase 10.1).
- `reference/schemas/intel.schema.json` — validates `.design/intel/*.json` (Phase 10).

### Phase 12 prerequisites (read for context, not re-implement)
- `tests/commands.test.cjs`, `tests/hook-validation.test.cjs`, `tests/schema-drift.test.cjs`, `tests/stale-colon-refs.test.cjs` — existing Phase 12 tests CI will orchestrate.
- `.planning/phases/12-test-coverage/12-0*-SUMMARY.md` — what landed, what's known to be tested.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- **`.github/workflows/ci.yml`** — already runs the matrix (Node 22/24 × Linux/macOS/Windows). Phase 13 adds jobs, does not replace.
- **`tests/*.test.cjs`** — 16 existing tests including frontmatter, size-budget, hook validation, schema-drift, stale-colon-refs. These cover most of Phase 13's validation logic at test level; CI just needs to run them + surface failures at the right severity.
- **`scripts/bootstrap.sh`** — target of `shellcheck` (already Phase 1 hardened).
- **`.claude-plugin/`** — has `plugin.json` + `marketplace.json`; the version-bump detector reads from here.
- **`test-fixture/baselines/phase-6/`, `phase-8/`, `phase-10/`, `phase-11/`** — baseline layout already established; Phase 13 adds `phase-13/`.

### Established Patterns
- All repo scripts use `#!/usr/bin/env bash` + relative paths + `$HOME` (Phase 1 cross-platform discipline).
- Tests use `node:test` + `node:assert` — no external test framework. Phase 13 scripts should follow the same stdlib-only convention.
- Atomic commits per task (Phase 2 discipline). Release workflow should NOT create merge commits — it only creates tags + releases.
- Regression baselines are directory snapshots in `test-fixture/baselines/phase-N/` — same layout required for phase-13.

### Integration Points
- `ci.yml` → new jobs added before the existing `test` matrix (fast-fail lint first) and after (security/size-budget gates).
- `release.yml` (new) → triggered independently by push-to-main, reads `plugin.json` diff.
- `CONTRIBUTING.md` (new) → root-level, referenced from README badge row.
- `reference/schemas/` (new dir) → authored under existing `reference/` convention.
- `.github/CODEOWNERS`, `.github/pull_request_template.md` — standard GitHub locations.

</code_context>

<specifics>
## Specific Ideas

- User's workflow is direct pushes to `main`. Branch protection rollout is **two-phase**: (1) advisory checks first push, (2) enforcing after the first clean tag+release smoke test. Document both phases in CONTRIBUTING.md.
- Solo maintainer today → CODEOWNERS pins one user; PR template is a self-review checklist, not a review-assignment tool.
- `claude plugin validate .` CLI support is new and may not be available on all CI runner images. Ship schema-only fallback so CI stays green if the CLI install fails.
- Gitleaks first-run scans full history once; subsequent runs scan only incremental commits (controlled via action config).
- Release-time smoke test intentionally uses `/gdd:explore` (not the full pipeline) — it's the fastest end-to-end check that the installed plugin actually runs against a fixture. Expensive verify/design stages are out of scope for smoke.

</specifics>

<deferred>
## Deferred Ideas

- **Multi-runtime CI (Codex/Cline/Cursor)** — per roadmap design notes, deferred to later phases. Phase 13 targets Claude Code runner images only.
- **Real MCP calls in CI** — MCPs are mocked via Phase 12 fixtures. Live MCP integration tests deferred.
- **Full release rollback automation** — Phase 13 ships documented manual rollback (`scripts/rollback-release.sh` that takes a tag + deletes). Fully automated rollback with git history restoration is deferred as too risky for v1.
- **Marketplace publish** — placeholder job only; real marketplace webhook lands when a registry exists.
- **Token-cost regression gate** — roadmap design note mentions CI reading `cost-report.md` from Phase 10.1. Noted but not in the Wave list; implementing as a **soft warn** (log only, no block) inside the existing CI run is a stretch goal for plan 13-05 or 13-08; otherwise deferred to a Phase 13.1 patch.
- **Performance benchmarks** (pipeline run time budget) — deferred.
- **Dependabot / Renovate** for Node deps — deferred.

</deferred>

---

*Phase: 13-ci-cd*
*Context gathered: 2026-04-18*
*Mode: auto (recommended defaults applied; all gray areas auto-resolved)*
