# Spatial - Composition, Grid, and Perceptual Organization

Spatial design governs how elements are placed, sized, and related in two-dimensional
space: composition principles (rule of thirds, focal point, eye-flow), proportion
derivation (baseline grid, spacing ladder), CSS implementation (Grid, container queries,
clamp), visual hierarchy, Gestalt grouping, and data presentation. Read this file first,
then load the specific fragment for the task at hand. Does not cover 3D depth signaling
via color/shadow as a color decision (see `color.md`) or responsive layout shifts driven
by locale/platform (see `responsive.md`).

## Fragment Index

| Fragment | When to load |
|---|---|
| [`./composition.md`](./composition.md) | choosing a compositional grid (rule of thirds, root rectangles, Fibonacci), placing a focal point, deciding eye-flow archetype (Z / F / Gutenberg) |
| [`./proportion-systems.md`](./proportion-systems.md) | deriving the baseline grid unit, spacing ladder, icon sizing, corner radius from a single multiplier (4pt / 8pt / sqrt(2)) |
| [`./css-grid-layout.md`](./css-grid-layout.md) | implementing CSS Grid templates, subgrid, container queries, `clamp()` fluid type, logical props, anchor positioning |
| [`./visual-hierarchy-layout.md`](./visual-hierarchy-layout.md) | ordering elements by importance: Z-order, whitespace rules, shadow depth, 24 landing archetypes |
| [`./gestalt.md`](./gestalt.md) | auditing perceptual grouping: proximity, similarity, continuity, closure, figure/ground - 8 principles with scoring rubrics |
| [`./image-optimization.md`](./image-optimization.md) | images in layout: format matrix, srcset/sizes math, LQIP/BlurHash, CDN transforms, image budget |
| [`./data-visualization.md`](./data-visualization.md) | charts/dashboards: 25-type chart-choice matrix, color-blind palettes, axis conventions, UUPM dashboard patterns |
| [`./surfaces.md`](./surfaces.md) | surface treatments: concentric radius formula, optical alignment, 3-layer shadow system, hit area sizing |

## Rules of Thumb

1. Place primary CTAs on the rule-of-thirds power points (the 33%/67% intersections), not dead-center. Centered heroes are the intentional exception, not the default.
2. Choose one baseline unit for the whole product (4pt, 8pt, or sqrt(2)) and author every spacing, sizing, and radius token as a multiple of it. No one-off values.
3. CSS Grid container queries (`@container`) should replace media queries for component-level layout. Reserve media queries for page-level breakpoints only.
4. Gestalt proximity rule: related controls 8px apart or less; unrelated groups 32px apart or more. The layout should communicate relationships before the user reads labels.
5. Choose the chart type before the color palette. The wrong chart type cannot be rescued by a better palette. Use `data-visualization.md` chart-choice matrix first.

## See Also

- Shadow and elevation as color/depth signal: [`./color.md`](./color.md)
- Type scale ties into spatial proportion grid: [`./typography.md`](./typography.md)
- Responsive layout shifts at breakpoints: [`./responsive.md`](./responsive.md)
- Gestalt grouping informs information architecture: [`./interaction.md`](./interaction.md)
- Gaming: TV-safe area constraints: [`./domains/gaming-patterns.md`](./domains/gaming-patterns.md)
