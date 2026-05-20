# `/gdd:report-issue` — Full Procedure

Long-form companion to [SKILL.md](./SKILL.md). Phase 28.5 keeps SKILL.md ≤100 lines; step-by-step + rationale live here.

## Architecture

The report flow is the only outbound path the plugin offers. Every byte leaving the user's machine via this surface:

1. has been redacted for secrets (Phase 22 `redact.cjs`),
2. has been pseudonymized for identity (Plan 30-01 `pseudonymize.cjs`),
3. has been written to disk where the user can read it,
4. has been read back from disk after the user closed the editor, and
5. has cleared an explicit per-issue `y/N` prompt.

No environment variable, command-line flag, or build configuration bypasses any of these steps. Two test layers enforce this:

- **Static** (`tests/report-issue-destination-static.test.cjs`, `tests/report-issue-no-auto-submit-static.test.cjs`) — fail the build on any forbidden code pattern in `skills/report-issue/` or `scripts/lib/issue-reporter/`.
- **Runtime** (`tests/report-issue.test.cjs`) — 26 cases proving the orchestrator threads consent + persistence + edit-before-submit + triage + hardcoded destination + flag whitelist.

## Steps

### Step 1 — Triage gate (D-07)

`matchKnownFailure(errorContext)` regex-matches `error.message + error.stack` against `reference/known-failure-modes.md`. If matched, prints diagnosis + remedy and exits without writing a draft. `--force-report` overrides the gate but does NOT override consent.

### Step 2 — Assemble payload (D-01)

`assemble(commandName, errorContext, trajectoryRef?, capabilityGapEvent?)` returns markdown. Order is locked: redact → pseudonymize (Case 9 of 30-02 enforces). Bilingual disclaimer at top: "Это псевдонимизация, не анонимизация" / "This is pseudonymization, not anonymization." Fingerprint computed on the scrubbed stack so the same bug from different cwd's hashes the same.

### Step 3 — Write draft (D-04)

`writeDraft({title, body, fingerprint})` writes to `.design/issue-drafts/<YYYYMMDDTHHMMSSZ>-<fp8>.md`. The file has a small HTML-comment header (timestamp, destination, full fingerprint) so a future maintainer with a corrupted-looking draft can reconstruct provenance. The file is NOT deleted on decline — the user keeps their work.

### Step 4 — Edit (optional)

If `$EDITOR` is set, `promptConsent` spawns it on the draft path and blocks until exit. Otherwise the user opens it manually. `EDITOR` is a POSIX convention (git, crontab, gh all use it); the static-grep test only forbids env-var reads matching `/REPORT|ISSUE|AUTO_REPORT/i`.

### Step 5 — Consent prompt (D-03)

The single submission gate. Three preconditions must hold:

1. `process.stdin.isTTY === true`.
2. No env var matches `/REPORT|ISSUE|AUTO_REPORT/i` with a truthy value (`rejectBypassEnv` throws otherwise, naming the offender).
3. The draft file exists and is readable.

The function prints a summary (destination, draft path, title, first 10 body lines), asks `Submit this issue to hegemonart/get-design-done? [y/N]` via `readline`, treats anything other than `y`/`yes` (case-insensitive, trimmed) as decline, and **re-reads the draft from disk** so user edits in Step 4 are picked up.

### Step 6 — Dedup hook (deferred to 30-05)

`options.dedupCheck({fingerprint, title})` in `runReportFlow`. If it returns truthy `existing`, the orchestrator returns `{submitted: false, reason: 'duplicate', existing}` without calling `submitFn`. Plan 30-05 will wire `gh issue list --search "fingerprint:<hash>"`.

### Step 7 — Submit via `gh` (D-05 + D-02)

`submitViaGh({title, body})` spawns:

```bash
gh issue create --repo hegemonart/get-design-done --title <title> --body-file <tmp/body.md>
```

Body is written to a tmp file to avoid arg-length and shell-escaping. URL parsed from stdout. No HTTPS, no fetch, no third-party packages — only the user's `gh` CLI with their credentials.

## The `--report` flag (D-11)

`cli-flag-report.cjs` whitelists three commands today: `gdd:plan-phase`, `gdd:execute-phase`, `gdd:report-issue`. The whitelist intersects with `listProposeReportModes()`; if the catalogue has zero `propose_report: true` entries, the flag disables everywhere. `installReportFlagOn(parser, commandName)` is a no-op for non-whitelisted commands; `parseReportFlag` returns `{report: false}` regardless of argv.

## Privacy guarantees

| Layer | Guarantee | Enforced by |
|---|---|---|
| Static code | No `process.env.*REPORT*`/`*ISSUE*`/`*AUTO_REPORT*` reads in the report tree | `report-issue-no-auto-submit-static.test.cjs` |
| Static string | Only `destination.cjs` may contain the literal repo string | `report-issue-destination-static.test.cjs` |
| Static flag | No `--yes` / `--no-confirm` / `--auto-confirm` / `--auto-submit` strings | `report-issue-no-auto-submit-static.test.cjs` |
| Runtime frozen | `DESTINATION_REPO` reassignment throws | static test S3 + behavioural H2 |
| Runtime env | `rejectBypassEnv` throws on truthy forbidden env var | `report-issue.test.cjs` B1, U1 |
| Runtime TTY | `promptConsent` throws on `!stdin.isTTY` | C5 |
| Runtime consent | Only `y`/`yes` accepted | C1..C3, U3 |
| Runtime re-read | `promptConsent` re-reads draft before returning final body | E1, E2 |
| Runtime destination | `submitViaGh` always passes `--repo hegemonart/get-design-done` | H1 |

## Troubleshooting

- **`gh` not authenticated**: submission throws with status + stderr; draft path preserved. Run `gh auth login`, retry. (T-30-04-08 accepted)
- **`EDITOR` spawns wrong tool**: set `EDITOR=<your-editor>` in shell rc.
- **Triage matched something irrelevant**: pass `--force-report`. Consent still required.
- **TTY refused (CI / non-interactive)**: by design — run locally. (T-30-04-05 mitigated)
- **No `--report` flag on a command you expected**: not on the whitelist; file an issue via this flow describing the use case.

## Forward-looking hooks

- **Plan 30-05** wires `options.dedupCheck` to `gh issue list --search "fingerprint:<hash>"`. The hook is already present in `runReportFlow`; no further changes to that file will be needed.
- **Plan 30-06** adds `gh`-absent fallback (clipboard + URL) and the `GDD_DISABLE_ISSUE_REPORTER=1` kill-switch. The kill-switch is a disable signal (skip the whole flow), not a bypass.
- **Plan 30-07** ships the network-isolation CI gate. Plan 30-04 already meets the invariant; the gate locks it in.

## References

- [SKILL.md](./SKILL.md) — entry contract.
- `reference/pseudonymization-rules.md` — full R1..R8 rule catalog (Plan 30-01).
- `reference/known-failure-modes.md` — triage catalogue (Plan 30-03).
- `.planning/phases/30-issue-reporter/CONTEXT.md` — phase decisions D-01..D-15.
