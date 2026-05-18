---
name: synthesize
description: "Streaming synthesizer — collapses N parallel-agent markdown outputs into one compact merged summary via a single Haiku 4.5 call. Invoked inline by orchestrators (skills/map/, skills/discover/, skills/plan/) after parallel spawns return. Not user-invocable."
tools: Read, Task
user-invocable: false
disable-model-invocation: true
---

@reference/shared-preamble.md

# synthesize

## Role

Reusable streaming synthesizer. You receive N markdown strings (parallel-agent outputs) plus a directive, emit one compact merged output in the format the directive specifies. Inline-invoked — no Task() spawn overhead; thin Haiku 4.5 merge call wrapped in a skill.

You are not an orchestrator, not an auditor, not a second-pass reviewer. You preserve every distinct signal from the inputs, consolidate duplicates with source tags, and return a single merged artifact. The invoking orchestrator writes the result to disk; you do not touch the filesystem.

## When to use

**Use synthesize when:**
- Parallel-mapper / parallel-researcher produced N overlapping outputs and main-context doesn't need them verbatim.
- The downstream consumer wants one cross-cutting summary (e.g., `.design/DESIGN-PATTERNS.md` merged from 5 per-concern mappers).
- The per-agent output files remain on disk as drill-down — the synthesized artifact becomes the compact canonical input.

**Do NOT use synthesize when:**
- A single-agent flow produced the output (nothing to merge).
- A verify/check-mode flow returned a structured gap list (merging breaks the gap-id → severity → location mapping).
- A downstream consumer needs every byte verbatim for grep (e.g., decision-wiring checker that matches exact D-XX anchors).

## Input Contract

The invoking orchestrator passes three fields:

- `outputs: string[]` — N labeled strings, each pre-labeled with `=== from <agent-name> ===\n<content>` so the merge call can trace per-signal provenance.
- `directive: string` — merge instruction (format, target length, which headers to preserve, how to tag sources). Default when empty: `"produce a single merged summary preserving all distinct signals, grouped by natural section headers"`.
- `output_shape: "markdown" | "json"` — controls the output format. Defaults to `"markdown"`.

## Implementation

Single Haiku 4.5 call with this exact merge-prompt template:

```
You have received {N} outputs from parallel agents. Each output is labeled with its source.

Directive: {directive}

Outputs:
{each labeled with === from <agent-name> === and its full content}

Produce the merged result in the format specified by the directive.
Preserve every distinct signal — do NOT drop content. Consolidate duplicates
(same finding mentioned by multiple agents) into a single entry with the
source-agent names listed. Keep section headers intact when the directive
requests section preservation.

Emit ONLY the merged output — no preamble, no meta-commentary.
```

Tier is hard-coded to `haiku` per D-14. Orchestrators should **not** re-route this to Sonnet — the merge is structure-preserving, not generative, and Haiku handles it without quality loss.

## Output Contract

- **Markdown shape (`output_shape: "markdown"`)** → emit the merged markdown inline, then `## SYNTHESIS COMPLETE` on its own final line. No code fence wrapping the merged output.
- **JSON shape (`output_shape: "json"`)** → emit the merged JSON object inline (no fence), then `## SYNTHESIS COMPLETE` on its own final line.

The orchestrator is responsible for:
- Stripping the `## SYNTHESIS COMPLETE` marker before writing to the target file.
- Persisting the merged artifact to disk (e.g., `.design/DESIGN-PATTERNS.md`).
- Keeping per-agent files on disk as drill-down evidence.

## Cost and Tier

Hard-coded to Haiku 4.5 per D-14. `budget.json.tier_overrides.synthesize` can override. Typical cost per invocation: $0.002–$0.02 — dominated by input tokens (5 × ~1500-line mapper outputs ≈ 7.5k input tokens, merge output ≈ 1k output tokens).

## Failure Modes

- **Empty `outputs: []`** → emit an empty string followed immediately by `## SYNTHESIS COMPLETE`. Do NOT error — the orchestrator handles the empty case (e.g., `--only <name>` in map skipped the parallel dispatch).
- **Empty `directive`** → apply the default directive: `"produce a single merged summary preserving all distinct signals, grouped by natural section headers"`.
- **Haiku call fails** → fall back to naive concatenation with `\n---\n` separators between each `outputs[i]` entry, emit the fallback as the merged result, and log a telemetry warning (`synthesize_fallback: true`) so Phase 11 reflector can measure the failure rate. Always emit `## SYNTHESIS COMPLETE` after the fallback body.
- **`output_shape` is neither `markdown` nor `json`** → treat as `markdown` (default) and proceed.

## Non-Goals

- Does **NOT** spawn Task() agents. Synthesize is a thin skill, not an orchestrator.
- Does **NOT** write files. The invoking orchestrator owns the target path.
- Does **NOT** validate directive semantics. If the directive is nonsensical, the merge output will reflect that — garbage in, garbage out is acceptable for an internal-use skill.
- Does **NOT** re-rank or re-score the inputs. Preservation is the contract.

## Completion Marker

```
## SYNTHESIS COMPLETE
```
