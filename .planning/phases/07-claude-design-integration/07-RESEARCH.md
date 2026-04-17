# Phase 7: Claude Design Integration + Pinterest Connection — Research

**Researched:** 2026-04-18
**Domain:** Claude Design handoff adapter, Pinterest MCP wiring, pipeline router extension, verify mode extension
**Confidence:** MEDIUM (Claude Design handoff bundle format is undocumented; everything else is HIGH)

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

- Sub-command `handoff` added to root SKILL.md alongside existing stage names
- Alias: `--from-handoff` flag accepted anywhere in pipeline router
- Routing: handoff → adapter → verify (skip scan, discover, plan entirely)
- STATE.md must mark skipped stages so resume logic doesn't try to re-run them
- Claude Design handoff bundle: parse HTML export + any accompanying JSON/markdown for design tokens
- Step 0B (new) runs after Step 0 Figma, before Step 1 interview; condition is `handoff_source` present in STATE.md
- Step 0B output: D-XX decisions tagged `(source: claude-design-handoff)`; "tentative — confirm with user" marking for uncertain translations
- Verify `--post-handoff`: DESIGN-PLAN.md not required; adds "Handoff Faithfulness" section; still runs design-integration-checker + design-verifier + design-fixer loop
- Handoff Faithfulness scores: color fidelity, typography fidelity, spacing fidelity, component structure match; grep-based token comparison (not visual diff)
- Pinterest: same ToolSearch-only probe as Refero; fallback chain position: Pinterest → Refero → awesome-design-md
- connections/figma.md is the template for connections/claude-design.md and connections/pinterest.md
- STATE.md `<connections>` block gains `claude_design:` and `pinterest:` lines

### Claude's Discretion

- Exact field placement of `handoff_source` within STATE-TEMPLATE.md schema (must not require a new top-level XML section per NOTE in the template — prefer appending to existing sections)
- Exact values for `handoff_source` (e.g., `claude-design-html`, `claude-design-bundle`, `manual`)
- Whether Pinterest probe uses server name `mcp-pinterest`, `pinterest`, or must remain generic pending ToolSearch
- Whether `handoff` sub-command routes through an explicit intermediate skill file or inline logic inside the router

### Deferred Ideas (OUT OF SCOPE)

- Native Claude Design integration API (not yet published by Anthropic)
- Visual diff between Claude Design screenshot and code render (requires computer-use)
- `get_code_connect_map` Figma tool wiring (future phase candidate)
- Pinterest board-specific search or pin save
- PPTX/PDF export parsing
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| CDES-01 | `connections/claude-design.md` — documents handoff bundle format, adapter pattern, and reverse workflow | See Claude Design product facts + HTML parsing patterns below |
| CDES-02 | design-context-builder Step 0B — reads handoff bundle, pre-populates DESIGN-CONTEXT.md D-XX decisions | See Step 0B pattern + extraction heuristics below |
| CDES-03 | `reference/STATE-TEMPLATE.md` gains `handoff_source`; STATE.md marks prior stages as "sourced from handoff" | See STATE.md schema extension below |
| CDES-04 | Root SKILL.md exposes `handoff` sub-command / `--from-handoff` flag; routes to verify | See router extension pattern below |
| CDES-05 | Verify `--post-handoff` mode: relaxes DESIGN-PLAN.md prereq; Handoff Faithfulness score section | See verify extension pattern below |
| PINS-01 | `connections/pinterest.md` + Area 5 extension + capability matrix update | See Pinterest MCP findings below |
</phase_requirements>

---

## Summary

Phase 7 has two clearly bounded tracks: (1) Claude Design handoff integration — a new entry point that pre-populates context from a handoff bundle and routes directly to verify, and (2) Pinterest MCP as a third reference-collection option in discover.

The biggest research uncertainty is the Claude Design handoff bundle format. Anthropic's announcement (April 17, 2026) states "Claude packages everything into a handoff bundle you can pass to Claude Code with a single instruction" but does not document the internal format. No community reverse-engineering of the bundle structure was found as of research date. The decision in CONTEXT.md to work with the HTML export as the primary parseable artifact is the correct pragmatic choice — the standalone HTML export is available, contains CSS and component structure, and can be grep-parsed for design tokens.

Pinterest MCP landscape is well-researched. The dominant option for visual reference use (no API key, search-only) is `terryso/mcp-pinterest`, which exposes tools named `pinterest_search`, `pinterest_get_image_info`, and `pinterest_search_and_download`. The MCP server name for Claude Code registration is `mcp-pinterest`, making the Claude Code tool prefix `mcp__mcp-pinterest__*`. There is also `@iflow-mcp/pinterest-mcp-server` as an alternative with a similar tool set. Neither requires official Pinterest API credentials — both use headless browser scraping. A ToolSearch-only probe (no live call needed) is the correct pattern, matching how Refero is probed.

All pipeline extension patterns have clear precedents in the existing codebase: the `--auto` flag model in verify, the Step 0 conditional skip in design-context-builder, and the Jump Mode table in SKILL.md.

**Primary recommendation:** Implement the four plans in order. Plan 01 creates the connection specs (documentation only). Plan 02 implements Step 0B in design-context-builder. Plan 03 adds the router entry point and verify mode extension. Plan 04 wires Pinterest into Area 5.

---

## Standard Stack

### Core (Phase 7 — no new npm dependencies)

| Component | Version/Location | Purpose | Why Standard |
|-----------|-----------------|---------|--------------|
| `agents/design-context-builder.md` | existing | Add Step 0B after Step 0 | All pre-population logic lives here; consistent with Figma Step 0 |
| `skills/verify/SKILL.md` | existing | Add `--post-handoff` flag parsing and mode | Verify is the only stage needed post-handoff |
| `SKILL.md` (root) | existing | Add `handoff` to Jump Mode table | All sub-command routing lives in root router |
| `reference/STATE-TEMPLATE.md` | existing | Add `handoff_source` field | Single source of truth for pipeline state schema |
| `connections/` | existing dir | New spec files | All connection specs live here per established pattern |

### External MCP (Pinterest — user-supplied)

| Package | Install | Server Name | Tool Prefix | Auth |
|---------|---------|-------------|-------------|------|
| `terryso/mcp-pinterest` (primary) | `npx -y @smithery/cli install mcp-pinterest --client claude` | `mcp-pinterest` | `mcp__mcp-pinterest__*` | None — headless scraping |
| `@iflow-mcp/pinterest-mcp-server` (alternative) | `npx @iflow-mcp/pinterest-mcp-server` | server name varies | verify via ToolSearch | None |

**CRITICAL: Tool prefix uncertainty.** In Claude Code, MCP tool names follow the pattern `mcp__<server-name>__<tool-name>`. For `terryso/mcp-pinterest`, when registered with server name `mcp-pinterest` (the default Smithery install), Claude Code tools would be `mcp__mcp-pinterest__pinterest_search` etc. However, if the user registers the server with a different name (e.g., `pinterest`), the prefix changes. The spec file MUST document this and require ToolSearch verification before any tool call — do not hardcode the prefix.

**Confidence:** Tool names (`pinterest_search`, `pinterest_get_image_info`, `pinterest_search_and_download`) are HIGH confidence (verified from GitHub + multiple MCP registries). Server-name-derived prefix is MEDIUM confidence (inference from Claude Code naming conventions; exact behavior depends on user's registration name).

---

## Architecture Patterns

### Pattern 1: Conditional Step Entry (existing — replicate for Step 0B)

design-context-builder already implements this cleanly for Step 0 (Figma):

```markdown
## Step 0 — Figma Pre-population

**Skip this step if `figma` is `not_configured` or `unavailable` in `.design/STATE.md` `<connections>`.**
Proceed directly to Step 1 — interview-only flow continues as before. No error.

### If `figma: available`
  [ToolSearch first, then get_variable_defs, then variable → decision translation]
```

**Step 0B must follow the identical pattern:**

```markdown
## Step 0B — Claude Design Handoff Pre-population

**Skip this step if `handoff_source` is absent from `.design/STATE.md` `<position>`.**
Proceed directly to Step 1 (or Step 0 if Figma is available).

### If `handoff_source` is present
  [Read the handoff artifact path, parse it, emit D-XX decisions tagged (source: claude-design-handoff)]
```

The ordering must be: Step 0 (Figma) → Step 0B (Claude Design) → Step 1 (interview). Both can run independently.

### Pattern 2: Jump Mode Extension (existing — add one row)

Current root SKILL.md Jump Mode table:

```
/ultimate-design scan     → Skill("ultimate-design:scan")
/ultimate-design discover → Skill("ultimate-design:discover")
...
/ultimate-design compare  → Skill("ultimate-design:compare")
```

New row to add:

```
/ultimate-design handoff  → [inline logic: run handoff adapter, then Skill("ultimate-design:verify", "--post-handoff")]
```

**Decision on routing architecture:** The CONTEXT.md decision says "handoff → adapter → verify". The adapter is Step 0B inside design-context-builder. The correct implementation is:

1. Router parses `handoff` sub-command
2. Router initializes STATE.md with `handoff_source` field and marks scan/discover/plan as `skipped`
3. Router spawns design-context-builder with a `handoff_mode: true` context flag (which triggers Step 0B)
4. After design-context-builder completes, router invokes verify with `--post-handoff`

This keeps the adapter logic inside design-context-builder (consistent with where all pre-population lives) and the routing logic inside the router (consistent with where all routing lives). No separate `skills/handoff/SKILL.md` file is needed — inline logic in the router is correct.

### Pattern 3: Flag Mode Extension in Verify (existing --auto pattern)

Current verify SKILL.md flag parsing:

```markdown
## Flag Parsing

- `--auto` → `auto_mode=true` (no interactive prompts; skip visual UAT; on gaps: save-and-exit)
```

Add parallel entry:

```markdown
- `--post-handoff` → `post_handoff_mode=true` (relaxes DESIGN-PLAN.md prerequisite; adds Handoff Faithfulness section)
```

The DESIGN-PLAN.md prerequisite is referenced in agent spawn prompts, not in a separate prereq-check block. Each agent spawn in Step 1 includes `@.design/DESIGN-PLAN.md` in `<required_reading>`. In `--post-handoff` mode, that line must be removed or made conditional.

### Pattern 4: Skipped Stage Marking in STATE.md

When `handoff` sub-command runs, stages that were not run need to be marked so resume logic does not try to re-run them. The existing write contract in STATE-TEMPLATE.md defines these status values:

```
initialized | in_progress | completed | blocked
```

A fifth value `skipped` is the cleanest approach. Alternatively, the `<position>` stage field can be set directly to `verify` (the first real stage), with a note in `<blockers>` or a new field documenting provenance.

**Recommendation:** Add `skipped` as a valid `<position>` status. When handoff initializes STATE.md, set:

```xml
<position>
stage: verify
wave: 1
task_progress: 0/3
status: in_progress
handoff_source: claude-design-html
skipped_stages: scan, discover, plan
</position>
```

Adding `skipped_stages` as a sub-field inside `<position>` does NOT require a new top-level XML section (satisfying the template's constraint). It's a new field appended to the existing section.

### Pattern 5: Refero Probe (replicate exactly for Pinterest)

Current Refero probe (ToolSearch-only):

```
ToolSearch({ query: "refero", max_results: 5 })
  → Empty result     → refero: not_configured
  → Non-empty result → refero: available
```

Pinterest probe (identical pattern, different query):

```
ToolSearch({ query: "pinterest", max_results: 5 })
  → Empty result     → pinterest: not_configured
  → Non-empty result → pinterest: available
```

Rationale for ToolSearch-only (no live tool call): same as Refero — Pinterest search as probe would waste tokens before confirming the connection is even needed. Tool presence confirms availability.

### Anti-Patterns to Avoid

- **Hardcoding the Pinterest MCP tool prefix.** Tool names from the registry are `pinterest_search` etc., but the Claude Code invocation prefix depends on the server registration name (`mcp__<server-name>__<tool-name>`). Always ToolSearch first and use the confirmed name.
- **Requiring DESIGN-PLAN.md in agent spawns during --post-handoff.** Remove or conditionalize the `@.design/DESIGN-PLAN.md` line from all three agent spawn prompts inside verify when `post_handoff_mode=true`.
- **Blocking the pipeline when handoff bundle is unparseable.** If the HTML export yields no extractable tokens, Step 0B must gracefully skip and proceed to Step 1 (interview), not abort. Mirror Step 0's error handling exactly.
- **Adding a new top-level XML section to STATE-TEMPLATE.md for `handoff_source`.** The template's notes explicitly warn: "Do not add new top-level XML sections without updating this template." Use existing sections: `handoff_source` inside `<position>` and `skipped_stages` inside `<position>`.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Pinterest image search | Custom scraper / WebSearch fallback | `terryso/mcp-pinterest` via ToolSearch | Headless browser already handles pagination, rate limiting, URL extraction; no API key needed |
| Design token extraction from HTML | Custom HTML parser | grep/awk patterns on known CSS structures | Claude Design HTML exports contain standard CSS properties; regex-based extraction is sufficient and already the project's grep philosophy |
| Visual diff of handoff vs implementation | Computer-use screenshot comparison | Grep-based token comparison (Handoff Faithfulness score) | CONTEXT.md explicitly defers visual diff; grep is reliable and in-scope |

---

## Common Pitfalls

### Pitfall 1: Pinterest Tool Prefix Assumption
**What goes wrong:** Code hardcodes `mcp__mcp-pinterest__pinterest_search` but user registered the server as `pinterest` (making the actual tool `mcp__pinterest__pinterest_search`).
**Why it happens:** MCP server name in Claude Code is user-configurable at registration time.
**How to avoid:** Always use ToolSearch with query `"pinterest"` (not `"mcp-pinterest"`) and use the returned tool name verbatim. Document both common registration names in `connections/pinterest.md`.
**Warning signs:** ToolSearch returns non-empty but subsequent tool call fails with "tool not found."

### Pitfall 2: Claude Design HTML as Static Document
**What goes wrong:** Adapter tries to parse the HTML export as if it has a fixed, predictable schema.
**Why it happens:** Claude Design is an Anthropic Labs research preview (launched 2026-04-17) with no documented export format. The HTML output is Claude-generated — structure will vary between designs.
**How to avoid:** Use resilient grep patterns that match CSS value conventions, not structural assumptions:
- Colors: `grep -oE '#[0-9a-fA-F]{3,8}|rgb\([^)]+\)|hsl\([^)]+\)|oklch\([^)]+\)'`
- Font families: `grep -oE 'font-family:[^;]+' | grep -v inherit | sort -u`
- Spacing: `grep -oE '--[a-z-]*spacing[a-z-]*:[^;]+'`
- CSS custom properties: `grep -oE '--[a-z][a-z0-9-]+:[^;]+'`
Mark all extracted values as `tentative — confirm with user` (same caveat as Figma resolved values).
**Warning signs:** Zero grep matches on a valid HTML export → broaden patterns.

### Pitfall 3: Resume Logic Breaking in --post-handoff Mode
**What goes wrong:** Verify's resume check (`stage==verify && status==in_progress`) still tries to load DESIGN-PLAN.md as part of the re-spawn prompts.
**Why it happens:** The resume path re-spawns design-verifier with the same `<required_reading>` block as the initial run — which includes `@.design/DESIGN-PLAN.md`.
**How to avoid:** The `post_handoff_mode` flag must be preserved in STATE.md (as a field in `<position>`) so it is available on resume. The verify skill reads it at entry and passes it through to all agent spawn prompts. Pattern: add `post_handoff: true` to the `<position>` section when `--post-handoff` was the entry flag.

### Pitfall 4: Handoff Faithfulness as a Blocking Score
**What goes wrong:** Handoff Faithfulness score causes the verify stage to `blocked` status even when all implementation quality checks pass.
**Why it happens:** If Handoff Faithfulness is treated as a must-have gate, a mismatch between handoff intent and code forces a blocked state — but the code may be deliberately different from the handoff (user overrides).
**How to avoid:** Handoff Faithfulness is a **reporting section only**, not a gate. It surfaces fidelity information; gaps do not automatically become BLOCKER-severity items. They appear as COSMETIC or MINOR (low fidelity is informational, not blocking). The existing gap-response loop handles them normally.

### Pitfall 5: `skipped_stages` Breaking Downstream Resume Logic
**What goes wrong:** A future stage (e.g., plan) reads STATE.md, sees `status=skipped` and enters an unexpected code path.
**Why it happens:** The existing write contract only defines `initialized | in_progress | completed | blocked`. Adding `skipped` creates a fifth value that existing stages don't handle.
**How to avoid:** Implement `skipped_stages` as an informational field inside `<position>`, NOT as a `status` value. Keep `status` for the CURRENT active stage (`in_progress`). Skipped stages are not tracked as `stage:` entries — only the current stage (`verify`) is set. This is purely backward-compatible.

---

## Code Examples

### Step 0B Condition Check (in design-context-builder)

```markdown
## Step 0B — Claude Design Handoff Pre-population

**Skip this step if `handoff_source` is absent from `.design/STATE.md` `<position>`.**
Proceed directly to Step 0 (Figma) or Step 1.

### If `handoff_source` is present

Read the handoff artifact. Check in order:
1. `.design/handoff/` directory (for bundle format with multiple files)
2. `.design/handoff.html` (for single-file HTML export)
3. Path recorded in `handoff_source_path` (if set by the router)

If no artifact is found: log warning "Handoff source declared in STATE.md but no artifact found at expected paths. Proceeding to Step 1." Proceed to Step 1. Do NOT abort.
```

### HTML Design Token Extraction Patterns

```bash
# CSS custom properties (most reliable for Claude Design HTML — it uses inline styles + CSS blocks)
grep -oE 'var\(--[a-z][a-z0-9-]+\)' handoff.html | sort -u

# Inline hex/rgb color values
grep -oE '#[0-9a-fA-F]{3,8}' handoff.html | sort -u
grep -oE 'rgb\([0-9 ,]+\)' handoff.html | sort -u

# Font families (extract from inline style or <style> block)
grep -oE "font-family:[[:space:]]*[^;\"']+" handoff.html | sed "s/font-family:[[:space:]]*//" | sort -u

# Spacing values from inline styles
grep -oE "(padding|margin|gap):[[:space:]]*[0-9]+[a-z]+" handoff.html | sort -u

# CSS custom property declarations (if the HTML has a <style> block with :root)
grep -oE '--[a-z][a-z0-9-]+:[[:space:]]*[^;]+' handoff.html | grep -v 'inherit\|var(' | sort -u
```

These patterns extract raw values. The adapter must deduplicate and classify (color vs spacing vs typography) before emitting D-XX decisions.

### --post-handoff Mode in Verify (agent spawn modification)

Normal design-verifier spawn includes:

```
<required_reading>
@.design/STATE.md
@.design/DESIGN-AUDIT.md
@.design/DESIGN-PLAN.md        ← remove this line in --post-handoff mode
@.design/DESIGN-CONTEXT.md
@.design/tasks/
...
</required_reading>
```

In `--post-handoff` mode, DESIGN-PLAN.md is absent; the spawn must be conditioned:

```markdown
### If `post_handoff_mode=false` (normal mode):
  Include `@.design/DESIGN-PLAN.md` in required_reading.

### If `post_handoff_mode=true` (post-handoff mode):
  Omit `@.design/DESIGN-PLAN.md`.
  Add to the agent instruction: "No DESIGN-PLAN.md exists. Verify against DESIGN-CONTEXT.md decisions (D-XX) only. Treat each D-XX decision as an implicit task."
```

This applies to ALL three agent spawns in Step 1 (design-auditor, design-verifier, design-integration-checker).

### Handoff Faithfulness Section Format

Add this section to DESIGN-VERIFICATION.md output when `post_handoff_mode=true`:

```markdown
## Handoff Faithfulness

| Dimension | Handoff Intent | Code Reality | Fidelity | Severity |
|-----------|----------------|--------------|----------|----------|
| Color — primary brand | #3B82F6 (from handoff D-03) | #3B82F6 in --color-primary | HIGH | — |
| Color — background | #F9FAFB (from handoff D-04) | Not found in CSS | LOW | MINOR |
| Typography — body font | Inter (from handoff D-05) | 'Inter' in tailwind fontFamily | HIGH | — |
| Spacing — base unit | 16px (from handoff D-06) | Mixed 12px/16px/20px | MEDIUM | COSMETIC |

**Overall Faithfulness:** HIGH / MEDIUM / LOW
**Note:** This section measures implementation fidelity to the Claude Design handoff intent.
Faithfulness gaps are informational — they do not gate verification pass/fail.
```

### STATE.md Handoff Initialization (router logic)

When `handoff` sub-command is invoked, the router initializes STATE.md:

```xml
<position>
stage: verify
wave: 1
task_progress: 0/3
status: in_progress
handoff_source: claude-design-html
handoff_source_path: .design/handoff.html
post_handoff: true
skipped_stages: scan, discover, plan
</position>
```

Add these new fields to STATE-TEMPLATE.md as optional fields inside `<position>` with `~` default:

```
handoff_source: ~
handoff_source_path: ~
post_handoff: false
skipped_stages: ~
```

### Pinterest Probe (in design-context-builder Area 5)

```markdown
**Pinterest probe (ToolSearch-only — no live tool call needed):**

ToolSearch({ query: "pinterest", max_results: 5 })
  → Empty result     → pinterest: not_configured  (skip to Tier 2 — Refero)
  → Non-empty result → confirm tool name from results (expected: something containing "pinterest_search")
                     → pinterest: available

Write pinterest status to STATE.md <connections>.
```

Note: tool names returned by ToolSearch are the ground truth — use them verbatim (do not hardcode `mcp__mcp-pinterest__pinterest_search`).

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Figma-only pre-population | Multi-source pre-pop (Figma Step 0 + Claude Design Step 0B) | Phase 7 | Adapter pattern enables additional sources without restructuring |
| Refero-only visual references | Three-tier: Pinterest → Refero → awesome-design-md | Phase 7 | Pinterest preferred when available (richer visual inspiration) |
| Verify always requires DESIGN-PLAN.md | Verify has `--post-handoff` mode (plan-free entry) | Phase 7 | Enables Claude Design handoff direct-to-verify workflow |

---

## Open Questions

1. **Claude Design HTML export structure — is there accompanying JSON?**
   - What we know: Claude Design lists exports as "standalone HTML, PDF, PPTX, Canva, internal URLs, handoff bundle." The standalone HTML is the parseable artifact. The "handoff bundle" description implies it may contain more than just HTML.
   - What's unclear: Whether the handoff bundle is the same as the HTML export or a separate multi-file artifact containing structured JSON token data. No community reverse-engineering found as of 2026-04-18.
   - Recommendation: `connections/claude-design.md` should describe BOTH cases: (a) HTML-only export — parse with grep patterns; (b) bundle with accompanying files — prefer JSON/markdown if present, fall back to HTML. Step 0B should check for both.

2. **Pinterest probe query string — `"pinterest"` vs `"mcp-pinterest"`**
   - What we know: ToolSearch uses substring matching on server names. The terryso package registers as `mcp-pinterest` by default via Smithery. Users may register it differently.
   - What's unclear: Whether querying `"pinterest"` vs `"mcp-pinterest"` gives reliably different result sets.
   - Recommendation: Use `"pinterest"` as the query — it will match any server name containing "pinterest" regardless of user's registration choice. Document both registration names in `connections/pinterest.md`.

3. **handoff_source field values — should `claude-design-bundle` be distinct from `claude-design-html`?**
   - What we know: CONTEXT.md says values like `claude-design-html`, `claude-design-bundle`, `figma-export`, `manual`.
   - What's unclear: Whether the distinction between bundle and HTML matters to downstream logic.
   - Recommendation: Keep both values. Step 0B behavior differs slightly: HTML-only → grep patterns only; bundle → check for JSON token file first, then fall back to grep. The field value controls which extraction path runs.

---

## Validation Architecture

### What can be verified automatically (grep/file existence checks)

| Check | Command | Expected Result |
|-------|---------|-----------------|
| `connections/claude-design.md` exists | `test -f connections/claude-design.md` | Exit 0 |
| `connections/pinterest.md` exists | `test -f connections/pinterest.md` | Exit 0 |
| connections.md has claude_design row | `grep -c "claude_design\|claude-design" connections/connections.md` | >= 1 |
| connections.md has pinterest row | `grep -c "pinterest" connections/connections.md` | >= 1 |
| STATE-TEMPLATE.md has handoff_source | `grep -c "handoff_source" reference/STATE-TEMPLATE.md` | >= 1 |
| STATE-TEMPLATE.md has skipped_stages | `grep -c "skipped_stages" reference/STATE-TEMPLATE.md` | >= 1 |
| design-context-builder has Step 0B | `grep -c "Step 0B" agents/design-context-builder.md` | >= 1 |
| design-context-builder tools includes pinterest | `grep -c "pinterest" agents/design-context-builder.md` | >= 1 |
| Root SKILL.md has handoff in argument-hint | `grep "argument-hint" SKILL.md \| grep -c "handoff"` | >= 1 |
| Root SKILL.md has handoff in Jump Mode table | `grep -c "handoff" SKILL.md` | >= 2 (table + routing) |
| Verify SKILL.md has --post-handoff | `grep -c "post-handoff" skills/verify/SKILL.md` | >= 1 |
| Verify SKILL.md has Handoff Faithfulness | `grep -c "Handoff Faithfulness" skills/verify/SKILL.md` | >= 1 |

### What requires live MCP testing

| Test | Method | Notes |
|------|--------|-------|
| Pinterest ToolSearch probe | Live session: `ToolSearch({ query: "pinterest", max_results: 5 })` | Requires user to have installed mcp-pinterest; Phase 7 smoke test |
| Pinterest search execution | Live session: call confirmed tool with `keyword: "dashboard UI"` | Confirms headless browser works, returns image URLs |
| Claude Design handoff bundle parsing | Live test with a real Claude Design HTML export | Can only be tested end-to-end with an active Claude Design subscription; Phase 7 scope |

### Suggested smoke test for the handoff entry point

After Phase 7 execution, a minimal smoke test verifies the routing works without requiring a live Claude Design export:

```bash
# Smoke test: handoff entry point smoke (no real bundle needed)
# 1. Create a minimal .design/ with a stub handoff.html
mkdir -p .design
cat > .design/handoff.html << 'EOF'
<html><head><style>
:root { --color-primary: #3B82F6; --font-family-body: Inter; --spacing-base: 16px; }
</style></head><body style="color: #1F2937; font-family: Inter; padding: 16px;">Hello</body></html>
EOF

# 2. Verify grep extraction patterns work on the stub
grep -oE '#[0-9a-fA-F]{3,8}' .design/handoff.html        # expect: #3B82F6 #1F2937
grep -oE '--[a-z][a-z0-9-]+:[[:space:]]*[^;]+' .design/handoff.html  # expect: 3 custom property matches

# 3. Verify SKILL.md routes handoff correctly (static check)
grep "handoff" SKILL.md | grep -v "^#"

# 4. Verify STATE-TEMPLATE.md has the new fields
grep "handoff_source\|skipped_stages\|post_handoff" reference/STATE-TEMPLATE.md
```

**Per-plan smoke tests:**
- Plan 01: `test -f connections/claude-design.md && test -f connections/pinterest.md` — both files exist and are non-empty
- Plan 02: `grep -c "Step 0B" agents/design-context-builder.md` — >= 1 match
- Plan 03: `grep "handoff" SKILL.md | grep -v "^#" | wc -l` — >= 3 lines (argument-hint, table, routing)
- Plan 04: `grep -c "pinterest" agents/design-context-builder.md` — >= 3 lines (probe, Area 5 tier, fallback note)

---

## Sources

### Primary (HIGH confidence)
- `connections/connections.md` (this repo) — connection probe pattern, three-value status schema, extensibility guide
- `connections/refero.md` (this repo) — ToolSearch-only probe pattern; template for Pinterest spec
- `connections/figma.md` (this repo) — full connection spec format; template for Claude Design spec
- `agents/design-context-builder.md` (this repo) — Step 0 pattern; template for Step 0B
- `skills/verify/SKILL.md` (this repo) — flag parsing pattern; template for --post-handoff
- `SKILL.md` (this repo) — Jump Mode table; template for handoff routing
- `reference/STATE-TEMPLATE.md` (this repo) — field schema; constraint "no new top-level XML sections"
- [Anthropic Claude Design announcement](https://www.anthropic.com/news/claude-design-anthropic-labs) — authoritative product facts (handoff bundle description, export formats, Opus 4.7)
- [terryso/mcp-pinterest GitHub](https://github.com/terryso/mcp-pinterest) — tool names `pinterest_search`, `pinterest_get_image_info`, `pinterest_search_and_download`; no API key required
- [glama.ai mcp-pinterest](https://glama.ai/mcp/servers/@terryso/mcp-pinterest) — confirmed tool names
- [playbooks.com mcp-pinterest](https://playbooks.com/mcp/terryso/mcp-pinterest) — installation via Smithery, tool descriptions

### Secondary (MEDIUM confidence)
- [PulseMCP terryso-pinterest](https://www.pulsemcp.com/servers/terryso-pinterest) — confirms 23-star repo, no API key
- [ubos.tech mcp-pinterest README](https://ubos.tech/mcp/mcp-pinterest/) — two-tool variant of the server
- [InfoQ Pinterest MCP ecosystem](https://www.infoq.com/news/2026/04/pinterest-mcp-ecosystem/) — Pinterest's own MCP adoption (confirms MCP viability for Pinterest data, though their internal servers differ from terryso's)
- Community WebSearch corroboration that Claude Design HTML export contains CSS values — no structural reverse-engineering found

### Tertiary (LOW confidence)
- Claude Design handoff bundle internal format — no official documentation found; no community reverse-engineering as of 2026-04-18. All statements about HTML content are inferred from general knowledge of Claude Design's HTML rendering (it generates standard CSS-in-HTML output) and the decision to use grep-based extraction.

---

## Metadata

**Confidence breakdown:**
- Pinterest MCP (tool names, no-API-key, ToolSearch probe): HIGH — confirmed from GitHub + multiple registries
- Pinterest MCP tool prefix in Claude Code: MEDIUM — derived from Claude Code naming conventions; depends on user's registration name
- Claude Design handoff bundle format: LOW — no official docs; HTML export structure inferred from product category and grep-philosophy decision in CONTEXT.md
- Architecture patterns (Step 0B, router extension, verify mode, STATE.md fields): HIGH — all follow directly from existing codebase patterns
- Handoff Faithfulness score format: HIGH — spec is fully defined in CONTEXT.md decisions; implementation is design work, not research

**Research date:** 2026-04-18
**Valid until:** 2026-05-18 for Pinterest MCP (stable, no API changes expected). Claude Design bundle format: re-check when Anthropic publishes official developer docs ("coming weeks" per roadmap hint).
