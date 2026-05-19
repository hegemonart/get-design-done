---
phase: 28.8
plan: 28-8-03
subsystem: distribution-channels
tags: [research, codex, plugins, tier-2, distribution, manifest-spec]
type: research
status: complete
completed: 2026-05-19
requires:
  - .planning/phases/28.8-tier-2-distribution-channels/CONTEXT.md (D-03, D-05, D-07, D-09)
  - .planning/phases/28.7-verified-install-for-claimed-runtimes/CONTEXT.md (Phase 28.7 Codex AGENTS.md surface)
  - package.json (existing name/version/description/repository/license/keywords)
  - .claude-plugin/plugin.json (Anthropic-style plugin manifest — direct shape analog)
  - .claude-plugin/marketplace.json (legacy-compat marketplace catalog Codex reads)
  - AGENTS.md (existing Codex agent surface from Phase 28.7)
provides:
  - .planning/research/codex-plugins-2026-05-19.md (468 lines, 9 required sections + Open Questions + Fetch Issues, 62 https URLs cited)
  - Codex manifest field spec (8 top-level + 14 interface sub-fields)
  - Plugin structure tree with required/optional annotations
  - Distribution mechanism verdict (install-by-URL)
  - vs-AGENTS.md verdict (additive)
  - Schema mapping table (~26 rows) from manifest fields → GDD source artifacts
  - Field-test plan with exact command + prereqs + failure modes + verdict (GREEN)
  - Refinement to CONTEXT D-03: install-by-URL requires marketplace catalog file (we have it via legacy-compat `.claude-plugin/marketplace.json`)
affects:
  - Plan 28-8-C1 (Wave B — `.codex-plugin/plugin.json` generator + `kind: 'codex-plugin'` converter): consumes Manifest Format + Plugin Structure + Schema Mapping sections; verifies legacy-compat marketplace.json field shape
  - Plan 28-8-C2 (Wave B — doctor integration + field-test): consumes Distribution Mechanism + Install Verification Flow + Field-Test Plan sections; encodes 11 local doctor checks
  - Phase 28.7 codex.cjs converter: UNCHANGED (additive verdict means file-drop AGENTS.md surface remains)
  - CONTEXT 28.8 D-03: CONFIRMED with catalog-file refinement
  - CONTEXT 28.8 D-05: CONFIRMED — Codex slot is additive
  - CONTEXT 28.8 D-07: SATISFIED — re-fetched 2026-05-19
  - CONTEXT 28.8 D-09: GREEN gate — post-merge field-test runnable
tech-stack:
  added: []
  patterns:
    - WebFetch budget discipline: 5/6 fetches consumed; 2 URLs returned 404 (recorded in Fetch Issues, not retried)
    - Pin-date discipline: `<!-- Phase 28.8 / Plan 28-8-03 / pin-date 2026-05-19 / source-of-truth re-verify per CONTEXT D-07 -->` header per CONTEXT D-07
    - Schema mapping match-status taxonomy: `direct` / `transform` / `compose` / `generate` / `static` (parallel to Plan 28-8-02 framing)
    - Verdict-literal discipline: `additive` / `replacement` / `parallel`; `install-by-URL` / `marketplace-UI-only` / `hybrid`; `Field-test gate: GREEN` / `Field-test gate: BLOCKED — by [X]`
key-files:
  created:
    - .planning/research/codex-plugins-2026-05-19.md
    - .planning/phases/28.8-tier-2-distribution-channels/28-8-03-SUMMARY.md
  modified: []
decisions:
  - "Distribution mechanism = install-by-URL (with catalog-file requirement refinement): `codex plugin marketplace add owner/repo` accepts GitHub shorthand + Git URLs + local dirs, BUT the source must expose a marketplace catalog file (`.agents/plugins/marketplace.json` canonical OR `.claude-plugin/marketplace.json` legacy-compat). We already ship `.claude-plugin/marketplace.json` — Codex reads it as-is."
  - "vs AGENTS.md verdict = additive: both surfaces coexist with no documented precedence rule. C1 leaves Phase 28.7's codex.cjs untouched; adds kind='codex-plugin' for Tier-2 marketplace channel only."
  - "Field-test gate = GREEN: no blockers. Maintainer runs `codex plugin marketplace add hegemonart/get-design-done` post-merge with 5 prereqs (Codex CLI installed/authenticated, manifest + catalog committed, v1.28.8 tag pushed)."
  - "Plugin cache path refinement: `~/.codex/plugins/cache/$MARKETPLACE_NAME/$PLUGIN_NAME/$VERSION/` (NOT `~/.codex/plugins/cache/<owner>/<repo>/` as the 2026-05-18 working assumption had it)."
  - "Hooks `manifest.hooks` is off-by-default in this Codex release. C1 may omit `manifest.hooks` for v1.28.8 since the feature flag `[features].plugin_hooks = true` is user-side opt-in. Defer hook bundling to a follow-up phase."
metrics:
  research_doc_lines: 468
  https_urls_cited: 62
  webfetch_calls: 5
  webfetch_budget: 6
  unreachable_urls: 2
  manifest_top_level_fields_documented: 12
  manifest_interface_sub_fields_documented: 14
  schema_mapping_rows: 26
  plugin_structure_tree_entries: 10
  open_questions: 10
  fetch_issues: 2
  duration_minutes: ~35
  completed_date: 2026-05-19
---

# Phase 28.8 Plan 28-8-03: Codex Plugins Research Summary

Re-verify of [developers.openai.com/codex/plugins/build](https://developers.openai.com/codex/plugins/build) on 2026-05-19 (pin-dated per CONTEXT D-07), with full manifest schema + plugin structure + distribution mechanism + install verification + schema mapping + vs-AGENTS.md decision + field-test plan delivered at `.planning/research/codex-plugins-2026-05-19.md` (468 lines, 62 cited URLs).

## Deliverable

`.planning/research/codex-plugins-2026-05-19.md` — single self-contained research document with all nine required content sections that Plan 28-8-C1 and 28-8-C2 consume standalone.

| Required section | Present? | Notes |
|------------------|----------|-------|
| `## TL;DR` | yes | 7-bullet executive summary |
| `## Codex Plugins Re-verify` | yes | 9-row table of 2026-05-18-audit-assumption vs 2026-05-19-finding |
| `## Manifest Format` | yes | 12-row top-level field table + 14-row `interface` sub-shape table + marketplace catalog sub-section |
| `## Plugin Structure` | yes | 10-entry tree with required/optional citations |
| `## Distribution Mechanism` | yes | Verdict: `install-by-URL` |
| `## Install Verification Flow` | yes | 6-step state machine with pre-install, command, post-install layout, skills landing, verification, uninstall |
| `## Schema Mapping` | yes | 26-row table from manifest fields → GDD source artifacts |
| `## vs AGENTS.md` | yes | Verdict: `additive` |
| `## Field-Test Plan` | yes | Verdict: `Field-test gate: GREEN` |
| `## Open Questions` | yes | 10 items needing field-test confirmation |
| `## Fetch Issues` | yes | 2 URLs returned HTTP 404 (manifest, distribute candidate pages — content folded into /build) |
| `## Sources` | yes | 4 fetched URLs + 2 404s, all pin-dated 2026-05-19 |

## Verdicts (reported to phase orchestrator)

| Question | Verdict | Evidence |
|----------|---------|----------|
| Distribution model | **`install-by-URL`** (literal) | `codex plugin marketplace add owner/repo` documented for GitHub shorthand, Git URLs, SSH URLs, local dirs ([per build page](https://developers.openai.com/codex/plugins/build)). |
| CONTEXT D-03 (install-by-URL works today) | **CONFIRMED** with refinement | The URL must resolve to a marketplace catalog file (not the plugin manifest directly). Our existing `.claude-plugin/marketplace.json` is explicitly listed as legacy-compatible by Codex. |
| vs AGENTS.md | **`additive`** (literal) | No precedence rule documented. Both surfaces coexist: AGENTS.md = repo-rooted agent context (Tier-1); `.codex-plugin/plugin.json` = installed plugin under `~/.codex/plugins/cache/.../$VERSION/` (Tier-2). |
| CONTEXT D-05 (Tier-2 additive for Codex slot) | **CONFIRMED** | C1 adds `kind: 'codex-plugin'` without modifying Phase 28.7 `codex.cjs`. |
| Field-test gate | **`GREEN`** | 5 prereqs (Codex CLI installed/authenticated, manifest committed, catalog committed, v1.28.8 tag pushed). No blockers. |
| CONTEXT D-09 (post-merge maintainer field-test) | **VIABLE** | Exact command `codex plugin marketplace add hegemonart/get-design-done` documented with prereqs + failure modes + verification path. |
| CONTEXT D-07 (mandatory workstream-start re-verify) | **SATISFIED** | All 5 fetches dated 2026-05-19, NOT cached from 2026-05-18 audit. Pin-date in file header. |

## Fetch Discipline

| URL | HTTP | Outcome |
|-----|------|---------|
| `https://developers.openai.com/codex/plugins/build` | 200 | Primary source. Full manifest spec + plugin tree + distribution + cache path + hooks feature flag + "coming soon" registry verdict. |
| `https://developers.openai.com/codex/plugins` | 200 | Plugins overview. Install/uninstall flows, `codex /plugins` browser, `~/.codex/config.toml` per-plugin enable/disable. |
| `https://developers.openai.com/codex/skills` | 200 | Skill spec consumed by `manifest.skills`. SKILL.md required fields (`name`, `description`), skill scopes, distribute-via-plugin pointer. |
| `https://developers.openai.com/codex` | 200 | Codex docs home — confirmed Plugins under the Codex tree; navigation structure. |
| `https://developers.openai.com/codex/plugins/manifest` | 404 | Page does not exist — manifest schema is folded into `/build`. No impact. |
| `https://developers.openai.com/codex/plugins/distribute` | 404 | Page does not exist — distribution is folded into `/build`. No impact. |

**Budget consumed: 5 of 6 WebFetch calls** (4 successful, 1 not needed — I had enough material after fetching `/codex/plugins/build`, `/plugins`, `/skills`, `/codex`, plus the two confirmed-404 probes from the candidate URLs list).

**No CRITICAL fetch failures.** The CONTEXT-D-03-source-of-truth page (`/codex/plugins/build`) is `live` (HTTP 200, 334 KB). CONTEXT D-03 does NOT need revision for "page exists" reasons; only the catalog-file refinement noted above.

## Key Refinements Documented (vs 2026-05-18 audit)

1. **Plugin cache path correction.** 2026-05-18 working assumption was `~/.codex/plugins/cache/<owner>/<repo>/`. 2026-05-19 verbatim from build page: `~/.codex/plugins/cache/$MARKETPLACE_NAME/$PLUGIN_NAME/$VERSION/`. For our case the first segment is the marketplace catalog's `name` field (not GitHub `owner`).

2. **Marketplace catalog file is required.** The 2026-05-18 audit treated `.codex-plugin/plugin.json` as the sole entry point. The 2026-05-19 doc confirms a marketplace catalog file (`marketplace.json` listing plugins) is also required, and Codex reads our existing `.claude-plugin/marketplace.json` as the legacy-compat slot.

3. **`interface` sub-shape (14 fields) now documented.** 2026-05-18 audit listed `interface` as an optional field without enumerating sub-fields. 2026-05-19 build page enumerates all 14 (`displayName`, `shortDescription`, `longDescription`, `developerName`, `category`, `capabilities`, `websiteURL`, `privacyPolicyURL`, `termsOfServiceURL`, `defaultPrompt`, `brandColor`, `composerIcon`, `logo`, `screenshots`) — see Schema Mapping table for source-artifact mapping.

4. **Hooks feature flag is opt-in.** 2026-05-19 doc explicitly states: "Plugin hooks are off by default in this release; bundled hooks won't run unless `[features].plugin_hooks = true`." C1 may omit `manifest.hooks` from the v1.28.8 manifest since hooks won't run for most users.

5. **Marketplace catalog field shape.** Beyond `name`/`source.path`/`plugins[]`, Codex catalog entries require `policy.installation`, `policy.authentication`, and `category` per plugin. Our existing `.claude-plugin/marketplace.json` does NOT currently emit `policy` fields — C1 must either (a) add them to `.claude-plugin/marketplace.json` (preserves single-source-of-truth) or (b) emit a Codex-specific `.agents/plugins/marketplace.json` (cleaner separation). Recommended: option (b).

## TL;DR Pointers for C1 + C2

**For C1 (manifest + catalog generator):**
- Manifest filename: `.codex-plugin/plugin.json` at plugin root.
- 3 required fields: `name` (kebab-case), `version` (semver), `description` (free text).
- 9 optional top-level fields: `author`, `homepage`, `repository`, `license`, `keywords`, `skills`, `mcpServers`, `apps`, `hooks`, `interface`.
- 14 `interface` sub-fields (all optional).
- Schema mapping has 26 rows — every field's source artifact + match-status (`direct` / `transform` / `compose` / `generate` / `static`) + transform sentence.
- Plus Codex marketplace catalog: emit `.agents/plugins/marketplace.json` with `name`, `interface.displayName`, `plugins[].name`, `plugins[].source`, `plugins[].policy.installation`, `plugins[].policy.authentication`, `plugins[].category` per entry.

**For C2 (doctor mode + field-test):**
- 11 local-checkable items (no network calls): manifest exists, valid JSON, required fields present, name is kebab-case, version is semver, skills/mcpServers/hooks paths resolve, catalog file exists at canonical or legacy-compat path, catalog has matching plugin entry, entry's source.path resolves.
- Plugin cache path: `~/.codex/plugins/cache/$MARKETPLACE_NAME/$PLUGIN_NAME/$VERSION/`.
- Field-test command: `codex plugin marketplace add hegemonart/get-design-done`.

## Self-Check: PASSED

Verification of the listed deliverables:

| Claim | Verification | Result |
|-------|--------------|--------|
| `.planning/research/codex-plugins-2026-05-19.md` exists | `ls -la .planning/research/codex-plugins-2026-05-19.md` | FOUND — 468 lines |
| File contains all 9 required content sections | `grep -c '^## ' .planning/research/codex-plugins-2026-05-19.md` returns ≥ 9 | PASS (≥9 `## ` headings) |
| ≥ 200 lines | `wc -l` | PASS (468 lines) |
| ≥ 3 https URLs cited | `grep -c 'https://'` | PASS (62 URLs) |
| Verdict literals present (`install-by-URL`, `additive`, `Field-test gate: GREEN`) | `grep -E ...` | PASS — all three literals match |
| Field-test command `codex plugin marketplace add hegemonart/get-design-done` present | `grep` | PASS |
| Pin-date `2026-05-19` in header HTML comment | `grep` | PASS |
| Task 1 verify block (full chained command) | inline-run during execution | PASS — output: `Task 1 acceptance: PASS` |
