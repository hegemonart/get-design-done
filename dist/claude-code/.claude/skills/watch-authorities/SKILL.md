---
name: gdd-watch-authorities
description: "Fetches the design-authority feed whitelist, diffs against .design/authority-snapshot.json, and writes .design/authority-report.md (consumed by /gdd:reflect). Authority monitoring only — no trend-watching."
argument-hint: "[--refresh] [--since <date>] [--feed <name>] [--schedule <weekly|daily|monthly>]"
tools: Read, Write, Task, Bash
---

# /gdd:watch-authorities

Runs `design-authority-watcher` on demand. Fetches the curated design-authority feed whitelist, diffs against the prior snapshot, classifies new entries into five buckets, and writes `.design/authority-report.md`. Phase 11's reflector picks up the report automatically when you next run `/gdd:reflect`.

Authority-monitoring only. Not trend-watching. See `reference/authority-feeds.md` §"Rejected kinds" for what this skill will never fetch.

## Steps

1. **Parse args.** Extract optional flags: `--refresh`, `--since <date>`, `--feed <name>`, `--schedule <cadence>`. Anything that doesn't match one of these is an error — print `Unknown flag: <arg>. Valid flags: --refresh --since <date> --feed <name> --schedule <weekly|daily|monthly>.` and STOP.

   Mutual exclusion rules:
   - `--schedule` is handled entirely by this skill — it does not combine with the other three. If `--schedule` is present alongside any of `--refresh | --since | --feed`, print `--schedule cannot combine with other flags. Schedule registration runs this skill with no flags at the configured cadence.` and STOP.
   - `--refresh` and `--since` are mutually exclusive — print `--refresh and --since are mutually exclusive. --refresh re-seeds the snapshot silently; --since surfaces a backlog from a boundary date. Pick one.` and STOP.

2. **Handle `--schedule <cadence>` branch** (early-return).

   If `--schedule` is set:
   - Validate cadence ∈ {`weekly`, `daily`, `monthly`}; else print `Unknown cadence: <value>. Use one of: weekly, daily, monthly.` and STOP.
   - Probe for the scheduled-tasks MCP via ToolSearch:

     ```
     ToolSearch({ query: "scheduled-tasks", max_results: 3 })
     ```

   - If the probe returns an empty result set: print `scheduled-tasks MCP not connected. Install it with: claude mcp add scheduled-tasks ... then retry with --schedule.` — this is a documented fallback (not an error). Terminate with `## WATCH COMPLETE` and exit 0.
   - If the probe returns one or more `scheduled-tasks` tools: register the cron. Discover the MCP's registration tool name at runtime from the ToolSearch result and follow its schema. Target command: `/gdd:watch-authorities` with NO flags (the cron invokes the default diff-and-report behavior). Cadence → cron expression mapping:
     - `weekly`  → `0 9 * * 1` (Mondays 09:00 local)
     - `daily`   → `0 9 * * *` (every day 09:00 local)
     - `monthly` → `0 9 1 * *` (1st of each month 09:00 local)
   - After registration: print `Scheduled /gdd:watch-authorities to run <cadence>.` and terminate with `## WATCH COMPLETE`.

3. **Validate `--since <date>`** (if present).

   Accept ISO8601 (`YYYY-MM-DD` or `YYYY-MM-DDTHH:MM:SSZ`). Sanity-check via Bash `date -d "<value>" +%s` (GNU) or the POSIX equivalent `python3 -c "from datetime import datetime; datetime.fromisoformat('<value>'.replace('Z','+00:00'))"`. On parse failure: print `Invalid --since value: <value>. Use ISO8601 (YYYY-MM-DD or YYYY-MM-DDTHH:MM:SSZ).` and STOP.

   If the parsed date is earlier than `2020-01-01`, ask: `Very old --since value: <value>. Did you mean something more recent? Proceed? [y/N]`. On anything other than `y`/`Y`, STOP.

4. **Spawn the watcher.**

   Build the `Task(subagent_type="design-authority-watcher", ...)` prompt. The prompt supplies the agent's required-reading block (watcher step 0), echoes the invocation flags verbatim (watcher Flags section), and instructs the agent to follow its own fetch/diff/classify/write loop:

   ```
   Task("design-authority-watcher", """
   <required_reading>
   @reference/authority-feeds.md
   @.design/authority-snapshot.json
   @.design/STATE.md
   </required_reading>

   Invocation flags: <joined flag list or "none">

   Fetch the feeds listed in reference/authority-feeds.md, diff against .design/authority-snapshot.json,
   classify new entries per the D-17 decision table, write .design/authority-snapshot.json and
   .design/authority-report.md.

   Terminate with ## WATCH COMPLETE.
   """)
   ```

   `<joined flag list>` is the subset of `--refresh | --since <date> | --feed <name>` actually passed — e.g., `--refresh`, `--since 2026-03-01`, `--feed wai-aria-apg`, `--refresh --feed radix-ui-releases`, or literally `none` when no flags were supplied.

5. **Print summary.**

   After the agent returns:
   - If STATE.md gained a `<blocker type="contract-violation">` on this run (snapshot version mismatch, hash-format violation, or over-200 entries per feed), surface the blocker verbatim and stop — do not print the default "review and reflect" line.
   - Otherwise print the agent's one-line stdout summary (normal mode: `Surfaced N entries across M feeds. K skipped. See .design/authority-report.md.`; first-run / refresh mode: `Seeded snapshot for N feeds — next run will surface new entries.`) followed by: `Review and reflect: /gdd:reflect`.

6. **Terminate with `## WATCH COMPLETE`.**

## Do Not

- Do not modify `agents/design-authority-watcher.md`.
- Do not modify `agents/design-reflector.md` — Phase 13.2 does not touch the reflector agent (CONTEXT.md D-25).
- Do not write to `.design/authority-snapshot.json` or `.design/authority-report.md` directly — those are the agent's writes.
- Do not fetch URLs outside `reference/authority-feeds.md`. The whitelist is the allow-list.
