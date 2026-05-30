# Phase 29 — Stage-1 incubator drafts expected shape (K-stable-cluster fixture)

Source fixture: `test-fixture/baselines/phase-29/capability-gap-events-fixture.jsonl`
(14 synthetic `capability_gap` events across 4 stable clusters).

This is the expected shape of the Stage-1 drafts the incubator-author (Plan
29-04, `scripts/lib/incubator-author.cjs`) writes to
`.design/reflections/incubator/<slug>/` when run against the fixture above
post Stage-0 → Stage-1 user opt-in. Snapshot baseline — Plan 29-07 baseline
test asserts the structural shape (frontmatter present, `## Origin` section
present, `delegate_to: null` per D-12).

Per Phase 29 D-09: drafter only authors a new artifact when no existing artifact's
diff (by name + tools + description embedding) is below similarity threshold.

Two example drafts shown (cluster 01 → SKILL, cluster 04 → agent). Clusters 02 /
03 do not yet have enough stability per the gate spec.

---

## Draft 1 — `.design/reflections/incubator/svg-sprite-to-icon-component/SKILL.md`

```markdown
---
name: svg-sprite-to-icon-component
description: "Converts SVG sprite sheets into individual React/Vue icon components with type-safe props. Use when the codebase has a sprite.svg or icons.svg and we need per-icon components for tree-shakeable imports."
tools: Read, Write, Edit, Grep
default-tier: sonnet
parallel-safe: true
reads-only: false
delegate_to: null
---

# svg-sprite-to-icon-component

## Role

You convert SVG `<symbol>` definitions inside a sprite into single-file icon
components matching the project's existing icon convention.

## Origin

Drafted by Phase 29 incubator-author from the following `capability_gap`
events (cluster `bcdaa4f8cba0...`, 4 occurrences across 3 sources):

- `event_id`: derived from `phase-29-fixture-0-fast` (source: fast)
- `event_id`: derived from `phase-29-fixture-1-fast` (source: fast)
- `event_id`: derived from `phase-29-fixture-2-reflector_pattern` (source: reflector_pattern)
- `event_id`: derived from `phase-29-fixture-3-fast` (source: fast)

Computed usage frequency: 4 occurrences over ~14 reflection cycles
(synthetic span). Suggested integration point: alongside
`skills/extract-learnings` and `skills/style` — both currently surface
asset-related lookups without owning the conversion path.

## Procedure

(Stage-1 incubator draft — Phase 28.5 compact body follows, ≤100 lines per
the SKILL authoring contract.)
```

---

## Draft 2 — `.design/reflections/incubator/contrast-motion-auditor/agents/contrast-motion-auditor.md`

```markdown
---
name: contrast-motion-auditor
description: "Audits color contrast continuity across motion keyframes — flags WCAG-failing intermediate states between accessible start/end colors. Use when an animation transitions between two compliant colors but the midpoint may regress (sRGB muddy-mid problem). Reads OKLCH interpolation per reference/color-theory.md."
tools: Read, Grep, Bash
default-tier: sonnet
reasoning-class: medium
parallel-safe: true
reads-only: true
delegate_to: null
---

# contrast-motion-auditor

## Role

You audit motion keyframes for accessibility-regression at intermediate
states. Inputs are CSS/JSON animations + the reference palette.

## Origin

Drafted by Phase 29 incubator-author from the following `capability_gap`
events (cluster `5f1796008739...`, 4 occurrences across 3 sources):

- `event_id`: derived from `phase-29-fixture-10-router` (source: router)
- `event_id`: derived from `phase-29-fixture-11-fast` (source: fast)
- `event_id`: derived from `phase-29-fixture-12-reflector_pattern` (source: reflector_pattern)
- `event_id`: derived from `phase-29-fixture-13-router` (source: router)

Computed usage frequency: 4 occurrences over ~14 reflection cycles
(synthetic span). Suggested integration point: invoked alongside
`design-verifier` during the Verify stage — the verifier checks
start/end states; this agent extends coverage to keyframe interpolation.

## Audit Steps

(Stage-1 incubator draft — agent body follows.)
```

---

## What this fixture verifies

- Phase 28.5-compliant frontmatter present (`name`, `description` in
  `<what>. Use when <triggers>.` form, `tools`, `default-tier`,
  `parallel-safe`, `reads-only`).
- `delegate_to: null` defensive default per D-12 (forward-compat with Phase 27).
- `## Origin` section lists originating `capability_gap` event refs.
- Computed usage frequency + suggested integration point present.
- Scope respected (D-05): both drafts target `skills/` or `agents/` — never
  runtimes / transports / connections / hooks.

The drafter does NOT promote — promotion is the user's `accept` action in
`/gdd:apply-reflections` (29-05). Until then drafts live under
`.design/reflections/incubator/<slug>/` only and accumulate the 30-day TTL
clock (29-06, D-06).
