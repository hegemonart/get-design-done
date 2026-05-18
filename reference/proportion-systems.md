---
name: proportion-systems
type: layout
version: 1.0.0
phase: 28
tags: [proportion, spacing, baseline-grid, vertical-rhythm, modular-scale]
last_updated: 2026-05-18
---

# Proportion Systems — Whole-UI Modular Relationships

The existing [typography reference](./typography.md) covers the modular type scale — base 16px, a ratio (1.250 Major Third, 1.333 Perfect Fourth, 1.414 √2, 1.618 φ), and the geometric ladder of font sizes that scale produces. That ladder is one slice of a larger system. A proportion system is the rule that *every* dimension in the UI — type, spacing between elements, sizing of icons and avatars, and corner radius on components — derives from a single underlying unit and a small set of multipliers, so that values across the four systems land on the same grid and visibly belong to the same composition.

This file exists because that whole-UI view is undocumented today: [design-system-guidance.md](./design-system-guidance.md) mentions 8pt spacing in passing, [style-vocabulary.md](./style-vocabulary.md) cites "8pt spacing grid" as a Flat Design 2.0 marker, and `typography.md` owns the type-scale slice — but nothing ties them together. An agent that picks `padding: 12px` next to body text at `16/24` on an 8pt grid is breaking proportion silently, because the cross-system relationship was never stated. This is the file an agent should consult any time it is *constructing* the underlying grid of a UI — choosing a baseline unit, deriving a spacing ladder, deciding whether icon-md should be 20px or 24px, or auditing why a layout "feels off" despite each token being internally consistent.

The jump this file closes is from *"we use a modular type scale"* to *"we use a coherent proportion system across type + spacing + sizing + radius — the whole UI snaps to one grid."*

## Baseline Grid Systems

A baseline grid is the invisible underlying structure every dimension snaps to. It is one number — `4`, `8`, or `1.414` — and the rule that no value in the UI may be authored that is not a multiple of that number. The grid is not a layout grid (columns and gutters); it is the smallest atomic unit out of which both the column grid and every spacing / sizing / radius token are composed. Three baselines dominate: 4pt, 8pt, and √2. Pick one for the whole product; do not mix.

### 4pt Grid

When it fits: dense data UIs where rows must be visually compact (trading terminals, observability dashboards, IDE-style tooling, spreadsheet-derived layouts). The 4pt unit lets you author 12px / 20px / 28px row heights that an 8pt grid forbids, which matters when 10–20 horizontal rows need to fit above the fold. The cost is that fine increments invite drift — without strict review, a team will quickly have `13px`, `15px`, and `17px` in production.

```css
/* 4pt grid — dense data UI */
:root {
  --grid-unit: 4px;

  --space-1: calc(var(--grid-unit) * 1);  /* 4px  */
  --space-2: calc(var(--grid-unit) * 2);  /* 8px  */
  --space-3: calc(var(--grid-unit) * 3);  /* 12px */
  --space-4: calc(var(--grid-unit) * 4);  /* 16px */
  --space-5: calc(var(--grid-unit) * 5);  /* 20px */
  --space-6: calc(var(--grid-unit) * 6);  /* 24px */
  --space-7: calc(var(--grid-unit) * 7);  /* 28px */
  --space-8: calc(var(--grid-unit) * 8);  /* 32px */
}

.data-row {
  height: var(--space-7);                 /* 28px — on-grid */
  padding-inline: var(--space-3);         /* 12px — on-grid */
}
```

### 8pt Grid

When it fits: product UI, marketing surfaces, default for most consumer apps. Material Design, iOS Human Interface Guidelines, and the majority of modern design systems converge on 8pt because the unit is large enough to prevent drift (no one accidentally authors 9px) yet small enough to express every meaningful step. Half-units (4px) are permitted only at the smallest scale (icon padding, single-character chip insets) and are explicitly named — never freehand.

```css
/* 8pt grid — product UI default */
:root {
  --grid-unit: 8px;

  --space-0\.5: 4px;                      /* explicit half-unit — only for chip insets */
  --space-1: calc(var(--grid-unit) * 1);  /* 8px  */
  --space-2: calc(var(--grid-unit) * 2);  /* 16px */
  --space-3: calc(var(--grid-unit) * 3);  /* 24px */
  --space-4: calc(var(--grid-unit) * 4);  /* 32px */
  --space-5: calc(var(--grid-unit) * 5);  /* 40px */
  --space-6: calc(var(--grid-unit) * 6);  /* 48px */
  --space-8: calc(var(--grid-unit) * 8);  /* 64px */
}

.card {
  padding: var(--space-3);                /* 24px — on-grid */
  gap: var(--space-2);                    /* 16px — on-grid */
}
```

### √2 Grid (root-2)

When it fits: editorial layouts, print-adjacent surfaces, long-form article pages, document viewers. The √2 ratio (≈1.414) is the proportion that survives bisection — fold an A4 page in half and you get an A5 page with the same proportion. UIs that mirror physical paper (PDF readers, marketing landing pages with magazine layouts, layouts that breathe like print) feel right on √2 because subdivisions cascade self-similarly. The underlying spacing unit is still an integer (typically 8px or 16px) but the column and section *ratios* are √2, and key dimensions are generated by repeated multiplication or division by 1.414. See `./composition.md` §Root Rectangles — √2, √3, √5 for the geometry behind the ratio.

```css
/* √2 grid — editorial / print-adjacent */
:root {
  --base: 16px;

  --space-2:  calc(var(--base) * 1);              /* 16px       */
  --space-3:  calc(var(--base) * 1.414);          /* ≈22.6px → 24px on the 8pt grid */
  --space-4:  calc(var(--base) * 2);              /* 32px       */
  --space-5:  calc(var(--base) * 2.828);          /* ≈45.2px → 48px */
  --space-6:  calc(var(--base) * 4);              /* 64px       */
}

.article-section {
  aspect-ratio: 1 / 1.414;                        /* A-paper ratio */
  padding-inline: var(--space-4);
  padding-block: var(--space-5);
}
```

**Decision rule:** if the product is a dense data UI where row density is the dominant constraint, pick 4pt. If the product is editorial or print-adjacent and pages should feel like documents, pick √2 (over an integer pixel unit). For everything else — and that is most product work — pick 8pt. Document the decision once at the design-system level; do not let individual surfaces pick their own grid.

## Baseline-Grid Lock

Baseline-grid lock is the discipline that every text baseline in the UI lands on a grid line — typically the same 4pt or 8pt unit used for spacing. The mechanism is the `line-height` of every text style: set line-height so the resulting line box is a whole multiple of the grid unit. Body text at 16px font with line-height `24px` consumes exactly three 8pt units per line. Heading text at 32px with line-height `40px` consumes five. Caption at 14px with line-height `24px` consumes three. Every block of text — regardless of size — stacks on the same invisible horizontal rulings.

Lock matters because mixed-size text without it produces drift. A page that interleaves body, headings, and captions whose line-heights are *not* grid multiples will accumulate fractional-pixel errors block-by-block; by mid-page, the right column has slid out of alignment with the left. Visually the page looks "slightly wrong" without an obvious cause. Lock eliminates the symptom by construction.

```css
/* Baseline-grid lock on an 8pt grid */
:root {
  --grid-unit: 8px;

  /* Every line-height is a multiple of --grid-unit */
  --line-body:    calc(var(--grid-unit) * 3);  /* 24px — 3 units */
  --line-heading: calc(var(--grid-unit) * 5);  /* 40px — 5 units */
  --line-caption: calc(var(--grid-unit) * 3);  /* 24px — 3 units */
}

p           { font-size: 16px; line-height: var(--line-body);    }
h2          { font-size: 32px; line-height: var(--line-heading); }
.caption    { font-size: 14px; line-height: var(--line-caption); }
```

## Vertical Rhythm

Vertical rhythm is the lived consequence of baseline-grid lock: because every text block consumes a whole number of grid units, block-level elements stack on the grid without ever needing manual margin tweaks. The page reads with a quiet, mechanical regularity that the eye registers as polish even when no one can articulate why. Vertical rhythm is what readers mean when they say a layout feels "professional" or "calm".

The rule that produces it is: pick the baseline unit once, set every line-height in the type ramp as a multiple of that unit, and set every block-level margin (margin-top, margin-bottom, padding-block on cards and sections) as a multiple of the same unit. Once both type and spacing are on-grid, rhythm emerges automatically — no per-element adjustment.

```css
/* Vertical rhythm — body, heading, caption, all on the 8pt grid */
:root {
  --grid-unit: 8px;
}

body {
  font-size: 16px;
  line-height: calc(var(--grid-unit) * 3);   /* 24px — 3 units */
}

h2 {
  font-size: 32px;
  line-height: calc(var(--grid-unit) * 5);   /* 40px — 5 units */
  margin-block-start: calc(var(--grid-unit) * 6);  /* 48px */
  margin-block-end:   calc(var(--grid-unit) * 3);  /* 24px */
}

.caption {
  font-size: 14px;
  line-height: calc(var(--grid-unit) * 3);   /* 24px — 3 units, same as body */
}

article > * + * {
  margin-block-start: calc(var(--grid-unit) * 2);  /* 16px between siblings */
}
```

**Exceptions are explicit, not freehand.** Display-scale type (font-size ≥ 56px) is often set with optical line-height — a unitless ratio of 1.05–1.15 — because mechanical 8pt multiples look too sparse at hero scale. Single-line callouts (status badges, single-character chips) may use `line-height: 1` with vertical padding rounded to the grid. Treat both as named utilities (`.display-line-height`, `.chip-vertical`) rather than ad-hoc overrides — once the exception is a token, it remains visible to audit.

## Modular Relationships

The point of the proportion system is that the four sub-systems — type, spacing, sizing, radius — are not authored independently. Each derives from the same baseline unit, and certain pairs of values across systems are intentionally identical. Body line-height equals the spacing token that separates two body paragraphs equals the height of a medium icon. The numerical equality is the visible signature of an authored composition.

| System  | Token       | Value | Grid relationship              | Cross-system pairing                  |
| ------- | ----------- | ----- | ------------------------------ | ------------------------------------- |
| type    | text-xs     | 12px  | 1.5 × baseline                 | matches `space-1.5` (4pt half-step)   |
| type    | text-sm     | 14px  | non-grid (optical exception)   | line-height 20px (2.5 units) is grid  |
| type    | text-base   | 16px  | 2 × baseline (8pt)             | matches `space-2`                     |
| type    | text-lg     | 20px  | 2.5 × baseline                 | line-height 28px (3.5 units)          |
| type    | text-xl     | 24px  | 3 × baseline                   | matches `space-3`, matches `icon-md`  |
| type    | text-2xl    | 32px  | 4 × baseline                   | matches `space-4`, matches `icon-lg`  |
| space   | space-1     | 8px   | 1 × baseline                   | matches `radius-md`                   |
| space   | space-2     | 16px  | 2 × baseline                   | matches `text-base`                   |
| space   | space-3     | 24px  | 3 × baseline                   | matches body line-height, `icon-md`   |
| space   | space-4     | 32px  | 4 × baseline                   | matches `text-2xl`, `icon-lg`         |
| space   | space-6     | 48px  | 6 × baseline                   | matches `avatar-md` height            |
| radius  | radius-sm   | 4px   | 0.5 × baseline                 | half-step, only on chips and tags     |
| radius  | radius-md   | 8px   | 1 × baseline                   | matches `space-1`                     |
| radius  | radius-lg   | 16px  | 2 × baseline                   | matches `space-2`, `text-base`        |
| size    | icon-sm     | 16px  | 2 × baseline                   | matches `text-base` cap-height        |
| size    | icon-md     | 24px  | 3 × baseline                   | matches body line-height, `space-3`   |
| size    | icon-lg     | 32px  | 4 × baseline                   | matches `text-2xl`, `space-4`         |
| size    | avatar-sm   | 32px  | 4 × baseline                   | matches `icon-lg`, `space-4`          |
| size    | avatar-md   | 48px  | 6 × baseline                   | matches `space-6`                     |
| size    | avatar-lg   | 64px  | 8 × baseline                   | 8 grid units, matches hero spacing    |

The pairing column is the asset. An agent picking a value reads across the table: "I need padding around 16px text on an 8pt grid" → `space-2` (16px) or `space-3` (24px), never `padding: 12px` (1.5 units — half-step, reserved for chips). "I need an icon next to body text" → `icon-md` (24px), because body line-height is 24px and the icon should occupy the same vertical band. The relationships make these decisions one-step.

**A concrete pairing example.** Body text is 16px on 24px line-height (8pt grid). A button next to body text should have vertical padding such that the total button height is a clean multiple of the grid. Padding 8px + line-height 24px + padding 8px = 40px (5 units — on-grid). Padding 12px + line-height 24px + padding 12px = 48px (6 units — on-grid). Padding 10px gives 44px (5.5 units — off-grid, breaks rhythm); the only way to know that is to consult the matrix. Once a team internalizes the pairings, the choice between 8px and 12px stops being aesthetic — both are correct, both produce on-grid heights, and the team picks based on density.

## Radius Scale as Proportion

Corner radius is the easiest token to author ad-hoc — `border-radius: 6px` looks fine in isolation — and the easiest to break the system with. The radius scale belongs to proportion because it must derive from component height, not be chosen freehand. The common rule is `radius-md ≈ 0.25 × component height`: a 40px-tall button gets 8px radius, a 32px-tall chip gets 8px radius, a 24px-tall tag gets 4px or 8px. The 0.25× ratio is visually balanced — large enough to register as "rounded", small enough to keep the geometry of the rectangle dominant.

Two exceptions matter and are named, not freehand. **Pill** sets `border-radius: 9999px` (or `border-radius: 50%` on a square) — explicit "fully rounded", used for tags, status badges, and avatar wrappers. **Square** sets `border-radius: 0` — explicit "no rounding", used inside data tables where rectangular cells must butt against each other, and on heavily geometric brand systems.

```css
/* Radius scale as proportion to component height */
:root {
  --radius-none: 0;
  --radius-sm:   4px;       /* 0.25 × 16px (tag height) */
  --radius-md:   8px;       /* 0.25 × 32px (chip / small button) */
  --radius-lg:   10px;      /* 0.25 × 40px (default button) */
  --radius-xl:   16px;      /* 0.25 × 64px (large input / card) */
  --radius-full: 9999px;    /* pill */
}

.button-default {
  block-size: 40px;
  border-radius: var(--radius-lg);   /* 10px — 0.25 × 40px */
}

.chip {
  block-size: 32px;
  border-radius: var(--radius-md);   /* 8px — 0.25 × 32px */
}

.avatar {
  inline-size: 48px;
  block-size:  48px;
  border-radius: var(--radius-full); /* pill (circle) — explicit named exception */
}
```

## Sizing Scale Derivation

Sizing tokens — icon dimensions, avatar dimensions, button heights, input heights — are not a separate ladder. They are derived from the spacing scale by consistent multipliers, so that every size token equals some `space-N` token. This is the rule that prevents sizing drift: a new size token must reuse an existing spacing value; it may not introduce a new pixel value.

The derivation table for an 8pt grid:

```css
/* Sizing tokens derived from spacing tokens */
:root {
  --grid-unit: 8px;

  /* Spacing ladder (canonical) */
  --space-1:  calc(var(--grid-unit) * 1);   /*  8px */
  --space-2:  calc(var(--grid-unit) * 2);   /* 16px */
  --space-3:  calc(var(--grid-unit) * 3);   /* 24px */
  --space-4:  calc(var(--grid-unit) * 4);   /* 32px */
  --space-5:  calc(var(--grid-unit) * 5);   /* 40px */
  --space-6:  calc(var(--grid-unit) * 6);   /* 48px */
  --space-8:  calc(var(--grid-unit) * 8);   /* 64px */

  /* Sizing tokens — every value is a spacing token, not a new pixel literal */
  --icon-sm:    var(--space-2);   /* 16px */
  --icon-md:    var(--space-3);   /* 24px */
  --icon-lg:    var(--space-4);   /* 32px */

  --avatar-sm:  var(--space-4);   /* 32px */
  --avatar-md:  var(--space-6);   /* 48px */
  --avatar-lg:  var(--space-8);   /* 64px */

  --button-sm:  var(--space-4);   /* 32px height */
  --button-md:  var(--space-5);   /* 40px height — default button */
  --button-lg:  var(--space-6);   /* 48px height */

  --input-md:   var(--space-5);   /* 40px height — matches button-md */
}
```

The rule that makes this work: **a new sizing token must derive from spacing — never freehand.** If a designer needs a 36px button, the answer is not `--button-custom: 36px`; the answer is either 32px (`--space-4`) or 40px (`--space-5`), and the designer picks one. The token system declines to express off-grid sizes, which is the point.

## Cross-References

- [design-system-guidance.md](./design-system-guidance.md) — general design-system authoring context that this file deepens for proportion. That file mentions 8pt grids in passing; this file is the formal treatment.
- [typography.md](./typography.md) §Type Scale Systems — the canonical modular-scale slice this file extends to the whole UI. Read that section first for the upstream type ladder.
- [style-vocabulary.md](./style-vocabulary.md) — style rows that cite "8pt spacing grid" (Flat Design 2.0) and other proportional vocabulary surfaces. This file is the underlying mechanism behind those style-row markers.

Forward reading: [composition.md](./composition.md) §Root Rectangles — √2, √3, √5 for the geometry behind the √2 grid baseline option above.

Note: reciprocal inbound cross-links from these files into `proportion-systems.md` land in Phase 28-06 (additive-only, decision D-06). This file declares its three outbound links now; the inverse direction is a separate, batched edit.
