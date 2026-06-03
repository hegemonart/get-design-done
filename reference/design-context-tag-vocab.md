---
name: design-context-tag-vocab
type: reference
version: 1.0.0
phase: 52
tags: [design-context, knowledge-graph, tags, vocabulary, controlled-vocab]
last_updated: 2026-06-03
---

# DesignContext Tag Vocabulary

This is the controlled vocabulary the DesignContext validator checks node `tags[]` against. A tag
outside this list is a soft warning, not a hard error, so a mapper can ship a new tag and the
graph still loads; the warning prompts a reviewer to either fix the tag or add it here.

## Source of truth

The canonical list lives in code, in the `TAG_VOCAB` set inside
`scripts/validate-design-context.cjs`. That set is what the validator enforces. This document
mirrors it for human readers and groups the tags by concern. When the set changes, update this
file by hand to match. If the two ever disagree, the code wins.

## Why a controlled vocabulary

Free-form tags drift: one node says `darkmode`, another `dark-mode`, a third `dark`. A query for
`dark-mode` then misses two of three. A controlled list keeps tags queryable and keeps the
`nodes(graph, { tag })` filter reliable. The list is deliberately broad rather than minimal, so
most real tags land inside it; the soft-warning behavior absorbs the rest without blocking a build.

## Tags by concern

The groupings below are for reading only. The validator treats the vocabulary as one flat set, so
a tag is valid regardless of which group it sits in.

- **Color**: `color`, `palette`, `theme`, `dark-mode`, `light-mode`, `contrast`, `gradient`,
  `surface`, `brand`.
- **Spacing and sizing**: `spacing`, `sizing`, `density`, `gap`, `inset`, `stack`.
- **Typography**: `typography`, `font`, `type-scale`, `heading`, `body-text`, `label`, `numeric`.
- **Radius, shape, elevation**: `radius`, `shape`, `border`, `shadow`, `elevation`, `depth`.
- **Motion**: `motion`, `transition`, `animation`, `easing`, `duration`, `enter`, `exit`, `loop`,
  `gesture`.
- **Accessibility**: `a11y`, `aria`, `focus`, `keyboard`, `screen-reader`, `reduced-motion`,
  `contrast-safe`, `touch-target`.
- **Layout and structure**: `layout`, `grid`, `flex`, `responsive`, `breakpoint`, `container`,
  `overflow`, `position`, `z-index`.
- **Interaction state**: `state`, `hover`, `active`, `disabled`, `loading`, `error`, `success`,
  `selected`, `pressed`, `dragging`.
- **Component taxonomy**: `atom`, `molecule`, `organism`, `template`, `primitive`, `composite`,
  `layout-primitive`.
- **Forms and inputs**: `form`, `input`, `control`, `validation`, `field`.
- **Navigation and structure**: `navigation`, `overlay`, `modal`, `menu`, `tabs`, `data-display`,
  `feedback`, `media`.
- **Semantic role**: `interactive`, `static`, `decorative`, `destructive`, `utility`.
- **Quality flags**: `deprecated`, `experimental`, `stable`, `anti-pattern`, `review-needed`.

## Machine-readable list

The fenced block below is the same vocabulary as a flat list for any tool that wants to read the
doc instead of the code. Tokens are separated by commas or newlines (split on `/[\s,]+/`), so the
grouping into lines is cosmetic. It must stay equal to the `TAG_VOCAB` set in
`scripts/validate-design-context.cjs`.

```text
color, palette, theme, dark-mode, light-mode, contrast, gradient, surface, brand,
spacing, sizing, density, gap, inset, stack,
typography, font, type-scale, heading, body-text, label, numeric,
radius, shape, border, shadow, elevation, depth,
motion, transition, animation, easing, duration, enter, exit, loop, gesture,
a11y, aria, focus, keyboard, screen-reader, reduced-motion, contrast-safe, touch-target,
layout, grid, flex, responsive, breakpoint, container, overflow, position, z-index,
state, hover, active, disabled, loading, error, success, selected, pressed, dragging,
atom, molecule, organism, template, primitive, composite, layout-primitive,
form, input, control, validation, field,
navigation, overlay, modal, menu, tabs, data-display, feedback, media,
interactive, static, decorative, destructive, utility,
deprecated, experimental, stable, anti-pattern, review-needed
```

## Cross-references

- The node and edge type catalogue and the four shapes: see `./design-context-schema.md`.
- The validator that enforces this vocabulary: `scripts/validate-design-context.cjs`.
