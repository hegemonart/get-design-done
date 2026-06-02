# Typography - Scale, Pairing, and Hierarchy

This file is the domain index for typography. It covers type-scale construction,
weight hierarchy, font pairing, and micro-typography. Read `variable-fonts-loading.md`
when web fonts are in scope. Read `proportion-systems.md` when the full UI grid is
in scope. Does not cover text-contrast (see `color.md`) or locale text expansion
(see `responsive.md`, which indexes [`./i18n.md`](./i18n.md) for the per-locale expansion budgets).

## Fragment Index

| Fragment | When to load |
|---|---|
| This file (below) | type scale ratios, sizing tokens, weight hierarchy, font pairings, micro-typography |
| [`./variable-fonts-loading.md`](./variable-fonts-loading.md) | web fonts, `@font-face`, `font-display`, FOIT/FOUT, variable font axes, subsetting, fallback metrics |
| [`./proportion-systems.md`](./proportion-systems.md) | 4pt/8pt/sqrt(2) baseline grid, spacing ladder, icon sizing, corner radius derivation |

## Rules of Thumb

1. A 1.25 (Major Third) or 1.333 (Perfect Fourth) ratio fits 95% of SaaS products; only reach for 1.618 when visual drama is the explicit brief.
2. Never author `line-height` as a pixel value - always use a unitless multiplier (1.4-1.6 for body, 1.1-1.2 for headings); unitless values scale with user font-size overrides.
3. Font weight on the web has only 7 meaningful stops (100-700 in 100-steps); any weight not in the font file rounds to the nearest available - check the variable font `wght` range before specifying 450 or 600.
4. Baseline-grid lock: every spacing and sizing token should be a multiple of the chosen baseline unit; `padding: 12px` next to body at `16/24` on an 8pt grid is a silent proportion break.
5. For localized UIs, size type containers for +40% expansion (Russian/Finnish worst-case); top-aligned labels are the only label position that absorbs expansion without layout breakage.

## See Also

- Text contrast and color-blindness checks: [`./color.md`](./color.md)
- Text expansion in localized UIs: [`./responsive.md`](./responsive.md)
- Proportion systems tie type to spatial grid: [`./spatial.md`](./spatial.md)
- Finance number formatting (tabular-nums): [`./domains/finance-patterns.md`](./domains/finance-patterns.md)

---

## Type Scale Systems

### Modular Scale (Recommended)

Choose a ratio and base size. Common ratios:

| Ratio | Name | Use case |
|---|---|---|
| 1.067 | Minor Second | Dense UIs, data-heavy dashboards |
| 1.125 | Major Second | Conservative, corporate |
| 1.200 | Minor Third | Balanced - most SaaS products |
| 1.250 | Major Third | Consumer, editorial |
| 1.333 | Perfect Fourth | Strong hierarchy, marketing |
| 1.414 | Augmented Fourth | Bold, magazine-style |
| 1.500 | Perfect Fifth | Very dramatic hierarchy |
| 1.618 | Golden Ratio | Maximum visual drama |

**Standard scale (base 16px, ratio 1.25 - Major Third):**

| Token | Size | Use |
|---|---|---|
| `text-xs` | 12px | Captions, badges, timestamps |
| `text-sm` | 14px | Secondary labels, helper text |
| `text-base` | 16px | Body text (minimum) |
| `text-lg` | 18px / 20px | Lead paragraphs, emphasized body |
| `text-xl` | 20px / 24px | Section headings (h3) |
| `text-2xl` | 24px / 32px | Page headings (h2) |
| `text-3xl` | 30px / 40px | Section titles (h1 secondary) |
| `text-4xl` | 36px / 48px | Hero headings |
| `text-5xl+` | 48px+ | Display, marketing hero |

Never create a scale ad-hoc. Pick one ratio, generate the scale, use only values in the scale.

**See:** [`./proportion-systems.md`](./proportion-systems.md) for how the type scale ties to spacing / sizing / radius scales.

---

## Line Height

| Context | Line height | Notes |
|---|---|---|
| Body text | **1.5 - 1.75** | More generous = more readable |
| Headings | **1.1 - 1.3** | Tight heading stacks look intentional |
| Captions / small text | **1.4** | Smaller text needs more breathing room |
| Code blocks | **1.6 - 1.8** | Line scanning for code |
| Display / hero | **0.9 - 1.1** | Can go very tight for dramatic effect |

---

## Line Length (Measure)

| Context | Characters per line | Notes |
|---|---|---|
| Desktop body | **65 - 75 chars** | Optimal reading comfort |
| Mobile body | **35 - 55 chars** | Narrower viewport forces shorter |
| Hero/display | **35 - 55 chars** | Headings should never wrap awkwardly |
| Data/tables | No limit | Tables have own structure |

Enforce with `max-width`: `65ch` for body containers works with any font size.

---

## Font Weight Hierarchy

| Role | Weight | Notes |
|---|---|---|
| Display headings | **700 - 900** | Bold commands attention |
| Page headings | **600 - 700** | Strong but not display-level |
| Section headings | **500 - 600** | Distinguish from body |
| Body text | **400** | Regular - no emphasis weight |
| UI labels | **500** | Slightly heavier than body |
| Captions | **400** | Regular - size reduces emphasis |
| Monospace code | **400 - 500** | |

**Rule**: Never use `font-weight: 300` (light) on small text. It becomes illegible below 16px.

---

## Proven Font Pairings

### For SaaS / Productivity
- **Plus Jakarta Sans** (headers) + **Plus Jakarta Sans** (body) - single-family, geometric, modern
- **DM Sans** (headers) + **DM Sans** (body) - clean, contemporary
- **Outfit** + **Work Sans** - geometric, startup feel

### For Consumer / Marketing
- **Playfair Display** + **Inter** - editorial contrast (serif header, sans body)
- **Cormorant Garamond** + **Montserrat** - luxury, refined
- **Syne** + **Manrope** - fashion-forward, editorial

### For Finance / Enterprise
- **IBM Plex Sans** (all) - technical, neutral, reliable
- **Lexend** + **Source Sans 3** - corporate, trustworthy, accessible
- **Libre Bodoni** + **Public Sans** - news editorial, authority

### For Developer Tools / Technical
- **JetBrains Mono** (code) + **IBM Plex Sans** (UI) - technical, consistent
- **Fira Code** + **Fira Sans** - same family, harmonious
- **Geist Mono** + **Geist** (Vercel) - modern technical

### For Bold / Expressive
- **Bebas Neue** + **Source Sans 3** - display contrast, impactful
- **Syne** + **Epilogue** - editorial, contemporary
- **Clash Display** + **Satoshi** - startup bold, premium

### For Accessibility-First
- **Atkinson Hyperlegible** (all) - designed for low-vision readers
- **Lexend** (all) - designed to improve reading fluency

---

## Typographic Anti-Patterns

**Inter as the default** - Inter is excellent but requires a reason. "I used Inter" is not a typographic decision. If there's no brand reason for Inter specifically, explore the pairing list above.

**Space Grotesk without purpose** - frequently used as a "quirky technical" font. Overused.

**Mismatched personality** - serif heading on a developer tool, playful font on a medical platform, condensed display on body text.

**Too many families** - maximum **2 font families** in a UI. More than that = chaos. (Exceptions: monospace for code is a 3rd that doesn't count.)

**Light weights on small text** - `font-weight: 300` below 16px fails contrast and readability.

**All caps body text** - reserved for: labels, badges, category markers, short UI labels only. Never for sentences or paragraphs.

**Inconsistent tracking** - only use `letter-spacing` intentionally. Positive tracking on uppercase labels is fine. Negative tracking on small body text reduces readability.

---

## Letter Spacing Rules

| Use case | letter-spacing |
|---|---|
| Body text | `0` (default) |
| Uppercase labels / badges | `0.05em - 0.1em` |
| Display headings | `-0.02em - 0.01em` |
| Monospace code | `0` or slight positive |

---

## Hierarchy Without Size (Advanced)

Strong typographic hierarchy comes from **multiple signals combined**, not just font-size:

```
SIZE + WEIGHT + COLOR + FAMILY + SPACING
```

Example of weak hierarchy: h2 = 24px regular Inter, h3 = 20px regular Inter, body = 16px regular Inter.
Example of strong hierarchy: h2 = 32px 700 Playfair Display, h3 = 18px 600 Inter, body = 16px 400 Inter.

Test: Can you tell which element is a heading just from the weight/family, without looking at size? If yes, hierarchy is working.

---

## Number Formatting in Data UIs

- Use **tabular figures** (`font-variant-numeric: tabular-nums`) for all numbers in tables, dashboards, and metric displays. This aligns decimal points.
- `JetBrains Mono`, `IBM Plex Mono`, `Roboto Mono` have tabular figures by default.
- Most modern sans-serifs support it via CSS property even without a separate mono font.

```css
.metric-value,
.table-number {
  font-variant-numeric: tabular-nums;
}
```

---

## Brand Archetype Quick Guide

| Archetype | Character | Recommended Pairing |
|-----------|-----------|---------------------|
| SaaS / productivity | clear, neutral, utilitarian | Inter (UI) + Inter (body) - single family |
| Consumer / editorial | warm, opinionated, expressive | Fraunces or GT Sectra (display) + Inter (body) |
| Enterprise / finance | authoritative, conservative | IBM Plex Sans (UI) + IBM Plex Serif (body) |
| Developer tools | technical, efficient | Geist (UI) + Geist Mono (code) |
| Bold / expressive | high-energy, distinctive | Sohne or Mona Sans (display) + Inter (body) |

**Selection heuristic:** If the brief uses words like "professional", "trustworthy", "clean" use SaaS or Enterprise. If "warm", "editorial", "narrative" use Consumer. If "bold", "energetic", "distinctive" use Bold. If "technical", "efficient", "fast" use Dev tools.

---

## Micro-Typography

### text-wrap

Use `text-wrap: balance` for headings to prevent orphaned single words:
```css
h1, h2, h3 { text-wrap: balance; }
```
Chromium supports up to 6 lines, Firefox up to 10. Do not apply to body text (performance cost scales with line count). For body copy and captions, use `text-wrap: pretty` instead - it prevents widows (dangling last words) without the line-count restriction.

### Font smoothing

Apply antialiasing at root level only:
```css
:root {
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}
```
Never apply per-element - this creates inconsistency within a single text block.

### Tabular numerals

Use tabular-nums on any surface where numbers change dynamically or need to align in columns:
```css
.counter, .price, .timer, .table-cell { font-variant-numeric: tabular-nums; }
```
Proportional numerals (the default) cause text to shift width when numbers change, creating jitter in timers and prices. Exception: Inter's `1` character widens slightly with tabular-nums - test at your numeric composition before committing.
