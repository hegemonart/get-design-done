<!-- Source: Phase 18 — get-design-done -->

# Variable Fonts & Font Loading

## Variable Font Axes

### Registered Axes

Registered axes have standardized four-character tags and map to familiar CSS properties:

| Axis tag | CSS property mapping | Range (typical) | Description |
|----------|---------------------|-----------------|-------------|
| `wght`   | `font-weight`       | 100–900         | Weight |
| `ital`   | `font-style: italic` | 0–1            | Italic (binary or interpolated) |
| `opsz`   | `font-optical-sizing` / `font-variation-settings` | 8–144 | Optical size |
| `slnt`   | `font-style: oblique Xdeg` | -90–0 | Slant |
| `GRAD`   | `font-variation-settings: 'GRAD'` | -200–150 | Grade (weight without layout shift) |

Custom axes use all-uppercase four-character tags (e.g., `XTIL`, `WONK`, `SPAC`). Custom axes have no CSS property shorthand and must use `font-variation-settings`.

### @font-face with Variable Font Ranges

Declare variable fonts with ranges so the browser knows the full axis span:

```css
/* Single variable font file covering full weight range */
@font-face {
  font-family: 'Inter';
  src:
    url('/fonts/inter-variable.woff2') format('woff2 supports variations'),
    url('/fonts/inter-variable.woff2') format('woff2');
  font-weight: 100 900;        /* wght axis range */
  font-style: normal;
  font-display: swap;
}

/* Separate italic variable font */
@font-face {
  font-family: 'Inter';
  src: url('/fonts/inter-variable-italic.woff2') format('woff2 supports variations');
  font-weight: 100 900;
  font-style: italic;
  font-display: swap;
}

/* Font with opsz axis — declare optical size range */
@font-face {
  font-family: 'Source Serif';
  src: url('/fonts/source-serif-variable.woff2') format('woff2 supports variations');
  font-weight: 200 900;
  font-style: normal oblique -15deg 0deg;  /* slnt axis range */
  font-display: swap;
}
```

### font-variation-settings Usage

`font-variation-settings` is a low-level override. Use registered-axis CSS properties first; fall back to `font-variation-settings` for custom axes or unsupported registered axes.

```css
/* Prefer high-level properties */
h1 {
  font-weight: 700;         /* maps to wght */
  font-style: oblique 5deg; /* maps to slnt */
  font-optical-sizing: auto; /* maps to opsz */
}

/* Use font-variation-settings for custom axes or combined overrides */
.headline {
  font-variation-settings:
    'wght' 750,
    'GRAD' 50,   /* custom Grade axis — no CSS property */
    'opsz' 36;
}

/* Dark mode: GRAD axis adjustment (see section below) */
@media (prefers-color-scheme: dark) {
  body {
    font-variation-settings: 'GRAD' -50;
  }
}
```

**Do:** Set `font-variation-settings` on a parent and let children inherit.
**Don't:** Override `font-variation-settings` on a child while expecting inherited axes to persist — the property does not merge; it replaces entirely.

```css
/* WRONG — child loses 'wght' axis set on parent */
body { font-variation-settings: 'wght' 400, 'GRAD' 0; }
.bold { font-variation-settings: 'wght' 700; } /* GRAD silently reset to default */

/* CORRECT — repeat all axes on child */
.bold { font-variation-settings: 'wght' 700, 'GRAD' 0; }

/* BETTER — use CSS custom properties to manage axes */
:root {
  --font-wght: 400;
  --font-grad: 0;
}
body {
  font-variation-settings: 'wght' var(--font-wght), 'GRAD' var(--font-grad);
}
.bold { --font-wght: 700; }
@media (prefers-color-scheme: dark) {
  :root { --font-grad: -50; }
}
```

### font-optical-sizing

`font-optical-sizing: auto` lets the browser use the `opsz` axis automatically based on computed `font-size`. It is enabled by default when the font has an `opsz` axis.

```css
/* auto (default) — browser picks opsz value from font-size */
body { font-optical-sizing: auto; }

/* none — disable automatic optical sizing */
.logo-lockup { font-optical-sizing: none; }

/* Manual override via font-variation-settings */
.caption {
  font-optical-sizing: none;          /* disable auto so manual value wins */
  font-variation-settings: 'opsz' 12;
}
```

---

## font-display and Loading Behavior

### FOIT, FOUT, FAIT Definitions

| Term | Full name | Behavior |
|------|-----------|----------|
| FOIT | Flash of Invisible Text | Browser hides text until the web font loads |
| FOUT | Flash of Unstyled Text | Browser shows fallback font, swaps to web font when ready |
| FAIT | Flash of Actually Invisible Text | Hybrid: short invisible period then fallback |

**Which is worse:** FOIT is worse for perceived performance and accessibility. Users see blank content, which degrades readability and Cumulative Layout Shift (CLS) scores when text suddenly appears. FOUT is preferable because content is readable immediately.

### font-display Values

```css
@font-face {
  font-family: 'Inter';
  src: url('/fonts/inter-variable.woff2') format('woff2');
  font-weight: 100 900;
  font-display: swap;       /* change this per use case */
}
```

| Value | Block period | Swap period | Best for |
|-------|-------------|-------------|----------|
| `auto` | Browser default (usually same as `block`) | Varies | Avoid — unpredictable |
| `block` | ~3s invisible | Infinite swap | Icon fonts where letters must match |
| `swap` | ~0ms invisible | Infinite swap | Body copy, headings — text visible immediately |
| `fallback` | ~100ms invisible | ~3s swap | Performance-sensitive text; graceful if font is slow |
| `optional` | ~100ms invisible | 0s (no swap) | Decorative fonts, hero text; skip swap if font not cached |

**Decision guide:**

- Body text, headings, UI labels → `font-display: swap`
- Performance-critical above-the-fold text → `font-display: fallback` (limits FOUT to 3s)
- Decorative / non-critical typefaces → `font-display: optional` (no layout shift at all on slow connections)
- Icon fonts (glyph mapping critical) → `font-display: block` (accept FOIT for correctness)

```css
/* Body copy — always visible */
@font-face {
  font-family: 'Inter';
  src: url('/fonts/inter-variable.woff2') format('woff2');
  font-weight: 100 900;
  font-display: swap;
}

/* Optional decorative typeface */
@font-face {
  font-family: 'Playfair Display';
  src: url('/fonts/playfair-variable.woff2') format('woff2');
  font-weight: 300 900;
  font-display: optional;
}

/* Icon font — glyphs must match */
@font-face {
  font-family: 'MyIcons';
  src: url('/fonts/myicons.woff2') format('woff2');
  font-display: block;
}
```

---

## Preload Strategies

### Preload Syntax

```html
<!-- Preload a WOFF2 variable font — crossorigin is required even same-origin -->
<link
  rel="preload"
  href="/fonts/inter-variable.woff2"
  as="font"
  type="font/woff2"
  crossorigin
/>
```

`crossorigin` is mandatory for all font preloads regardless of origin. Without it the browser fetches the font twice.

### Which Subset to Preload

Preload only the subset(s) used above the fold. Preloading unused fonts wastes bandwidth and delays critical resources.

```html
<!-- Preload only the Latin subset for an English-language site -->
<link rel="preload" href="/fonts/inter-latin.woff2" as="font" type="font/woff2" crossorigin />

<!-- Do NOT preload every unicode-range subset — browser handles lazy loading of others -->
```

### How Many Fonts to Preload

- **1–2 font files maximum** as a general rule. More preloads compete with images, scripts, and CSS.
- Preload the **regular weight** (400) of the primary typeface first.
- Preload a **bold weight** (700) only if it appears above the fold in a critical heading.
- Never preload fonts with `font-display: optional` — the browser will skip the swap anyway on slow connections.

```html
<!-- Minimal correct preload for a typical site -->
<head>
  <!-- 1. Primary body font — preloaded -->
  <link rel="preload" href="/fonts/inter-variable.woff2" as="font" type="font/woff2" crossorigin />

  <!-- 2. Stylesheet that declares @font-face — load after preload hint -->
  <link rel="stylesheet" href="/css/fonts.css" />
</head>
```

---

## WOFF2 Subsetting

### unicode-range Descriptor

`unicode-range` tells the browser which characters a font file covers. The browser only downloads the file if the page contains a character in that range.

```css
/* Latin subset */
@font-face {
  font-family: 'Inter';
  src: url('/fonts/inter-latin.woff2') format('woff2');
  font-weight: 100 900;
  font-display: swap;
  unicode-range: U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6,
                 U+02DA, U+02DC, U+2000-206F, U+2074, U+20AC, U+2122,
                 U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD;
}

/* Cyrillic subset — only downloaded if Cyrillic characters present */
@font-face {
  font-family: 'Inter';
  src: url('/fonts/inter-cyrillic.woff2') format('woff2');
  font-weight: 100 900;
  font-display: swap;
  unicode-range: U+0400-045F, U+0490-0491, U+04B0-04B1, U+2116;
}

/* Greek subset */
@font-face {
  font-family: 'Inter';
  src: url('/fonts/inter-greek.woff2') format('woff2');
  font-weight: 100 900;
  font-display: swap;
  unicode-range: U+0370-03FF;
}
```

### Subsetting Tools

**pyftsubset** (part of fonttools — Python):

```bash
# Install
pip install fonttools brotli

# Subset to Latin characters and output WOFF2
pyftsubset inter-variable.ttf \
  --output-file=inter-latin.woff2 \
  --flavor=woff2 \
  --layout-features="*" \
  --unicodes="U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+2000-206F,U+2074,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD"

# Preserve variable font axes
pyftsubset inter-variable.ttf \
  --output-file=inter-variable-latin.woff2 \
  --flavor=woff2 \
  --layout-features="*" \
  --unicodes="U+0000-00FF" \
  --retain-gids
```

**glyphhanger** (Node.js — analyzes a live URL and generates subset):

```bash
# Install
npm install -g glyphhanger

# Analyze a URL and output subset unicodes
glyphhanger https://example.com --subset=inter-variable.ttf --formats=woff2

# Subset from a text string
glyphhanger --whitelist="ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789 " \
  --subset=inter-variable.ttf \
  --formats=woff2
```

---

## Fallback Metric Overrides and CLS Prevention

When `font-display: swap` triggers, the fallback font (Arial, Georgia, etc.) has different metrics than the web font. The browser reflows layout, causing Cumulative Layout Shift (CLS).

**Fallback metric override descriptors** (in `@font-face` of a _fallback_ font face) adjust the fallback to match the web font's metrics, eliminating the reflow.

```css
/* Step 1: Declare the real web font */
@font-face {
  font-family: 'Inter';
  src: url('/fonts/inter-variable.woff2') format('woff2');
  font-weight: 100 900;
  font-display: swap;
}

/* Step 2: Declare an adjusted fallback with matching metrics */
@font-face {
  font-family: 'Inter-fallback';
  src: local('Arial');
  size-adjust: 107%;               /* scale fallback to match web font cap height */
  ascent-override: 90%;            /* match web font ascender */
  descent-override: 22%;           /* match web font descender */
  line-gap-override: 0%;           /* match web font line gap */
}

/* Step 3: Use both in the font stack */
body {
  font-family: 'Inter', 'Inter-fallback', Arial, sans-serif;
}
```

### Descriptor Reference

| Descriptor | What it adjusts | Value type |
|------------|----------------|------------|
| `size-adjust` | Overall em-square scale | `%` (100% = no change) |
| `ascent-override` | Ascender height above baseline | `%` of em |
| `descent-override` | Descender depth below baseline | `%` of em |
| `line-gap-override` | Extra space between lines built into the font | `%` of em |

### Finding Metric Values

Use the [Font Style Matcher](https://meowni.ca/font-style-matcher/) or the `fonttools` Python library:

```python
from fontTools.ttLib import TTFont

font = TTFont('inter-variable.ttf')
head = font['head']
hhea = font['hhea']
os2  = font['OS/2']

units_per_em = head.unitsPerEm
ascent   = os2.sTypoAscender  / units_per_em * 100
descent  = abs(os2.sTypoDescender) / units_per_em * 100
line_gap = os2.sTypoLineGap   / units_per_em * 100

print(f"ascent-override: {ascent:.0f}%")
print(f"descent-override: {descent:.0f}%")
print(f"line-gap-override: {line_gap:.0f}%")
```

**Do:** Tune `size-adjust` first — it has the largest visual impact. Then fine-tune ascent/descent.
**Don't:** Use `ascent-override: 100%` blindly — 100% is the fallback default; only override when you have real metric data.

---

## Variable Fonts in Dark Mode

### GRAD Axis (Grade)

The Grade axis (`GRAD`) adjusts apparent weight without changing the advance widths of any glyphs. This means **no layout reflow** when switching between light and dark modes — unlike changing `font-weight`, which can alter character widths.

In dark mode, light text on dark backgrounds appears heavier due to irradiation/halation. Lowering `GRAD` compensates for this optical effect.

```css
:root {
  --font-grad: 0;
}

@media (prefers-color-scheme: dark) {
  :root {
    --font-grad: -50;    /* reduce apparent weight in dark mode */
  }
}

body {
  font-variation-settings: 'wght' var(--font-wght, 400), 'GRAD' var(--font-grad);
}
```

```css
/* Theme toggle via data attribute */
[data-theme="light"] { --font-grad: 0; }
[data-theme="dark"]  { --font-grad: -50; }

body {
  font-variation-settings: 'GRAD' var(--font-grad, 0);
}
```

**GRAD vs wght in dark mode:**

| Approach | Layout shift | Glyph width change | Correct method |
|----------|-------------|-------------------|----------------|
| Change `font-weight` | Yes (possible) | Yes | No |
| Change `GRAD` axis | No | No | Yes |

### Fonts with a GRAD Axis

Notable typefaces: Roboto Flex, Google Fonts variable fonts from 2022+, Amstelvar. Check if a font has `GRAD` using `font-variation-settings: 'GRAD' 0` — if it has no effect the font lacks the axis.

---

## System Font Stacks

### Purpose

System fonts load instantly (zero network request) and match the platform's native UI. Use them for UI chrome, admin interfaces, and wherever custom branding is not required.

### Per-Platform System Fonts

| Platform | Primary UI font | Year introduced |
|----------|----------------|----------------|
| macOS 10.11+ | San Francisco (`-apple-system`) | 2015 |
| iOS 9+ | San Francisco (`-apple-system`) | 2015 |
| Windows 10+ | Segoe UI | 2006 |
| Windows 11 | Segoe UI Variable | 2021 |
| Android 4.0+ | Roboto | 2011 |
| Linux (GNOME) | Cantarell | — |
| Linux (KDE) | Noto Sans | — |

### Modern System Font Stack

```css
/* Full cross-platform system font stack */
body {
  font-family:
    -apple-system,          /* macOS/iOS Safari — San Francisco */
    BlinkMacSystemFont,     /* macOS Chrome — San Francisco */
    'Segoe UI Variable',    /* Windows 11 — variable version of Segoe UI */
    'Segoe UI',             /* Windows 10 */
    system-ui,              /* CSS standard keyword (Chrome/Firefox/Safari) */
    Roboto,                 /* Android, ChromeOS */
    Oxygen,                 /* KDE Linux */
    Ubuntu,                 /* Ubuntu Linux */
    Cantarell,              /* GNOME Linux */
    'Helvetica Neue',       /* macOS pre-San Francisco */
    Arial,                  /* universal fallback */
    sans-serif;
}
```

### Monospace System Stack

```css
code, pre, kbd, samp {
  font-family:
    ui-monospace,           /* CSS standard — maps to SF Mono on Apple */
    'Cascadia Code',        /* Windows 11 Terminal default */
    'Cascadia Mono',
    'Segoe UI Mono',        /* Windows 10 */
    'Ubuntu Mono',          /* Ubuntu Linux */
    'Roboto Mono',          /* Android */
    Menlo,                  /* macOS pre-SF Mono */
    Monaco,
    Consolas,               /* Windows */
    'Courier New',          /* universal fallback */
    monospace;
}
```

### Serif System Stack

```css
.prose {
  font-family:
    ui-serif,               /* CSS standard — not yet widely unique per platform */
    Georgia,                /* universal, well-hinted */
    Cambria,                /* Windows */
    'Times New Roman',
    Times,
    serif;
}
```

### Notes on `system-ui`

`system-ui` is a CSS level 4 generic family that maps to the OS UI font. It is well-supported (Chrome 56+, Firefox 92+, Safari 11+). Use it as the primary keyword in minimal stacks when you want the standard OS font without specifying exact names:

```css
/* Minimal modern stack */
body {
  font-family: system-ui, sans-serif;
}
```

For maximum compatibility with older browsers and to ensure San Francisco on macOS/iOS Safari (which does not respond to `system-ui` in all versions), keep `-apple-system` and `BlinkMacSystemFont` before `system-ui`.

---

## Quick Reference: Common Mistakes

| Mistake | Fix |
|---------|-----|
| `font-variation-settings` on child loses parent axes | Use CSS custom properties to compose all axes in one declaration |
| Preloading without `crossorigin` attribute | Always add `crossorigin` — font fetches are CORS requests |
| Using `font-display: block` on body text | Use `swap` — block causes FOIT, text invisible for up to 3s |
| Changing `font-weight` between light/dark modes | Use `GRAD` axis — changes weight appearance without layout shift |
| Missing `font-weight` range in `@font-face` for variable font | Declare `font-weight: 100 900` so browser knows full range |
| Subsetting variable font without `--retain-gids` | Add `--retain-gids` to pyftsubset to preserve axis interpolation |
| Setting `font-optical-sizing: auto` alongside manual `opsz` in `font-variation-settings` | Set `font-optical-sizing: none` first, then set `'opsz'` manually |
| Preloading every unicode-range split | Preload only the primary Latin subset; browser lazy-loads others |
