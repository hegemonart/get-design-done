---
name: color-theory
type: palette
version: 1.0.0
phase: 28
tags: [color, oklch, harmonies, accessibility, motion]
last_updated: 2026-05-18
---

# Color Theory

The existing [palette catalog](./palette-catalog.md) gives industry-vertical lookup — read a row, adopt the baseline tokens, ship. This file gives the underlying model so an agent can reason about color *before* applying it: which color space to author in, how to construct a harmony that holds together under motion and across viewing conditions, how surrounding context shifts perception, which hue pairs collapse under common color-blindness, and why default sRGB interpolation produces muddy mid-transitions in animation. Where the catalog says "shift the primary hue ±15°", this file replaces that hand-wave with explicit OKLCH ΔL/ΔC/Δh guidance.

This is the file an agent should consult any time it is *constructing* color — picking a new palette, generating a harmony, animating a color, or auditing a contrast pair under the color-blindness lens.

---

## Color Spaces — sRGB / HSL / OKLCH / LCH

Color is not one thing. Every "color" lives in some color space, and every color space makes a trade between three concerns: device gamut (what monitors can actually display), authoring ergonomics (what a human can predict from the numbers), and perceptual uniformity (whether equal numeric jumps produce equal perceived jumps). Choosing the wrong space costs hours of token tweaking and produces palettes that drift under interpolation.

### sRGB

sRGB is the device-coordinate space — three channels (`r`, `g`, `b`), each `0–255` or `0–1`, mapped onto the standard-monitor gamut defined by IEC 61966-2-1 (1996). It models *what the monitor emits*, not *what the eye perceives*. Equal numeric jumps are not equal perceptual jumps: stepping `rgb(50 50 50)` → `rgb(100 100 100)` looks like a much larger lightness change than `rgb(200 200 200)` → `rgb(250 250 250)`, even though both are a +50 step. Use sRGB only at the output layer (final compiled CSS), not as the authoring space for a palette.

### HSL

HSL was the first authoring-friendly attempt: three channels (`h` 0–360°, `s` 0–100%, `l` 0–100%) that decompose color into hue, saturation, and lightness — the dimensions a human reasons in. The catch: HSL's `l` is *not* perceptual lightness. `hsl(60 100% 50%)` (pure yellow) and `hsl(240 100% 50%)` (pure blue) both have `l: 50%`, but yellow looks vastly brighter than blue at identical `l`. This means a design instruction like "shift hue 30°, hold lightness constant" can produce wildly different perceived lightnesses across hue ranges. HSL is fine for quick mental math; it is wrong for token-system construction.

### OKLCH

OKLCH is the modern authoring default: three channels (`L` 0–1 perceptual lightness, `C` 0–~0.4 chroma, `h` 0–360°), built on the Oklab perceptual color space (Ottosson, 2020). Three properties make it the right choice for design tokens:

1. **Perceptual uniformity in L.** `oklch(0.6 0 0)` and `oklch(0.6 0.2 240)` have the same perceived lightness, regardless of hue. "Hold lightness constant while shifting hue" finally means what it says.
2. **Independent C and h axes.** Adjusting chroma does not drift lightness; rotating hue does not drift either. Token systems become predictable.
3. **Wide-gamut aware.** OKLCH expresses Display-P3 and Rec.2020 colors that sRGB cannot represent, while remaining a single authoring space.

Browser support: CSS Color Module 4 `oklch(L C H)` shipped in Safari 15.4, Chrome 111, Firefox 113 — already production-safe for token authoring with sRGB fallback.

### LCH

LCH (CIE Lab-based) is OKLCH's older sibling: same three-axis structure (`L`, `C`, `h`), built on the 1976 CIE L*a*b* color space. It is perceptually uniform but has well-documented hue-rotation kinks in the blue range — straight-line hue interpolation through LCH visibly bends toward purple. OKLCH was specifically designed to fix this. Use LCH only when matching an existing print or video pipeline; otherwise prefer OKLCH.

### Concrete CSS — the same color in four spaces

Using `#1A56DB` from the FinTech/Banking row of [./palette-catalog.md](./palette-catalog.md) as the authoritative primary:

```css
/* The same color, four spaces. Author in OKLCH; output sRGB for fallback. */
.primary-srgb { color: rgb(26 86 219); }                 /* device coordinates */
.primary-hsl  { color: hsl(222 81% 48%); }               /* hue/sat/light, non-perceptual L */
.primary-oklch { color: oklch(0.488 0.215 263.5); }      /* perceptual L, predictable C and h */
.primary-lch  { color: lch(38 71 290); }                 /* legacy perceptual, blue-rotation kink */
```

```css
/* Token-system pattern — author OKLCH, ship sRGB fallback in the same declaration. */
:root {
  --color-primary: #1A56DB;                              /* sRGB fallback */
  --color-primary: oklch(0.488 0.215 263.5);             /* OKLCH wins where supported */
}
```

---

## Color Harmonies

All six harmonies expressed in OKLCH — adjust hue offset while holding `L` and `C` constant for perceptual stability. The hue offset is what defines the harmony; the lightness and chroma stay anchored so the relationship reads as a *family*, not a collision.

### Complementary

Two hues separated by 180°. Maximum hue contrast, used for accent pairs and dual-action layouts.

Formula: `h + 180°`, hold `L` and `C` constant.

```css
/* Base from FinTech row of ./palette-catalog.md (primary navy + complementary amber accent). */
:root {
  --primary:        oklch(0.488 0.215 263.5);   /* navy */
  --complementary:  oklch(0.488 0.215 83.5);    /* amber, +180° */
}
```

### Analogous

Three hues at small offsets — typically 30°. Reads as a single mood with internal modulation; ideal for backgrounds, illustrations, and gentle gradients.

Formula: `[h - 30°, h, h + 30°]`, hold `L` and `C` constant.

```css
/* Base from Healthcare row of ./palette-catalog.md (clinical green + neighbors). */
:root {
  --analog-a: oklch(0.65 0.15 132);   /* yellow-green */
  --analog-b: oklch(0.65 0.15 162);   /* green (anchor) */
  --analog-c: oklch(0.65 0.15 192);   /* teal */
}
```

### Triadic

Three hues evenly spaced 120° apart. High visual energy, balanced — used for playful brand systems and category color coding.

Formula: `[h, h + 120°, h + 240°]`, hold `L` and `C` constant.

```css
/* Base anchored on the SaaS/B2B row periwinkle of ./palette-catalog.md. */
:root {
  --triad-a: oklch(0.6 0.18 280);     /* periwinkle */
  --triad-b: oklch(0.6 0.18 40);      /* warm coral, +120° */
  --triad-c: oklch(0.6 0.18 160);     /* fresh green, +240° */
}
```

### Split-complement

A base hue plus the two hues flanking its complement (180° ± 30°). Retains complementary tension without the dual-action visual collision; the workhorse harmony for dashboards and content-heavy product surfaces.

Formula: `[h, h + 150°, h + 210°]`, hold `L` and `C` constant.

```css
/* Base from the Developer Tools row of ./palette-catalog.md (near-black + warm pair). */
:root {
  --split-base: oklch(0.6 0.16 260);  /* cool blue */
  --split-a:    oklch(0.6 0.16 50);   /* warm amber,  base + 150° */
  --split-b:    oklch(0.6 0.16 110);  /* lime green, base + 210° */
}
```

### Tetradic

Four hues forming a rectangle on the hue wheel — two complementary pairs offset from each other. Very rich; demands one dominant hue and three accents at lower chroma to avoid noise.

Formula: `[h, h + 60°, h + 180°, h + 240°]`, hold `L` and `C` constant.

```css
/* Base anchored on the Gaming/Entertainment row of ./palette-catalog.md (violet primary). */
:root {
  --tetra-a: oklch(0.55 0.2 300);     /* violet (dominant) */
  --tetra-b: oklch(0.55 0.12 0);      /* red-magenta, +60° (accent, reduced chroma) */
  --tetra-c: oklch(0.55 0.12 120);    /* green, +180° (accent) */
  --tetra-d: oklch(0.55 0.12 180);    /* teal, +240° (accent) */
}
```

### Monochromatic

One hue, varied only in `L` and/or `C`. Reads as a single material expressed across light and dark surfaces. The natural pattern for elevation systems and dense data displays.

Formula: hold `h` constant; vary `L` across `0.95 → 0.15` for a 9-step scale; optionally taper `C` near the L extremes (high `C` collapses to neutral as `L → 1` or `L → 0`).

```css
/* Base from the Luxury/Fashion row of ./palette-catalog.md (near-black scale). */
:root {
  --mono-50:  oklch(0.97 0.005 270);
  --mono-200: oklch(0.88 0.02  270);
  --mono-400: oklch(0.7  0.04  270);
  --mono-600: oklch(0.5  0.06  270);
  --mono-800: oklch(0.3  0.05  270);
  --mono-950: oklch(0.15 0.02  270);
}
```

### When to use which

- **Single brand voice, calm:** monochromatic or analogous.
- **Two clear actions (primary vs. destructive):** complementary.
- **Three-category coding (status: ok / warn / error):** triadic.
- **Dashboard with one hero accent + supporting hues:** split-complement.
- **Editorial / illustrative / rich brand:** tetradic — but reduce chroma on three of the four hues.
- **Token system primarily expressing depth, not category:** monochromatic, scaled across `L`.

---

## Simultaneous Contrast and Warm-Cool Effects

Color is never seen in isolation. The eye continuously normalizes color relative to its surround — a phenomenon Josef Albers documented exhaustively in *Interaction of Color* (1963) and which the perceptual literature calls *simultaneous contrast*. The same OKLCH value placed against a darker surround reads *lighter and more saturated* than placed against a lighter surround; against a complementary surround, hue itself shifts. Token-level lesson: a contrast ratio measured against pure white at design time is not the contrast a user perceives at runtime in a card-on-card-on-background layout.

```css
/* Same foreground token, two surrounds. The same token reads as a different color. */
.fg-on-light {
  background: oklch(0.97 0.01 270);                 /* near-white surround */
  color:      oklch(0.6  0.15 30);                  /* warm coral — appears darker and richer */
}
.fg-on-dark {
  background: oklch(0.18 0.02 270);                 /* near-black surround */
  color:      oklch(0.6  0.15 30);                  /* same OKLCH — appears lighter and more luminous */
}
```

Warm-cool effects are simultaneous contrast's spatial cousin. Warm hues (red through yellow, OKLCH `h` roughly 0–90°) read as *advancing* — they appear closer to the viewer; cool hues (green through blue, OKLCH `h` roughly 140–270°) read as *receding*. Place a warm accent against a cool field and the accent leaps forward; reverse the relationship and the same hue retreats. Use this deliberately: warm accents pull the eye to primary actions and selected states; cool accents recede appropriately for ambient information, hover states, and large background fields where you do not want the surface competing for attention.

---

## Color-Blindness — Deutan / Protan / Tritan

Color-vision deficiency is common — roughly 8% of males and 0.5% of females of Northern European descent have some form. The three clinical types collapse different hue pairs:

- **Deutan** (deuteranomaly / deuteranopia, ~6% of males — the most common): reduced green sensitivity. Confuses red-green pairs at similar lightness, and green-brown at similar saturation.
- **Protan** (protanomaly / protanopia, ~1% of males): reduced red sensitivity. Confuses red-green pairs; reds appear darker than to typical vision.
- **Tritan** (tritanomaly / tritanopia, very rare, <0.01%): reduced blue sensitivity. Confuses blue-yellow pairs and blue-green pairs.

Token-level guidance:

1. **Never encode status with red/green alone at similar `L`.** A red-green status pair where both tokens sit at `oklch(0.6 …)` is invisible to a deutan viewer. Either separate `L` by at least 0.15, or distinguish with an icon/shape.
2. **Prefer hue pairs separated by ≥ 120° in OKLCH `h` for category coding.** Red (`h ≈ 30°`) vs. blue (`h ≈ 260°`) is ~230° apart and reads reliably across all three types. Red (`h ≈ 30°`) vs. green (`h ≈ 140°`) is only ~110° apart and collapses under deutan.
3. **Test the destructive / success pair under deutan simulation.** If a deutan filter renders them indistinguishable, raise their lightness contrast.
4. **Add a non-color carrier.** Icons, underlines, bold weight, position — color must never be the *only* differentiator (WCAG 1.4.1, Use of Color).

A good starting palette is the **Wong 8-color CB-safe palette** (Bang Wong, *Nature Methods* 2011) — designed for scientific visualization to remain distinguishable under all three CVD types. Concrete OKLCH approximations of three of its colors for direct use in a token system:

```css
/* Three of the 8 Wong CB-safe palette colors, approximated in OKLCH. */
:root {
  --cb-blue:    oklch(0.55 0.13 240);   /* Wong "blue"           — #0072B2 */
  --cb-orange:  oklch(0.74 0.15  60);   /* Wong "orange"         — #E69F00 */
  --cb-green:   oklch(0.58 0.13 160);   /* Wong "bluish green"   — #009E73 */
}
```

See [./accessibility.md](./accessibility.md) for the WCAG intersection — color must not be the only differentiator (WCAG 1.4.1), and the chosen pair must still satisfy 4.5:1 body-text and 3:1 UI-element contrast thresholds at any combination used.

---

## Color Interpolation in Animation

Animating from one color to another is interpolation across a color space, and the choice of space changes what the user sees mid-transition. When CSS animates `background-color` from red to green in default sRGB, the midpoint becomes muddy gray — sRGB's interpolation path crosses the desaturated valley between hues, dragging chroma toward 0 at the midpoint. The same animation in OKLCH walks a perceptually-clean arc along the hue wheel, preserving chroma and lightness across the transition. The user never sees gray.

```css
/* BAD — default interpolation space is sRGB. Red → green midpoint is muddy gray. */
.bad {
  background: red;
  transition: background-color 600ms ease;
}
.bad:hover { background: green; }
```

```css
/* GOOD — explicit OKLCH interpolation. Red → green midpoint stays chromatic. */
.good {
  background: oklch(0.6 0.22 25);                   /* red in OKLCH */
  transition: background-color 600ms ease;          /* honored when --start/--end are OKLCH */
}
.good:hover { background: oklch(0.6 0.22 145); }    /* green in OKLCH, same L and C */
```

```css
/* GOOD — explicit interpolation space via color-mix(in oklch, …). */
.fade {
  background: color-mix(in oklch, oklch(0.6 0.22 25) 50%, oklch(0.6 0.22 145));
  /* The 50% midpoint is a clean chromatic yellow-green, not gray. */
}
```

```css
/* GOOD — CSS Color Module 4 explicit interpolation hint on a gradient. */
.bar {
  background: linear-gradient(in oklch to right, oklch(0.6 0.22 25), oklch(0.6 0.22 145));
}
```

Lab-based interpolation (`in lab` or `in oklab`) is also chromatically clean and is the right choice when matching a print pipeline; OKLCH is the right choice for everything else because hue stays on the perceptual wheel and lightness stays steady. Avoid `in hsl` for cross-hue interpolation — it inherits HSL's non-perceptual lightness and produces lightness drift across hue families.

Practical defaults:

- **Same-hue intensity changes** (e.g., disabled → enabled, hover): any space is acceptable; OKLCH is still preferred for predictability.
- **Cross-hue transitions** (status changes, theme swaps, brand-moment flourishes): mandate `in oklch` or `color-mix(in oklch, …)`. Default sRGB is the muddy-mid bug.
- **Dark-mode swap animations**: mandate `in oklch` for the same reason — sRGB midpoints across the L extremes are visibly grayed.

See [./motion-interpolate.md](./motion-interpolate.md) for the cross-system motion-interpolation discipline that owns interpolation rules across spaces (timing, easing, value mapping). That file owns the interpolation rules; this section owns the color-specific reasoning.

---

## Cross-References

- [./palette-catalog.md](./palette-catalog.md) — industry-vertical lookup table; this file replaces its Step 4 "shift hue ±15°" instruction with explicit OKLCH ΔL/ΔC/Δh guidance and supplies the underlying color-space model.
- [./motion-interpolate.md](./motion-interpolate.md) — cross-system motion-interpolation discipline; this file's §Color Interpolation in Animation links out to it for the broader interpolation rules.
- [./accessibility.md](./accessibility.md) — WCAG 2.1 thresholds; this file's §Color-Blindness section intersects with WCAG 1.4.1 (Use of Color) and 1.4.3 (Contrast Minimum).

Reciprocal inbound cross-links land in Phase 28-06 (additive-only, D-06) — the other files will gain pointers back to this one without altering their existing content.
