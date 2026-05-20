---
name: report-issue
description: "Consent-gated GitHub issue reporter for /gdd. Triages locally against `reference/known-failure-modes.md`, layers Phase 22 secret-redaction with Phase 30 pseudonymization, drafts the payload to `.design/issue-drafts/`, opens `$EDITOR` for inspection, and submits via the user's `gh` CLI to a hardcoded repo only after explicit per-issue consent. Use when the user runs `/gdd:report-issue`, hits a failure on a whitelisted command with the `--report` flag, or asks to file a bug against get-design-done."
argument-hint: "[<command-name>] [--force-report]"
tools: Read, Write, Grep, Bash
---

# /gdd:report-issue

Local-first, consent-gated GitHub issue reporter. No auto-mode. Destination repo is hardcoded. The full step-by-step lives in [report-issue-procedure.md](./report-issue-procedure.md); this file is the entry contract.

## Pre-flight

If invoked without an error context (the user just typed `/gdd:report-issue` cold), ask in one round-trip: *"What command failed and what was the error?"* Capture command name + a paraphrase of the error. Don't interrogate — one short answer is enough to feed the triage matcher.

## Steps

1. **Triage**. Call `matchKnownFailure(errorContext)` from `scripts/lib/issue-reporter/triage-matcher.cjs` (Plan 30-03). If `matched === true` and `--force-report` is NOT set: print the suggested diagnosis + remedy, stop. Do NOT write a draft. (D-07)
2. **Assemble**. Call `assemble(commandName, errorContext, trajectoryRef?, capabilityGapEvent?)` from `scripts/lib/issue-reporter/payload-assembly.cjs` (Plan 30-02). This layers Phase 22 redact → Phase 30 pseudonymize, computes the fingerprint, and renders bilingual disclaimer + sections.
3. **Draft**. Call `writeDraft({title, body, fingerprint})` from `scripts/lib/issue-reporter/draft-writer.cjs`. Print the absolute path: `Draft written to .design/issue-drafts/<timestamp>-<fp8>.md`. The file persists across decline — the user keeps their work either way. (D-04)
4. **Edit**. If `$EDITOR` is set, the consent prompt opens it on the draft and blocks until exit. Otherwise the path is printed and the user can open it manually. `EDITOR` is the only env var the report flow reads.
5. **Consent**. Call `promptConsent({draftPath})` from `scripts/lib/issue-reporter/consent-prompt.cjs`. It re-reads the (possibly edited) draft from disk, prints a summary, asks `Submit this issue to hegemonart/get-design-done? [y/N]`. Anything other than `y`/`yes` declines. (D-03)
   - Throws if `process.stdin.isTTY` is false (no auto-mode).
   - Throws if any `process.env` key matching `/REPORT|ISSUE|AUTO_REPORT/i` is set to a truthy value.
6. **Dedup hook**. Plan 30-05 will wire dedup via `gh issue list --search "fingerprint:<hash>"`. For now, `options.dedupCheck` in `runReportFlow` is a no-op unless the caller passes a function.
7. **Submit**. On `y`, call `submitViaGh({title, body})` from `scripts/lib/issue-reporter/gh-submit.cjs`. This spawns `gh issue create --repo hegemonart/get-design-done --title <title> --body-file <tmp>`. Destination is hardcoded; no env var or flag can redirect it. (D-02 + D-05)

## Use through `--report`

Whitelisted to specific commands via `scripts/lib/issue-reporter/cli-flag-report.cjs`. Only `gdd:plan-phase`, `gdd:execute-phase`, and `gdd:report-issue` itself install the flag — and only when `reference/known-failure-modes.md` has at least one `propose_report: true` entry. Non-whitelisted commands silently do not see the flag. (D-11)

## Use through `--force-report`

Available on `/gdd:report-issue`. Overrides the triage gate (Step 1) but does NOT override consent. The user still gets the draft + consent prompt. There is no path to submit without an explicit `y`.

## Privacy contract

- **Pseudonymization, not anonymization.** Disclaimer (Russian + English) is rendered at the top of the payload by Plan 30-02. Side-channel content (writing style, code patterns) may still re-identify. The user reviews the exact bytes before consenting.
- **No auto-mode, no env-var bypass.** Static tests (`tests/report-issue-no-auto-submit-static.test.cjs`) fail the build if anyone adds a `process.env.*REPORT*`/`*ISSUE*`/`*AUTO_REPORT*` read here or under `scripts/lib/issue-reporter/`. Runtime check in `consent-prompt.cjs` is the second layer.
- **Hardcoded destination.** `scripts/lib/issue-reporter/destination.cjs` is the only file that contains the literal repo string; it exports a frozen object so runtime tampering throws. Static tests enforce both invariants.
- **No HTTPS, no fetch.** Submission goes through the user's `gh` CLI only. Plan 30-07 ships a CI gate that fails the build if any network primitive is added here.

## Troubleshooting

- **`gh` not authenticated.** The submission step fails with a clear error pointing to the draft path. Run `gh auth login` and re-invoke `/gdd:report-issue` — the draft survives.
- **No `EDITOR` set.** The path is printed; open it in whatever editor you prefer, save, then return to the consent prompt.
- **Triage matched something irrelevant.** Pass `--force-report` to bypass the gate. Consent is still required.

See [report-issue-procedure.md](./report-issue-procedure.md) for the full procedure with rationale per decision (D-02, D-03, D-04, D-05, D-07, D-11).
