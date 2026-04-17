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
