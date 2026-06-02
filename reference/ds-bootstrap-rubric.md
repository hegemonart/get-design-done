# Greenfield Design-System Bootstrap Rubric

Emission rules for `/gdd:bootstrap-ds` + `agents/ds-generator.md` - how to turn a brand input (a primary color + optional secondary + tone tags + target framework) into a coherent token system, **without inventing a brand**. The deterministic math lives in `scripts/lib/ds/token-scale.cjs`; the color-theory grounding lives in `reference/color-theory.md`. This file is the rulebook the generator obeys.

GDD does not author a brand identity (logomarks, voice) - it emits a **starter token system + a few proof components** a greenfield project can build on.

---

## Color

- **Primary → 9 tints/shades.** Convert the brand primary to OKLCH `{l, c, h}`, then call `oklchScale(primary)` → 9 stops (`100`…`900`) emitted as native CSS `oklch()`. Stop `500` is the primary exactly; lighter stops interpolate L toward white with damped chroma; darker stops toward black. Native `oklch()` - **no hex conversion, no color library**.
- **Never auto-generate more than 2 brand colors.** Primary is always emitted. A **secondary** scale is emitted **only if the user supplies one**. Never invent a third brand hue.
- **Neutrals** - a low-chroma gray ramp (chroma ≤ 0.02) sharing the primary's hue for a subtle tint, or pure neutral (`c = 0`). 9 stops via `oklchScale({ l, c: 0.012, h: primary.h })`.
- **Semantic colors** - success / warning / danger / info derived at fixed hues (≈145 / 85 / 25 / 255) at the brand's mid-lightness + chroma, so they sit in the same family. These are functional, not "brand" colors (they do not count against the ≤2 rule).
- **Contrast** - every text-on-surface pairing must clear WCAG AA (see `reference/color-theory.md`); the generator checks the chosen `500`/`700` against white/`50`.

## Typography

- **Modular scale** via `typeScale(baseRem, ratio, steps)`. Base `1rem` (16px). **Ratio ∈ {1.2 (minor third), 1.25 (major third), 1.333 (perfect fourth)}** - pick by tone (calm → 1.2, default → 1.25, editorial/bold → 1.333).
- Emit named steps (`xs`…`5xl`) from the scale; line-height pairs (tight 1.2 for headings, 1.5 for body).
- Font family is a **slot**, not a choice - emit a system-font stack placeholder + a `--font-sans` / `--font-mono` variable the user swaps. GDD does not pick a typeface (brand territory).

## Spacing

- **4pt or 8pt baseline** via `spacingScale(basePx, count)` (8pt is the default; 4pt for dense/data UIs). Emit the standard `[1,2,3,4,6,8,12,16]` multiples as `--space-*`.

## Radius + Motion

- **Radius** via `radiusScale(basePx)` → `sm/md/lg/xl/full` (`full = 9999` pill).
- **Motion defaults** - durations `fast 150ms / base 250ms / slow 400ms`; easing `ease-out` for enters, a standard curve for moves; **always** respect `prefers-reduced-motion` (emit the media-query guard).

## The 3 variants (D-02 - user picks one)

The generator emits three coherent variants; the user picks ONE before first-component scaffolding:

| Variant | Chroma | Type ratio | Spacing | Radius | Feel |
|---|---|---|---|---|---|
| **conservative** | damped (×0.8) | 1.2 | 8pt | sm (4) | calm, corporate, dense-friendly |
| **balanced** (default) | as given | 1.25 | 8pt | md (8) | versatile default |
| **bold** | boosted (×1.15, clamped) | 1.333 | 8pt | lg (12) | expressive, marketing-forward |

## Emission format

- Emit **CSS custom properties** (`:root { --color-primary-500: oklch(...); --space-4: 16px; ... }`) as the canonical artifact, plus a target-framework mapping:
  - **web (default)** - a Tailwind `theme.extend` block (or shadcn CSS variables) + the `:root` tokens.
  - **native** - route the token set through `reference/native-platforms.md` (Phase 34) for SwiftUI / Compose / Flutter theme objects.
- Tokens are **named by role, not value** (`--color-primary-500`, not `--blue-500`) so a rebrand is a one-line hue change.

## First-component scaffolding (proof artifact)

After the user picks a variant, emit **button + input + card** in the detected target framework, consuming only the emitted tokens - a proof the system is coherent, not a full component library (that is out of scope).
