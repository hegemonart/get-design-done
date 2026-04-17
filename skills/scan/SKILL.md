---
name: scan
description: "Design scanner for new or uninitialized repos. Automatically maps the existing design system (colors, typography, spacing, components, tokens), runs a full anti-pattern audit, scores all 7 categories, and produces two artifacts: DESIGN.md (living design system snapshot) and .design/DESIGN-DEBT.md (prioritized debt roadmap with effort estimates). Run this once before starting discovery in any new codebase."
argument-hint: "[--quick] [--full]"
user-invocable: true
---

# Ultimate Design — Scan

**Pre-pipeline initializer.** Run once in any new or existing repo before starting the Discover → Plan → Design → Verify pipeline.

Produces:
- `DESIGN.md` — snapshot of the existing design system as it actually is
- `.design/DESIGN-DEBT.md` — prioritized debt roadmap

`--quick`: Skip component inventory, focus on tokens + anti-patterns only (~2 min)
`--full`: Include component-by-component analysis (slower, more thorough)

Default: full scan of tokens, patterns, and anti-patterns. Component inventory is a summary count, not per-file.

---

## Step 1 — Orient

Identify the project structure before scanning:

```bash
# Framework detection
cat package.json 2>/dev/null | grep -E '"(next|nuxt|vite|react|vue|svelte|remix|astro|tailwind)"' | head -20

# CSS approach
ls src/styles/ styles/ app/styles/ 2>/dev/null
find . -name "tailwind.config.*" -not -path "*/node_modules/*" 2>/dev/null | head -3
find . -name "*.tokens.json" -o -name "design-tokens.*" -o -name "tokens.css" 2>/dev/null | grep -v node_modules | head -5

# Component count
find . -name "*.tsx" -o -name "*.jsx" -o -name "*.vue" -o -name "*.svelte" 2>/dev/null | grep -v node_modules | wc -l

# Style file count
find . -name "*.css" -o -name "*.scss" -o -name "*.less" 2>/dev/null | grep -v node_modules | wc -l
```

Record: framework, CSS approach, component count, style file count, token system (yes/no).

**Detect source root.** Check these directories in order and use the first one that exists:
`src/` → `app/` → `pages/` → `lib/`. Substitute the detected source root (the matched
directory name) into every subsequent grep command in this SKILL.md that currently references
`src/` as the primary component root. If none of these directories exist, log
"No standard source directory found — manual audit required" and proceed with the unchanged
command (the `2>/dev/null` guards will suppress the no-match output).

Log the detected source root in DESIGN.md frontmatter as:
    source_roots: [<detected_dir>]

---

## Step 2 — Extract Color System

```bash
# All hex colors used
grep -roh "#[0-9a-fA-F]\{3,8\}" src/ styles/ app/ --include="*.css" --include="*.scss" --include="*.tsx" --include="*.jsx" --include="*.ts" --include="*.vue" 2>/dev/null | sort | uniq -c | sort -rn | head -40

# oklch / hsl / rgb colors
grep -rEoh "oklch\([^)]*\)|hsl\([^)]*\)|rgb\([^)]*\)" src/ styles/ --include="*.css" --include="*.scss" 2>/dev/null | sort | uniq -c | sort -rn | head -20

# CSS custom properties (color tokens)
grep -rEoh "\-\-[a-z][a-z0-9\-]*color[a-z0-9\-]*:\s*[^;]*|\-\-color[a-z0-9\-]*:\s*[^;]*" src/ styles/ --include="*.css" --include="*.scss" 2>/dev/null | sort | uniq | head -30

# Tailwind color config
grep -A 100 '"colors"' tailwind.config.* 2>/dev/null | head -50
```

**Analyze the color data:**

1. How many unique colors? (< 10 = disciplined, 10–25 = moderate, > 25 = ad-hoc)
2. Is there a token layer (CSS custom properties)? Or raw hex in components?
3. Does the palette contain AI-slop colors? (#6366f1, #8b5cf6, #06b6d4)
4. Are there semantic roles evident from naming? (`--color-primary`, `--color-danger`)
5. Is pure black (#000000) used in dark mode?

Produce a color inventory table:
```
| Color | Occurrences | Role (inferred) | Issues |
```

---

## Step 3 — Extract Typography System

```bash
# Font families
grep -rEoh "font-family:\s*[^;]*|fontFamily:\s*[^,}]*" src/ styles/ --include="*.css" --include="*.scss" --include="*.ts" --include="*.tsx" 2>/dev/null | sort | uniq -c | sort -rn | head -20

# Font sizes
grep -rEoh "font-size:\s*[0-9.]*\(rem|px|em\)|text-(xs|sm|base|lg|xl|2xl|3xl|4xl|5xl|6xl|7xl)" src/ styles/ --include="*.css" --include="*.scss" --include="*.tsx" --include="*.jsx" 2>/dev/null | sort | uniq -c | sort -rn | head -30

# Font weights
grep -rEoh "font-weight:\s*[0-9]*|fw-[0-9]*|font-(thin|light|normal|medium|semibold|bold|extrabold|black)" src/ styles/ --include="*.css" --include="*.scss" --include="*.tsx" 2>/dev/null | sort | uniq -c | sort -rn | head -20

# Line heights
grep -rEoh "line-height:\s*[0-9.]*|leading-[a-z0-9]*" src/ styles/ --include="*.css" --include="*.scss" --include="*.tsx" 2>/dev/null | sort | uniq -c | sort -rn | head -15
```

**Analyze:**

1. How many font families? (> 2 = violation unless one is monospace)
2. Are font sizes from a defined scale or arbitrary px?
3. Map found sizes to nearest modular scale — identify outliers
4. Are weights following hierarchy? (body 400, headings 600-700, never 300 on small text)
5. Line-height on body text — is it 1.5–1.75?
6. Any of the reflex fonts without apparent brand reason? (Inter, DM Sans, Space Grotesk, Plus Jakarta Sans)

Read `${CLAUDE_PLUGIN_ROOT}/reference/typography.md` for comparison criteria.

Produce a typography inventory table.

---

## Step 4 — Extract Spacing System

```bash
# All CSS spacing values
grep -rEoh "padding:\s*[0-9]*px|margin:\s*[0-9]*px|gap:\s*[0-9]*px" src/ styles/ --include="*.css" --include="*.scss" 2>/dev/null | grep -oh "[0-9]*px" | sort -n | uniq -c | sort -rn | head -20

# Tailwind spacing overrides
grep -A 30 '"spacing"' tailwind.config.* 2>/dev/null | head -35

# Space tokens
grep -rEoh "\-\-space[a-z0-9\-]*:\s*[^;]*|\-\-spacing[a-z0-9\-]*:\s*[^;]*" src/ styles/ --include="*.css" 2>/dev/null | head -20
```

**Analyze:**

Grid compliance: are spacing values in the 4/8/12/16/24/32/48/64 series? Flag any values not in this set (e.g., 13px, 22px, 37px are off-grid).

---

## Step 5 — Anti-Pattern Audit

Read `${CLAUDE_PLUGIN_ROOT}/reference/anti-patterns.md`. Run all grep commands.

```bash
# BAN violations (−3 each from Anti-Pattern score)
echo "=== BAN-01: Side-stripe borders ===" && grep -rEn "border-left:\s*[2-9][0-9]*px|border-right:\s*[2-9][0-9]*px" src/ --include="*.css" --include="*.scss" --include="*.tsx" 2>/dev/null
echo "=== BAN-02: Gradient text ===" && grep -rEn "background-clip:\s*text|text-fill-color:\s*transparent" src/ 2>/dev/null
echo "=== BAN-03: Bounce easing ===" && grep -rEn "cubic-bezier\(.*-[0-9]|bounce|elastic" src/ --include="*.css" --include="*.scss" 2>/dev/null
echo "=== BAN-08: transition: all ===" && grep -rnE "transition:[[:space:]]*all([^a-zA-Z]|$)" src/ --include="*.css" --include="*.scss" --include="*.tsx" 2>/dev/null | head -10
echo "=== BAN-05: Pure black dark mode ===" && grep -rEn "#000000\b|rgb\(0,\s*0,\s*0\)" src/ --include="*.css" --include="*.scss" 2>/dev/null | head -5
echo "=== BAN-06: Disable zoom ===" && grep -rEn "user-scalable=no|maximum-scale=1" public/ src/ 2>/dev/null
echo "=== BAN-07: outline:none without replacement ===" && grep -rnE ":focus[[:space:]]*\{" src/ --include="*.css" --include="*.scss" 2>/dev/null | head -5

# SLOP signals (−1 each)
echo "=== SLOP-01: AI palette ===" && grep -rEn "#6366f1|#8b5cf6|#06b6d4" src/ 2>/dev/null | head -5
echo "=== SLOP-04: backdrop-filter ===" && grep -rnE "backdrop-filter:[[:space:]]*blur" src/ --include="*.css" --include="*.scss" 2>/dev/null | head -5

# Accessibility
echo "=== A11Y: focus rings ===" && grep -rEn "outline:\s*none|outline:\s*0" src/ --include="*.css" --include="*.scss" 2>/dev/null | head -5
echo "=== A11Y: reduced motion ===" && grep -rn "prefers-reduced-motion" src/ --include="*.css" --include="*.scss" 2>/dev/null | head -3
echo "=== A11Y: div onClick ===" && grep -rEn "onClick.*div|<div.*onClick" src/ --include="*.tsx" --include="*.jsx" 2>/dev/null | head -5
echo "=== A11Y: small font ===" && grep -rEn "font-size:\s*1[0-5]px|font-size:\s*[0-9]px" src/ --include="*.css" --include="*.scss" 2>/dev/null | head -5
```

For each finding: record the count, a sample file:line, and severity (BAN = P0, SLOP = P1, A11Y = P0–P1 depending on type).

---

## Step 6 — Component Inventory

If `--quick`, skip this step.

### Component pattern indicators

A bare `grep -rln "className" src/` produces false positives on type-only files, test files, utility helpers, and server-only modules — none of which are components. Instead, use a three-pass multi-signal filter. A file qualifies as a component only when **all three indicators** match:

1. Has a JSX-like return: `grep -lE "return\s*\(" <file>`
2. Has className or class attribute usage: `grep -lE "className=|class=" <file>`
3. Has a component framework import: `grep -lE "from ['\"](react|preact|vue)" <file>`

```bash
# Component inventory — three-pass filter (requires all three signals)

# Pass 1: files with JSX-like return statements
grep -rlE "return\s*\(" src/ --include="*.tsx" --include="*.jsx" 2>/dev/null \
  | grep -vE "\.test\.|\.spec\.|\.stories\." > /tmp/scan-pass1.txt

# Pass 2: intersect with className/class presence
grep -lE "className=|class=" $(cat /tmp/scan-pass1.txt) 2>/dev/null > /tmp/scan-pass2.txt

# Pass 3: intersect with framework import (react, preact, or vue)
grep -lE "from ['\"](react|preact|vue)" $(cat /tmp/scan-pass2.txt) 2>/dev/null > /tmp/components.txt

# Count and list
wc -l < /tmp/components.txt
cat /tmp/components.txt
```

This produces a component inventory that excludes false positives. The resulting file list is the authoritative component set for the rest of this step.

```bash
# Count components by directory (from the filtered list)
xargs dirname < /tmp/components.txt | sort | uniq -c | sort -rn | head -20

# Look for design system component patterns
grep -rEln "Button|Modal|Dialog|Toast|Tooltip|Badge|Card|Input|Select|Dropdown|Table|Tab|Accordion" \
  $(cat /tmp/components.txt) 2>/dev/null | grep -v node_modules | head -20
```

Identify:
- Core UI primitives that exist (Button, Input, Modal, etc.)
- Which have design system-level implementation vs. one-off styles
- Which are candidates for design system extraction

### --full mode per-file output

If `--full` flag is set, emit one row per file in the component inventory:

| File | Component Count | Styling Approach | Token Usage | Issues |
|------|-----------------|------------------|-------------|--------|
| src/components/Button.tsx | 1 | Tailwind | var(--primary), p-4, gap-2 | heading weight dup |
| src/components/Card.tsx | 1 | CSS Module | styles.card, rgb(...) | hardcoded color |

Columns:
- **File**: relative path from repo root
- **Component Count**: number of exported components in file (grep `export.*function\|export.*const.*=.*\(.*=>`)
- **Styling Approach**: `Tailwind` | `CSS Module` | `styled-components` | `inline` | `mixed`
- **Token Usage**: comma-separated tokens/values found (max 5, "+N more" if there are more)
- **Issues**: short flags for known problems (e.g., `hardcoded color`, `off-grid spacing`, `heading weight dup`)

Without `--full`, the component inventory is a summary count only (not per-file).

---

## Step 7 — Score All 7 Categories

Read `${CLAUDE_PLUGIN_ROOT}/reference/audit-scoring.md`. Score each category 0–10 based on what you found in Steps 1–6.

Apply the weighted formula:
```
Score = (Accessibility × 0.25) + (Visual Hierarchy × 0.20) + (Typography × 0.15)
      + (Color × 0.15) + (Layout × 0.10) + (Anti-Patterns × 0.10) + (Motion × 0.05)
```

Calculate grade (A=90–100, B=75–89, C=60–74, D=45–59, F=0–44).

---

## Step 8 — Generate Design Debt Roadmap

Collect all findings from Steps 1–6. Classify each:

| Severity | Code | Rule |
|---|---|---|
| Blocker | P0 | BAN violations, contrast failures, keyboard nav broken |
| Major | P1 | SLOP signals, no token layer, off-grid spacing, no scale system |
| Minor | P2 | Reflex font without reason, inconsistent weights, redundant colors |
| Cosmetic | P3 | Polish items, minor naming inconsistencies |

Group into **debt themes**:

1. **Foundation** — token layer, design system architecture
2. **Typography** — scale, hierarchy, families
3. **Color** — palette, semantics, dark mode
4. **Accessibility** — contrast, focus, semantics, motion
5. **Anti-Patterns** — BAN + SLOP removals
6. **Components** — inconsistency, missing primitives
7. **Motion** — easing, duration, reduced-motion

For each debt item, estimate effort:
- `XS` — single-line grep-and-replace (< 30 min)
- `S` — localized fix in 1–3 files (< 2h)
- `M` — affects 5–15 files, requires testing (2–8h)
- `L` — architectural change, touches 15+ files (1–3 days)
- `XL` — design system rebuild (3+ days)

### Priority score for ordering DESIGN-DEBT.md entries

Each debt item gets three scores:

- **severity_weight**: `{ P0: 4, P1: 3, P2: 2, P3: 1 }`
- **effort_weight**: `{ XS: 5, S: 4, M: 3, L: 2, XL: 1 }` — high effort = lower priority
- **dependency_depth**: count of other debt items this fix unblocks

Formula:

```
priority_score = (severity_weight × effort_weight) + (dependency_depth × 2)
```

Ordering rules:
1. Sort entries by `priority_score` descending (highest first)
2. Tiebreak: file count descending (more files affected = more impact)
3. Second tiebreak: alphabetical by item ID (D-001 before D-002)

Example: A P1 issue (`severity_weight = 3`) with S effort (`effort_weight = 4`) that unblocks 2 other items (`dependency_depth = 2`) scores: `(3 × 4) + (2 × 2) = 16`. A P0 issue (`4`) with XL effort (`1`) with no dependencies scores: `(4 × 1) + 0 = 4`. The P1 ranks above the P0 despite lower severity because its XL effort makes the P0 low ROI.

Identify **quick wins**: P1 issues with XS/S effort — these have the best ROI.
Identify **blocking dependencies**: fixes that must happen before others (e.g., token layer before dark mode).

---

## Output 1: DESIGN.md

Write `DESIGN.md` at the project root:

```markdown
---
generated: [ISO 8601]
tool: ultimate-design scan
score: [N]/100 ([grade])
framework: [name]
css_approach: [tailwind | css-modules | styled-components | plain-css | mixed]
token_layer: true | false
---

# Design System Snapshot — [Project Name]

> Auto-generated by ultimate-design scan. Update manually when the system evolves.

## Current Score

| Category | Score | Grade |
|---|---|---|
| Accessibility | [N]/10 | |
| Visual Hierarchy | [N]/10 | |
| Typography | [N]/10 | |
| Color | [N]/10 | |
| Layout & Spacing | [N]/10 | |
| Anti-Patterns | [N]/10 | |
| Motion | [N]/10 | |
| **Weighted Total** | **[N]/100** | **[grade]** |

## Color System

**Token layer:** [Yes — CSS custom properties / No — raw values in components]

**Palette inventory:**
| Color | Hex | Role | Occurrences | Issues |
|---|---|---|---|---|
| Primary | #[hex] | [inferred role] | [N] | [any issues] |

**Semantic consistency:** [Pass / Fail — describe]
**Dark mode:** [Yes / No / Partial] — [pure black: yes/no]
**AI-slop palette present:** [Yes (#6366f1 etc.) / No]

## Typography System

**Families used:** [family 1], [family 2]
**Scale:** [defined modular scale / ad-hoc px values / Tailwind defaults]

| Token | Size | Found occurrences | Scale-compliant |
|---|---|---|---|
| body | [Npx] | [N] | [✓/✗] |
| sm | [Npx] | [N] | [✓/✗] |

**Line-height body:** [value] ([pass ≥1.5 / fail])
**Weight hierarchy:** [described]
**Off-scale values found:** [list any non-standard sizes]

## Spacing System

**Grid:** [8pt / 4pt / ad-hoc / Tailwind defaults]
**Non-grid values found:** [list off-grid values with occurrence count]

## Component Inventory

**Total components:** [N]
**With consistent styling:** [N] (~[N]%)
**Core primitives present:** [Button ✓, Input ✓, Modal ✗, Toast ✗, ...]

## Anti-Pattern Status

| Pattern | Status | Occurrences | Locations |
|---|---|---|---|
| BAN-01: Side-stripe border | [✓ Clear / ✗ Found] | [N] | [file:line] |
| BAN-02: Gradient text | [✓ Clear / ✗ Found] | [N] | |
| BAN-03: Bounce easing | [✓ Clear / ✗ Found] | [N] | |
| BAN-07: outline:none | [✓ Clear / ✗ Found] | [N] | |
| BAN-08: transition:all | [✓ Clear / ✗ Found] | [N] | |
| SLOP-01: AI palette | [✓ Clear / ✗ Found] | [N] | |
| SLOP-04: backdrop-filter | [✓ Clear / ✗ Found] | [N] | |

## Motion / Animation

**prefers-reduced-motion:** [Implemented / Missing]
**Easing used:** [list found easing values]
**Bounce/elastic:** [Found / None]
```

---

## Output 2: .design/DESIGN-DEBT.md

Create `.design/` if needed. Write `.design/DESIGN-DEBT.md`:

```markdown
---
generated: [ISO 8601]
score: [N]/100 ([grade])
p0_count: [N]
p1_count: [N]
p2_count: [N]
p3_count: [N]
---

# Design Debt — [Project Name]

> Prioritized roadmap of design issues found by ultimate-design scan.
> Fix P0s before shipping. Work through P1s in priority order.
> Quick wins (P1 + XS/S effort) are marked ⚡.

## Summary

| Severity | Count | Est. Total Effort |
|---|---|---|
| P0 Blocker | [N] | [sum of estimates] |
| P1 Major | [N] | [sum] |
| P2 Minor | [N] | [sum] |
| P3 Cosmetic | [N] | [sum] |

**Category score to improve first:** [lowest-scoring category] ([N]/10) — highest impact on overall score.

---

## P0 — Blockers (fix before shipping)

### D-001 — [Issue title]
Category: [scoring category]
Theme: [foundation | typography | color | accessibility | anti-patterns | components | motion]
Severity: [P0/P1/P2/P3]
Effort: [XS/S/M/L/XL]
priority_score: [computed: (severity_weight × effort_weight) + (dependency_depth × 2)]
Description: [What the issue is and where it was found]
Evidence: [file:line or grep pattern that found it]
Fix: [Concrete steps to fix — specific enough to execute without extra research]
Acceptance: [What pass looks like — verifiable]
Depends on: [D-XXX if this fix requires another fix first, else "none"]
Dependency depth: [N — count of items this fix unblocks]

---

## P1 — Major (fix in current design pass)

### D-010 — [Issue title] ⚡
Category: [category]
Theme: [theme]
Severity: P1
Effort: XS
priority_score: [computed: (3 × 5) + (dependency_depth × 2) = 15+]
Description: [...]
Evidence: [...]
Fix: [...]
Acceptance: [...]
Dependency depth: [N]

---

## P2 — Minor (fix if time allows)

[same structure]

---

## P3 — Cosmetic (deferred to polish pass)

[same structure]

---

## Recommended Fix Order

Based on dependencies and ROI:

1. **[D-XXX]** — [title] (unblocks [D-XXX, D-XXX])
2. **[D-XXX]** — ⚡ quick win
3. **[D-XXX]** — [title]
...

## Pipeline Recommendation

Given the scan results:

```
Suggested first pipeline run:
  /ultimate-design:discover --auto
    → Will use DESIGN.md as baseline context
  /ultimate-design:plan
    → Scope: address all P0s + top 5 P1s
  /ultimate-design:design
  /ultimate-design:verify
    → Target score: [current + 15 points minimum]
```

Focus areas for first design pass:
1. [highest-impact category]: [specific what to fix]
2. [second-highest-impact]: [specific what to fix]
3. Quick wins: [D-XXX], [D-XXX], [D-XXX] (all XS effort, instant score gain)
```

---

## After Writing

```
━━━ Scan complete ━━━
Project:  [name]
Score:    [N]/100 ([grade])
P0 blockers:  [N]
P1 major:     [N]
Quick wins:   [N] (P1 + XS/S effort)

Artifacts written:
  DESIGN.md           — design system snapshot
  .design/DESIGN-DEBT.md — prioritized debt roadmap

Next steps:
  Option A — Start the pipeline:
    /ultimate-design:discover
    (DESIGN.md will be used as baseline context)

  Option B — Fix quick wins first, then start:
    [list top 3 quick win fixes inline]
    Then: /ultimate-design:discover

  Option C — Just reference the debt:
    DESIGN-DEBT.md is your backlog. Filter by theme or severity.
━━━━━━━━━━━━━━━━━━━━━
```
