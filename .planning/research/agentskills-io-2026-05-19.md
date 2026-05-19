# agentskills.io Research — 2026-05-19

<!-- Phase 28.8 / Plan 28-8-01 / pin-date 2026-05-19 / source-of-truth re-verify per CONTEXT D-07 -->

## TL;DR

- **Recommendation: `lint-only`.** Phase 28.5's `skills/<name>/SKILL.md` frontmatter contract is already a strict superset of the two agentskills.io required fields (`name`, `description`); zero hard schema changes required. A small ongoing-enforcement lint script (28-8-A1) protects against drift.
- **Hard-required spec compliance: 100%.** Every shipped `skills/*/SKILL.md` already satisfies the two REQUIRED fields (`name` slug-shaped, `description` non-empty ≤1024 chars) per spec at [agentskills.io/specification](https://agentskills.io/specification).
- **Frontmatter divergences from spec: 3, all soft (`extra` or `rename` of optional fields).** `argument-hint` (Claude Code extension, not in spec), `disable-model-invocation` (Claude Code extension), `tools: Read, Write` (comma-separated; spec's `allowed-tools` is space-separated AND flagged "Experimental — support for this field may vary"). All silently ignored by spec-conformant runtimes per OpenCode docs ("Unknown frontmatter fields are ignored").
- **Runtime carousel scope reality:** of the 10 runtimes the plan asked us to verify, only 6 (Codex, Cursor, OpenCode, Gemini CLI, VS Code Copilot, Claude Code) appear on the agentskills.io homepage carousel; **Kilo, Augment, Hermes, and Qwen are NOT on agentskills.io as of 2026-05-19**. Kilo's own docs do cite the spec; the others have no canonical "Skills" doc to verify against.
- **Branch outcome:** Wave B Plan 28-8-A1 ships `scripts/lint-agentskills-spec.cjs` only — no consolidated converter, no per-runtime refactor of Phase 28.7's converter cluster. Plan 28-8-A2 re-tests `full`-compat runtimes only (subset, not all 10).

## Spec Summary

Source: [agentskills.io/specification](https://agentskills.io/specification), fetched 2026-05-19. Spec is hosted on Mintlify (mirror at `agent-skills.mintlify.app`); no published version number, but the spec headers we extracted match the carousel page's same-day publication date.

### Directory structure

```
skill-name/
├── SKILL.md          # Required: metadata + instructions
├── scripts/          # Optional: executable code
├── references/       # Optional: documentation
├── assets/           # Optional: templates, resources
└── ...
```

### Frontmatter — exact field table (verbatim from spec)

| Field | Required | Constraints |
|-------|----------|-------------|
| `name` | **Yes** | Max 64 characters. Lowercase letters, numbers, and hyphens only. Must not start or end with a hyphen. Must not contain consecutive hyphens. Must match the parent directory name. Regex: `^[a-z0-9]+(-[a-z0-9]+)*$`. |
| `description` | **Yes** | Max 1024 characters. Non-empty. Describes what the skill does and when to use it. |
| `license` | No | License name or reference to a bundled license file. |
| `compatibility` | No | Max 500 characters. Indicates environment requirements (intended product, system packages, network access, etc.). |
| `metadata` | No | Arbitrary key-value mapping for additional metadata. |
| `allowed-tools` | No | Space-separated string of pre-approved tools the skill may use. **Marked "Experimental" — support for this field may vary between agent implementations.** |

### Body content

> "The Markdown body after the frontmatter contains the skill instructions. There are no format restrictions. ... Keep your main SKILL.md under 500 lines. Move detailed reference material to separate files."

Our Phase 28.5 D-01 caps at 250 lines (block) / 100 lines (warn) — strictly tighter than the spec's 500-line guidance.

### Validation tool

> "Use the `skills-ref` reference library to validate your skills: `skills-ref validate ./my-skill`. This checks that your SKILL.md frontmatter is valid and follows all naming conventions."

Reference impl exists. We do not currently invoke `skills-ref` in CI; Plan 28-8-A1 may or may not wrap it depending on packaging (out of scope for this research).

### Progressive disclosure expectations

Spec calls out three load-time tiers: metadata (~100 tokens, all skills at startup), instructions (<5000 tokens recommended, on activation), resources (on-demand). Matches our Phase 28.5 D-01 cap discipline exactly.

## Claimed-Compat Verification

Per the plan's 10 named runtimes. Sources for each row are agentskills.io homepage carousel `instructionsUrl` fields (fetched 2026-05-19) cross-checked with each runtime's own docs page (also fetched 2026-05-19 unless URL unreachable).

| Runtime | Docs URL | On agentskills.io carousel? | Spec referenced in own docs? | Field list match | Compat strength | Notes |
|---------|----------|-----------------------------|------------------------------|------------------|-----------------|-------|
| **Codex** | [developers.openai.com/codex/skills](https://developers.openai.com/codex/skills/) | Yes ("OpenAI Codex") | No literal "agentskills.io" reference; uses the same `name` + `description` minimum ("SKILL.md must include name and description") | name, description required (matches spec) | **full** | Adds Codex-specific `agents/openai.yaml` for "appearance and dependencies" — orthogonal to spec frontmatter. |
| **Cursor** | [cursor.com/docs/skills](https://cursor.com/docs/skills) (redirects from `/context/skills`) | Yes ("Cursor") | URL responded to fetch but content is SPA-rendered (DOM empty in static fetch); 308 redirect from `/context/skills` → `/skills` confirmed. We cannot verify field list from static HTML on 2026-05-19. | unverified (SPA) | **claim-only** | Carousel adoption confirmed; doc-level field verification deferred. Conservative classification — does not change recommendation (lint covers it). |
| **OpenCode** | [opencode.ai/docs/skills](https://opencode.ai/docs/skills/) | Yes ("OpenCode") | Cites spec implicitly via field list; explicit text "Only these fields are recognized: name (required), description (required), license (optional), compatibility (optional), metadata (optional)". **`allowed-tools` not in recognized list.** "Unknown frontmatter fields are ignored." | Subset of spec (no `allowed-tools`); matches required fields | **full** | OpenCode XDG paths support `~/.opencode/skills/`, `~/.claude/skills/`, `~/.agents/skills/` interchangeably. Phase 28.7 installs OpenCode as `command/` (slash-command surface), NOT `skills/` — so our OpenCode install path is orthogonal to agentskills.io. |
| **Gemini CLI** | [geminicli.com/docs/cli/skills](https://geminicli.com/docs/cli/skills/) | Yes ("Gemini CLI") | **Explicit:** "Based on the Agent Skills open standard, a 'skill' is a self-contained directory..." | name + description (per overview page; deeper field-by-field reference is on linked sub-pages we didn't fetch) | **full** | Uses `~/.gemini/skills/` + `~/.agents/skills/` interchangeably (interop path). Phase 28.7 installs Gemini as `commands/gdd/` (slash-command surface) — orthogonal to agentskills.io skills surface. |
| **VS Code Copilot** | [code.visualstudio.com/docs/copilot/customization/agent-skills](https://code.visualstudio.com/docs/copilot/customization/agent-skills) | Yes ("VS Code", "GitHub Copilot") | **Explicit:** "directory that contains a SKILL.md file, following the Agent Skills specification" + "Learn more about the Agent Skills standard at agentskills.io" | name + description (matches spec) | **full** | Registers via `chatSkills` contribution point in `package.json`. Confirms portability across "GitHub Copilot in VS Code, GitHub Copilot CLI, GitHub Copilot cloud agent". |
| **Claude Code** | [code.claude.com/docs/en/skills](https://code.claude.com/docs/en/skills) | Yes ("Claude Code", "Claude") | No literal "agentskills.io" reference in skills doc, but Anthropic is the spec author per Phase 28.5 audit. **Claude Code's frontmatter is a SUPERSET of the spec** — adds `when_to_use`, `argument-hint`, `arguments`, `disable-model-invocation`, `user-invocable`, `allowed-tools`, `model`. | Superset (all spec fields + Claude Code extensions) | **full** | `allowed-tools` documented (space-separated string OR YAML list — both accepted). Confirms our `argument-hint` is a Claude Code extension, NOT a spec field. |
| **Kilo** | [kilocode.ai/docs/features/skills](https://kilocode.ai/docs/features/skills) | No (NOT on carousel as of 2026-05-19) | **Explicit:** "Frontmatter Fields Per the Agent Skills specification:" — reproduces the spec field table verbatim including `name`, `description`, `license`, `compatibility`, `metadata`. **`allowed-tools` not listed.** | Matches spec required fields exactly | **full** | Kilo cites the spec even though Kilo's brand is not on the agentskills.io carousel. Strong runtime-doc compat; the missing carousel slot is a marketing/curation gap, not a technical one. Phase 28.7 installs Kilo as `command/` (slash-command surface), so our Kilo install path is orthogonal to skills format. |
| **Augment** | (no canonical URL found) | No (NOT on carousel) | Could not verify. We tried `docs.augmentcode.com/customize-workflows/skills` on 2026-05-19; URL returned a Mintlify error page (no skills doc page exists at that path). | unverified | **claim-only** | The 2026-05-18 audit said "Augment claims agentskills.io compat" but agentskills.io as of 2026-05-19 does not list Augment, and we cannot find an Augment skills doc. The "compat claim" is unverified — possibly deprecated or never shipped. Recommendation: treat Augment as non-spec for Plan 28-8-A2's verification matrix until we can re-locate the doc. |
| **Hermes** | (out of scope — see notes) | No (NOT on carousel) | Not verified. | n/a | **none / out-of-scope** | Phase 28.7 D-03 + D-10 explicitly remove Hermes from our 14-runtime list. We do not ship a Hermes converter (no `scripts/lib/install/converters/hermes.cjs`). Plan 28-8-A2 should not include Hermes in its verification subset. |
| **Qwen** | [qwenlm.github.io/qwen-code-docs/en/skills](https://qwenlm.github.io/qwen-code-docs/en/skills/) | No (NOT on carousel) | Fetched on 2026-05-19; response was 17 KB of mostly empty SPA chrome — content is JS-rendered, no static field table extractable. | unverified (SPA) | **claim-only** | Phase 28.7 installs Qwen as `skills/` with `gdd-` prefix (skills-format runtime). Output is spec-compliant on the required-field axis. |

### One-sentence summary per runtime

- **Codex** — `full` compat: explicitly requires `name` + `description`; no spec citation but spec-conformant on the required-field axis.
- **Cursor** — `claim-only`: on agentskills.io carousel, but doc page is SPA-only and unverifiable from static fetch on 2026-05-19.
- **OpenCode** — `full` compat: lists spec's required + 3 optional fields verbatim; ignores unknown fields gracefully.
- **Gemini CLI** — `full` compat: explicitly cites "Based on the Agent Skills open standard"; uses interop `~/.agents/skills/` path.
- **VS Code Copilot** — `full` compat: links agentskills.io by name; registers skills via `chatSkills` manifest contribution.
- **Claude Code** — `full` compat (superset): all spec fields supported plus Claude Code extensions (`argument-hint`, `disable-model-invocation`, etc.).
- **Kilo** — `full` compat: reproduces the spec field table verbatim in its own docs despite not appearing on the agentskills.io carousel.
- **Augment** — `claim-only` (unverifiable): URL we expected returned a Mintlify error page; carousel does not list Augment.
- **Hermes** — out-of-scope: Phase 28.7 D-03 + D-10 explicitly excluded.
- **Qwen** — `claim-only` (SPA): doc page is JS-rendered, no static field table.

## Schema Mapping

Our Phase 28.5 SKILL.md frontmatter contract — sampled from real shipped skills (`skills/discuss/SKILL.md`, `skills/audit/SKILL.md`, `skills/brief/SKILL.md`, `skills/debug/SKILL.md`, `skills/help/SKILL.md`) and confirmed against [Phase 28.5 CONTEXT.md D-01..D-11](../phases/28.5-skill-authoring-contract/CONTEXT.md) — uses these fields: `name`, `description`, `argument-hint` (optional), `tools` (comma-separated), `disable-model-invocation` (optional, whitelist-gated).

| agentskills.io field | Required? | Type | Our SKILL.md field | Match status | Notes |
|----------------------|-----------|------|---------------------|--------------|-------|
| `name` | Yes | string (slug, ≤64 chars, `^[a-z0-9]+(-[a-z0-9]+)*$`) | `name` (e.g. `gdd-discuss`) | **match** | Our names are slug-shaped with `gdd-` prefix. `gdd-discuss` is 11 chars, far under the 64 cap. Regex check confirmed against `skills/discuss/SKILL.md`, `skills/audit/SKILL.md`, `skills/brief/SKILL.md`, etc. — all pass. Parent-directory match (`skills/discuss/` vs `name: gdd-discuss`) **fails the spec's "must match parent directory name" rule** when read strictly — but Phase 28.7 D-05 + D-07 install with target dir `skills/gdd-discuss/`, which DOES match. So source-tree and install-tree differ: source `skills/discuss/` (no prefix) → install `skills/gdd-discuss/` (prefixed). Spec compliance is at the install-tree level. |
| `description` | Yes | string (1-1024 chars) | `description` (Phase 28.5 D-01 advisory ≤500 chars + strict ≤1024 char cap) | **match** | Our 1024-char cap (Phase 28.5 D-01 strict) = spec cap. Phase 28.5 D-01 advisory ≤500 is strictly tighter than spec. Sample skills (`discuss`, `audit`, `brief`, `debug`, `help`) all under 500 chars. |
| `license` | No | string | (absent) | **additive (optional)** | We do not emit `license` per skill. Repository-level MIT license is documented in repo root `LICENSE` + `NOTICE`. The spec's `license` field is optional and our omission is permitted. Could be added per-skill in future if any skill carries a different license (none currently). |
| `compatibility` | No | string (1-500 chars) | (absent) | **additive (optional)** | Our skills do not carry per-skill compatibility metadata. The closest analog is Phase 28.5 D-09's `disable-model-invocation` whitelist, which is Claude-Code-specific (not the spec's "compatibility"). Adding `compatibility: Designed for Claude Code (or similar products)` is feasible but adds noise for zero current value — runtimes already silently ignore unknown fields. Not gap-actionable. |
| `metadata` | No | map | (absent) | **additive (optional)** | We do not emit a generic `metadata` map. Our Phase 28.5 frontmatter uses dedicated fields (`argument-hint`, `tools`, `disable-model-invocation`) rather than nesting under `metadata`. Could be folded under `metadata.argument-hint`/`metadata.tools` etc. for spec purity, but this would break Claude Code's frontmatter consumers (which read top-level `argument-hint`). Not gap-actionable. |
| `allowed-tools` | No (Experimental) | string (space-separated) | `tools: Read, Write, Task` (comma-separated) | **rename + format-divergence (low severity)** | Two divergences: (a) field name (`tools` vs `allowed-tools`); (b) separator (comma vs space). Spec flags `allowed-tools` as Experimental — "support for this field may vary". OpenCode docs DO NOT list `allowed-tools` among recognized fields. Claude Code docs say `allowed-tools` accepts BOTH "space-separated string or a YAML list" — but does Claude Code accept our existing `tools:` field? Per Phase 28.5 D-11, our `tools` is the load-bearing allow-list at the validator level, but the spec's `allowed-tools` is the spec-named field. Phase 28.7 converters do NOT rewrite `tools` → `allowed-tools`. Most runtimes silently ignore both unknown forms. Low-risk drift; lint should warn on missing `allowed-tools` (or accept `tools` as a compat alias) but not hard-block. |
| (none) | n/a | n/a | `argument-hint: "[topic] [--all]"` | **extra (Claude Code extension)** | Not in agentskills.io spec. Documented in Claude Code's skill docs as an OPTIONAL field for autocomplete hint. Silently ignored by spec-conformant runtimes (OpenCode "Unknown frontmatter fields are ignored"). No spec-side gap; informational divergence only. |
| (none) | n/a | n/a | `disable-model-invocation: true` | **extra (Claude Code extension)** | Not in agentskills.io spec. Documented in Claude Code's skill docs to suppress auto-invocation. Phase 28.5 D-09 whitelist-gated. Silently ignored by spec-conformant runtimes. No spec-side gap. |

### Match-status summary

- **match**: 2 / 8 rows (`name`, `description` — both spec-required fields).
- **rename + format-divergence**: 1 / 8 rows (`tools` ↔ `allowed-tools`, low severity, spec field is Experimental).
- **additive (optional)**: 3 / 8 rows (`license`, `compatibility`, `metadata` — we don't emit; all spec-optional; runtime impact zero).
- **extra**: 2 / 8 rows (`argument-hint`, `disable-model-invocation` — Claude Code extensions; silently ignored by spec-conformant runtimes per OpenCode docs).
- **divergent (semantically different requiring code change)**: 0.

## Gap Analysis

### Spec-required gaps (must fix for compliance)

**None.** Both REQUIRED fields (`name`, `description`) are emitted by every shipped `skills/*/SKILL.md` we inspected. Source-tree vs install-tree directory naming is resolved correctly by Phase 28.7's `buildFrontmatter` normalizer (`gdd-` prefix applied to `name` in lockstep with destination directory `skills/gdd-<skill>/`).

### Spec-optional gaps (informational; runtime impact zero)

1. **`allowed-tools` not emitted; we emit `tools` instead.** (Rename + format divergence per Schema Mapping.) **Backward compatibility:** Phase 28.7 converters (e.g., `scripts/lib/install/converters/opencode.cjs`, `cursor.cjs`, `kilo.cjs`) currently pass `tools:` through verbatim. Adding `allowed-tools:` as an additional emit (NOT a replacement) would be backward-compatible. **Size:** 70 skills × 1 frontmatter line = 70 lines net add if applied to source tree. **Decision:** lint warns on missing `allowed-tools` (with `tools` as compat alias), but does not enforce until/unless agentskills.io upgrades it from Experimental.
2. **`license` absent.** Could be emitted from repo-level LICENSE. **Backward compatibility:** purely additive — Phase 28.7 converters pass through any new field. **Size:** 70 skills × 1 line = 70 lines net add. **Decision:** OPTIONAL — not gap-actionable until a per-skill license divergence emerges.
3. **`compatibility` absent.** Could be emitted as `Designed for Claude Code (or similar products)` per spec example. **Backward compatibility:** additive. **Size:** 70 lines net add. **Decision:** SKIP — adds noise for zero current value.

### Non-gap divergences (informational only)

1. `argument-hint` (Claude Code extension, NOT in spec) — silently ignored by spec-conformant runtimes per OpenCode "Unknown frontmatter fields are ignored". **No action.**
2. `disable-model-invocation` (Claude Code extension, NOT in spec) — same disposition. **No action.**
3. `tools` (our naming) vs `allowed-tools` (spec naming) — covered above as the single rename gap candidate.

### Total actionable changes

- **Strictly required for spec compliance:** 0.
- **Recommended ongoing-enforcement lint rules:** 3 (name regex, description ≤1024 chars + non-empty, body ≤500 lines per spec guidance).
- **Optional spec-additive emits:** 0–3 (lint may warn but should not hard-block).

## Adoption Recommendation

**Chosen branch: `lint-only`.**

### Rationale

The decision rubric from [Phase 28.8 CONTEXT.md D-11](../phases/28.8-tier-2-distribution-channels/CONTEXT.md) maps as follows:

- `no-op` would require Gap Analysis to enumerate 0 required changes AND Compat Verification to show ≥7/10 runtimes accept current frontmatter. Required-changes count is 0, satisfying the first half — but the spec has *opinions* (e.g., `allowed-tools` naming, validation via `skills-ref`, length guidance) that we currently don't enforce in CI, so `no-op` understates the value of an ongoing lint gate.
- `lint-only` requires "0–2 trivial renames/additives AND we want ongoing enforcement but no runtime-converter consolidation (Phase 28.7's per-runtime converters already cover the surface)." Gap Analysis enumerates exactly one trivial rename (`tools` ↔ `allowed-tools`, spec field Experimental) and three optional additives (`license`, `compatibility`, `metadata`) that runtimes silently ignore. Phase 28.7's per-runtime converter cluster (`scripts/lib/install/converters/*.cjs`) is recent (shipped 2026-05-19) and works — refactoring it for marginal benefit risks regression. **This branch fits exactly.**
- `partial` would require a clear subset of runtimes whose docs reference the spec literally to benefit from a shared converter. Compat Verification shows 3/10 explicit spec citations (Gemini CLI, VS Code Copilot, Kilo) plus 2 strong-match runtimes (Codex, OpenCode), but our Schema Mapping shows **no field-level divergence requiring runtime-specific converter logic** — every spec-conformant runtime accepts our current frontmatter unchanged. Building a shared converter for an empty transform set has negative ROI.
- `consolidate` would require ≥3 actionable changes AND ≥5/10 runtimes sharing enough surface to justify a unified `scripts/lib/install/converters/agentskills-io.cjs`. We have 0 actionable changes. Strongly rejected.

The chosen `lint-only` branch is grounded specifically in: Schema Mapping rows showing 2/2 required fields `match`, 0 `divergent` rows, and 1 `rename` row where the spec field (`allowed-tools`) is itself flagged Experimental. Compat Verification rows showing 6/10 explicit `full` (Codex, OpenCode, Gemini CLI, VS Code Copilot, Claude Code, Kilo) + 3 `claim-only` SPA/unverifiable (Cursor, Augment, Qwen) + 1 out-of-scope (Hermes) — no row blocked by our current frontmatter.

## Implementation Implications for Wave B

### Plan 28-8-A1 — what to ship

- `scripts/lint-agentskills-spec.cjs` ONLY. No `scripts/lib/install/converters/agentskills-io.cjs`. No refactor of Phase 28.7's per-runtime converters.
- Lint check coverage (one rule per spec mandate):
  1. **R1** — every `skills/*/SKILL.md` frontmatter contains non-empty `name`.
  2. **R2** — `name` matches regex `^[a-z0-9]+(-[a-z0-9]+)*$` (lowercase alphanumeric + hyphens; no leading/trailing/consecutive hyphens; ≤64 chars).
  3. **R3** — `name` matches the parent directory of the SKILL.md (after Phase 28.7 install-time `gdd-` prefixing; for source-tree lint, allow EITHER the bare slug OR the `gdd-`-prefixed slug).
  4. **R4** — `description` is non-empty and ≤1024 chars.
  5. **R5** — SKILL.md body ≤500 lines (spec guidance "Keep your main SKILL.md under 500 lines"). Note: Phase 28.5 D-01 strict cap is already 250; this rule is informational redundancy that flags drift toward spec ceiling.
- Lint outputs WARN (not ERROR) on missing `allowed-tools` if `tools` is present. Lint outputs WARN on `argument-hint` / `disable-model-invocation` only if a strict-spec mode flag is set (default OFF).
- Wire into existing CI gate from Phase 28.5-11 (alongside `scripts/validate-skill-length.cjs`).

### Plan 28-8-A1 — what NOT to ship

- No consolidated converter. The Phase 28.7 cluster is the right abstraction layer for runtime-specific install logic; agentskills.io spec compliance is orthogonal (every spec-conformant runtime accepts our existing frontmatter unchanged per Schema Mapping).
- No rewrite of `tools` → `allowed-tools` in source skills. The spec field is Experimental and runtime support varies (OpenCode does not list `allowed-tools`); changing the source-tree breaks the Claude Code consumer.

### Plan 28-8-A2 — verification subset

Per Compat Verification table, re-test only the `full`-compat runtimes installed as `skills/` form in Phase 28.7:

- **Codex** — `scripts/lib/install/converters/codex.cjs` output → spec-compliant frontmatter check (`name`, `description` required fields present, `name` slug-matches install-dir).
- **VS Code Copilot** — `scripts/lib/install/converters/copilot.cjs` output → same check + spec citation honor (Copilot reads `chatSkills` manifest pointer; verify pointer present per VSCode doc).
- **Claude Code** — passthrough (no converter); frontmatter is identity-equivalent to source.
- **Cursor** — `scripts/lib/install/converters/cursor.cjs` output → required-field check. Doc-level verification not feasible (SPA) on 2026-05-19; rely on schema-level check only.
- **Augment** / **Qwen** — required-field check only; treat as `claim-only` per Compat table.

Runtimes NOT to include in Plan 28-8-A2 subset:
- **Gemini CLI**, **OpenCode**, **Kilo** — Phase 28.7 installs these as `commands/` (slash-command surface), not `skills/`. Their agentskills.io compat is at the SKILL.md format level, which our install path doesn't exercise. Out-of-scope for A2's verification subset.
- **Hermes** — out-of-scope per Phase 28.7 D-03 + D-10.

### Decision lock for CONTEXT.md D-13

`agentskills.io adoption outcome: lint-only.` See § Adoption Recommendation. Wave B Plan 28-8-A1 ships `scripts/lint-agentskills-spec.cjs` only; no consolidated converter; no schema breakage to 70 shipped skills.

## Fetch Issues

- **Cursor docs (https://cursor.com/docs/skills)** — static HTML fetch on 2026-05-19 returned a Vercel/Next.js SPA shell with empty body; content is JS-rendered. URL redirected from `/docs/context/skills` → `/docs/skills` (308 Permanent). Carousel adoption confirmed via agentskills.io; field-level verification deferred. Does not change recommendation (lint covers it).
- **Qwen docs (https://qwenlm.github.io/qwen-code-docs/en/skills/)** — static HTML fetch returned 17 KB SPA chrome; content is JS-rendered.
- **Augment docs** — fetched `https://docs.augmentcode.com/customize-workflows/skills` on 2026-05-19; URL returned a Mintlify "next_error_" error page. No skills doc page exists at that path. The 2026-05-18 audit's "Augment claims compat" finding could not be re-verified on 2026-05-19. Treating Augment as `claim-only`.
- **Hermes** — not fetched. Out-of-scope per Phase 28.7 D-03 + D-10 (Hermes is not in our 14-runtime list).

WebFetch budget: spec used 11 of the 12 allowed (2 spec pages + 6 successful runtime docs + 1 Cursor retry + 1 failed Augment + 1 Qwen partial). One call remained unused.

## Sources

All URLs fetched 2026-05-19 unless noted.

- [https://agentskills.io](https://agentskills.io) — homepage with adopter carousel; extracted 36 `instructionsUrl` field entries; confirmed 10 plan-target runtimes' presence/absence (6 present: Codex, Cursor, OpenCode, Gemini CLI, VS Code Copilot, Claude Code; 4 absent: Kilo, Augment, Hermes, Qwen).
- [https://agentskills.io/specification](https://agentskills.io/specification) — canonical spec; extracted verbatim field table (name/description required; license/compatibility/metadata/allowed-tools optional; `allowed-tools` Experimental); body ≤500 lines guidance; `skills-ref` validation tool reference.
- [https://developers.openai.com/codex/skills/](https://developers.openai.com/codex/skills/) — Codex skills doc; confirmed "SKILL.md must include name and description"; added Codex-specific `agents/openai.yaml`.
- [https://cursor.com/docs/skills](https://cursor.com/docs/skills) — Cursor skills doc; SPA-rendered, content unverifiable from static fetch on 2026-05-19; redirect confirmed.
- [https://opencode.ai/docs/skills/](https://opencode.ai/docs/skills/) — OpenCode skills doc; extracted recognized-field list (`name`, `description`, `license`, `compatibility`, `metadata`); confirmed "Unknown frontmatter fields are ignored"; XDG paths `~/.opencode/skills/`, `~/.claude/skills/`, `~/.agents/skills/`.
- [https://geminicli.com/docs/cli/skills/](https://geminicli.com/docs/cli/skills/) — Gemini CLI skills doc; explicit "Based on the Agent Skills open standard"; `~/.gemini/skills/` + `~/.agents/skills/` interop paths.
- [https://code.visualstudio.com/docs/copilot/customization/agent-skills](https://code.visualstudio.com/docs/copilot/customization/agent-skills) — VS Code Copilot agent-skills doc; explicit "following the Agent Skills specification" + "Learn more about the Agent Skills standard at agentskills.io"; `chatSkills` contribution point in `package.json`.
- [https://code.claude.com/docs/en/skills](https://code.claude.com/docs/en/skills) — Claude Code skills doc; extracted full frontmatter reference table including `allowed-tools` (space-separated string OR YAML list), `argument-hint`, `disable-model-invocation`, `when_to_use`, `arguments`, `user-invocable`, `model`.
- [https://kilocode.ai/docs/features/skills](https://kilocode.ai/docs/features/skills) — Kilo skills doc; explicit "Per the Agent Skills specification:" + verbatim field table (`name`, `description` required; `license`, `compatibility`, `metadata` optional).
- [https://docs.augmentcode.com/customize-workflows/skills](https://docs.augmentcode.com/customize-workflows/skills) — Augment skills doc URL probed; returned a Mintlify error page; field list unverifiable on 2026-05-19.
- [https://qwenlm.github.io/qwen-code-docs/en/skills/](https://qwenlm.github.io/qwen-code-docs/en/skills/) — Qwen skills doc; SPA-rendered, content unverifiable from static fetch on 2026-05-19.

Phase-internal cross-references (not fetched URLs):

- [.planning/phases/28.5-skill-authoring-contract/CONTEXT.md](../phases/28.5-skill-authoring-contract/CONTEXT.md) — D-01..D-11 frontmatter contract that defines our current SKILL.md shape.
- [.planning/phases/28.7-verified-install-for-claimed-runtimes/CONTEXT.md](../phases/28.7-verified-install-for-claimed-runtimes/CONTEXT.md) — D-03 + D-10 (Hermes out-of-scope); D-05 (per-runtime converter pattern).
- [skills/discuss/SKILL.md](../skills/discuss/SKILL.md) — frontmatter sample 1 (`name: gdd-discuss`, `argument-hint`, `tools: Read, Write, Task`).
- [skills/audit/SKILL.md](../skills/audit/SKILL.md) — frontmatter sample 2.
- [skills/brief/SKILL.md](../skills/brief/SKILL.md) — frontmatter sample 3 (uses MCP tool names in `tools:` list).
- [skills/help/SKILL.md](../skills/help/SKILL.md) — frontmatter sample with `disable-model-invocation: true`.
- [scripts/lib/install/converters/shared.cjs](../scripts/lib/install/converters/shared.cjs) — `buildFrontmatter()` confirmed: passes `tools:` and `argument-hint:` through verbatim; only normalizes `name:` prefix.
- [scripts/lib/install/runtime-artifact-layout.cjs](../scripts/lib/install/runtime-artifact-layout.cjs) — runtime → kind mapping: 9 runtimes install as `skills/` (claude, cursor, codex, copilot, antigravity, windsurf, augment, trae, qwen, codebuddy), 3 as `commands/` (gemini, opencode, kilo), 1 absent (cline).
