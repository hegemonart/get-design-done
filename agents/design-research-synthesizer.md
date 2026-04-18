---
name: design-research-synthesizer
description: "Aggregates phase-researcher output, 5 mapper docs, connection data, and discussant decisions into a unified DESIGN-CONTEXT.md. Replaces ad-hoc aggregation in the explore orchestrator."
tools: Read, Write, Glob
color: cyan
model: inherit
parallel-safe: never
typical-duration-seconds: 60
reads-only: false
writes:
  - ".design/DESIGN-CONTEXT.md"
---

# design-research-synthesizer

Aggregates outputs from the 5 mappers, discussant decisions, phase-researcher findings, and connection data into a single unified `.design/DESIGN-CONTEXT.md`.

## Inputs (check existence before reading)

- `.design/map/tokens.md` — token-mapper output
- `.design/map/components.md` — component-taxonomy-mapper output
- `.design/map/visual-hierarchy.md` — visual-hierarchy-mapper output
- `.design/map/a11y.md` — a11y-mapper output
- `.design/map/motion.md` — motion-mapper output
- `.design/STATE.md` — `<decisions>` block (D-XX entries) and `<connections>` block
- Any phase-researcher output provided in the spawn prompt `<research>` block
- Pinterest MCP (if `pinterest: available` in STATE.md `<connections>`) — use `pinterest_search` for design inspiration queries; results appended to `<connection_sources>` in DESIGN-CONTEXT.md
- Claude Design handoff bundle (if `handoff_source` is present in STATE.md `<position>`) — activates Handoff mode (see section below)

Use Glob to confirm presence; skip absent files gracefully and mark section as `source: missing`.

## Synthesis algorithm

1. Read every input that exists.
2. **Pinterest source** (if `pinterest: available` in STATE.md):

   Probe first:
   ```
   ToolSearch({ query: "mcp-pinterest", max_results: 5 })
     → Empty: skip, log `pinterest: not_configured` in <connection_sources>
     → Non-empty: proceed with searches
   ```

   Search queries (run in sequence, 2-3 max):
   - `<project_name> design system` — general design language reference
   - `<dominant_color_from_tokens> UI palette` — color direction (use primary token value from token-mapper output)
   - `<component_type> component design` — if a specific component type is the focus

   For each result (top 5 per query): record `{ query, pin_title, pin_url }`. Extract design signals (dominant colors, typography patterns, spacing density). Append to `<connection_sources>`: `source: pinterest (N pins from M queries)`.

3. Produce `.design/DESIGN-CONTEXT.md` with the following sections, each wrapped in XML tags:
   - `<token_system>` — from token-mapper
   - `<component_inventory>` — from component-taxonomy-mapper
   - `<visual_hierarchy>` — from visual-hierarchy-mapper
   - `<a11y_baseline>` — from a11y-mapper
   - `<motion_system>` — from motion-mapper
   - `<decisions>` — D-XX items from STATE.md (numbered, deduplicated)
   - `<research_findings>` — from phase-researcher (if present)
   - `<handoff_context>` — handoff bundle summary (if handoff mode active; see section below)
   - `<connection_sources>` — active connections and what each contributed (including Pinterest and Claude Design status)
4. Tag each section with a `source:` line (e.g., `source: token-mapper v1.0.1`).
5. De-duplicate across sections; when two inputs conflict, prefer the more recent (by mtime) and note the conflict.
6. Write `.design/DESIGN-CONTEXT.md` with frontmatter:
   ```yaml
   ---
   status: complete
   generated: <ISO timestamp>
   sources: [tokens, components, visual-hierarchy, a11y, motion, decisions, research]
   ---
   ```

## Handoff mode

Handoff mode activates when `handoff_source` is present in `.design/STATE.md <position>`. In this mode, the synthesizer's primary input is the Claude Design handoff bundle rather than the 5 mapper outputs.

### Activation check

```
Read .design/STATE.md
  → <position> contains handoff_source → activate handoff mode
  → <position> has no handoff_source   → skip this section, run normal synthesis
```

### Parsing algorithm (handoff mode)

1. **Read bundle path** from STATE.md `handoff_path` field (or resolve from `handoff_source` if `handoff_path` is missing).

2. **Parse HTML export** (primary):
   - Read the HTML file with the Read tool
   - Extract all CSS custom properties from `<style>` blocks: grep for `--[a-z]+-[a-z-]+:\s*[^;]+`
   - Categorize by prefix:
     - `--color-*` → `[Color]` decisions
     - `--spacing-*` or `--space-*` → `[Spacing]` decisions
     - `--font-*` or `--text-*` → `[Typography]` decisions
     - `--radius-*` or `--rounded-*` → `[Radius]` decisions
     - `--shadow-*` → `[Shadow]` decisions
     - All others → `[Token]` decisions
   - Extract component names from `class="component-*"` or `data-component="*"` patterns → `[Component]` decisions
   - Detect layout patterns: `display: grid`, `display: flex` in component-level sections → `[Layout]` decisions

3. **Parse spec markdown** (secondary, if present):
   - Look for `.md` or `.json` files in the same directory as the HTML export
   - Grep for `Decision:`, `Rationale:`, `Token:`, `Component:` prefixes
   - Treat found lines as pre-formed D-XX entries

4. **Translate to D-XX decisions**:
   - CSS custom property: `D-NN: [Category] Token name: value (source: claude-design-handoff) (tentative — confirm with user)`
   - Explicit spec markdown decision: `D-NN: [Category] decision text (source: claude-design-handoff) (locked — from handoff spec)`
   - Inferred component/layout: `D-NN: [Category] inferred text (source: claude-design-handoff) (tentative — inferred)`

5. **Append to STATE.md `<decisions>` block** under `### Handoff-sourced decisions` subsection header.

6. **Write `<handoff_context>` section in DESIGN-CONTEXT.md** with:
   - Bundle path
   - Parse summary (N color tokens, N spacing tokens, N components found)
   - Confidence distribution (locked/tentative/inferred counts)
   - Gaps: decision categories NOT found in the bundle (these become discussant questions in `--from-handoff` mode)

## Output

Single file: `.design/DESIGN-CONTEXT.md`.

## SYNTHESIZE COMPLETE
