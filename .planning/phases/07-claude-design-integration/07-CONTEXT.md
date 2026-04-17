# Phase 7: Claude Design Integration + Pinterest Connection — Context

**Gathered:** 2026-04-18
**Status:** Ready for planning
**Source:** User brief + Claude Design official docs (support.claude.com + anthropic.com/news, 2026-04-17 launch)

<domain>
## Phase Boundary

This phase makes ultimate-design a first-class post-handoff verification layer for Claude Design (Anthropic Labs, claude.ai/design). It also adds Pinterest MCP as a third reference-collection option in the discover stage.

**In scope:**
- Auto-landing entry point: `/ultimate-design handoff` or `--from-handoff` flag
- Handoff bundle → DESIGN-CONTEXT.md adapter (design-context-builder Step 0B)
- STATE.md `handoff_source` field to track pipeline provenance
- Verify `--post-handoff` mode (relaxed prereqs, Handoff Faithfulness score)
- `connections/claude-design.md` — full connection spec including reverse workflow
- `connections/pinterest.md` — Pinterest MCP spec following existing connections/ pattern
- Capability matrix update in `connections/connections.md`
- design-context-builder Area 5 fallback chain extended: Pinterest → Refero → awesome-design-md
- Discover/scan probe updates for Pinterest

**Out of scope:**
- Native Claude Design integration API (not yet published by Anthropic)
- PPTX/PDF export reading from Claude Design outputs
- Storybook, Linear, GitHub connections (deferred to future phases)
- Figma get_code_connect_map wiring (can be revisited in a future phase)

</domain>

<decisions>
## Implementation Decisions

### Entry Point Design
- Sub-command `handoff` added to root SKILL.md alongside existing stage names (scan, discover, plan, design, verify, style, darkmode, compare)
- Alias: `--from-handoff` flag accepted anywhere in pipeline router
- Routing: handoff → adapter → verify (skip scan, discover, plan entirely)
- STATE.md must mark skipped stages so resume logic doesn't try to re-run them

### Handoff Bundle Format (what we know)
- Claude Design exports: standalone HTML, PDF, PPTX, Canva export, internal URLs
- The "Claude Code handoff bundle" is described as "everything packaged for Claude Code with a single instruction"
- Format is not publicly documented yet — adapter must work with what's practically available:
  - HTML export contains inline styles, color values, typography, component structure
  - The bundle likely contains design system data (colors, type, spacing) extracted during Claude Design's onboarding
- Adapter approach: parse HTML export + any accompanying JSON/markdown for design tokens and decisions

### DESIGN-CONTEXT.md Pre-population from Handoff
- Follow existing Figma Step 0 pattern in design-context-builder
- New Step 0B (runs after Step 0 Figma, before Step 1 interview)
- Condition: `handoff_source` present in STATE.md
- Output: D-XX decisions tagged `(source: claude-design-handoff)`
- Same "tentative — confirm with user" marking for uncertain translations

### Verify --post-handoff Mode
- Relaxes: DESIGN-PLAN.md not required
- Adds: "Handoff Faithfulness" section in DESIGN-VERIFICATION.md
  - Scores: color fidelity, typography fidelity, spacing fidelity, component structure match
  - Not a visual diff — grep-based token comparison between handoff decisions and source code
- Still runs: design-integration-checker, design-verifier, design-fixer loop

### Pinterest MCP
- Same probe pattern as Refero (presence-only, ToolSearch first)
- Tool prefix unknown — must be researched; likely `mcp__pinterest__*`
- Role: visual reference collection during discover (same as Refero)
- Fallback chain position: Pinterest → Refero → awesome-design-md (Pinterest is preferred when available — richer visual inspiration)
- No pipeline stage besides discover uses Pinterest

### Reverse Workflow (DESIGN.md → Claude Design)
- When user onboards a codebase into Claude Design, Claude Design auto-builds its design system
- Our `scan` produces DESIGN.md — an equivalent structured snapshot
- Document the workflow: run scan first, then pass DESIGN.md as context to Claude Design to reduce its auto-detection work
- This is documentation only — no code changes required, just a workflow section in connections/claude-design.md

### Existing Pattern Compatibility
- connections/figma.md format is the template for connections/claude-design.md and connections/pinterest.md
- Probe pattern spec lives in connections/connections.md — new connections copy it inline
- STATE.md `<connections>` block gains: `claude_design: <available|not_configured>` and `pinterest: <available|not_configured>`

</decisions>

<specifics>
## Claude Design Product Facts (authoritative — from official docs)

- Launched: April 17, 2026 (Anthropic Labs research preview)
- URL: claude.ai/design
- Powered by: Claude Opus 4.7
- Available: Pro, Max, Team, Enterprise (Enterprise off-by-default)
- Auto-builds design system from codebases + design files during onboarding
- Applies team's colors/typography/components to every subsequent project
- Inputs: text prompts, images, DOCX/PPTX/XLSX, codebases (recommend subdirectories for large repos), web capture, inline canvas comments
- Outputs: standalone HTML, PDF, PPTX, Canva export, internal share URLs, **Claude Code handoff bundle**
- Handoff quote: "Claude packages everything into a handoff bundle you can pass to Claude Code with a single instruction"
- Refinement: inline comments, direct text edits, adjustment sliders (spacing/color/layout), "apply across design" bulk changes
- Static → interactive prototype conversion available
- Collaboration: view-only/comment/edit share links, org-scoped
- Roadmap: "Over the coming weeks, we'll make it easier to build integrations with Claude Design"
- No public integration API documented yet
- Known limitation: large repos cause perf degradation (use subdirectory links)

## Existing Plugin Files to Extend

- `agents/design-context-builder.md` — add Step 0B after existing Step 0 (Figma pre-pop)
- `skills/verify/SKILL.md` — add `--post-handoff` mode
- `SKILL.md` (root) — add `handoff` to command table, argument-hint, routing logic
- `reference/STATE-TEMPLATE.md` — add `handoff_source` field
- `connections/connections.md` — add Claude Design + Pinterest rows to capability matrix, update STATUS column for both as "Active"
- New files: `connections/claude-design.md`, `connections/pinterest.md`

</specifics>

<deferred>
## Deferred

- Native Claude Design integration API hook (Anthropic hasn't published it yet — revisit when "coming weeks" arrives)
- Visual diff between Claude Design screenshot and code render (requires computer-use; complex)
- `get_code_connect_map` Figma tool wiring (deferred from Phase 4 — can land in a future phase)
- Pinterest board-specific search or pin save (out of scope for reference-collection use case)
- PPTX/PDF export parsing (not needed for HTML-primary handoff workflow)
</deferred>
