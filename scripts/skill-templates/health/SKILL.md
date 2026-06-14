---
name: hone-health
description: "Reports .design/ artifact health - staleness, missing files, token drift, broken state transitions. Activates for requests involving checking .design artifact health, staleness, token drift, or broken state transitions."
tools: Read, Bash, Glob, Grep, mcp__hone_state__get
disable-model-invocation: true
---

# {{command_prefix}}health

**Role:** Report the health of the `.design/` directory. Print a score and list the checks that failed.

## Checks

1. **Artifact inventory** - `ls -la .design/*.md` with size and mtime. Print a table.
2. **Missing expected artifacts** - by `stage` field from the `mcp__hone_state__get` snapshot:
   - `brief` expects BRIEF.md
   - `explore` expects DESIGN.md, DESIGN-DEBT.md, DESIGN-CONTEXT.md
   - `plan` expects DESIGN-PLAN.md
   - `design` expects DESIGN-SUMMARY.md
   - `verify` expects DESIGN-VERIFICATION.md
   FAIL per missing.
3. **Token drift** - `wc -c .design/DESIGN.md .design/DESIGN-CONTEXT.md`; approx tokens = bytes/4. WARN if combined >40000.
4. **Aged DESIGN-DEBT** - items in `.design/DESIGN-DEBT.md` not touched in >14 days (file mtime). WARN.
5. **Broken state transitions** - `stage` field from the snapshot inconsistent with artifacts present (e.g. stage=`verify` but DESIGN-SUMMARY.md missing). FAIL.
6. **Pending sketch/spike wrap-ups** - any `.design/sketches/*` or `.design/spikes/*` directory lacking a SUMMARY.md. WARN.
7. **Seed germination** - scan `.design/SEEDS.md` (if present) for seeds whose trigger keywords match the snapshot or CYCLES.md content. List as "Seed ready: <text>".

## State snapshot

Call `mcp__hone_state__get` once at the start to pull the snapshot used by checks 2, 5, and 7. Aggregate health math stays prose-level:
- Count available connections from `<connections>`.
- Count open blockers from `<blockers>` where `resolved` is absent.
- Count pending must-haves from `<must_haves>` where `status: "pending"`.

## Output

```
━━━ Design health ━━━
Artifacts:
  BRIEF.md           2.1 KB   2026-04-14
  DESIGN.md          18.4 KB  2026-04-17
  DESIGN-CONTEXT.md  7.2 KB   2026-04-17

Checks:
  [PASS] Missing artifacts
  [WARN] Token drift (42,100)
  [PASS] Aged DESIGN-DEBT
  [PASS] State transitions
  [PASS] Sketch/spike wrap-ups
  [PASS] Seed germination

Health: 5 / 6 checks passing.
━━━━━━━━━━━━━━━━━━━━━
```

## Figma-extract readiness (figma_extract)

After the health table, the `hone_health` MCP surface (`scripts/lib/health-mirror/index.cjs`) reports a `figma_extract` check so a user knows whether figma-extract is usable. The detail is one of three exact strings:

- `figma extract: ready (token set)` - `FIGMA_TOKEN` (or `FIGMA_PERSONAL_ACCESS_TOKEN`) is present (status `ok`).
- `figma extract: token missing` - no token env is set (status `warn`).
- `figma extract: plugin sync needed for variables (Free tier detected)` - token present but a prior pull recorded a 403/skip on the Variables REST path, so run the plugin-sync step (status `warn`).

Token PRESENCE only is detected (D-10) - the token value is never read, logged, or shown. The Free-tier signal is read from the local raw-pull cache only; no network call is made.

## Skill-discipline bootstrap (skill_discipline)

The `hone_health` MCP surface also reports a `skill_discipline` check (Phase 32) confirming the using-gdd SessionStart bootstrap is live - detail is one of three exact strings:
- `skill-discipline: ready` - `skills/using-gdd/SKILL.md` exists AND `hooks/hooks.json` SessionStart wires `inject-using-gdd.sh` (status `ok`).
- `skill-discipline: missing using-gdd` (skill absent) or `skill-discipline: hook not wired` (skill present, no SessionStart inject) - both `warn`. The MCP surface also reports a `harness_freshness` check (Phase 44): per-harness `last_verified` age, status-aware (only `tested` harnesses warn at 60d / fail at 180d; others `n/a`). Full taxonomy in `HARNESSES.md`; refresh with `npm run verify:harness <id>`.

## Check MCP registration (hone-mcp)

After the health table, inspect whether `hone-mcp` (Phase 27.7+) is registered with any installed harness and render a one-line status row. Dismissable via `.design/config.json#mcp_nudge=false`. Non-blocking: failure paths render `MCP server: unknown` rather than crash. Full detection procedure (dismissal check, detection via `scripts/lib/install/mcp-register.cjs`, row rendering for claude/codex/both/neither, fallback) lives in `./health-mcp-detection.md`.

## Update notice (safe-window surface)

After the health table, emit the plugin-update banner if one is present:

```bash
[ -f .design/update-available.md ] && cat .design/update-available.md
```

Written by `hooks/update-check.sh`; suppressed mid-pipeline and when the latest release is dismissed.

## Skill-length report

After the health table, surface the Phase 28.5 skill-authoring contract drift signal by running `node scripts/validate-skill-length.cjs --quiet --json` and reading `summary` from stdout. Print two prose lines:

- `Skill-length: <total> total | <clean> clean | <warnings> warn (>=100) | <blockers> block (>=250)`
- If blockers > 0: list each blocker as a row `- <name> (<lines> lines)`. Else: print `All skills within contract.`

Thresholds: warn >=100, block >=250 (D-01). Strict description-format off by default (D-02). Then add two compact Phase 50 lines from `scripts/lib/manifest/skills.json`: `Skills: <n>/<total> in v3 description form` (descriptions matching `/Activates for requests involving/i`) and `Composition: <edges> edges | <cycles> cycles` (`composes_with`/`next_skills` fan-out; cycles via `scripts/validate-composition-graph.cjs` when present, else `0`). See `./health-skill-length-report.md` for the JSON shape and threshold rationale.

## Do Not

- Do not mutate STATE.md - this skill is read-only. Only `mcp__hone_state__get` is permitted.

## HEALTH COMPLETE
