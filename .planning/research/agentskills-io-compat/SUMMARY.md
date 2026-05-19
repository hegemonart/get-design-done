---
phase: 28.8
plan: A2
created: 2026-05-19
type: aggregate-verification-report
verdicts_confirmed: 3
verdicts_deferred: 1
verdicts_not_applicable: 1
lint_failures: 0
lint_warnings: 32
lint_passes: 38
skills_total: 70
---

# agentskills.io Cross-Runtime Compat Verification — Summary

Scope: 5-runtime subset per Wave A research § Plan 28-8-A2 verification subset (`.planning/research/agentskills-io-2026-05-19.md` lines 166-178). The subset rule: a runtime is in-scope iff (a) it claims agentskills.io compat AND (b) it is in our Phase 28.7 14-runtime install list AND (c) the claim is on the `skills/` surface axis. Out-of-subset runtimes are documented in the exclusions table at the bottom.

Lint reference: `scripts/lint-agentskills-spec.cjs skills/` (A1 lint script, D-13 lint-only branch). Single invocation; same output captured into each per-runtime report. Exit code **0**, summary line: `70 skills, 38 PASS, 32 WARN, 0 FAIL`.

## Aggregate Table

| Runtime         | Claimed status   | Our install kind         | Our converter                                       | Lint result | Verdict          |
|-----------------|------------------|--------------------------|-----------------------------------------------------|-------------|------------------|
| Cursor          | claim-only (SPA) | skills/                  | converters/cursor.cjs                               | pass (0 FAIL) | confirmed      |
| Codex           | full / verified  | skills/                  | converters/codex.cjs                                | pass (0 FAIL) | confirmed      |
| VS Code Copilot | full / verified  | skills/ (gap: no `chatSkills` manifest emit) | none (no `vscode-copilot.cjs`)    | pass (0 FAIL) | deferred       |
| Claude Code     | full (superset)  | skills/ (passthrough)    | none (canonical, `null` converter)                  | pass (0 FAIL) | confirmed      |
| Kilo            | full / verified  | command/                 | converters/kilo.cjs                                 | pass (0 FAIL) | not-applicable |

Verdict distribution: **3 confirmed, 1 deferred, 1 not-applicable**.

Per-runtime reports: [cursor.md](./cursor.md) · [codex.md](./codex.md) · [vscode-copilot.md](./vscode-copilot.md) · [claude-code.md](./claude-code.md) · [kilo.md](./kilo.md)

## Overall Verdict

**3 of 5 subset runtimes are confirmed on the agentskills.io spec schema axis:** Cursor (schema-only — doc-level SPA-deferred), Codex (most explicit static-fetch citation), and Claude Code (canonical / passthrough by construction). All three have install paths landing on the `skills/` surface and their inputs (our 70-skill source tree) pass A1 lint with 0 FAIL.

**1 deferred (VS Code Copilot):** our 70 source skills are spec-compliant, but our installer does not emit the `package.json`-with-`contributes.chatSkills` manifest required to surface skills inside VS Code Copilot's UI. The existing `copilot.cjs` converter targets the GitHub Copilot file-drop surface, not the VS Code extension contribution surface — flag for Phase 28.9+ scoping.

**1 not-applicable (Kilo):** our Phase 28.7 install routes to Kilo's `command/` slash-command surface per the D-10 surface choice. The agentskills.io spec governs the `skills/` schema, which is orthogonal to our chosen install path for Kilo.

**Wave A D-13 lint-only branch VALIDATED:** Wave A predicted zero lint failures because Phase 28.5 frontmatter is a strict superset of the spec-required `name` + `description` fields. The empirical observation matches: 0 FAIL across 70 skills (38 PASS, 32 WARN advisory). The A1 lint script (`scripts/lint-agentskills-spec.cjs`) is sufficient ongoing enforcement; no consolidated-converter (D-11) work is required, and no schema breakage was introduced. The 32 W2 warnings are Phase 28.5 D-01 >200-char description advisories — intentionally permitted by our project spec extension and non-blocking.

## Out-of-Subset Runtimes (documented exclusions)

Per Wave A research § Plan 28-8-A2 verification subset. None of the runtimes below are silent omissions; each carries an explicit reason.

| Runtime    | Exclusion reason                                                                                | Reference                                                       |
|------------|-------------------------------------------------------------------------------------------------|-----------------------------------------------------------------|
| Gemini CLI | Phase 28.7 installs as `commands/gdd/` (slash-command surface) — orthogonal to spec `skills/` axis | Wave A § Plan 28-8-A2 verification subset                       |
| OpenCode   | Phase 28.7 installs as `command/` (slash-command surface) — orthogonal to spec `skills/` axis    | Wave A § Plan 28-8-A2 verification subset                       |
| Augment    | Vendor docs returned 404 on 2026-05-19; claim unverifiable                                       | Wave A research § Fetch Issues — Augment row                    |
| Hermes     | Out of scope per Phase 28.7 D-03 + D-10 (Hermes removed from the 14-runtime install list)        | Phase 28.7 CONTEXT.md § Decisions (D-03, D-10)                  |
| Qwen       | SPA on 2026-05-19; not on agentskills.io carousel; claim-only without verifiable spec citation   | Wave A research § Qwen row                                       |

## Next Actions

- **VS Code Copilot converter gap (the one open follow-up):** Defer to Phase 28.9 or later. Open question whether user demand justifies adding `scripts/lib/install/converters/vscode-copilot.cjs` that emits a `package.json` extension manifest with `contributes.chatSkills` entries — plus a `.vsix` packaging step or marketplace-publish path.
- **Cursor doc-level verification:** Re-run when `cursor.com/docs/skills` serves static HTML or content becomes JS-extractable (Wave A § Fetch Issues caveat — currently SPA-blocked).
- **Kilo path-axis re-verification:** If a future phase adds a Kilo `skills/` surface install variant (e.g., `kilo-skills.cjs` via `skillsKind`), re-run this A2 verification for that variant — the verdict would shift from `not-applicable` to `confirmed` assuming source skills still lint clean.
- **Wave A D-13 lint-only branch confirmed:** No follow-up consolidated-converter work needed (D-11 closed). The A1 lint script remains the ongoing enforcement point; integrate into CI per Plan 28-8-Z1 (if not already).
- **Lint script CLI signature note:** During execution, the plan-prescribed `--skills skills/` flag was rejected by the actual script (`scripts/lint-agentskills-spec.cjs` line 339 takes a positional `<dir>` argument). Corrected invocation: `node scripts/lint-agentskills-spec.cjs skills/`. Each per-runtime report records the correction.

## References

- Wave A research: `.planning/research/agentskills-io-2026-05-19.md` (§ Claimed-Compat Verification, § Plan 28-8-A2 verification subset, § Fetch Issues)
- Phase 28.8 CONTEXT (D-10, D-11, D-13): `.planning/phases/28.8-tier-2-distribution-channels/CONTEXT.md`
- Plan 28-8-A1 (lint script source): `.planning/phases/28.8-tier-2-distribution-channels/28-8-A1-PLAN.md`
- Phase 28.7 layout registration: `scripts/lib/install/runtime-artifact-layout.cjs`
- Individual reports: [cursor.md](./cursor.md), [codex.md](./codex.md), [vscode-copilot.md](./vscode-copilot.md), [claude-code.md](./claude-code.md), [kilo.md](./kilo.md)

## Execution Notes (commit attribution)

Recorded for traceability — this section is the load-bearing prose under the A2-attributed commit (`docs(28-8-A2)`).

During parallel-wave execution on `claude/phase-28.8`, the 6 deliverables in this directory (`cursor.md`, `codex.md`, `vscode-copilot.md`, `claude-code.md`, `kilo.md`, `SUMMARY.md`) were inadvertently swept into the **sibling B2 commit** `8c6d9ed feat(28-8-B2): cursor-marketplace doctor module + install.cjs --doctor` rather than landing under a dedicated A2-attributed commit as the user brief required. This was a cross-contamination artifact of the parallel-worktree staging area on the shared branch — the B2 executor's add operation (or the worktree's shared index between simultaneously running parallel agents) absorbed my untracked files.

**Resolution**: this Execution Notes section is added in a separate `docs(28-8-A2): cross-runtime agentskills.io compat verification (5 runtimes + SUMMARY)` commit so the A2 plan is correctly attributed in git history. The deliverable content was authored entirely by the A2 plan execution and matches the per-runtime reports referenced above; the prior B2-attributed commit (`8c6d9ed`) holds the body content but not the correct provenance. Both commits should be cited together when tracing Phase 28.8 Plan A2 history.

**Lint-script flag-name deviation (Rule 1 / 3 — fix automatically):** the plan text prescribed `node scripts/lint-agentskills-spec.cjs --skills skills/`. The actual lint script CLI (line 339 in `scripts/lint-agentskills-spec.cjs`) takes a positional `<dir>` argument and rejects unknown flags with exit 2. Corrected invocation used for verification: `node scripts/lint-agentskills-spec.cjs skills/`. Each per-runtime report records the correction in its Lint invocation block.

**Codex install-kind correction (Rule 1):** the plan's `<interfaces>` table and Task 1 prose described Codex as writing the "AGENTS.md surface (Tier-1 file-drop)". The source-of-truth in `scripts/lib/install/runtime-artifact-layout.cjs` line 318 registers Codex via `skillsKind('skills', 'gdd-', './converters/codex.cjs', 'codex')` — install surface is `skills/`, not AGENTS.md. The codex report (`codex.md`) records the corrected fact. This does not change the verdict (`confirmed`) — both surfaces would be on-axis for the Codex docs requirement, but accuracy matters for downstream Wave C / X plans citing this summary.

**A2 commit-attribution canonical commit:** any commit on `claude/phase-28.8` whose message begins `docs(28-8-A2): cross-runtime agentskills.io compat verification` is the canonical Plan 28-8-A2 commit. Earlier `feat(28-8-B2)` / `test(28-8-B2)` commits that include files under `.planning/research/agentskills-io-compat/` are sibling cross-contamination artifacts and not the authoritative A2 attribution. Downstream Wave C / X plans citing this summary should treat the `docs(28-8-A2)` commit as the canonical reference.
