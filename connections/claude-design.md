# Claude Design — Connection Specification

This file is the connection specification for Claude Design (https://claude.ai/design, Anthropic Labs) within the get-design-done pipeline. Its primary role is to enable handoff-first workflows: when a Claude Design handoff bundle is available, users can skip the scan/discover/plan stages and route directly to verify. Claude Design is not an MCP server — it is a browser-based design tool that produces exportable handoff bundles. See `connections/connections.md` for the full connection index and capability matrix.

---

## What Is a Claude Design Handoff Bundle?

Claude Design produces AI-generated designs that can be exported as **handoff bundles**. A bundle contains:

| Artifact | Format | Contains |
|----------|--------|---------|
| Standalone HTML export | `.html` | Rendered component tree, inline CSS (design tokens as CSS custom properties), component structure, color/spacing/typography values |
| Design spec (optional) | `.md` or `.json` | Design decisions as structured text, token tables, component annotations |
| Assets (optional) | `assets/` dir | Icons, images referenced by the HTML export |

**Bundle entry point:** The primary parseable artifact is the HTML export. It contains inline `<style>` blocks with CSS custom properties (e.g., `--color-primary: #3B82F6`) and class-level token usage.

**Bundle discovery:** The pipeline looks for the bundle in:
1. The path passed via `--from-handoff <path>` flag or `handoff <path>` sub-command
2. The value of `handoff_source` in `.design/STATE.md` (if a prior session already set it)
3. A `claude-design-handoff.html` file in the project root (convention — not required)

---

## Handoff Bundle Format — Field Catalogue

### From the HTML export (primary parsing target)

| Field type | CSS pattern to grep | Example | D-XX mapping |
|------------|--------------------|---------|-----------| 
| Color tokens | `--color-[name]:` in `<style>` | `--color-primary: #3B82F6` | `[Color] Primary: #3B82F6` |
| Spacing tokens | `--spacing-[n]:` in `<style>` | `--spacing-4: 1rem` | `[Spacing] Scale unit: 1rem (4px base)` |
| Typography tokens | `--font-[family|size|weight]:` in `<style>` | `--font-family: Inter, sans-serif` | `[Typography] Font family: Inter` |
| Radius tokens | `--radius-[n]:` in `<style>` | `--radius-md: 8px` | `[Radius] Default: 8px` |
| Shadow tokens | `--shadow-[level]:` in `<style>` | `--shadow-sm: 0 1px 2px` | `[Shadow] Elevation-sm: 0 1px 2px` |
| Component names | `<section class="component-[name]">` | `component-button` | `[Component] Button exists` |
| Layout pattern | `display: [grid\|flex]` in component sections | `display: grid; grid-template-columns: repeat(3, 1fr)` | `[Layout] Card grid: 3-col` |

### From the spec markdown/JSON (secondary, if present)

Grep for `Decision:`, `Rationale:`, `Token:`, `Component:` prefixes. Treat as pre-formed D-XX entries — translate directly into STATE.md decisions with `(source: claude-design-handoff)` tag.

---

## Adapter Pattern — Bundle Fields → D-XX Decisions

The `design-research-synthesizer` runs in `handoff` mode when `handoff_source` is present in STATE.md. It:

1. Parses the HTML export for CSS custom properties (colors, spacing, typography, radius, shadows)
2. Reads any `.md` spec file in the same directory as the HTML export
3. Translates each found value into a D-XX decision entry
4. Tags all entries: `(source: claude-design-handoff)` + `(tentative — confirm with user)` for inferred values, `(locked — from handoff spec)` for explicit spec values
5. Appends all entries to STATE.md `<decisions>` block and `.design/DESIGN-CONTEXT.md`

**Confidence levels:**

| Source | Tag | Confidence |
|--------|-----|-----------|
| Explicit spec markdown `Decision: ...` | `(locked — from handoff spec)` | High — treat as confirmed |
| CSS custom property in `<style>` | `(tentative — from handoff CSS)` | Medium — surfaced to user for confirm |
| Inferred from class structure | `(tentative — inferred)` | Low — always surface to user |

---

## Stage Routing for Handoff Workflows

When `handoff_source` is set in STATE.md:

```
Normal pipeline: scan → discover → plan → design → verify
Handoff pipeline:  [scan skipped] → [discover skipped] → [plan skipped] → verify
```

**What skipped stages write to STATE.md:**

```xml
<position>
stage: verify
wave: 1
task_progress: 0/0
status: handoff-sourced
handoff_source: claude-design-html
skipped_stages: scan, discover, plan
</position>
```

**Verify `--post-handoff` mode** (implemented in plan 09-05):
- DESIGN-PLAN.md prerequisite check is relaxed (no DESIGN-PLAN.md exists for handoff flows)
- Adds "Handoff Faithfulness" section to DESIGN-VERIFICATION.md
- All other verify checks run normally

---

## Reverse Workflow — DESIGN.md → Claude Design Onboarding

After a successful implementation cycle, the pipeline can produce a design spec document that can be shared back with Claude Design (or any AI design tool) as an onboarding artifact:

1. Run `/gdd:style` to generate `DESIGN-STYLE-[Component].md` for key components
2. Collect the D-XX decisions from STATE.md `<decisions>` block
3. Combine into `DESIGN.md` (or use the existing one if it was produced by the pipeline)

This `DESIGN.md` + `DESIGN-STYLE-*.md` set can be copy-pasted into a Claude Design conversation to seed a new AI design iteration with the implemented system's actual values — "feed the code back to the designer."

**No automation is required for this workflow** — it is a manual copy-paste operation. The connection spec documents it so users know it is possible.

---

## Availability Probe

Claude Design is not an MCP server — it has no tools to probe via ToolSearch. Availability is determined by whether the user has provided a handoff bundle path.

**Probe pattern:**

```
At scan stage entry:
  1. Check STATE.md <position> for handoff_source field
  2. Check $ARGUMENTS for --from-handoff <path> flag
  3. Check project root for claude-design-handoff.html

  → Bundle path found AND file exists           → claude_design: available
  → Bundle path provided but file missing/bad   → claude_design: unavailable
  → No bundle path, no file                      → claude_design: not_configured
```

Write result to STATE.md `<connections>` at scan entry.

**Verdict summary:**

| Value | Meaning |
|-------|---------|
| `available` | A handoff bundle path was supplied and the file exists/parses |
| `unavailable` | A handoff path was configured but the file is missing, unreadable, or malformed |
| `not_configured` | No handoff bundle was supplied and none was discovered in the conventional location |

---

## STATE.md Integration

### `<connections>` block

```xml
<connections>
figma: available
refero: not_configured
preview: available
storybook: not_configured
chromatic: not_configured
graphify: not_configured
pinterest: not_configured
claude_design: available
</connections>
```

### `<position>` block — handoff fields (added to STATE-TEMPLATE in plan 09-03)

```xml
<position>
stage: verify
wave: 1
task_progress: 0/0
status: handoff-sourced
handoff_source: claude-design-html
handoff_path: ./claude-design-handoff.html
skipped_stages: scan, discover, plan
</position>
```

**`handoff_source` values:**

| Value | Meaning |
|-------|---------|
| `claude-design-html` | Bundle is a standalone HTML export from Claude Design |
| `claude-design-bundle` | Bundle is a directory with HTML + spec markdown + assets |
| `manual` | User manually initialized STATE.md with design decisions (no bundle file) |

---

## Caveats and Pitfalls

1. **Handoff bundle format is undocumented by Anthropic.** The Claude Design handoff bundle format is inferred from the product announcement and common HTML export patterns. The pipeline uses defensive parsing: grep for CSS custom properties in `<style>` tags, extract component class names from `class="component-*"` patterns, and fall back to the spec markdown/JSON if CSS parsing yields no results. If the format changes in a future Claude Design release, update this spec and the synthesizer's parsing patterns.

2. **`(tentative)` decisions MUST be confirmed by the user.** The discussant `--from-handoff` mode surfaces all tentative decisions for confirmation before proceeding to verify. Do NOT skip this step — implementing against unconfirmed inferred values is the primary failure mode of handoff-sourced workflows.

3. **Skipped stages mean no DESIGN-PLAN.md.** Verify's normal prerequisite check requires DESIGN-PLAN.md. Handoff mode bypasses this check (plan 09-05 implements the relaxation). If running verify manually after a handoff, always pass `--post-handoff` to prevent the prerequisite check from blocking.

4. **Handoff faithfulness is grep-based, not visual.** The Handoff Faithfulness score in DESIGN-VERIFICATION.md compares token values between the handoff bundle and the implemented code — it does NOT use computer vision or screenshot comparison. Visual fidelity between the Claude Design render and the implementation is currently out of scope (requires computer-use, deferred to a future phase).

5. **Reverse workflow is manual — no automation.** The DESIGN.md → Claude Design onboarding flow is documentation of a manual workflow. The pipeline does not auto-post to Claude Design or call any external API.
