---
name: discover
description: "Stage 1 of the Ultimate Design pipeline. Reads existing project files, runs a baseline design audit, conducts a structured discovery interview to capture scope/audience/goals/brand/references/constraints, identifies gray areas, and produces DESIGN-CONTEXT.md. Use --auto to infer all answers from code without questions."
argument-hint: "[--auto]"
user-invocable: true
---

# Ultimate Design — Discover

**Stage 1 of 4.** Produces `.design/DESIGN-CONTEXT.md`.

---

## Step 0 — Pre-Read (always do this first)

Before asking a single question, read everything available:

| What to read | Extract |
|---|---|
| `.design/DESIGN-CONTEXT.md` | If exists and complete → ask to resume or restart |
| `README.md` | Project name, description, target users |
| `package.json` | Framework, dependencies, existing design tools |
| `tailwind.config.*` | Color tokens, font config, spacing overrides |
| `src/styles/` or `styles/` | CSS custom properties, design tokens |
| `src/components/` (sample 5–8 files) | Component patterns, current UI approach |
| Any `*.figma`, `.tokens.json`, `design-tokens.*` | Existing design system constraints |
| `DESIGN.md` or `BRAND.md` | Pre-existing brand documentation |

**Synthesize before interviewing.** After reading, you should already know:
- What framework and CSS approach is in use
- Whether there's an existing design system or it's ad-hoc
- Whether there are obvious violations (wrong contrast, no focus rings, bounce easing, etc.)

---

## Step 1 — Baseline Audit

Run a quick automated audit against the codebase. This becomes the "before" score in Verify.

Read `${CLAUDE_PLUGIN_ROOT}/reference/audit-scoring.md` for the scoring framework.
Read `${CLAUDE_PLUGIN_ROOT}/reference/anti-patterns.md` for grep patterns.

**Run these checks:**

```bash
# Anti-pattern grep (BAN violations — −3 each from Anti-Pattern score)
grep -rn "border-left:\s*[2-9]" src/ --include="*.css" --include="*.scss" --include="*.tsx" --include="*.ts" 2>/dev/null | head -5
grep -rn "background-clip:\s*text\|text-fill-color:\s*transparent" src/ 2>/dev/null | head -5
grep -rn "transition:\s*all" src/ 2>/dev/null | head -5
grep -rn "user-scalable=no\|maximum-scale=1" public/ 2>/dev/null | head -5
grep -rn ":focus\s*{" src/ 2>/dev/null | head -5

# SLOP signals (−1 each)
grep -rn "#6366f1\|#8b5cf6\|#06b6d4" src/ 2>/dev/null | head -5
grep -rn "backdrop-filter:\s*blur" src/ 2>/dev/null | head -5

# Accessibility basics
grep -rn "font-size:\s*1[0-5]px\|font-size:\s*[0-9]px" src/ 2>/dev/null | head -5
grep -rn "outline:\s*none\|outline:\s*0" src/ 2>/dev/null | head -5
```

Score each category 0–10 using the rubric in `reference/audit-scoring.md`. Calculate the weighted total. This is `baseline_score`.

If you can't run bash or there's no `src/` directory, score each category as "?" and note "manual audit required."

---

## Step 2 — Discovery Interview

Work through areas below. Ask each as ONE focused question, not a sub-list. Skip any area where reading files gave you a clear answer — state what you inferred and let the user correct it.

**Save after each confirmed answer** — write `.design/DESIGN-CONTEXT.md` incrementally (partial status) so a crash doesn't lose work.

---

### Area 1 — Scope

> What exactly are we designing? (new page, existing component audit, design system tokens, full product redesign, specific flow?)

Clarify: is this new work, a redesign, an audit, or a handoff?

Also determine: which files/directories are in scope. If the user says "the dashboard", identify the specific files.

---

### Area 2 — Audience

> Who is the primary user? One sentence: their role, skill level, and usage context.

Examples:
- "Senior engineers at B2B SaaS companies, using the dashboard for 4+ hours daily on desktop"
- "Non-technical founders, occasional users, primarily on mobile"
- "Internal ops team, 15 users, power users who know every shortcut"

If inferred from README, state the inference and ask for correction.

---

### Area 3 — Goals (Observable Outcomes)

> What does success look like? Name 1–3 observable, measurable outcomes.

Push for specificity. Reject vague goals:
- ✗ "looks better" → ✓ "passes WCAG AA contrast on all text"
- ✗ "feels more modern" → ✓ "headline typography has a clear scale system, not ad-hoc sizes"
- ✗ "cleaner layout" → ✓ "spacing uses an 8pt grid with no arbitrary px values"

Record as G-01, G-02, G-03.

---

### Area 4 — Brand Direction

> Pick 3 words that describe how this should feel — and name one thing it must NOT look like.

**Reject generic words** — push back on: "modern", "clean", "elegant", "professional", "minimal", "friendly". These describe nothing.

**Push for specific**: "brutalist editorial", "pharmaceutical precision", "warm developer tool", "soviet constructivist data", "archival research tool", "luxury B2B", "indie hacker gritty".

The NOT is equally important:
- "NOT a Tailwind UI template clone"
- "NOT another purple-gradient AI product"
- "NOT enterprise blue and gray"

---

### Area 5 — Visual References

> Name 2–3 sites, apps, or aesthetic references to draw from. Competitors, design inspiration, or "this vibe from another industry entirely."

For each reference:
1. If refero MCP is available: call `refero_search_screens` with the reference name. Log results as R-01, R-02, etc. Note the URL and a short description of what specifically to borrow.
2. If no refero: search `~/.claude/libs/awesome-design-md/` for matching DESIGN.md files. List found matches.
3. If neither: record the reference name and ask the user to describe what specifically they want to borrow from it.

Log each as R-01, R-02, etc. For each: title, source, and specifically what to take from it (color approach? layout? typography? density? interaction pattern?).

---

### Area 6 — Constraints

> Any hard constraints? List them:

- Framework / CSS approach (already inferred from files — confirm)
- Existing design tokens that cannot change
- Accessibility level (WCAG AA minimum by default — AAA if specified)
- Device targets (desktop-primary, mobile-first, or responsive equal priority)
- Browser support requirements
- Performance constraints (animation budget, bundle size)
- Deadline

Record as C-01, C-02, etc.

---

### Area 7 — Gray Areas (Explicit Decisions Required)

Based on what you've read and discussed, identify questions that have no clear answer yet and where the wrong choice would be costly to reverse. These are **gray areas** that need explicit sign-off before planning.

Format each as:
```
GRAY-01: [Question]
Options: [A] vs [B] vs [C]
Stakes: [What happens if we choose wrong]
Recommendation: [Your recommendation and why]
```

Example gray areas:
- "Should we keep the existing component structure and only restyle, or rebuild components from scratch? (Stakes: rebuild touches 40+ files; restyle is safer but may leave structural issues)"
- "The current color system uses raw hex values with no token layer. Should we introduce CSS custom properties as part of this pass? (Stakes: tokenization is a dependency for dark mode and theming later)"
- "Current font is Inter. Should we change it? (Stakes: font change ripples through all text sizing — risky mid-project)"

Ask the user to resolve each gray area before proceeding to writing the context file.

---

## Auto Mode

If `$ARGUMENTS` contains `--auto`:
- Skip all interview questions
- Infer all answers from project files
- Apply defaults for anything not found:
  - Scope: "Full design quality audit and improvement pass"
  - Audience: inferred from README (if not found: "professional users on desktop")
  - Brand: "Clear, purposeful, not generic SaaS"
  - References: none
  - Constraints: inferred from package.json
- Identify gray areas automatically based on file reading, resolve them with conservative defaults
- Skip gray area sign-off
- Write DESIGN-CONTEXT.md immediately

---

## Step 3 — Design Direction Statement

After all areas are confirmed, synthesize and present for sign-off:

```
━━━ Design Direction ━━━

Direction: [one-sentence characterization — what this design is trying to be]

Tone: [word] · [word] · [word]
NOT: [the thing to explicitly avoid]

Decisions locked:
  D-01: [Typography: e.g., "Move from ad-hoc px sizes to a 1.25 modular scale based at 16px"]
  D-02: [Color: e.g., "Replace AI-default indigo palette with warm ochre primary + slate neutrals"]
  D-03: [Layout: e.g., "Enforce 8pt grid — audit and fix all spacing values not in the 4/8/12/16/24/32/48/64 series"]

References to draw from:
  R-01: [Title] — borrow: [what specifically]
  R-02: [Title] — borrow: [what specifically]

Gray areas resolved:
  GRAY-01: [Decision made]

Baseline design score: [N]/100 ([grade])
  Key issues found: [top 3 auto-detected problems]

Does this direction feel right? Any adjustments?
━━━━━━━━━━━━━━━━━━━━━━━━
```

Iterate until the user confirms. Then write the artifact.

---

## Output: DESIGN-CONTEXT.md

Create `.design/` directory if needed. Write `.design/DESIGN-CONTEXT.md`:

```markdown
---
project: [name]
created: [ISO 8601]
status: complete
baseline_score: [N]/100
baseline_grade: [A/B/C/D/F]
---

<domain>
[What's in scope. Specific files/directories if relevant.]
</domain>

<audience>
Primary: [one sentence]
Usage context: [when/where/how long they use the interface]
Skill level: [novice / intermediate / expert / mixed]
</audience>

<goals>
G-01: [Observable, verifiable success outcome]
G-02: [...]
G-03: [...]
</goals>

<brand>
Direction: [one sentence characterization]
Tone: [word] · [word] · [word]
NOT: [what to explicitly avoid looking like]
Existing signals: [any locked brand tokens, fonts, colors that cannot change]
</brand>

<references>
R-01: [Title] — [source] — borrow: [specific element]
R-02: [...]
</references>

<decisions>
D-01: [Category: Typography] [Concrete decision] — [rationale, why this not the alternative]
D-02: [Category: Color] [...]
D-03: [Category: Layout] [...]
</decisions>

<gray_areas_resolved>
GRAY-01: [Question] → Decision: [what was decided] — [reason]
</gray_areas_resolved>

<constraints>
C-01: Framework: [framework name]
C-02: CSS approach: [Tailwind / CSS modules / styled-components / etc.]
C-03: Accessibility: WCAG 2.1 AA (minimum)
C-04: [other constraints]
</constraints>

<canonical_refs>
[Files downstream agents must read before working]
- package.json
- tailwind.config.ts (if exists)
- src/styles/ (design tokens)
- [specific component files identified as in-scope]
- ${CLAUDE_PLUGIN_ROOT}/reference/anti-patterns.md
- ${CLAUDE_PLUGIN_ROOT}/reference/typography.md
- ${CLAUDE_PLUGIN_ROOT}/reference/accessibility.md
- ${CLAUDE_PLUGIN_ROOT}/reference/audit-scoring.md
- ${CLAUDE_PLUGIN_ROOT}/reference/motion.md
- ${CLAUDE_PLUGIN_ROOT}/reference/heuristics.md
</canonical_refs>

<baseline_audit>
| Category | Score | Notes |
|---|---|---|
| Accessibility | [N]/10 | [key issues found] |
| Visual Hierarchy | [N]/10 | [key issues found] |
| Typography | [N]/10 | [key issues found] |
| Color | [N]/10 | [key issues found] |
| Layout & Spacing | [N]/10 | [key issues found] |
| Anti-Patterns | [N]/10 | [violations found] |
| Motion | [N]/10 | [key issues found] |
| **Weighted Total** | **[N]/100** | **[Grade]** |

Key violations:
- [BAN/SLOP code]: [description] — [file:line if found]
</baseline_audit>

<must_haves>
[Observable outcomes that must be true after the Design stage.
Written as user-verifiable statements, not process steps.]
- Color contrast passes WCAG 2.1 AA on all text elements
- Spacing values come from the 4/8/12/16/24/32/48/64 series only
- No BAN violations from reference/anti-patterns.md remain in codebase
- Typography uses a defined modular scale — no arbitrary px values
- [Goal-derived must-haves from G-01, G-02, G-03]
</must_haves>

<deferred>
[Good ideas surfaced during discovery but explicitly out of scope for this pass]
</deferred>
```

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
