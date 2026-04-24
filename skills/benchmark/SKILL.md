---
name: gdd-benchmark
description: Harvest and synthesize per-component design benchmarks from 18 design systems. Produces canonical specs at reference/components/<name>.md.
argument-hint: "<component> | --wave <N> | --list | --refresh <component>"
tools: Read, Write, Bash, Grep, Glob, Task, WebFetch
---

# /gdd:benchmark

Harvest per-component design knowledge from 18 design systems and synthesize canonical
specs at `reference/components/<name>.md`.

## Invocation Modes

| Invocation | Action |
|------------|--------|
| `/gdd:benchmark <component>` | Harvest + synthesize a single component |
| `/gdd:benchmark --wave <N>` | Run a full wave (1 = Inputs, 2 = Containers, etc.) |
| `/gdd:benchmark --list` | Show corpus coverage — which specs exist, which are pending |
| `/gdd:benchmark --refresh <component>` | Re-harvest a spec (for design-system version bumps) |

## Single-Component Flow (`/gdd:benchmark <component>`)

1. **Check if spec exists** — `Glob("reference/components/<component>.md")`.
   If found and `--refresh` was not passed, confirm before overwriting.

2. **Harvest** — spawn `component-benchmark-harvester` with:
   ```
   Task("component-benchmark-harvester", """
   <required_reading>
   @connections/design-corpora.md
   </required_reading>

   Harvest design-system excerpts for component: <component>
   Emit raw harvest to: .planning/benchmarks/raw/<component>.md
   Consume any relevant content from: .planning/research/impeccable-salvage/

   Acceptance: .planning/benchmarks/raw/<component>.md exists with ≥4 source sections.
   """)
   ```

3. **Synthesize** — spawn `component-benchmark-synthesizer` with:
   ```
   Task("component-benchmark-synthesizer", """
   <required_reading>
   @.planning/benchmarks/raw/<component>.md
   @reference/components/TEMPLATE.md
   @reference/anti-patterns.md
   </required_reading>

   Synthesize the raw harvest into a canonical spec.
   Output: reference/components/<component>.md
   Update: reference/components/README.md (add entry in correct category)

   Acceptance: spec exists, ≤350 lines, cites ≥4 systems, has TEMPLATE.md sections,
   WAI-ARIA keyboard contract present, failing-example block present.
   """)
   ```

4. **Report** — print spec path, line count, systems cited.

## Wave Mode (`/gdd:benchmark --wave <N>`)

Read the wave definition from `reference/components/README.md` and run each component
in the wave sequentially (not parallel — each harvest is network-bound and the raw files
are large).

| Wave | Components |
|------|-----------|
| 1 | button, input, select-combobox, checkbox, radio, switch, link, label |
| 2 | card, modal-dialog, drawer, popover, tooltip, accordion, tabs |

Print progress per component: `[N/total] harvesting <component>…`

## List Mode (`/gdd:benchmark --list`)

Read `reference/components/README.md` and diff against `reference/components/*.md` files.
Print a table:

```
Component        Status   Wave  Lines
button           ✓        1     248
input            ✓        1     312
select-combobox  ✓        1     295
...
toast            pending  3     —
```

## Refresh Mode (`/gdd:benchmark --refresh <component>`)

Same as single-component flow but skips the "already exists" guard. Use when a design
system ships a breaking update to a component's spec.

## Source List

`connections/design-corpora.md` — 18 design systems with canonical URLs, licensing, and
fallback chain (canonical → archive.org → Refero MCP → Pinterest MCP).

## Output Artifacts

| Artifact | Purpose |
|----------|---------|
| `.planning/benchmarks/raw/<component>.md` | Raw multi-source harvest (input only) |
| `reference/components/<component>.md` | Canonical spec (distributed with plugin) |
| `reference/components/README.md` | Corpus index (updated by synthesizer) |
