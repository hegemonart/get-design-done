<!-- Source: Phase 18 — get-design-done -->

# CSS Grid Layout — Advanced Craft Reference

## 1. CSS Grid Template Patterns

### Holy Grail Layout

Classic five-area layout: header, nav, main, aside, footer.

```css
.holy-grail {
  display: grid;
  grid-template-areas:
    "header header  header"
    "nav    main    aside"
    "footer footer  footer";
  grid-template-columns: 200px 1fr 200px;
  grid-template-rows: auto 1fr auto;
  min-height: 100dvh;
}

.header { grid-area: header; }
.nav    { grid-area: nav; }
.main   { grid-area: main; }
.aside  { grid-area: aside; }
.footer { grid-area: footer; }
```

Responsive collapse — stack columns below 768px:

```css
@media (max-width: 768px) {
  .holy-grail {
    grid-template-areas:
      "header"
      "nav"
      "main"
      "aside"
      "footer";
    grid-template-columns: 1fr;
    grid-template-rows: auto;
  }
}
```

### Bento Grid Layout

Dashboard card mosaic where cards span varied tracks.

```css
.bento {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  grid-template-rows: repeat(3, 200px);
  gap: 16px;
}

/* Feature card — spans 2 cols × 2 rows */
.bento__card--featured {
  grid-column: span 2;
  grid-row: span 2;
}

/* Wide card — full width */
.bento__card--wide {
  grid-column: 1 / -1;
}

/* Tall card */
.bento__card--tall {
  grid-row: span 2;
}
```

Auto-fit bento with minimum card size:

```css
.bento-auto {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
  grid-auto-rows: minmax(180px, auto);
  gap: 16px;
}
```

### Masonry via `grid-template-rows: masonry`

Native CSS masonry — items pack into shortest column, no JavaScript.

```css
.masonry {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
  grid-template-rows: masonry; /* native masonry axis */
  gap: 16px;
}
```

**Browser support (2025):** Firefox (behind flag), Safari 18+ (partial). Use `@supports` for progressive enhancement:

```css
@supports (grid-template-rows: masonry) {
  .masonry {
    grid-template-rows: masonry;
  }
}

/* Fallback: multi-column layout */
@supports not (grid-template-rows: masonry) {
  .masonry {
    column-count: 3;
    column-gap: 16px;
  }
  .masonry > * {
    break-inside: avoid;
    margin-bottom: 16px;
  }
}
```

---

## 2. Subgrid

### What It Is

`subgrid` lets a nested grid inherit track definitions from its parent grid. Without subgrid, inner grids define their own tracks independently — card headers and footers cannot align across sibling cards.

```css
/* Parent defines the tracks */
.card-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  grid-template-rows: auto 1fr auto; /* header, body, footer */
  gap: 24px;
}

/* Each card participates in parent row tracks */
.card {
  display: grid;
  grid-row: span 3;
  grid-template-rows: subgrid; /* inherit parent's 3 row tracks */
}

.card__header { grid-row: 1; }
.card__body   { grid-row: 2; }
.card__footer { grid-row: 3; }
```

### When to Use Subgrid

- Card grids where headers, body areas, and CTAs must align across columns
- Form layouts with labels and inputs spanning parent tracks
- Table-like layouts built from components

### Browser Support

Chrome 117+, Firefox 71+, Safari 16+. Baseline widely available as of 2024.

```css
/* Safe to use without @supports for modern browsers */
/* Fallback pattern for older targets */
@supports not (grid-template-rows: subgrid) {
  .card {
    display: flex;
    flex-direction: column;
  }
  .card__body {
    flex: 1; /* push footer down */
  }
}
```

---

## 3. Container Queries

### Core Syntax

Query an element's own container rather than the viewport.

```css
/* 1. Define the container */
.card-wrapper {
  container-type: inline-size;
  container-name: card;
}

/* 2. Query inside */
@container card (min-width: 400px) {
  .card {
    display: grid;
    grid-template-columns: 120px 1fr;
  }
}

@container card (min-width: 600px) {
  .card__title {
    font-size: 1.5rem;
  }
}
```

### `container-type` Values

| Value | Queries |
|---|---|
| `inline-size` | Width queries only (most common) |
| `size` | Width and height queries |
| `normal` | No containment (default) |

### `container-name`

Named containers allow nested or specific targeting:

```css
.sidebar {
  container-type: inline-size;
  container-name: sidebar;
}

.main-content {
  container-type: inline-size;
  container-name: main;
}

@container sidebar (max-width: 300px) {
  .widget { font-size: 0.875rem; }
}

@container main (min-width: 700px) {
  .widget { font-size: 1rem; }
}
```

### Practical Reusable Component Pattern

```css
/* Component owns its responsiveness */
.media-card {
  container-type: inline-size;
}

/* Stacked by default */
.media-card__inner {
  display: flex;
  flex-direction: column;
}

/* Side-by-side when container is wide enough */
@container (min-width: 480px) {
  .media-card__inner {
    flex-direction: row;
  }

  .media-card__image {
    width: 40%;
    flex-shrink: 0;
  }
}
```

**Browser support:** Chrome 105+, Firefox 110+, Safari 16+. Baseline widely available.

---

## 4. Fluid Typography with `clamp()`

### The Utopia.fyi Formula

```
font-size: clamp(min, preferred, max)
```

Where preferred is a linear interpolation between viewport sizes:

```
preferred = V × 1vw + R × 1rem
```

- `V` = viewport coefficient (controls how fast size scales)
- `R` = root-relative offset (base size contribution)

### Deriving V and R

Given: min font size `f_min` at viewport `v_min`, max font size `f_max` at viewport `v_max` (all in px):

```
V = (f_max - f_min) / (v_max - v_min) × 100
R = f_min - V × (v_min / 100)   (convert back to rem ÷ 16)
```

### Real Examples

**Body text — 16px at 320px viewport → 20px at 1440px:**

```
V = (20 - 16) / (1440 - 320) × 100 = 0.357
R = 16 - 0.357 × (320/100) = 16 - 1.143 = 14.857 → ÷16 = 0.929rem
```

```css
body {
  font-size: clamp(1rem, 0.929rem + 0.357vw, 1.25rem);
}
```

**Display heading — 32px at 320px → 72px at 1440px:**

```css
h1 {
  font-size: clamp(2rem, 0.286rem + 5.357vw, 4.5rem);
}
```

**Practical scale using clamp:**

```css
:root {
  --text-xs:   clamp(0.75rem,  0.7rem  + 0.25vw,  0.875rem);
  --text-sm:   clamp(0.875rem, 0.825rem + 0.25vw, 1rem);
  --text-base: clamp(1rem,     0.929rem + 0.357vw, 1.25rem);
  --text-lg:   clamp(1.125rem, 1rem    + 0.625vw, 1.5rem);
  --text-xl:   clamp(1.25rem,  1rem    + 1.25vw,  2rem);
  --text-2xl:  clamp(1.5rem,   1rem    + 2.5vw,   2.5rem);
  --text-3xl:  clamp(1.875rem, 1rem    + 4.375vw, 3.5rem);
  --text-4xl:  clamp(2.25rem,  0.75rem + 7.5vw,   5rem);
}
```

**Fluid spacing with clamp:**

```css
:root {
  --space-s:  clamp(0.75rem,  0.25vw + 0.68rem,  1rem);
  --space-m:  clamp(1rem,     0.5vw  + 0.87rem,  1.5rem);
  --space-l:  clamp(1.5rem,   1vw    + 1.25rem,  2.5rem);
  --space-xl: clamp(2rem,     2vw    + 1.5rem,   4rem);
}
```

---

## 5. Intrinsic Sizing in Grid Track Definitions

### Keywords

| Keyword | Behavior |
|---|---|
| `min-content` | Shrinks to smallest content size (longest unbreakable word) |
| `max-content` | Grows to fit all content on one line |
| `fit-content(N)` | Like `max-content` but clamps at `N` |
| `auto` | Distributes remaining space, respects min/max |
| `fr` | Fractional remaining space after fixed tracks |

### Usage in Grid

```css
.layout {
  display: grid;

  /* Label column: as wide as needed, content column: takes rest */
  grid-template-columns: max-content 1fr;

  /* Sidebar: shrinks to content, main: fills */
  grid-template-columns: min-content 1fr;

  /* Tag list: constrained but wraps if narrow */
  grid-template-columns: fit-content(200px) 1fr;
}
```

### Auto-sizing Rows

```css
.card-grid {
  grid-auto-rows: minmax(min-content, auto);
  /* Each row is at least as tall as its shortest content,
     and grows to fit the tallest cell */
}
```

### `minmax()` Patterns

```css
/* Never narrower than 250px, fills available space */
grid-template-columns: repeat(auto-fill, minmax(250px, 1fr));

/* Text column: at least 45 characters wide */
grid-template-columns: minmax(45ch, 1fr) 300px;
```

---

## 6. Logical Properties

### Why They Matter

Physical properties (`margin-left`, `padding-top`) break when:
- Language direction is RTL (Arabic, Hebrew, Farsi)
- Writing mode is vertical (Japanese, Chinese traditional)

Logical properties map to flow-relative directions.

### Property Mapping

| Physical | Logical |
|---|---|
| `margin-left` | `margin-inline-start` |
| `margin-right` | `margin-inline-end` |
| `margin-top` | `margin-block-start` |
| `margin-bottom` | `margin-block-end` |
| `padding-left/right` | `padding-inline` |
| `padding-top/bottom` | `padding-block` |
| `width` | `inline-size` |
| `height` | `block-size` |
| `top` | `inset-block-start` |
| `left` | `inset-inline-start` |
| `border-left` | `border-inline-start` |
| `text-align: left` | `text-align: start` |

### Real Usage

```css
/* Navigation link — respects RTL padding */
.nav__link {
  padding-inline: 1rem;
  padding-block: 0.5rem;
  border-inline-start: 3px solid transparent;
}

.nav__link:hover {
  border-inline-start-color: var(--color-accent);
}

/* Card — flow-safe spacing */
.card {
  margin-block-end: 1.5rem;
  padding-inline: 1.5rem;
  padding-block: 1rem;
}

/* Positioned element — flow-relative */
.tooltip {
  position: absolute;
  inset-block-start: 100%;
  inset-inline-start: 0;
}

/* Shorthand: all four insets */
.overlay {
  inset: 0; /* shorthand for top/right/bottom/left: 0 */
}
```

**Browser support:** All modern browsers. IE11 does not support logical properties.

---

## 7. Safe Area Insets

### Purpose

On devices with notches, home bars, rounded corners, or camera cutouts, content can be hidden behind the system UI. CSS environment variables expose the safe zone.

### Variables

| Variable | Maps to |
|---|---|
| `env(safe-area-inset-top)` | Top notch / status bar |
| `env(safe-area-inset-right)` | Right edge |
| `env(safe-area-inset-bottom)` | Home indicator / bottom bar |
| `env(safe-area-inset-left)` | Left edge |

### Requirements

The viewport meta tag must include `viewport-fit=cover`:

```html
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
```

### Usage Patterns

```css
/* Fixed header — clear the notch */
.app-header {
  position: fixed;
  top: 0;
  inset-inline: 0;
  padding-block-start: env(safe-area-inset-top);
  height: calc(60px + env(safe-area-inset-top));
}

/* Fixed bottom nav — clear home indicator */
.bottom-nav {
  position: fixed;
  bottom: 0;
  inset-inline: 0;
  padding-block-end: env(safe-area-inset-bottom);
}

/* Scrollable content — offset for fixed header/footer */
.scroll-content {
  padding-block-start: calc(60px + env(safe-area-inset-top));
  padding-block-end: calc(56px + env(safe-area-inset-bottom));
}

/* Fallback with max() for older browsers */
.app-header {
  padding-top: max(env(safe-area-inset-top), 16px);
}
```

**Browser support:** Safari 11.1+, Chrome 69+, Firefox 110+.

---

## 8. `aspect-ratio` with `object-fit` and `object-position`

### `aspect-ratio`

Forces an element to maintain a width-to-height ratio:

```css
.card__image {
  aspect-ratio: 16 / 9;
  width: 100%;
}

.avatar {
  aspect-ratio: 1; /* square */
  width: 48px;
}

.portrait {
  aspect-ratio: 3 / 4;
}
```

### `object-fit`

Controls how replaced content (img, video) fills its box:

| Value | Behavior |
|---|---|
| `cover` | Scales to fill, may crop. Maintains aspect ratio. |
| `contain` | Scales to fit inside. Letterboxed if needed. |
| `fill` | Stretches to fill exactly. Distorts if different ratio. |
| `none` | No resizing. May overflow or underflow. |
| `scale-down` | Picks smaller of `none` or `contain`. |

```css
/* Hero image — always fills, crops if needed */
.hero__img {
  width: 100%;
  aspect-ratio: 21 / 9;
  object-fit: cover;
  object-position: center 30%; /* focus on upper portion */
}

/* Thumbnail — fits inside, no crop */
.thumb {
  width: 80px;
  height: 80px;
  object-fit: contain;
  background: var(--color-surface-muted); /* fills letterbox area */
}

/* Product shot — keep top of image in frame */
.product__img {
  aspect-ratio: 1;
  object-fit: cover;
  object-position: top center;
}
```

### `object-position`

Same syntax as `background-position`. Positions the content within the box:

```css
/* Keywords */
object-position: center center;  /* default */
object-position: top right;
object-position: bottom left;

/* Length / percentage */
object-position: 50% 20%;      /* horizontal vertical */
object-position: 0 0;          /* top-left corner */
```

---

## 9. Alignment Shorthands: `place-items`, `place-content`, `place-self`

These are shorthands combining `align-*` and `justify-*`.

### `place-items` (on container)

Sets both `align-items` and `justify-items`:

```css
/* Center all items in their grid cell */
.grid {
  display: grid;
  place-items: center;  /* align-items: center; justify-items: center */
}

/* Different values: align-items / justify-items */
.grid {
  place-items: start end;
}
```

### `place-content` (on container)

Sets both `align-content` and `justify-content`:

```css
/* Full centering of the grid tracks within the container */
.grid {
  display: grid;
  place-content: center;

  /* Or with different values */
  place-content: space-between center;
}
```

### `place-self` (on grid/flex child)

Sets both `align-self` and `justify-self` for one item:

```css
.modal {
  display: grid;
  place-items: center;  /* centers all children */
}

.modal__close-btn {
  place-self: start end; /* override: top-right corner */
}
```

### Centering Cheat Sheet

```css
/* Center a single element, any size */
.parent {
  display: grid;
  place-items: center;
}

/* Center flex children */
.flex-parent {
  display: flex;
  place-content: center;
  gap: 1rem;
}
```

---

## 10. `grid-auto-flow: dense`

### What It Does

When grid items have different sizes (some spanning multiple columns), gaps appear when larger items cannot fit in the current row. `dense` backfills those gaps with smaller items, ignoring source order.

```css
.gallery {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  grid-auto-rows: 200px;
  gap: 16px;
  grid-auto-flow: dense; /* fills gaps with smaller items */
}

.gallery__item--wide  { grid-column: span 2; }
.gallery__item--tall  { grid-row: span 2; }
.gallery__item--large { grid-column: span 2; grid-row: span 2; }
```

### Trade-off

`dense` reorders items visually away from DOM order. This breaks keyboard navigation and screen reader traversal for interactive content. Use only for purely visual galleries where tab order is not meaningful.

```css
/* Safe: purely decorative image mosaic */
.photo-mosaic {
  grid-auto-flow: dense;
}

/* Unsafe: card grid with links or buttons */
/* Do NOT use dense here — tab order will seem random */
.card-grid {
  grid-auto-flow: row; /* default — preserve order */
}
```

---

## 11. Anchor Positioning

### What It Is

CSS Anchor Positioning (`anchor()`, `position-anchor`) allows an absolutely positioned element to tether its position to a named anchor element — without JavaScript. Replaces Popper.js / Floating UI for tooltips, dropdowns, popovers.

### Core Syntax

```css
/* 1. Define the anchor */
.trigger {
  anchor-name: --my-tooltip;
}

/* 2. Tether positioned element to anchor */
.tooltip {
  position: absolute;
  position-anchor: --my-tooltip;

  /* Position relative to anchor edges */
  top: anchor(bottom);      /* align tooltip top to anchor bottom */
  left: anchor(left);       /* align tooltip left to anchor left */
}
```

### `anchor()` Values

```css
.popover {
  position: absolute;
  position-anchor: --trigger;

  /* Anchor edge references */
  top:    anchor(bottom);        /* below anchor */
  bottom: anchor(top);           /* above anchor */
  left:   anchor(right);         /* right of anchor */
  right:  anchor(left);          /* left of anchor */
  top:    anchor(center);        /* anchor vertical center */
  left:   anchor(center);        /* anchor horizontal center */
}
```

### `@position-try` — Automatic Flip

Define fallback positions if primary placement goes off-screen:

```css
@position-try --flip-above {
  top: auto;
  bottom: anchor(top);
}

.tooltip {
  position: absolute;
  position-anchor: --trigger;
  top: anchor(bottom);
  position-try-fallbacks: --flip-above;
}
```

### Progressive Enhancement Pattern

```css
/* Base: JavaScript-positioned fallback */
.tooltip {
  position: fixed; /* JS will set top/left */
}

/* Enhancement: native anchor positioning */
@supports (anchor-name: --x) {
  .tooltip {
    position: absolute;
    position-anchor: --trigger;
    top: anchor(bottom);
    left: anchor(left);
    /* Remove JS positioning when supported */
  }

  .trigger {
    anchor-name: --trigger;
  }
}
```

**Browser support (2025):** Chrome 125+, Edge 125+. Firefox and Safari: not yet shipped. Use `@supports (anchor-name: --x)` gate for all production use.

---

## Quick Reference: Grid Track Sizing

```css
/* Fixed */
grid-template-columns: 200px 1fr;

/* Repeat patterns */
grid-template-columns: repeat(3, 1fr);
grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));

/* Mixed */
grid-template-columns: 250px repeat(3, 1fr) min-content;

/* Named lines */
grid-template-columns: [sidebar-start] 250px [sidebar-end main-start] 1fr [main-end];

/* Content item span */
.item {
  grid-column: main-start / main-end;
  grid-column: 1 / -1;   /* full width */
  grid-column: span 2;
}
```

## Quick Reference: Alignment

```css
/* Container — distribute tracks */
justify-content: start | end | center | stretch | space-between | space-around | space-evenly;
align-content:   start | end | center | stretch | space-between | space-around | space-evenly;
place-content:   <align-content> <justify-content>;

/* Container — align items within cells */
justify-items: start | end | center | stretch;
align-items:   start | end | center | stretch | baseline;
place-items:   <align-items> <justify-items>;

/* Item — override for one child */
justify-self: start | end | center | stretch;
align-self:   start | end | center | stretch | baseline;
place-self:   <align-self> <justify-self>;
```
