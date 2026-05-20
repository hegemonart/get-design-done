# `/gdd:report-issue` — Full Procedure

Long-form companion to [SKILL.md](./SKILL.md). Phase 28.5 keeps SKILL.md ≤100 lines; step-by-step + rationale live here.

## Architecture

The report flow is the only outbound path the plugin offers. Every byte leaving the user's machine via this surface:

1. has been redacted for secrets (Phase 22 `redact.cjs`),
2. has been pseudonymized for identity (Plan 30-01 `pseudonymize.cjs`),
3. has been written to disk where the user can read it,
4. has cleared a pre-submit dedup check against the destination repo (Plan 30-05) — `+1` and `me-too` on a matching existing issue NEVER spawn a duplicate (D-06),
5. has been read back from disk after the user closed the editor, and
6. has cleared an explicit per-issue `y/N` prompt.

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

### Step 4 — Pre-submit dedup (D-06)

`scripts/lib/issue-reporter/dedup.cjs` exports `searchByFingerprint(fingerprint, {destination})` which spawns `gh issue list --search "fingerprint:<hash>" --json number,title,url --repo <destination>` (read-only). Resolves `{matches: [...], degraded?, reason?}` — NEVER throws on gh failure.

Routing:

- `matches.length === 0` (no existing issue) **or** `degraded === true` (search unavailable; surface a one-line warning) → fall through to Step 5 with the prepared draft.
- `matches.length >= 1` → render the dedup UI listing each `{number, title, url}` with three actions per match:

  - **`+1`** → `react(n, {destination})` spawns `gh api -X POST /repos/<destination>/issues/<n>/reactions -f content=+1`. Resolves `{ok:true}`; exits the report flow on success ("reaction recorded on #<n>"). **NO new issue is created** (D-06).
  - **`me-too`** → `commentMeToo(n, {destination, errorContext, runtime, pluginVersion})` spawns `gh issue comment <n> --repo <destination> --body <body>`. The body contains EXACTLY three fields (`Last error:`, `Runtime:`, `Plugin version:`) — nothing more (negative-presence tested). `errorContext.lastErrorLine` is the ALREADY-pseudonymized last error line from 30-02's payload pipeline (D-01); dedup.cjs does NOT re-derive raw stderr. Exits the report flow on success ("comment added to #<n>"). **NO new issue is created** (D-06).
  - **`new`** → fall through to Step 5 with the prepared draft despite the match (user explicitly opted to force a new issue).

`+1` and `me-too` failures (auth/network/rate) propagate as rejected promises with annotated `.reason` so the caller can offer retry/cancel — they do NOT silently fall back to creating a new issue (that would defeat dedup intent).

Wiring: `runReportFlow` calls `options.dedupCheck({fingerprint, title})` BEFORE the consent prompt (`report-flow.cjs` STEP 4). The skill drives the `+1`/`me-too`/`new` UI by passing a `dedupCheck` callback that wraps `searchByFingerprint` + the `react`/`commentMeToo` calls. Returning truthy `existing` from the callback short-circuits `runReportFlow` to `{submitted:false, reason:'duplicate'}`. Returning falsy continues to Step 5.

### Step 5 — Edit (optional)

If `$EDITOR` is set, `promptConsent` spawns it on the draft path and blocks until exit. Otherwise the user opens it manually. `EDITOR` is a POSIX convention (git, crontab, gh all use it); the static-grep test only forbids env-var reads matching `/REPORT|ISSUE|AUTO_REPORT/i`.

### Step 6 — Consent prompt (D-03)

The single submission gate for the new-issue path. Three preconditions must hold:

1. `process.stdin.isTTY === true`.
2. No env var matches `/REPORT|ISSUE|AUTO_REPORT/i` with a truthy value (`rejectBypassEnv` throws otherwise, naming the offender).
3. The draft file exists and is readable.

The function prints a summary (destination, draft path, title, first 10 body lines), asks `Submit this issue to hegemonart/get-design-done? [y/N]` via `readline`, treats anything other than `y`/`yes` (case-insensitive, trimmed) as decline, and **re-reads the draft from disk** so user edits in Step 5 are picked up.

(The `+1` / `me-too` paths from Step 4 do NOT pass through this consent prompt — selecting either action in the dedup UI IS the explicit consent for that minimal interaction. The new-issue path always passes through this prompt.)

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
| Dedup destination | `dedup.cjs` accepts `destination` only as a parameter — no env/config lookup (D-02) | `issue-reporter-dedup.test.cjs` test 11 |
| Dedup body shape | `buildMeTooBody` returns EXACTLY 3 lines (`Last error:` / `Runtime:` / `Plugin version:`) — no stack/path/env/cmd (D-06) | tests 5 + 6 (verbatim + negative-presence) |
| Dedup network | `dedup.cjs` imports only `child_process`; no `https`/`fetch`/`axios`/`node-fetch` (D-05) | 30-07 static-grep gate |
| Dedup test hermeticity | No live `gh` calls in CI; injected spawn spy + traced `child_process.spawnSync` counter assert 0 real invocations (D-13) | `issue-reporter-dedup.test.cjs` test 10 |
| Dedup pseudonymization | `me-too` body uses the ALREADY-pseudonymized `errorContext.lastErrorLine` from 30-02's pipeline; dedup.cjs does NOT re-derive raw stderr (D-01) | dedup test "commentMeToo passes pseudonymized lastErrorLine through to gh body" |

## Troubleshooting

- **`gh` not authenticated**: submission throws with status + stderr; draft path preserved. Run `gh auth login`, retry. (T-30-04-08 accepted)
- **`EDITOR` spawns wrong tool**: set `EDITOR=<your-editor>` in shell rc.
- **Triage matched something irrelevant**: pass `--force-report`. Consent still required.
- **TTY refused (CI / non-interactive)**: by design — run locally. (T-30-04-05 mitigated)
- **No `--report` flag on a command you expected**: not on the whitelist; file an issue via this flow describing the use case.

## Forward-looking hooks

- **Plan 30-05** *(landed)* — `scripts/lib/issue-reporter/dedup.cjs` wires `options.dedupCheck` to `gh issue list --search "fingerprint:<hash>"`. The skill drives the `+1` / `me-too` / `new` UI by passing a `dedupCheck` callback that wraps `searchByFingerprint` + `react` + `commentMeToo`. The hook in `runReportFlow` now runs BEFORE consent (per D-06).
- **Plan 30-06** adds `gh`-absent fallback (clipboard + URL) and the `GDD_DISABLE_ISSUE_REPORTER=1` kill-switch. The kill-switch is a disable signal (skip the whole flow), not a bypass.
- **Plan 30-07** ships the network-isolation CI gate. Plans 30-04 and 30-05 already meet the invariant (no `https`/`fetch`/`axios`/`node-fetch`/`node:https` in their files); the gate locks it in.

## References

- [SKILL.md](./SKILL.md) — entry contract.
- `reference/pseudonymization-rules.md` — full R1..R8 rule catalog (Plan 30-01).
- `reference/known-failure-modes.md` — triage catalogue (Plan 30-03).
- `.planning/phases/30-issue-reporter/CONTEXT.md` — phase decisions D-01..D-15.
