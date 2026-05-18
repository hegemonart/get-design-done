---
name: composition
type: layout
version: 1.0.0
phase: 28
tags: [composition, golden-ratio, fibonacci, focal-point, eye-flow]
last_updated: 2026-05-18
---

# Composition — Pre-Gestalt Layout Fundamentals

The existing [visual hierarchy and layout reference](./visual-hierarchy-layout.md) covers shadow, z-index, whitespace, asymmetry, and the 12-column grid — the *applied* surface of layout. This file gives the upstream foundation those rules silently assume: rule of thirds, the golden ratio and root rectangles, Fibonacci, focal-point construction, visual-weight calculus, optical-vs-mathematical centering, and the Z / F / Gutenberg eye-flow patterns. Where `visual-hierarchy-layout.md` says "place the CTA where the eye lands", this file replaces that hand-wave with explicit grids, ratios, weight formulas, and detection signatures an audit can grep for.

This is the file an agent should consult any time it is *constructing* a layout — choosing a grid, placing a focal point, balancing two halves of a composition, centering a glyph next to text, or deciding which eye-flow archetype a page should follow.

---

## Rule of Thirds

The rule of thirds divides any canvas into a 3×3 grid with two horizontal and two vertical lines at the 33% and 67% marks. The four intersections of those lines are the *power points* — the locations the eye lands when scanning a composition. Placing a focal element exactly on a power point produces a layout that reads as deliberate and balanced; placing it at dead-center produces a layout that reads as static and posed. The rule is not a law; it is a default that holds until a stronger compositional intent overrides it (centered hero, symmetric mirror, single-axis radial).

**Audit detection signature.** Grep for grid declarations using third-fractions, then check whether a focal element (large heading, primary CTA, hero image) sits near one of the four intersections:

```bash
# Find grids using third-fractions
grep -rE "grid-template-columns:\s*1fr\s+1fr\s+1fr|33%|66%|33\.33%|66\.66%" src/

# Then inspect: does a [data-focal], a primary CTA, or an h1 land near one of those gridlines?
```

```html
<!-- Hero layout — CTA placed at the lower-right power point -->
<section class="hero">
  <div class="hero__copy">
    <h1>Build it once. Ship it everywhere.</h1>
    <p>Lead with the value, not the brand.</p>
  </div>
  <div class="hero__cta">
    <button>Get Started</button>
  </div>
</section>

<style>
.hero {
  display: grid;
  grid-template-columns: 1fr 1fr 1fr;     /* thirds — vertical gridlines at 33% / 67% */
  grid-template-rows: 1fr 1fr 1fr;        /* thirds — horizontal gridlines at 33% / 67% */
  min-height: 80vh;
}
.hero__copy {
  grid-column: 1 / 3;                     /* fills the left two-thirds */
  grid-row: 2 / 3;                        /* sits on the upper-third horizontal line */
  align-self: center;
}
.hero__cta {
  grid-column: 3 / 4;                     /* rightmost third */
  grid-row: 3 / 4;                        /* lower-third row */
  align-self: end;
  justify-self: end;                      /* lower-right power point (67%, 67%) */
}
</style>
```

The CTA sits at the lower-right intersection — the natural Z-pattern terminus (see [§Eye-Flow Patterns](#eye-flow-patterns)). The headline anchors the upper-left third where reading begins.

---

## Golden Ratio and Root Rectangles

Beyond thirds, four irrational ratios govern compositions that need to feel *proportional* rather than *gridded*: φ (the golden ratio), √2, √3, and √5. Each rectangle has a different subdivision behavior — when you remove the largest possible square from inside it, the remainder has a specific relationship to the original. φ produces another φ-rectangle (infinitely self-similar — the source of the golden spiral). √2 produces a rectangle that, when folded in half, is still √2 (the math behind A0 / A1 / A2 paper). √3 produces a √3 / 2 rectangle. √5 produces two squares plus a φ-rectangle and is the bridge from integer roots back to φ via the identity `φ = (1 + √5) / 2`.

### φ-Grid (Golden Ratio)

φ ≈ 1.618. A φ-rectangle has its short side to long side in ratio `1 : 1.618`. When the same ratio governs the relationship between a sidebar and main content, an image and its caption block, or a heading and its body text, the layout reads as *naturally weighted* — neither cramped nor empty. The catch is that φ is opinionated: it pulls compositions toward warmth and editorial feel, away from grid-locked rigidity. Use it where the design wants to feel hand-tuned, not where it must align to a strict baseline grid.

```css
/* φ-grid — sidebar:content ratio of 1:1.618 */
.layout {
  display: grid;
  grid-template-columns: 1fr 1.618fr;     /* φ */
  gap: var(--space-6);
}

/* Image card with φ-proportioned caption block */
.card {
  display: grid;
  grid-template-rows: 1.618fr 1fr;        /* image : caption = φ : 1 */
}
```

### Root Rectangles — √2, √3, √5

| Ratio | Value  | Subdivision property                                    | UI fit                                                          |
| ----- | ------ | ------------------------------------------------------- | --------------------------------------------------------------- |
| √2    | 1.414  | Halving produces another √2 rectangle (ISO paper sizes) | Editorial / print-adjacent UI; documents, articles, long-reads  |
| √3    | 1.732  | Subdivides into three √3 / 2 rectangles                 | Music, data, spreadsheet-adjacent surfaces with triadic rhythm  |
| √5    | 2.236  | Decomposes into 2 squares + a φ-rectangle               | Bridge to φ; very wide hero panels, marquee bands               |
| φ     | 1.618  | Removing the largest square leaves another φ-rectangle  | Editorial, naturalistic, "hand-tuned" feel                      |

```css
/* √2 rectangle — print-adjacent article card */
.article-card {
  aspect-ratio: 1 / 1.414;                /* √2 — same proportion as A4 paper */
}

/* √3 rectangle — triadic data tile */
.data-tile {
  aspect-ratio: 1 / 1.732;
}
```

### Dynamic Symmetry

Dynamic symmetry (Jay Hambidge, 1920) draws *armatures* inside root rectangles: the diagonal of the whole rectangle plus perpendiculars dropped from each corner to that diagonal. The intersections form anchor points for focal elements. The technique is older than the rule of thirds, more flexible, and produces compositions that hold together at different sizes (responsive layouts) because the armature is ratio-based, not pixel-based. In UI, dynamic symmetry shows up implicitly any time a hero image and its caption follow the diagonal of a φ or √2 rectangle.

### Fibonacci

The Fibonacci sequence — `1, 1, 2, 3, 5, 8, 13, 21, 34, 55, …` — approaches φ as the ratio between consecutive terms (8 / 5 = 1.6; 13 / 8 = 1.625; 21 / 13 = 1.615). The square-rectangle subdivision pattern uses Fibonacci numbers as side lengths: a 1×1 square next to a 1×1 square forms a 1×2, append a 2×2 to make a 3×2, append a 3×3 to make a 5×3, and so on — each new square's side is the previous two added together. The diagonal through these squares traces the golden spiral.

In UI, Fibonacci numbers show up in two places: (a) spacing scales — `4 8 12 20 32 52 84` is a Fibonacci-flavored scale (and see [./visual-hierarchy-layout.md §Whitespace as Design Element](./visual-hierarchy-layout.md) for the applied scale); (b) content sizing where natural proportion matters more than strict alignment (a 5-column / 3-column / 2-column nested layout reads as proportional because consecutive Fibonacci pairs approach φ). Fibonacci is the *integer-friendly approximation of φ* — use it when you want φ's feel but need round numbers for token systems.

---

## Focal-Point Construction

Every composition declares 0, 1, or 2+ focal points. A composition with 0 focal points reads as a pattern or texture — fine for backgrounds, wrong for content. A composition with too many focal points reads as noisy and unfocused. Choosing the right count is the first compositional decision; placing them on a power point or armature anchor is the second.

### Single-Focal

One element dominates — significantly larger, higher contrast, more isolated, or more saturated than every sibling. The eye lands once and stays. Fits archetypes where there is exactly one decision to make or one piece of information to absorb.

- **UI archetypes:** landing hero, empty state, error page, sign-in / sign-up form, paywall, confirmation modal, onboarding step.
- **Audit detection:** one element scores ≥ 1.5× the visual weight of every other element on the page (see [§Visual-Weight Calculus](#visual-weight-calculus)).
- **Common failure:** decorative imagery competing with the primary CTA — image and CTA weight scores within 10%, eye bounces between them.

### Dual-Focal

Two elements compete intentionally — same weight, placed at opposite power points or mirrored across an axis. The eye is invited to compare. Fits archetypes where the user is choosing between exactly two paths.

- **UI archetypes:** pricing compare view (basic vs. pro), before/after slider, plan-A vs. plan-B, A/B testimonial pair, fork-in-the-road CTA (Login | Sign Up).
- **Audit detection:** exactly two elements with visual weights within 10% of each other and weights ≥ 2× the third-heaviest element; they sit on opposing thirds-power-points or mirror axes.
- **Common failure:** the two focal elements drift in weight as one gets a "recommended" badge — what was dual-focal becomes single-focal with a decorative competitor.

### Distributed

Three or more elements share weight — none dominates, all are roughly equal. The eye scans rather than locks on. Fits archetypes built around browse-and-select rather than read-and-act.

- **UI archetypes:** dashboard (multiple cards / KPIs / charts), gallery, product grid, settings index, file browser, kanban board.
- **Audit detection:** ≥ 3 elements with visual weights all within 25% of each other; total visual weight is high but no single element exceeds 1.3× the median.
- **Common failure:** one card accidentally gains a colored background and becomes a de facto focal point; the layout's "grid of equals" reads as "one promoted item plus its supporting cast".

---

## Visual-Weight Calculus

Visual weight is the *perceived heaviness* of an element — how strongly the eye is pulled to it relative to neighbors. It is the product of four factors, each normalized to 0..1:

```text
weight = size × contrast × isolation × complexity
```

- **Size** (0..1): the element's area normalized against the largest element on the page. A hero headline at full container width might be 1.0; a footer link at 12px might be 0.05.
- **Contrast** (0..1): luminance contrast against the immediate background, normalized against the page's maximum contrast pair. Black on white is 1.0; mid-gray on light-gray might be 0.2.
- **Isolation** (0..1): empty-space margin around the element, normalized against the largest margin on the page. Generous whitespace lifts the score; cramped neighbors lower it.
- **Complexity** (0..1): internal structure — an image with detail scores higher than a flat color block of the same size; a button with an icon plus a label plus a chevron scores higher than a plain text link.

The formula is multiplicative because each factor is necessary — an element with massive size but zero contrast (white text on white) has zero visual weight, regardless of isolation or complexity.

### Worked Example — 3 elements in a landing hero

Suppose a hero contains a headline, a primary CTA, and a secondary text link.

| Element                | Size  | Contrast | Isolation | Complexity | Weight                        |
| ---------------------- | ----- | -------- | --------- | ---------- | ----------------------------- |
| Headline (H1, 64px)    | 0.90  | 0.95     | 0.80      | 0.30       | `0.90 × 0.95 × 0.80 × 0.30` = **0.205** |
| Primary CTA (button)   | 0.25  | 0.90     | 0.70      | 0.60       | `0.25 × 0.90 × 0.70 × 0.60` = **0.095** |
| Secondary text link    | 0.10  | 0.40     | 0.30      | 0.20       | `0.10 × 0.40 × 0.30 × 0.20` = **0.002** |

The headline dominates (weight ≈ 0.2), the CTA is secondary (≈ 0.1, half the headline), the text link is near-invisible (≈ 0.002, two orders of magnitude lighter). This is correct for a hero that wants the user to read the headline, then act on the CTA, with the text link as a low-stakes escape hatch.

### "Balanced" — defined numerically

A two-sided composition is **balanced** when the sum of visual weights on each side of the optical center is within ~20% of the other. Three or more elements distributed are balanced when no single element exceeds 1.3× the median weight (see distributed-focal detection above).

### Audit detection signature for imbalance

```bash
# Pseudo-procedure for a layout auditor:
# 1. Identify every visible element ≥ 16px tall / 16px wide.
# 2. Score each on the four axes (size, contrast, isolation, complexity).
# 3. Multiply to get weight.
# 4. Sum weights on the left and right of the optical center.
# 5. If left_sum > 1.5 × right_sum (or right > 1.5 × left), flag IMBALANCED.
```

The 1.5× threshold catches obvious imbalance; the 20%-of-each-other rule is the *target* a balanced composition aims for. The gap between 20% and 50% is where a human designer's eye is needed — the formula declares "not obviously broken", not "definitively good".

---

## Optical vs. Mathematical Centering

The pixel center of a bounding box is rarely the visual center of the *thing inside the box*. Glyphs have asymmetric ink distribution; icons have asymmetric stroke weight; characters have descenders, ascenders, cap-height, and x-height that do not all line up with the box edges. Mathematical centering — `display: flex; align-items: center; justify-content: center;` — produces a result that *looks* off-center to the eye in three common cases:

- An icon glyph with directional weight (a play triangle pointing right has more ink on the left half of its bounding box and reads as shifted-left when math-centered).
- A button label aligned next to an icon — the label's x-height pulls the label's optical center *below* the icon's optical center.
- Mixed cap-height + x-height text aligned to a baseline — capitals look "too high" because their cap-height extends above the x-height where the eye expects the line to live.

### Asymmetric Glyph Weight — the −1px nudge

A right-pointing play triangle visually balances when its bounding box is shifted ~1 px (or 1.5–2 px at larger sizes) to the *right* of the mathematical center. The shift accounts for the empty wedge on the triangle's right side.

```css
/* Mathematically centered play button — looks shifted-LEFT to the eye */
.btn-play .icon-play { transform: translateX(0); }

/* Optically centered — −1px to nudge the visually-heavy edge toward the center */
.btn-play .icon-play {
  transform: translateX(1px);             /* compensate the empty wedge on the right */
}

/* At larger glyph sizes the nudge scales — roughly 2–3% of the glyph width */
.btn-play-lg .icon-play {
  transform: translateX(2px);
}
```

See [./iconography.md](./iconography.md) §1 "Optical Sizing & Stroke Weight" for the broader rules governing stroke-weight optics. The play-triangle case is the prototypical example; the same logic applies to chevrons, asymmetric arrows, and any glyph with a directional point.

### Cap-Height vs. X-Height Alignment

When a label sits next to an icon, the icon should align to the **cap-height** of capital letters in the label — not the x-height of lowercase, not the baseline. The eye reads the icon's center against the strongest vertical anchor in the type, and cap-height is that anchor. Aligning to x-height makes the icon look "low"; aligning to baseline makes it look "too low".

```css
/* Button with leading icon — align icon to cap-height of label */
.btn {
  display: inline-flex;
  align-items: center;                    /* approximate cap-height center */
  gap: 0.5em;
  line-height: 1;                         /* tighten so cap-height ≈ box-center */
}

.btn__icon {
  width: 1em;                             /* match cap-height, not x-height */
  height: 1em;
  display: inline-block;
  vertical-align: -0.1em;                 /* fine-tune — icon-by-icon optical nudge */
}

/* For icon-plus-text where the type has a large x-height ratio (Inter, IBM Plex):
   align-items: baseline is wrong (sinks the icon).
   align-items: center with line-height: 1 keeps the icon at cap-center. */
```

The cap-height anchor logic is one half of the story; the other half — modular scale, x-height ratios per typeface — lives in [./typography.md](./typography.md) §Type Scale Systems and §Modular Scale.

---

## Eye-Flow Patterns

A page is not read pixel-by-pixel. The eye follows one of three default patterns shaped by reading direction (LTR Western languages assumed; RTL mirrors these horizontally), content density, and the kind of decision the user is making. Designing *against* the dominant pattern produces friction; designing *with* it produces effortless scanning.

### Z-Pattern — landing pages, conversion flows

The Z-pattern fits sparse, hero-led pages with a clear call to action. The eye lands top-left (logo / brand), sweeps top-right (secondary nav / brand CTA), diagonals down-left (hero headline / body), then sweeps bottom-right (primary CTA terminus). Each anchor of the Z gets one element; the diagonal is the "story" connecting them.

```txt
┌──────────────────────────────────────────────────────────────┐
│  [Logo]  ─────────────────────────────────→  [Nav | Login]   │  1. top-left → top-right
│                                                              │
│                                                              │
│                ╲                                             │
│                  ╲                                           │  2. diagonal sweep
│                    ╲                                         │
│                      ╲                                       │
│                                                              │
│  [Headline]                                                  │  3. bottom-left
│  [Body]                                                      │
│  Lorem ipsum dolor sit amet ────────────→  [ Get Started ]   │  4. bottom-right CTA
└──────────────────────────────────────────────────────────────┘
```

Pair with single-focal-point construction (the CTA at the lower-right power point — same coordinate as the rule-of-thirds example above).

### F-Pattern — content-heavy, scanning surfaces

The F-pattern fits dense pages a user scans rather than reads — search results, news feeds, documentation, settings pages, listings. The eye sweeps horizontally across the top, drops to a shorter horizontal sweep mid-page, then runs vertically down the left edge sampling row-openers. Headings, leading icons, and the first 2–3 words of each row do the heaviest signaling work; deep right-side content gets skipped.

```txt
┌──────────────────────────────────────────────────────────────┐
│  ════════════════════════════════════════════════════════    │  1. top sweep (full width)
│  ─ list item 1 ─ ── ── ── ── ── ── ── ── ── ── ── ── ── ──   │
│  ──── ─── ── ── ── ── ── ── ── ── ── ── ── ── ── ── ── ──   │
│  ══════════════════════════════        ─── ── ── ── ── ──   │  2. mid sweep (partial)
│  ─ list item 2                                               │
│  ──── ─── ── ── ── ── ── ── ── ──                             │
│  ─ list item 3                                                │
│  ─── ── ── ── ── ── ── ── ── ── ──                            │
│  ─ list item 4                                                │  3. left-edge sample
│  ─ list item 5                                                │
│  ─ list item 6                                                │
└──────────────────────────────────────────────────────────────┘
```

Pair with distributed-focal-point construction. Front-load row-openers (titles, leading icons, status indicators) on the left edge. Avoid burying critical information on the right side of rows; the eye does not look there.

### Gutenberg Diagram — editorial, reading-heavy

The Gutenberg diagram applies to text-dense reading surfaces — long-form articles, blog posts, terms-of-service pages, documentation prose. The eye follows a *reading gravity* from the top-left (primary optical area) diagonally to the bottom-right (terminal area), and the two off-diagonal quadrants — top-right (strong fallow area) and bottom-left (weak fallow area) — receive much less attention. Placing critical information in the fallow areas guarantees it goes unread.

```txt
┌──────────────────────────────────────────────────────────────┐
│  ★ Primary Optical Area     │     ✕ Strong Fallow Area      │
│  (eye lands here first)     │     (skipped on first scan)    │
│                             │                                │
│  Heading                    │     side note / decorative     │
│  Lead paragraph...          │                                │
│  ──────────────────────────────────────────────              │
│                             │                                │
│  ✕ Weak Fallow Area         │     ★ Terminal Area           │
│  (rarely returned to)       │     (eye comes to rest here)   │
│                             │                                │
│                             │     Conclusion / CTA           │
└──────────────────────────────────────────────────────────────┘
```

Pair with single-focal-point construction. The terminal area is the natural home for a "next" action — a Read More link, a Subscribe CTA, a tip-jar button. Critical content does NOT go in either fallow area.

### Choosing the pattern

| UI archetype                                          | Eye-flow pattern  | Focal-point construction |
| ----------------------------------------------------- | ----------------- | ------------------------ |
| Landing page, sign-up, hero-led marketing             | Z                 | Single                   |
| Pricing compare, before/after, plan-A vs plan-B       | Z (mirrored)      | Dual                     |
| Search results, news feed, settings index, dashboard  | F                 | Distributed              |
| Documentation, listing, kanban, gallery               | F                 | Distributed              |
| Long-form article, blog post, terms of service        | Gutenberg         | Single (terminal CTA)    |
| Email newsletter, editorial layout                    | Gutenberg         | Single or dual           |

For RTL languages (Arabic, Hebrew, Urdu, Farsi) the Z-pattern and Gutenberg diagram mirror horizontally; the F-pattern's left-edge becomes a right-edge sample. See [./visual-hierarchy-layout.md §Asymmetry and Rhythm](./visual-hierarchy-layout.md) for the applied rhythm rules that pair with each pattern.

---

## Cross-References

- [./visual-hierarchy-layout.md](./visual-hierarchy-layout.md) — §Compositional Grids (responsive column + baseline grid) and §Asymmetry and Rhythm; composition is the upstream foundation that file assumes.
- [./iconography.md](./iconography.md) — §1 Optical Sizing & Stroke Weight; the optical-centering rules in this file apply directly to icon glyphs.
- [./typography.md](./typography.md) — §Type Scale Systems and §Modular Scale; the cap-height vs. x-height alignment rule depends on those scale relationships.

Reciprocal inbound cross-links land in Phase 28-06 (additive-only, D-06).
