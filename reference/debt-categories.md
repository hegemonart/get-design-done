---
name: debt-categories
type: reference
version: 1.0.0
phase: 48
tags: [debt, taxonomy, audit, crawler, priority-scoring, retroactive, aesthetic-slop, anti-slop]
last_updated: 2026-06-03
---

# Debt Categories

The taxonomy `agents/design-debt-crawler.md` uses to classify and rank design debt
found across an entire codebase. Each class has a definition, the detection signal
that surfaces it, and the typical fix shape. The priority model at the end converts
every finding into one comparable score so the catalog reads top to bottom by impact.

This taxonomy is detection-oriented, not a style guide. The reason behind each rule
lives in `reference/anti-patterns.md` (the BAN-NN and SLOP-NN catalog) and the domain
references `reference/color.md`, `reference/typography.md`, and `reference/spatial.md`.
This file is the catalog of what to look for and how to weigh it.

---

## Debt Classes

### color-literal

**Definition:** A raw color value written directly in source instead of a token
reference. Includes `#rgb` / `#rrggbb` / `#rrggbbaa` hex, `rgb()` / `rgba()`, and
`hsl()` / `hsla()` function literals that flow to a rendered surface.
**Detection signal:** Grep for `#[0-9a-fA-F]{3,8}`, `rgb\(`, `rgba\(`, `hsl\(`,
`hsla\(` in source files. Exclude token-definition files (the palette source itself)
and comments. A literal inside a `var(--token: #hex)` definition is the token, not debt.
**Fix shape:** Replace the literal with the matching semantic token. If no token
exists for that role, the fix is to define one first.

### untokenized-component

**Definition:** A component file that renders visual surface (color, spacing, type
size) using inline values or arbitrary utility classes rather than referencing the
design system's tokens or scale.
**Detection signal:** A component file (`.tsx` / `.jsx` / `.vue` / `.svelte`) that
contains color-literal or arbitrary-bracket utility hits (`\[[0-9]+px\]`,
`\[#[0-9a-f]+\]`) and zero `var(--` references or scale-class references. The ratio
of literal uses to token uses inside one file is the strength signal.
**Fix shape:** Route the component's visual values through tokens and the spacing
or type scale; remove the arbitrary brackets.

### anti-pattern

**Definition:** A confirmed instance of a banned construct (BAN-NN) or an AI-slop
tell (SLOP-NN) from `reference/anti-patterns.md`.
**Detection signal:** Run `hone-detect <path> --json`. Each finding carries its
`ruleId`, `file`, `line`, and a link back to the matching paragraph. The detector
covers the statically matchable BAN rules; the two subjective rules it cannot match
(BAN-04 keyboard-action animation, BAN-10 nested equal radius) are noted as a
manual-review item, not auto-counted.
**Fix shape:** Apply the rule's documented rewrite. Hard bans take precedence over
SLOP tells when both touch the same element.

### contrast

**Definition:** A foreground and background pairing that falls below the WCAG 2.1 AA
contrast floor (4.5:1 for body text, 3:1 for large text and non-text indicators).
**Detection signal:** Resolve text-color and background-color pairs that share an
element or selector, compute the ratio, and flag pairs under the threshold. Pairs
built from unresolvable runtime values are a manual-review item.
**Fix shape:** Adjust the token or the role assignment so the pair clears AA. Never
rely on color alone to carry meaning; pair it with text or an icon.

### density-spacing

**Definition:** Spacing values that sit off the project's modular scale (for example
the 4 / 8 / 12 / 16 / 24 / 32 series), or inconsistent density between sibling
components that should share rhythm.

**Detection signal:** Collect every padding, margin, and gap value, then flag values
that are not on the declared scale and clusters where neighboring components use
different step counts for the same structural role.

**Fix shape:** Snap off-grid values to the nearest scale step; align sibling density.

### typography-drift

**Definition:** Font sizes, weights, or families that drift from a systematic type
scale: arbitrary pixel sizes, more than the agreed family count, or weight choices
that break the heading-to-body hierarchy.

**Detection signal:** Tally the distinct font-size and font-weight values and the
family count. A long tail of one-off sizes, more than two families, or `font-weight`
under 400 on small text are the drift markers.

**Fix shape:** Map each one-off value onto the nearest scale step; cap families at two.

### a11y-text

**Definition:** Text-content accessibility debt: missing `alt` on meaningful images,
icon-only controls without an accessible name, placeholder used as the only label,
and generic or developer-facing copy in empty and error states.

**Detection signal:** Grep for `<img` without `alt`, interactive elements without
`aria-label` or visible text, inputs with `placeholder` and no `<label>`, and
empty-state strings such as "No data" or raw error codes.

**Fix shape:** Add the accessible name or label; rewrite generic copy to be specific
and actionable. Copy-quality detail lives in `reference/copy-quality.md`.

### aesthetic-slop

**Definition:** Work that reads as generically AI-default even when the pillar audit
passes: template copy, the default palette and typeface used without a decision, stock
scenes and placeholder content, flat competing hierarchy, and density inflated to fill
space. This is the orthogonal verb-axis lens from `reference/anti-slop-rubric.md`, not a
pillar failure. A surface can clear contrast, typography, and spacing and still be
aesthetic-slop because nothing about it is chosen.
**Detection signal:** The five verb axes (Directness, Distinctness, Hierarchy,
Authenticity, Density) scored 1-10 each by `agents/design-auditor.md`, with the sum
`< 35` of 50, corroborated by matches in `reference/visual-tells.md` (for example
`stock-photo-people`, `badge-spam`, `oversized-single-word`,
`motion-without-content-intent`, `narrator-from-a-distance-UI`, or the v1 tells). Record
the per-axis `verb_axes_scored` values and the matched tell categories as evidence.
**Fix shape:** Address the lowest axes first: write specific copy, route color and type
through documented tokens, establish one focal point, replace stock and placeholder with
real content, and size density to the content. This is usually a redesign-leaning effort,
not a one-line swap, so it scores low on the effort factor below.

---

## Priority Scoring Model

Every finding gets one priority score so the catalog ranks by impact, not by the
order files were walked. Three ordinal factors combine, each on a 1 to 3 scale.

**Visible-delta** (how much a user notices the fix):

| Value | Meaning |
|-------|---------|
| 3 | Changes a primary surface a user sees on first load |
| 2 | Changes a secondary or interior surface |
| 1 | Invisible at rest; shows only in an edge state or to assistive tech |

**Effort** (how cheap the fix is; cheaper scores higher so quick wins float up):

| Value | Meaning |
|-------|---------|
| 3 | Mechanical one-line swap (literal to token) |
| 2 | Localized edit across a single component |
| 1 | Needs a new token, scale decision, or cross-file refactor |

**Prevalence** (how many instances share this root cause):

| Value | Meaning |
|-------|---------|
| 3 | Ten or more instances of the same finding |
| 2 | Three to nine instances |
| 1 | One or two instances |

**Combine** by multiplying the three factors:

```
priority = visible-delta × effort × prevalence
```

The product ranges from 1 (low) to 27 (high). Sort the catalog by `priority`
descending so the highest-impact, lowest-cost, most-widespread debt sits at the top.
On ties, break by visible-delta first, then prevalence. Record the three factors next
to the score in each catalog row so the ranking is auditable, not opaque.
