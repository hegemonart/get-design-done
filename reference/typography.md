# Typography — Scale, Pairing, and Hierarchy

---

## Type Scale Systems

### Modular Scale (Recommended)

Choose a ratio and base size. Common ratios:

| Ratio | Name | Use case |
|---|---|---|
| 1.067 | Minor Second | Dense UIs, data-heavy dashboards |
| 1.125 | Major Second | Conservative, corporate |
| 1.200 | Minor Third | Balanced — most SaaS products |
| 1.250 | Major Third | Consumer, editorial |
| 1.333 | Perfect Fourth | Strong hierarchy, marketing |
| 1.414 | Augmented Fourth | Bold, magazine-style |
| 1.500 | Perfect Fifth | Very dramatic hierarchy |
| 1.618 | Golden Ratio | Maximum visual drama |

**Standard scale (base 16px, ratio 1.25 — Major Third):**

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

---

## Line Height

| Context | Line height | Notes |
|---|---|---|
| Body text | **1.5 – 1.75** | More generous = more readable |
| Headings | **1.1 – 1.3** | Tight heading stacks look intentional |
| Captions / small text | **1.4** | Smaller text needs more breathing room |
| Code blocks | **1.6 – 1.8** | Line scanning for code |
| Display / hero | **0.9 – 1.1** | Can go very tight for dramatic effect |

---

## Line Length (Measure)

| Context | Characters per line | Notes |
|---|---|---|
| Desktop body | **65 – 75 chars** | Optimal reading comfort |
| Mobile body | **35 – 55 chars** | Narrower viewport forces shorter |
| Hero/display | **35 – 55 chars** | Headings should never wrap awkwardly |
| Data/tables | No limit | Tables have own structure |

Enforce with `max-width`: `65ch` for body containers works with any font size.

---

## Font Weight Hierarchy

| Role | Weight | Notes |
|---|---|---|
| Display headings | **700 – 900** | Bold commands attention |
| Page headings | **600 – 700** | Strong but not display-level |
| Section headings | **500 – 600** | Distinguish from body |
| Body text | **400** | Regular — no emphasis weight |
| UI labels | **500** | Slightly heavier than body |
| Captions | **400** | Regular — size reduces emphasis |
| Monospace code | **400 – 500** | |

**Rule**: Never use `font-weight: 300` (light) on small text. It becomes illegible below 16px.

---

## Proven Font Pairings

### For SaaS / Productivity
- **Plus Jakarta Sans** (headers) + **Plus Jakarta Sans** (body) — single-family, geometric, modern
- **DM Sans** (headers) + **DM Sans** (body) — clean, contemporary
- **Outfit** + **Work Sans** — geometric, startup feel

### For Consumer / Marketing
- **Playfair Display** + **Inter** — editorial contrast (serif header, sans body)
- **Cormorant Garamond** + **Montserrat** — luxury, refined
- **Syne** + **Manrope** — fashion-forward, editorial

### For Finance / Enterprise
- **IBM Plex Sans** (all) — technical, neutral, reliable
- **Lexend** + **Source Sans 3** — corporate, trustworthy, accessible
- **Libre Bodoni** + **Public Sans** — news editorial, authority

### For Developer Tools / Technical
- **JetBrains Mono** (code) + **IBM Plex Sans** (UI) — technical, consistent
- **Fira Code** + **Fira Sans** — same family, harmonious
- **Geist Mono** + **Geist** (Vercel) — modern technical

### For Bold / Expressive
- **Bebas Neue** + **Source Sans 3** — display contrast, impactful
- **Syne** + **Epilogue** — editorial, contemporary
- **Clash Display** + **Satoshi** — startup bold, premium

### For Accessibility-First
- **Atkinson Hyperlegible** (all) — designed for low-vision readers
- **Lexend** (all) — designed to improve reading fluency

---

## Typographic Anti-Patterns

**Inter as the default** — Inter is excellent but requires a reason. "I used Inter" is not a typographic decision. If there's no brand reason for Inter specifically, explore the pairing list above.

**Space Grotesk without purpose** — frequently used as a "quirky technical" font. Overused.

**Mismatched personality** — serif heading on a developer tool, playful font on a medical platform, condensed display on body text.

**Too many families** — maximum **2 font families** in a UI. More than that = chaos. (Exceptions: monospace for code is a 3rd that doesn't count.)

**Light weights on small text** — `font-weight: 300` below 16px fails contrast and readability.

**All caps body text** — reserved for: labels, badges, category markers, short UI labels only. Never for sentences or paragraphs.

**Inconsistent tracking** — only use `letter-spacing` intentionally. Positive tracking on uppercase labels is fine. Negative tracking on small body text reduces readability. Random tracking changes across components signal lack of system.

---

## Letter Spacing Rules

| Use case | letter-spacing |
|---|---|
| Body text | `0` (default) |
| Uppercase labels / badges | `0.05em – 0.1em` |
| Display headings | `−0.02em – 0.01em` |
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

Pick the archetype closest to the project brief; use the recommended pairing
as a starting point (adjust for specific constraints).

| Archetype | Character | Recommended Pairing |
|-----------|-----------|---------------------|
| SaaS / productivity | clear, neutral, utilitarian | Inter (UI) + Inter (body) — single family |
| Consumer / editorial | warm, opinionated, expressive | Fraunces or GT Sectra (display) + Inter (body) |
| Enterprise / finance | authoritative, conservative | IBM Plex Sans (UI) + IBM Plex Serif (body) |
| Developer tools | technical, efficient | Geist (UI) + Geist Mono (code) |
| Bold / expressive | high-energy, distinctive | Söhne or Mona Sans (display) + Inter (body) |

**Selection heuristic:** If the brief uses words like "professional", "trustworthy", "clean" → SaaS or Enterprise. If "warm", "editorial", "narrative" → Consumer. If "bold", "energetic", "distinctive" → Bold. If "technical", "efficient", "fast" → Dev tools.

---

## Variable Fonts

Variable fonts expose typographic axes that can be animated or set per-context
via `font-variation-settings`. Prefer variable fonts over static family fallbacks
when available — one file covers all weights and widths.

### Common axes

| Axis | Range | Purpose |
|------|-------|---------|
| wght | 100–900 | Weight (Thin → Black) |
| wdth | 50%–150% | Width (Condensed → Extended) |
| ital | 0 / 1 | Italic toggle (discrete in most) |
| opsz | font-size value | Optical size (auto-applies when `font-optical-sizing: auto`) |

### @font-face format

```css
@font-face {
  font-family: 'InterVariable';
  src: url('/fonts/InterVariable.woff2') format('woff2-variations');
  font-weight: 100 900;
  font-style: normal;
}
```

### Usage via font-variation-settings

```css
.heading { font-variation-settings: "wght" 700, "opsz" 32; }
.body    { font-variation-settings: "wght" 400; }
```

### Fallback strategy

Always include a non-variable fallback of the same family in the font stack:

```css
font-family: 'InterVariable', 'Inter', -apple-system, system-ui, sans-serif;
```

---

## Micro-Typography
Source: jakubkrehel/make-interfaces-feel-better (MIT) — typography.md

### text-wrap

Use `text-wrap: balance` for headings to prevent orphaned single words:
```css
h1, h2, h3 { text-wrap: balance; }
```
Chromium supports up to 6 lines, Firefox up to 10. Do not apply to body text (performance cost scales with line count). For body copy and captions, use `text-wrap: pretty` instead — it prevents widows (dangling last words) without the line-count restriction.

### Font smoothing

Apply antialiasing at root level only:
```css
:root {
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}
```
Never apply per-element — this creates inconsistency within a single text block and is one of the most common micro-typography mistakes. The antialiased value makes text appear slightly thinner/lighter, which is generally preferred for UI type at modern screen densities.

### Tabular numerals

Use tabular-nums on any surface where numbers change dynamically or need to align in columns:
```css
.counter, .price, .timer, .table-cell { font-variant-numeric: tabular-nums; }
```
Proportional numerals (the default) cause text to shift width when numbers change, creating a distracting jitter in timers and prices. Exception: Inter's `1` character widens slightly with tabular-nums — test at your numeric composition before committing.

## Font Pairings Catalog
Source: nextlevelbuilder/ui-ux-pro-max-skill (MIT) — data/typography.csv

57 professionally curated pairings grouped by use-case vertical. For font loading, see `reference/data/google-fonts.csv` for the full 1923-font reference.

### SaaS / Productivity
- **Inter + Inter** (mono weight hierarchy) — The "safe default" for app UIs. Use regular (400) for body, medium (500) for labels, semibold (600) for headings. Consistent x-height, excellent at small sizes.
- **Inter + JetBrains Mono** — For dev tools and dashboards with code display. JetBrains Mono has excellent legibility at 12-14px.
- **Geist Sans + Geist Mono** — Vercel's pair; clean, modern, designed together.
- **Outfit + DM Mono** — Friendly SaaS feel with clear code fallback.

### Consumer / Marketing
- **Satoshi + Cabinet Grotesk** — High-energy, modern consumer feel.
- **Plus Jakarta Sans + Syne** — Playful but legible; works for creative consumer apps.
- **DM Sans + DM Serif Display** — Classic pairing; editorial headers, clean body.
- **Nunito + Source Code Pro** — Approachable and friendly.

### Finance / Enterprise
- **IBM Plex Sans + IBM Plex Mono** — Authoritative, systematic, designed for data-heavy interfaces.
- **Source Sans 3 + Source Code Pro** — Adobe's workhorse pair; widely trusted.
- **Lato + Roboto Mono** — Clean, neutral enterprise pair.

### Editorial / Publishing
- **Playfair Display + Source Serif 4** — High contrast serif headers with readable body serif.
- **Cormorant Garamond + Proza Libre** — Elegant luxury/editorial tone.
- **Libre Baskerville + Libre Franklin** — Free-license editorial pair.
- **EB Garamond + Lato** — Classic print feel with modern body.

### Wellness / Health
- **Nunito + Nunito Sans** — Soft, approachable, consistent x-height.
- **Quicksand + Work Sans** — Rounded, friendly, healthcare-appropriate.
- **Raleway + Open Sans** — Clean and welcoming.

### Dev Tools
- **JetBrains Mono + Inter** — Code-first, UI-second; natural for developer tools.
- **Fira Code + Fira Sans** — Cohesive family; ligatures available.
- **Cascadia Code + Segoe UI** — Microsoft's modern dev pair.

### Luxury / Fashion
- **Cormorant + Montserrat** — High contrast serif + geometric sans; classic luxury.
- **Bodoni Moda + Jost** — Fashion editorial feel.
- **Playfair Display + Raleway** — Elegant header + clean body.

### Gaming / Entertainment
- **Syne + DM Sans** — Bold, energetic headers; clean readable body.
- **Bebas Neue + Open Sans** — Impact headlines; neutral body.
- **Exo 2 + Roboto** — Futuristic but readable.
