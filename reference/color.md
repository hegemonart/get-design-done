# Color - Palette, Contrast, and Aesthetic Direction

Color governs how palettes are constructed, how semantic color roles are assigned, how
contrast compliance is verified, and how the aesthetic style direction is confirmed.
Read `color-theory.md` when building a new palette from scratch. Read `palette-catalog.md`
when adopting an industry-vertical baseline. Read `contrast-advanced.md` for APCA
thresholds on thin or colored text. Read `style-vocabulary.md` to confirm whether an
aesthetic style's color requirements fit the product type. Does not cover type sizing for
legibility (see `typography.md`) or dark-mode implementation steps beyond OKLCH token
generation (see `color-theory.md`).

## Fragment Index

| Fragment | When to load |
|---|---|
| [`./color-theory.md`](./color-theory.md) | constructing a palette, choosing a color space, building OKLCH harmonies, animating color, auditing under color-blindness simulation |
| [`./palette-catalog.md`](./palette-catalog.md) | adopting a pre-built industry-vertical palette as a baseline token set (40+ verticals, WCAG-verified) |
| [`./contrast-advanced.md`](./contrast-advanced.md) | computing text/UI contrast beyond WCAG 2.1 AA - especially for thin, large, or colored text where WCAG 2.1 misranks |
| [`./style-vocabulary.md`](./style-vocabulary.md) | confirming a UI aesthetic direction: does the style require dark mode, what are its signature color effects, which product types should avoid it |

## Rules of Thumb

1. Author new palette tokens in OKLCH, not HSL or hex. OKLCH ΔL/ΔC/Δh steps are perceptually uniform - equal numeric jumps produce equal perceived brightness jumps. HSL's lightness channel is not perceptual.
2. Never rely on color alone to convey state (error, warning, success). Always pair with an icon, label, or pattern - WCAG 1.4.1.
3. For the APCA dual-target pattern: meet WCAG 2.1 AA (4.5:1 for body text) AND check Lc 60 (APCA) for thin weights and colored backgrounds. The two systems can disagree on the same pair.
4. Check every palette under deutan (most common), protan, and tritan simulations before shipping. The color-blindness palettes in `color-theory.md` provide pre-vetted swap sets.

## See Also

- Typography legibility at small sizes: [`./typography.md`](./typography.md)
- OKLCH interpolation in color animations: [`./motion.md`](./motion.md)
- Spatial depth via shadow and elevation: [`./spatial.md`](./spatial.md)
- Healthcare: critical-value flags not color-only: [`./domains/healthcare-patterns.md`](./domains/healthcare-patterns.md)
- Finance: gain/loss color rules: [`./domains/finance-patterns.md`](./domains/finance-patterns.md)
