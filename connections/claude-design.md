# Claude Design — Connection Specification

This file is the connection specification for Claude Design (https://claude.ai/design, Anthropic Labs) within the get-design-done pipeline. Its primary role is to enable handoff-first workflows: when a Claude Design handoff bundle is available, users can skip the scan/discover/plan stages and route directly to verify. Claude Design is not an MCP server — it is a browser-based design tool that produces exportable handoff bundles. See `connections/connections.md` for the full connection index and capability matrix.

---

## What Is a Claude Design Handoff Bundle?

Claude Design produces AI-generated designs that can be exported in several formats or sent directly to Claude Code via a hosted URL. The pipeline supports all of them.

### Entry Points

| Source | How it arrives | handoff_source value |
|--------|---------------|----------------------|
| **"Send to local coding agent"** | Anthropic-hosted URL in the agent prompt | `claude-design-url` |
| **"Download zip"** | `.zip` bundle dropped into project | `claude-design-zip` |
| **"Save as standalone HTML"** | `.html` file dropped into project | `claude-design-html` |
| **"Save as PDF"** | `.pdf` file (spec text extraction only) | `claude-design-pdf` |
| **"Save as PPTX"** | `.pptx` file (spec text extraction only) | `claude-design-pptx` |
| **Bundle directory** | Unzipped directory with HTML + spec + assets | `claude-design-bundle` |

### Bundle contents by format

| Format | Primary artifact | Design tokens | Spec text | Images |
|--------|-----------------|---------------|-----------|--------|
| URL (hosted) | Fetched HTML | ✅ CSS custom props | ✅ if readme present | ✅ |
| ZIP | Unzipped HTML | ✅ CSS custom props | ✅ `readme.md` inside | ✅ |
| Standalone HTML | `.html` file | ✅ CSS custom props | ✅ if `.md` alongside | ✅ inline |
| PDF | `.pdf` text | ❌ (no CSS) | ✅ extracted text | ❌ |
| PPTX | `.pptx` slides | ❌ (no CSS) | ✅ slide text only | ❌ |

**Bundle entry point:** The primary parseable artifact is always the HTML — it contains inline `<style>` blocks with CSS custom properties (e.g., `--color-primary: #3B82F6`) and class-level token usage. PDF and PPTX are text-extraction fallbacks when no HTML is available.

**Bundle discovery:** The pipeline looks for the bundle in this priority order:
1. A `https://api.anthropic.com/v1/design/h/` URL in the agent invocation arguments
2. The path passed via `--from-handoff <path>` flag or `handoff <path>` sub-command
3. The value of `handoff_source` in `.design/STATE.md` (if a prior session already set it)
4. A `claude-design-handoff.{html,zip,pdf,pptx}` file in the project root (convention — not required)

---

## Format-Specific Ingestion

### URL format — `https://api.anthropic.com/v1/design/h/<hash>`

This is the native entry point when the user clicks **"Send to local coding agent"** in Claude Design. The agent prompt arrives as:

```
Fetch this design file, read its readme, and implement the relevant aspects of the design. https://api.anthropic.com/v1/design/h/<hash>
Implement: <user description>
```

**Detection:** grep the raw arguments/prompt for the pattern `https://api\.anthropic\.com/v1/design/h/[A-Za-z0-9_-]+`.

**Fetch sequence:**
1. `WebFetch` the URL — the response is either an HTML bundle or a redirect to a ZIP download
2. If `Content-Type: text/html` → treat as standalone HTML, parse normally
3. If `Content-Type: application/zip` or redirect to `.zip` → download to `.design/handoff/claude-design-handoff.zip`, then follow ZIP ingestion below
4. Check the response for an embedded `readme.md` link (often served alongside) — fetch it separately if present
5. Set `handoff_source: claude-design-url` and `handoff_url: <url>` in STATE.md

**Implement description:** The text after `Implement:` in the agent prompt is the user's implementation scope — capture it as a project note, not a D-XX decision.

### ZIP format

**Detection:** input path ends in `.zip` OR fetched from URL as zip.

**Ingestion sequence:**
1. Extract to `.design/handoff/` (temp directory, not committed)
2. Find the primary HTML: `index.html`, `design.html`, or any `.html` at root
3. Find spec: `readme.md`, `spec.md`, `design.md`, or any `.md` at root
4. Parse HTML + spec using the standard field catalogue below
5. Clean up `.design/handoff/` after parsing (keep only extracted decisions in STATE.md)

### PDF format

**Detection:** input path ends in `.pdf`.

**Ingestion:** PDF yields no CSS custom properties — token extraction is not possible. Instead:
1. Extract all text content (pdftotext or equivalent)
2. Grep for `Decision:`, `Rationale:`, `Token:`, `Color:`, `Typography:`, `Spacing:` prefixes
3. Treat matched lines as spec text → translate to D-XX entries tagged `(source: claude-design-pdf)` + `(tentative — text-only, no CSS confirmation)`
4. Note in STATE.md: `handoff_format: pdf` + caveat that token values were extracted from text, not CSS

**Limitation:** PDF handoffs cannot produce `(locked)` token decisions — all are `(tentative)`. Surface this explicitly to the user in the discussant step.

### PPTX format

**Detection:** input path ends in `.pptx`.

**Ingestion:** Same as PDF — text extraction only, no CSS tokens.
1. Extract slide text (python-pptx or unzip `.pptx` and parse `ppt/slides/*.xml`)
2. Same grep patterns as PDF
3. Tag all entries `(source: claude-design-pptx)` + `(tentative — text-only)`

**Limitation:** Same as PDF — all decisions are tentative. PPTX format is the weakest source; prefer HTML or ZIP if available.

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
  1. Check invocation arguments/prompt for https://api.anthropic.com/v1/design/h/ URL
  2. Check $ARGUMENTS for --from-handoff <path> flag
  3. Check STATE.md <position> for handoff_source / handoff_url / handoff_path field
  4. Check project root for claude-design-handoff.{html,zip,pdf,pptx}

  → URL detected (step 1)                        → claude_design: available (fetch at ingest time)
  → File path found AND file exists              → claude_design: available
  → Path/URL provided but unreachable/bad        → claude_design: unavailable
  → None of the above                            → claude_design: not_configured
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

| Value | Meaning | Token quality |
|-------|---------|---------------|
| `claude-design-url` | Fetched from Anthropic-hosted URL (Send to local coding agent) | High — HTML |
| `claude-design-zip` | ZIP bundle dropped into project | High — HTML inside |
| `claude-design-html` | Standalone HTML export | High — CSS custom props |
| `claude-design-bundle` | Directory with HTML + spec markdown + assets | High — CSS custom props |
| `claude-design-pdf` | PDF export (text extraction only) | Low — text only, all tentative |
| `claude-design-pptx` | PPTX export (text extraction only) | Low — text only, all tentative |
| `manual` | User manually initialized STATE.md with design decisions (no bundle file) | N/A |

---

## Caveats and Pitfalls

1. **Handoff bundle format is undocumented by Anthropic.** The Claude Design handoff bundle format is inferred from the product UI and common HTML export patterns. The pipeline uses defensive parsing: grep for CSS custom properties in `<style>` tags, extract component class names from `class="component-*"` patterns, and fall back to the spec markdown/JSON if CSS parsing yields no results. If the format changes in a future Claude Design release, update this spec and the synthesizer's parsing patterns. The URL endpoint (`/v1/design/h/<hash>`) may return different content types — always check `Content-Type` before deciding whether to parse as HTML or unzip.

6. **PDF and PPTX handoffs produce only tentative decisions.** These formats contain no CSS — all token values must be inferred from prose. Never promote PDF/PPTX-sourced decisions to `(locked)` without explicit user confirmation. If the user provides both a PDF and an HTML export, always prefer the HTML.

7. **ZIP extraction is ephemeral.** Extracted ZIP contents go to `.design/handoff/` and are deleted after parsing. Only the extracted D-XX decisions are persisted to STATE.md. Never commit the raw extracted files.

2. **`(tentative)` decisions MUST be confirmed by the user.** The discussant `--from-handoff` mode surfaces all tentative decisions for confirmation before proceeding to verify. Do NOT skip this step — implementing against unconfirmed inferred values is the primary failure mode of handoff-sourced workflows.

3. **Skipped stages mean no DESIGN-PLAN.md.** Verify's normal prerequisite check requires DESIGN-PLAN.md. Handoff mode bypasses this check (plan 09-05 implements the relaxation). If running verify manually after a handoff, always pass `--post-handoff` to prevent the prerequisite check from blocking.

4. **Handoff faithfulness is grep-based, not visual.** The Handoff Faithfulness score in DESIGN-VERIFICATION.md compares token values between the handoff bundle and the implemented code — it does NOT use computer vision or screenshot comparison. Visual fidelity between the Claude Design render and the implementation is currently out of scope (requires computer-use, deferred to a future phase).

5. **Reverse workflow is manual — no automation.** The DESIGN.md → Claude Design onboarding flow is documentation of a manual workflow. The pipeline does not auto-post to Claude Design or call any external API.
