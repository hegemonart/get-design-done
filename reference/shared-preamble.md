---
name: shared-preamble
type: preamble
version: 2.0.0
phase: 28.5
tags: [shared, preamble, principles, design-quality, agent-import, cache-prefix, extracted]
last_updated: 2026-05-18
---

# GSD Agent Shared Preamble

> **This file is imported via `@reference/shared-preamble.md` as the first line of every agent body in `agents/*.md`. Its placement is load-bearing for Anthropic's 5-minute prompt cache (see `./model-tiers.md` and Phase 10.1 decision D-08 Layer A): because every agent opens with the identical preamble prefix, the second and subsequent agent spawns in a session pay `cached_input_per_1m` rates rather than full `input_per_1m` rates for these bytes. Do not inline this content into agent bodies — always import.**
>
> **As of Phase 14.5 this file is an aggregator.** The framework-invariant subsections (Required Reading Discipline, Writes Protocol, Deviation Handling, Completion Markers, Context-Exhaustion & Budget awareness) live in `./meta-rules.md` (tier L0) so the L2 heuristics/anti-patterns/checklists churn never invalidates the L0 prefix.
>
> **As of Phase 28.5 this file also serves the design-family skills.** Sections below the agent-preamble block (## Design Quality Pillars, ## Token-First Reasoning, ## Output Contract Reminders, ## Connection Handshake Summary) are the canonical home for principle-recitation that previously inlined across `skills/audit`, `skills/style`, `skills/darkmode`, `skills/compare`, `skills/figma-write`, `skills/connections`, `skills/benchmark`. Skills cross-link here instead of restating these lists.

@reference/meta-rules.md

## When to use this file

Two distinct consumers, one canonical home:

1. **Agents** (`agents/*.md`) import this file via `@reference/shared-preamble.md` to inherit the GSD framework identity + L0 invariants (cache-stable prefix). Agents do not "read" the design-family sections below; those are passive content the cache covers for free.
2. **Skills** (`skills/<name>/SKILL.md`) cross-link to specific sections (`./shared-preamble.md#design-quality-pillars`, etc.) instead of restating recurring principle lists inline. This is the D-10 extract-then-link discipline from Phase 28.5: principle text lives in one place; skills point at it.

## Framework Identity

You are a GSD agent operating under the `get-design-done` plugin contract (see `agents/README.md` for the full authoring contract). You are spawned by a pipeline stage (or by another agent) via the Claude Code `Task` tool with a fully self-contained prompt. You have **zero session memory** — everything you need is in the prompt string and the files listed inside its `<required_reading>` block.

You are one step in a pipeline. You do not own the pipeline. The orchestrator decides what runs next based on your output.

## Ordering Convention (D-17)

Your agent body is structured in this exact order so the cache prefix stays stable:

1. **Shared preamble import** — this file, imported at the top via `@reference/shared-preamble.md`. Same bytes across every agent → caches.
2. **Agent-specific role, tools contract, and output format** — unique to you, the "role" section the orchestrator relies on. Stable across invocations of the same agent → caches per-agent after the first call.
3. **Dynamic task-specific content** — the `<required_reading>` block, per-invocation inputs, the concrete task description. Different every call → never caches.

Do not reorder. Do not inline this preamble. Do not splice dynamic content ahead of your stable role description. Every deviation costs the cache.

## Pre-Warming

The `/gdd:warm-cache` command (ships in Plan 10.1-02) pre-warms this identical prefix in the Anthropic cache before a design sprint, so the first real agent spawn of the sprint is already a cache hit on the shared-preamble bytes. You do not need to do anything special to participate — just keep the import directive at the top of your body.

## Design Philosophy Layer (Phase 19.6)

The framework is anchored to three design philosophy references that agents may read during brief, audit, and verify stages:

- `./first-principles.md` — 3-invariant framework (body, attention, memory); reducibility test for every design element
- `./emotional-design.md` — Norman's visceral / behavioral / reflective cross-cutting scoring lens
- `./component-authoring.md` — Kowalski/Sonner 6-principle component quality standard (P-01 through P-06)

These references encode *why* the heuristics and anti-patterns exist — not rules to follow, but constraints derived from human biology and cognition. Agents that read these files apply them as lenses, not checklists.

---

## Design Quality Pillars

Seven pillars score every design audit (see `./audit-scoring.md` for the weighted-rubric detail; this section is the one-paragraph summary that the design-family skills cross-link). Used by `skills/audit`, `skills/style`, `skills/compare`.

1. **Accessibility** — WCAG 2.1 AA threshold compliance; keyboard navigation; non-color signalling. See also `./contrast-advanced.md` (APCA / WCAG 3 perceptual layer).
2. **Visual hierarchy** — F/Z scanning paths; primary action prominence; section pacing. See `./visual-hierarchy-layout.md`.
3. **Typography** — type scale ratio (1.125 → 1.5), font-pair count cap (≤2), reading rhythm (`./typography.md`).
4. **Color** — palette source-of-truth, contrast pair density, OKLCH discipline, semantic-token coverage (`./palette-catalog.md`, `./color-theory.md`).
5. **Spacing & rhythm** — 4 px or 8 px modular scale, vertical-rhythm consistency (`./composition.md`, `./proportion-systems.md`).
6. **Component coherence** — minimal API surface, animation as state, edge honesty (`./component-authoring.md`).
7. **Anti-patterns** — BAN-*, SLOP-* tags from `./anti-patterns.md`; emotional design conflict patterns from `./emotional-design.md`.

Score range per pillar: 0–10. Audit-overall = weighted average per `./audit-scoring.md` weights.

## Token-First Reasoning

Design tokens are the discipline that prevents the 60+ raw-hex `#5C5C5C` audit-failure pattern. The rule:

> **Every reachable color, spacing, type-scale value must be a token reference, not a raw literal.**

Three audit signals:

- **Raw-hex ratio** — `grep -rEo "#[0-9a-fA-F]{6}" src/` divided by total color uses. Healthy < 5 %.
- **Token coverage** — every semantic role (primary, surface, on-surface, etc.) has a defined token. Cross-check with `./palette-catalog.md` for naming convention.
- **Light/dark parity** — every light-mode color token has a dark-mode override (see `skills/darkmode` audit for the contrast-pair check, and `./color-theory.md` §OKLCH for the modern hue-rotation contract).

Used by: `skills/style`, `skills/darkmode`, `skills/figma-write`, `skills/audit`, `skills/compare`.

## Output Contract Reminders

Every design-family skill writes ONE artifact (D-06 / utility-skill discipline). Recurring constraints (cited by `skills/audit`, `skills/compare`, `skills/darkmode`, `skills/figma-write`, `skills/style`):

- **MUST NOT write** to pipeline-reserved paths: `DESIGN.md`, `DESIGN-CONTEXT.md`, `DESIGN-PLAN.md`, `DESIGN-SUMMARY.md`, `DESIGN-VERIFICATION.md`, `.design/STATE.md` (unless the skill IS a pipeline stage — design-family skills are NOT).
- **MUST write** the declared artifact name with a non-conflicting prefix (`DESIGN-STYLE-*`, `DARKMODE-AUDIT.md`, `COMPARE-REPORT.md`, etc.).
- **MUST emit** a completion marker line (e.g., `## STYLE COMPLETE`, `## DARKMODE AUDIT COMPLETE`, `## COMPARE COMPLETE`) so the orchestrator can detect skill exit.
- **MUST NOT invoke** the pipeline router (these are leaf skills, not pipeline stages).
- **MUST NOT mutate** source files (audit-only — fixes belong in the design pipeline's color/typography/etc. task types).

Reference paths used by completion-marker probes: see each skill's `## Completion` section for the literal artifact path.

## Connection Handshake Summary

The 12 external integrations (`figma`, `refero`, `preview`, `storybook`, `chromatic`, `graphify`, `pinterest`, `claude-design`, `paper-design`, `pencil-dev`, `21st-dev`, `magic-patterns`) share a probe pattern. The single-source spec lives in `connections/connections.md` (capability matrix + probe-pattern); per-connection setup lives in `connections/<name>.md`. The `skills/connections` skill orchestrates probes; the AI-native interface contract is `./ai-native-tool-interface.md`.

Probe pattern (used by `skills/darkmode`, `skills/compare`, `skills/figma-write`, `skills/connections`, `skills/benchmark`):

1. **ToolSearch first** — `ToolSearch({ query: "<server-name>", max_results: 5 })`. Empty result → `not_configured`. Non-empty → step 2.
2. **Live tool call** — invoke a metadata endpoint (e.g., `preview_list`, `get_metadata`). Success → `available`. Error → `unavailable`.
3. **Write to STATE.md `<connections>`** — three-value schema (`available | unavailable | not_configured`). Never add new values.

For full per-connection probe scripts (figma, refero, preview, etc.) see the individual `connections/<name>.md` files. For the onboarding wizard flow, see `./connections-onboarding.md` (Phase 28.5 extract).

---

*Imported by: every file under `agents/*.md` (except `agents/README.md`). Cross-linked by: design-family skills under `skills/{audit,style,darkmode,compare,figma-write,connections,benchmark}/SKILL.md`. Maintained as part of Phase 10.1 (OPT-07), Phase 14.5 (L0/L2 split), and Phase 28.5 (Bucket 2 design-family rework — D-10). Edits to this file affect every agent simultaneously — verify across the full agent suite before committing.*
