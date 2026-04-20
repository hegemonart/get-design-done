---
name: gdd-explore
description: "Codebase inventory + design context — runs scan patterns and design-discussant interview, produces DESIGN.md + DESIGN-DEBT.md + DESIGN-CONTEXT.md (Stage 2 of 5)"
argument-hint: "[--skip-interview] [--skip-scan]"
tools: Read, Write, Bash, Grep, Glob, Task, AskUserQuestion
---

# Get Design Done — Explore

**Role:** You are the Explore stage. Stage 2 of 5 in the get-design-done pipeline.

**Purpose:** Unified exploration merging the former `scan` (inventory grep) and `discover` (context interview) stages. Produces `.design/DESIGN.md`, `.design/DESIGN-DEBT.md`, and `.design/DESIGN-CONTEXT.md`.

---

## Step 1 — Connection probe

Probe connection availability and update `.design/STATE.md` `<connections>`:

**A — Figma probe:**
```
ToolSearch({ query: "select:mcp__figma__get_metadata", max_results: 1 })
Empty → figma: not_configured
Non-empty → call mcp__figma__get_metadata; success → available; error → unavailable
```

**B — Refero probe:**
```
ToolSearch({ query: "refero", max_results: 5 })
Empty → refero: not_configured
Non-empty → refero: available
```

**C — 21st.dev probe:**
```
ToolSearch({ query: "mcp__21st", max_results: 5 })
Empty → 21st-dev: not_configured
Non-empty → 21st-dev: available
```

**D — Magic Patterns probe:**
```
ToolSearch({ query: "mcp__magic_patterns", max_results: 5 })
Empty → magic-patterns: not_configured
Non-empty → magic-patterns: available
```

**E — paper.design probe:**
```
ToolSearch({ query: "mcp__paper", max_results: 5 })
Empty → paper-design: not_configured
Non-empty → call mcp__paper-design__get_selection; success → available; error → unavailable
```

**F — pencil.dev probe (file-based):**
```bash
find . -name "*.pen" -not -path "*/node_modules/*" 2>/dev/null | head -1
Empty → pencil-dev: not_configured
Found → pencil-dev: available
```

Write all results to STATE.md `<connections>`.

## Step 1.5 — 21st.dev Prior-Art Check (when 21st-dev: available)

If `21st-dev: not_configured` in STATE.md: skip this step entirely.

When the explore stage identifies any greenfield component in scope (component name from BRIEF.md or user request that does not yet have an implementation file):

1. `21st_magic_component_search(component_name, limit: 3)`
2. Evaluate top result:
   - **fit ≥ 80%**: add `<prior-art>` block to DESIGN.md:
     ```xml
     <prior-art source="21st.dev" component="<name>" fit="<score>%" id="<component_id>">
       Recommendation: adopt — do not build custom. Confirm with design-executor.
     </prior-art>
     ```
   - **fit < 80%**: note top candidate in DESIGN.md as a reference, proceed with custom build:
     ```xml
     <prior-art source="21st.dev" component="<name>" fit="<score>%" id="<component_id>">
       Low fit — noted for reference. Building custom component.
     </prior-art>
     ```
3. If `svgl_get_brand_logo` is available and explore scope includes brand logo assets: call `svgl_get_brand_logo(brand_name)` for each required brand asset; add SVG results to `.design/assets/` and note in DESIGN.md.

If no greenfield components in scope: skip this step.

## Step 2 — Inventory scan (unless `--skip-scan`)

**Map pre-check:** If `.design/map/` exists and all 5 files (`tokens.md`, `components.md`, `visual-hierarchy.md`, `a11y.md`, `motion.md`) are present AND fresher than `src/` (mtime), consume them as the inventory source and skip the grep pass. Otherwise proceed with grep below and, after Step 4, suggest running `/gdd:map` for richer parallel-scanned data on the next cycle.

**Parallelism decision (before any multi-agent spawn):**
1. Read `.design/config.json` `parallelism` (or defaults from `reference/config-schema.md`).
2. Apply rules from `reference/parallelism-rules.md` (hard → soft).
3. Write verdict to STATE.md `<parallelism_decision>` with stage/verdict/reason/agents.
4. If verdict is `parallel`, dispatch via multiple `Task()` calls in one response; if `serial`, spawn sequentially.

Run the canonical scan grep/glob inventory (preserves PLAT-01/02 POSIX ERE patterns from Phase 1):

- **Component detection** — `Glob` for `**/*.{tsx,jsx,vue,svelte}`; count exports, identify shared UI primitives.
- **Color extraction** — `Grep` for hex (`#[0-9a-fA-F]{3,8}`), `rgb(`, `hsl(`, Tailwind arbitrary color classes; dedupe.
- **Typography scan** — Grep font-family declarations, Tailwind `font-*`, `text-*` size classes; identify type scale.
- **Motion scan** — Grep `transition`, `animate-`, `@keyframes`, `framer-motion` imports.
- **Token detection** — Check for `tailwind.config.{js,cjs,mjs,ts}`, CSS custom properties (`--*`), design-token JSON.
- **Layout detection** — Ordered fallback: `src/` → `app/` → `pages/` → `lib/` → unknown.

Write findings to:
- `.design/DESIGN.md` — current design system inventory + baseline score
- `.design/DESIGN-DEBT.md` — prioritized debt roadmap

Mark STATE.md `task_progress` for the scan pass.

## Step 2.5 — Detect prior sketches and project-local conventions

**Sketches**: If `.design/sketches/` exists, list all sketch slugs — group by those with `WINNER.md` (completed wrap-ups) vs without (pending). Note in STATE.md that sketches are present. Include the inventory in DESIGN.md under a "Prior Explorations" section so downstream stages see the history.

**Project-local skills**: Read any `./.claude/skills/design-*-conventions.md` files if present. Include their content in DESIGN-CONTEXT.md under a `<project_conventions>` section — these are codified decisions from prior `/gdd:sketch-wrap-up` runs or manual edits, and they override defaults.

**Global skills**: If `~/.claude/gdd/global-skills/` exists and contains `.md` files (other than README.md), read them and prepend their content to the `<project_conventions>` section under a `<global_conventions>` sub-block. Global skills represent cross-project personal conventions. They inform but do not override project-local decisions — when a project-local D-XX decision conflicts with a global skill, the project-local decision wins.

## Step 3 — Design interview (unless `--skip-interview`)

**Run this inline — do NOT spawn `design-discussant` as a subagent.** Subagent UI tools (`AskUserQuestion`) only render the native picker when called from the top-level skill context; spawning a Task() degrades the interview to plain markdown in chat (broken in Claude Desktop).

### 3.a — Pre-load context

Read in this order:
1. `.design/STATE.md` — existing `<decisions>` D-XX entries (do NOT re-ask anything covered)
2. `.design/BRIEF.md` — problem statement, audience, constraints
3. `.design/DESIGN.md` — auto-detected inventory from Step 2
4. `.design/DESIGN-CONTEXT.md` if it exists — `<gray_areas>` block lists unresolved topics
5. `./.claude/skills/design-*-conventions.md` if any — locked project conventions, treat as authoritative

If `<connections>` in STATE.md shows `figma: available`, call `mcp__figma__get_variable_defs` and draft tentative D-XX entries (mark `(tentative — confirm with user)`) before asking.

### 3.b — Identify question set

Build the list of areas needing input. Skip any area already answered by an existing D-XX or covered by a project convention. Default coverage:

- Cycle goal / outcome that matters most
- Audience and primary use context
- Brand direction (only if no tokens detected in DESIGN.md)
- Color primitives (only if no palette detected)
- Typography scale (only if no type system detected)
- Spacing scale (only if no spacing tokens detected)
- Motion preferences (only if no motion patterns detected)
- Any `<gray_areas>` from DESIGN-CONTEXT.md

### 3.c — Ask, one question at a time

For each area, call `AskUserQuestion` with a single focused question. Provide 4 concrete options plus "Other" / "Skip" where it helps. Do not batch questions into one call. Do not print the question as markdown — always go through the tool.

Reject generic answers ("modern", "clean", "professional"). If the answer is vague, ask one follow-up before recording.

### 3.d — Record after each answer

After each confirmed answer:
1. Append a `D-XX` entry to `.design/STATE.md` `<decisions>` block. Format:
   ```
   D-NN: [Category] Decision summary — short rationale
   ```
2. Append one JSON line to `.design/learnings/question-quality.jsonl` (create if absent):
   ```json
   {"ts":"<iso>","question_id":"Q-NN","question_text":"<verbatim>","answer_summary":"<one sentence>","quality":"high|medium|low|skipped","evidence":"<why>","cycle":"<active-cycle-slug>"}
   ```
   Quality classification: `skipped` if user picked Skip / "doesn't matter"; `low` if < 10 words and not a specific value; `medium` if hedged ("maybe", "I think", "not sure"); `high` otherwise.
3. Save STATE.md immediately (incremental save — survives crash mid-interview).

### 3.e — Produce DESIGN-CONTEXT.md

When all questions are answered, write `.design/DESIGN-CONTEXT.md` summarizing the locked decisions, remaining gray areas, and any Figma-sourced tentatives that were confirmed or rejected. Set frontmatter `status: complete`.

## Step 4 — Update STATE.md

- Set frontmatter `stage: plan`.
- Set `<position>` `status: completed` for explore.
- Set `<timestamps>` `explore_completed_at` = now.
- Update `last_checkpoint`. Write STATE.md.

## After Writing

```
━━━ Explore complete ━━━
Saved: .design/DESIGN.md, .design/DESIGN-DEBT.md, .design/DESIGN-CONTEXT.md
Next: @get-design-done plan
━━━━━━━━━━━━━━━━━━━━━━━━
```

## EXPLORE COMPLETE
