---
name: discover
description: "Stage 1.5 of 4 — thin orchestrator that spawns design-context-builder (auto-detect + interview) and design-context-checker (6-dimension validator) to produce DESIGN-CONTEXT.md."
argument-hint: "[--auto]"
user-invocable: true
---

# Ultimate Design — Discover

**Stage 1.5 of 4.** Produces `.design/DESIGN-CONTEXT.md`.

---

## State Integration

1. Read `.design/STATE.md`.
   - If missing: create minimal skeleton from `reference/STATE-TEMPLATE.md` with stage=discover, status=in_progress, task_progress=0/1, and log warning: "STATE.md not found — created fresh. If this is a resumed session, run /ultimate-design:scan first."
   - If present and stage==discover and status==in_progress: RESUME — continue existing interview; do not reset.
   - Otherwise: normal transition — set frontmatter stage=discover, <position> stage=discover, status=in_progress, task_progress=0/1.
2. **Probe connection availability** — ToolSearch runs FIRST because MCP tools may be in the deferred tool set. This is the canonical probe pattern (spec lives in `connections/connections.md`; copied inline because SKILL.md has no include mechanism — if the probe pattern changes, update all stages that copied it).

   **A — Figma probe:**

   ```
   A1. ToolSearch({ query: "select:mcp__figma-desktop__get_metadata", max_results: 1 })
   A2. Empty result → figma: not_configured (skip all Figma paths)
       Non-empty result → call mcp__figma-desktop__get_metadata
         Success → figma: available
         Error   → figma: unavailable
   ```

   **B — Refero probe (ToolSearch presence is sufficient — no tool call needed):**

   ```
   B1. ToolSearch({ query: "refero", max_results: 5 })
   B2. Empty result  → refero: not_configured
       Non-empty     → refero: available
   ```

   After both probes, update `.design/STATE.md` `<connections>` with the results and continue. Downstream stages (design-context-builder) read `<connections>` from STATE.md rather than re-probing.
3. Update last_checkpoint. Write STATE.md.

## Auto Mode

Auto Mode CSS detection (when `auto_mode: true` is passed to the builder):
  1. If tailwind.config.{js,cjs,mjs,ts} exists → Tailwind-only project
     - Skip CSS file grep
     - Parse tailwind.config for color palette, spacing scale, font families
     - Use tailwind.config values as the baseline style signal
  2. Else → fall through to existing CSS file grep logic

## Step 1 — Spawn design-context-builder

Task("design-context-builder", """
<required_reading>
@.design/STATE.md
@reference/audit-scoring.md
@reference/anti-patterns.md
</required_reading>

You are the design-context-builder agent. Auto-detect existing design system
state via grep/glob before asking questions. Interview the user ONLY for areas
where auto-detect returned no confident answer. Write .design/DESIGN-CONTEXT.md.

Baseline audit directory detection (ordered fallback chain):
  1. If src/ exists → use src/
  2. Elif app/ exists → use app/ (Next.js App Router)
  3. Elif pages/ exists → use pages/ (Next.js Pages Router)
  4. Elif lib/ exists → use lib/ (library-only projects)
  5. Else → flag "layout unknown", skip baseline, note in DESIGN-CONTEXT.md

Common gray areas to probe during discovery (Area 7):
  1. font-change risk — switching type families when existing UI has body copy in a specific family. Ask: "Is the current body font intentional or inherited? OK to change?"
  2. token-layer introduction risk — adding CSS custom properties to a codebase that uses direct values. Ask: "Do you want design tokens (--primary, --surface) or inline values (hex, rgb)?"
  3. Component rebuild vs restyle — when to keep existing component, when to rebuild from scratch. Ask: "For <component>, restyle in place or rebuild?"

Context:
  auto_mode: <true|false>

Output file: .design/DESIGN-CONTEXT.md
Emit `## CONTEXT COMPLETE` when done.
""")

Wait for `## CONTEXT COMPLETE`. Update STATE.md task_progress = 0.5.

## Step 2 — Spawn design-context-checker

Task("design-context-checker", """
<required_reading>
@.design/STATE.md
@.design/DESIGN-CONTEXT.md
</required_reading>

You are the design-context-checker agent. Validate DESIGN-CONTEXT.md across
6 dimensions. Return APPROVED or BLOCKED with per-dimension verdicts.

Emit `## CONTEXT CHECK COMPLETE` when done.
""")

Wait for `## CONTEXT CHECK COMPLETE`.

## Step 3 — Handle checker verdict

If APPROVED: proceed to state update.
If BLOCKED: present dimensions that BLOCKED to user, offer fix-and-retry loop
(re-spawn builder with specific fix instructions). Do not proceed to planning.

---

## State Update (exit)

1. Set <position> status=completed, task_progress=1/1.
2. Set <timestamps> discover_completed_at=<ISO 8601 now>.
3. Update last_checkpoint. Write STATE.md.

---

## After Writing

```
━━━ Discovery complete ━━━
Saved: .design/DESIGN-CONTEXT.md

Baseline score: [N]/100 ([grade])
Key issues: [top issue 1], [top issue 2], [top issue 3]

Next: /ultimate-design:plan
  → Decomposes your context into executable design tasks.
━━━━━━━━━━━━━━━━━━━━━━━━━
```

Do not proceed to planning automatically unless `--auto` was passed.

## DISCOVER COMPLETE
