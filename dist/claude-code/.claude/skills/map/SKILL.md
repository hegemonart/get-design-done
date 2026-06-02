---
name: gdd-map
description: "Dispatches 5 specialist codebase mappers in parallel. Produces .design/map/*.md files consumed by the explore stage."
argument-hint: "[--only tokens|components|visual-hierarchy|a11y|motion]"
tools: Read, Write, Bash, Task
user-invocable: true
---

# Get Design Done — Map

Parallel orchestrator. Spawns 5 specialist mappers, each writing one file under `.design/map/`. The explore stage consumes these when present. See `./reference/heuristics.md` §"Optimization rules" for parallel-spawn cost considerations.

## Mapper → Output

| Mapper | Output |
|--------|--------|
| `token-mapper` | `.design/map/tokens.md` |
| `component-taxonomy-mapper` | `.design/map/components.md` |
| `visual-hierarchy-mapper` | `.design/map/visual-hierarchy.md` |
| `a11y-mapper` | `.design/map/a11y.md` |
| `motion-mapper` | `.design/map/motion.md` |

## Step 1 — Setup

- Ensure `.design/map/` exists (create if missing).
- Read `.design/config.json` → `parallelism` object. Use `reference/config-schema.md` defaults if absent.
- Read `.design/STATE.md` — note `<connections>` (Figma availability for token-mapper).
- Parse `$ARGUMENTS`. If `--only <name>`, restrict the dispatch set to one mapper.

## Step 2 — Parallelism Decision

Per `reference/parallelism-rules.md`: all 5 mappers have `parallel-safe: auto` with disjoint `writes:` (each writes a different `.design/map/*.md` file) — no hard-rule conflict. `typical-duration-seconds` sum (~210s) minus slowest (~45s) ≈ 165s savings → clears `min_estimated_savings_seconds`. Verdict: **parallel**.

Write the verdict to STATE.md:

```xml
<parallelism_decision>
  stage: map
  verdict: parallel
  reason: "5 mappers, parallel-safe: auto, writes disjoint, est savings ~165s"
  agents: ["token-mapper", "component-taxonomy-mapper", "visual-hierarchy-mapper", "a11y-mapper", "motion-mapper"]
  ruled_out: []
  timestamp: [ISO 8601 now]
</parallelism_decision>
```

`--only` → adjust `agents` and set `verdict: serial` with `reason: "single mapper requested"`.

## Step 3 — Dispatch (concurrent)

Spawn all selected mappers in a single response with multiple `Task()` calls:

```
Task("<mapper-name>", """
<required_reading>
@.design/STATE.md
@reference/audit-scoring.md
[@reference/accessibility.md — a11y-mapper only]
[@reference/motion.md — motion-mapper only]
</required_reading>

You are <mapper-name>. Scan the codebase per your agent spec and write your
output file under .design/map/. Emit your completion marker when done.
""")
```

Wait for each completion marker: `## TOKEN MAP COMPLETE`, `## COMPONENT MAP COMPLETE`, `## VISUAL HIERARCHY MAP COMPLETE`, `## A11Y MAP COMPLETE`, `## MOTION MAP COMPLETE`.

## Step 3.5 — Synthesize parallel mapper outputs (Plan 10.1-04, D-13/D-14/D-15)

Each mapper has written its own `.design/map/*.md` (disjoint writes). Main-context doesn't need all 5 verbatim — invoke `synthesize` inline with `outputs:[<each file's text labelled "=== from <mapper> ==="]`, `directive: "Merge into cross-cutting DESIGN-PATTERNS.md preserving section headers; consolidate cross-mapper duplicates with source-agent names; target ~120 lines."`, `output_shape:"markdown"`.

Wait for `## SYNTHESIS COMPLETE`. Write merged markdown to `.design/DESIGN-PATTERNS.md` (overwrite if present) — the primary explore-stage input; per-mapper files remain as drill-down evidence. `--only` (single mapper) → skip this step.

## Step 4 — Collate

Write `.design/DESIGN-MAP.md` — thin index linking to each `.design/map/*.md` with a one-paragraph summary from each file's header. If Step 3.5 ran, also cross-link to `.design/DESIGN-PATTERNS.md` and note at the top: "See DESIGN-PATTERNS.md for the merged cross-cutting summary — this index preserves per-mapper drill-down."

## Step 5 — Report

```
━━━ Map complete ━━━
Files: .design/map/tokens.md, components.md, visual-hierarchy.md, a11y.md, motion.md
Index: .design/DESIGN-MAP.md
Next: /gdd:explore (consumes .design/DESIGN-PATTERNS.md on happy path; .design/map/*.md available for drill-down)
━━━━━━━━━━━━━━━━━━━━━
```

## MAP COMPLETE
