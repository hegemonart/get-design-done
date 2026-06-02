---
name: gdd-list-assumptions
description: "Surfaces hidden design assumptions baked into the codebase before planning — pattern-based detection plus user-surfaced items."
argument-hint: "[--area typography|color|layout|motion|a11y]"
tools: Read, Grep, Glob
disable-model-invocation: true
---

# /gdd:list-assumptions

**Role:** Surface implicit design assumptions that were never explicitly decided. Output a numbered list tagging each as `[EXPLICIT]` (found in STATE.md/DESIGN-CONTEXT.md decisions) or `[IMPLICIT]` (inferred from code patterns).

## Step 1 — Read explicit decisions

Read `.design/STATE.md` `<decisions>` and `.design/DESIGN-CONTEXT.md` (if present). Collect every D-XX as `[EXPLICIT]` entries keyed by category.

## Step 2 — Scan codebase for implicit patterns

If `--area <name>` is given, restrict to that area. Otherwise scan all.

**Layout**
- Grep for `@media` queries → "Is mobile-first or desktop-first assumed?"
- Grep for `grid-template`, `flex-direction` → "Is F-pattern or Z-pattern layout assumed?"

**Typography**
- Grep for `font-family` declarations → "Does the chosen font stack assume brand acceptance?"
- Grep for `font-size: [0-9]+px` with varying values → "Is a modular scale assumed or ad-hoc sizing?"

**Color**
- Grep for hex literals `#[0-9a-fA-F]{3,8}` → "Is the palette assumed to be fixed without a token layer?"

**Motion**
- Grep for `@keyframes`, `transition`, `animate` → "Does the brand tolerate animation?"
- Grep for `prefers-reduced-motion` → "Is reduced-motion honored or assumed ignored?"

**A11y**
- Grep for `aria-`, `role=`, `alt=` coverage → "Is WCAG AA the target, or AAA?"
- Grep for `outline: none`, `outline: 0` → "Are focus rings intentionally removed?"

For each hit, emit `Detected assumption: [pattern] at [file:line]` and flag as `[IMPLICIT]`.

## Step 3 — Output

```
━━━ Design assumptions ━━━

Typography
  01 [EXPLICIT] D-03: Font family Inter
  02 [IMPLICIT] 18 px font-size values found — scale not explicit (src/Card.css:12, ...)

Color
  03 [IMPLICIT] 47 hex literals — no token layer (see /gdd:discuss color)

...

N assumptions total — M implicit.
Next: /gdd:discuss --all to resolve implicit ones.
━━━━━━━━━━━━━━━━━━━━━━━━
```

## LIST-ASSUMPTIONS COMPLETE
