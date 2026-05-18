---
name: gdd-connections
description: "Interactive onboarding wizard for the 12 external integrations the pipeline supports — probes all (`figma`, `refero`, `preview`, `storybook`, `chromatic`, `graphify`, `pinterest`, `claude-design`, `paper-design`, `pencil-dev`, `21st-dev`, `magic-patterns`), recommends based on project type, walks the user through setup (auto-run MCP install or copy-command fallback), writes results to `STATE.md <connections>`. Use after `/gdd:new-project` or whenever the user wants to add, inspect, or skip a connection. Re-runnable anytime."
argument-hint: "[list | <connection-name> | --auto]"
user-invocable: true
tools: Read, Write, Bash, Glob, Grep, AskUserQuestion, ToolSearch
---

# /gdd:connections

Interactive onboarding for the 12 external integrations the pipeline supports. Replaces "probe silently at scan entry and hope the user noticed" with an explicit "here is what can plug in, here is how."

Canonical per-connection specs live in `../../connections/<name>.md` (one file per integration). The capability matrix + probe-pattern spec live in `../../connections/connections.md`. This skill is the **user-facing front end** for those specs.

For the 12 probe scripts (MCP + HTTP + CLI + file probes), bucket categorization, per-connection setup screen, auto-run eligibility matrix, value-prop one-liners, and STATE.md / config.json write contracts, see `../../reference/connections-onboarding.md`. For the cross-skill probe pattern + connection-handshake summary, see `../../reference/shared-preamble.md#connection-handshake-summary`. For the cross-skill output discipline, see `../../reference/shared-preamble.md#output-contract-reminders`.

---

## Invocation Modes

| Command | Behavior |
|---|---|
| `/gdd:connections` | Interactive wizard (default). Probes all, shows summary, asks what to configure. |
| `/gdd:connections list` | Read-only table. Probes all, writes STATE.md, no prompts, exits. |
| `/gdd:connections <name>` | Jump straight to setup for one connection (e.g. `/gdd:connections figma`). |
| `/gdd:connections --auto` | CI mode. Probes, writes STATE.md, no prompts, no install attempts. |

---

## State Integration

1. Read `.design/STATE.md` — if missing, that's fine; this skill does not require a pipeline run.
2. Read `.design/config.json` — if missing, use defaults. If `connections_onboarding` block is present with `pending_verification`, this is a resume — see Step 6.
3. Read `connections.skip[]` from config — never re-prompt for skipped connections.
4. Update `last_checkpoint` in STATE.md at skill exit if STATE.md exists.

---

## Workflow

1. **Probe all 12 connections** — run every probe script per `../../reference/connections-onboarding.md#step-1--probe-all-12-connections`. MCP probes use `ToolSearch` first; HTTP / CLI / file probes follow non-MCP patterns. Merge results into `STATE.md <connections>` with the three-value schema (`available | unavailable | not_configured`) — never add new values.
2. **Categorize + build summary** — bucket each probe result (available / recommended / optional / skipped / unavailable) using project-hint detection. Detail + recommendation mapping: `../../reference/connections-onboarding.md#step-2--bucket-categorization`.
3. **Print summary table** — show buckets + value-prop one-liners (verbatim from `../../reference/connections-onboarding.md#step-3--summary-table`).
4. **Route by mode** — `list` / `--auto` exits after summary; `<name>` jumps straight to Step 5; default mode opens an AskUserQuestion (configure recommended / pick one by one / configure all optional / re-check specific / exit). Routing detail: `../../reference/connections-onboarding.md#step-4--route-by-mode`.
5. **Per-connection setup screen** — for each target: read `connections/<name>.md`, present the setup screen, AskUserQuestion (run now / copy-paste / skip / never ask). Auto-run only if reversible (see eligibility matrix). On success: append name to `connections_onboarding.pending_verification[]`. Detail: `../../reference/connections-onboarding.md#step-5--per-connection-setup-screen`.
6. **Verification pass** — re-probe every name in `pending_verification[]`. Available → remove. `not_configured` → leave (needs session restart). `unavailable` → leave + note OAuth needed. Print "Setup complete" summary. Detail: `../../reference/connections-onboarding.md#step-6--verification-pass`.

If `.design/config.json > connections_onboarding.pending_verification[]` is non-empty at entry → enter **resume flow**: run Step 6 immediately; if clean, exit; otherwise fall through to Step 3. Detail: `../../reference/connections-onboarding.md#resumability`.

---

## Do Not

Per `../../reference/connections-onboarding.md#do-not`:

- Never run `npm install -g` globals automatically.
- Never write to `~/.bashrc`, `~/.zshrc`, or shell RC files.
- Never run `claude mcp add` without explicit `"Run install command now"` confirmation.
- Never auto-restart the Claude Code session.
- Never re-prompt for names in `connections.skip[]`.
- Never overwrite existing `<connections>` entries that this skill did not probe — merge only.

---

## Output

End every invocation with:

```
## CONNECTIONS COMPLETE
```
