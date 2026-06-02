---
name: scan
description: "Pre-pipeline initializer that maps an existing repo's design system (colors, typography, spacing, components, tokens), runs the anti-pattern audit, scores the 7 weighted categories, and writes DESIGN.md + .design/DESIGN-DEBT.md. Use when starting work in any new or existing repo before /gdd:discover."
argument-hint: "[--quick] [--full]"
user-invocable: true
---

# Get Design Done — Scan

**Pre-pipeline initializer.** Run once in any new or existing repo before starting the Discover -> Plan -> Design -> Verify pipeline.

Full procedure detail: `./scan-procedure.md`.

Produces:
- `DESIGN.md` — snapshot of the existing design system as it actually is
- `.design/DESIGN-DEBT.md` — prioritized debt roadmap

`--quick`: Skip component inventory, focus on tokens + anti-patterns only (~2 min)
`--full`: Include component-by-component analysis (slower, more thorough)

Default: full scan of tokens, patterns, and anti-patterns. Component inventory is a summary count, not per-file.

---

## State Integration

At scan entry, before running any step:

1. Read or create `.design/STATE.md` from `reference/STATE-TEMPLATE.md` (set `stage=scan`, `status=in_progress`, `task_progress=0/8`; preserve `started_at` on resume). See `./scan-procedure.md` §State Integration for the full read/create/resume decision tree.
2. Probe Figma + Refero connections (variant-agnostic ToolSearch + tiebreaker resolution). Detail: `./scan-procedure.md` §Probe connection availability.
3. Run the four Phase 8 probes (preview, storybook, chromatic, graphify) and batch-write results to STATE.md `<connections>`. Detail: `./scan-procedure.md` §Phase 8 Connection Probes.
4. Emit the first-run connection nudge if every probe returned `not_configured` AND `.design/config.json > connections_onboarding` is absent.
5. Update `last_checkpoint`; persist STATE.md before proceeding to Step 1.

---

## Workflow

The scan executes eight steps in order. Each step's full grep commands, analysis prompts, and decision rules live in `./scan-procedure.md` — keep that file open while executing.

### Step 1 — Orient

Detect framework, CSS approach, component count, style file count, token system. Detect source root by ordered fallback (`src/` -> `app/` -> `pages/` -> `lib/`) and substitute into subsequent grep commands. Log the detected source root in DESIGN.md frontmatter. Detail: `./scan-procedure.md` §Step 1.

### Step 2 — Extract Color System

Grep hex / `oklch()` / `hsl()` / `rgb()` colors, CSS custom properties, and Tailwind color config. Analyze palette size, token discipline, AI-slop colors (#6366f1, #8b5cf6, #06b6d4), semantic naming, dark-mode purity. Produce a color inventory table. Detail: `./scan-procedure.md` §Step 2.

### Step 2A — Figma Token Augmentation

If `figma: available` in STATE.md `<connections>`: call `{prefix}get_variable_defs`, translate variables by type/name pattern, merge with grep-derived tokens (never replace). Skip silently if `figma` is `not_configured` or `unavailable`. Detail: `./scan-procedure.md` §Step 2A.

### Step 3 — Extract Typography System

Grep font families, sizes, weights, line-heights. Analyze family count, scale compliance, weight hierarchy, line-height on body, reflex-font signals. Read `${CLAUDE_PLUGIN_ROOT}/reference/typography.md` for comparison criteria. Detail: `./scan-procedure.md` §Step 3.

### Step 4 — Extract Spacing System

Grep CSS spacing values, Tailwind spacing overrides, space tokens. Score grid compliance against the 4/8/12/16/24/32/48/64 series. Detail: `./scan-procedure.md` §Step 4.

### Step 5 — Anti-Pattern Audit

Read `${CLAUDE_PLUGIN_ROOT}/reference/anti-patterns.md`. Run all BAN-XX and SLOP-XX grep commands, plus a11y checks (focus rings, reduced-motion, div onClick, small fonts). Detail: `./scan-procedure.md` §Step 5.

### Step 6 — Component Inventory

If `--quick`, skip. Otherwise run the three-pass multi-signal filter (JSX-return + className + framework-import) to produce an authoritative component list, then enumerate primitives. In `--full` mode, emit one row per file. Detail: `./scan-procedure.md` §Step 6.

### Step 7 — Score All 7 Categories

Read `${CLAUDE_PLUGIN_ROOT}/reference/audit-scoring.md`. Score each category 0–10 and apply the weighted formula `(A11Y * 0.25) + (Visual Hierarchy * 0.20) + (Typography * 0.15) + (Color * 0.15) + (Layout * 0.10) + (Anti-Patterns * 0.10) + (Motion * 0.05)`. Grade A=90+, B=75+, C=60+, D=45+, F<45.

### Step 8 — Generate Design Debt Roadmap

Classify each finding P0/P1/P2/P3, estimate effort XS/S/M/L/XL, group by debt theme, compute `priority_score = (severity_weight * effort_weight) + (dependency_depth * 2)`. Mark P1+XS/S items as quick wins. Detail: `./scan-procedure.md` §Step 8.

---

## Outputs

Write both artifacts using the templates in `./scan-procedure.md`:

- **`DESIGN.md`** (project root) — design-system snapshot with score table, color/typography/spacing/component inventories, anti-pattern status, motion summary. Frontmatter records `score`, `framework`, `css_approach`, `token_layer`, and (if Figma ran) `figma_variables_used` + `figma_source`. Template: `./scan-procedure.md` §Output 1.
- **`.design/DESIGN-DEBT.md`** — prioritized debt roadmap grouped P0/P1/P2/P3, with priority_score ordering, recommended fix order, and pipeline recommendation. Template: `./scan-procedure.md` §Output 2.

---

## After Writing

Print the user-facing summary block from `./scan-procedure.md` §After Writing — project name, score, P0/P1 counts, quick-win count, artifact paths, and next-step options (start pipeline, fix quick wins first, or just reference the debt).

## SCAN COMPLETE
