# Surfaces
Source: jakubkrehel/make-interfaces-feel-better (MIT) — surfaces.md

Rules for nested surfaces, optical alignment, shadow systems, image outlines, and hit areas.

## Concentric Radius Formula

When nesting interactive elements inside a container (e.g., a card with a button, or a modal with an input), the inner radius must be SMALLER than the outer radius — by exactly the padding between them:

```
outerRadius = innerRadius + padding
```

Or equivalently:
```
innerRadius = outerRadius − padding
```

Example: card with `border-radius: 16px` and `padding: 16px` → inner elements should use `border-radius: 0px` (16 − 16 = 0). If padding is 8px → `border-radius: 8px` for inner elements.

**Exception:** when `padding > 24px`, treat the inner element as a visually separate surface and apply its own standard radius (4/8/12px depending on its type).

Why this matters: same radius on nested surfaces creates a visual disconnect — the inner element appears to "float" without belonging to the outer surface. The concentric formula creates perceptual depth and containment.

## Optical Alignment

Mathematical centering ≠ optical centering for asymmetric elements:

- **Icon with text:** `padding-inline-start` for the icon side should be 2px less than `padding-inline-end` for the text side. This corrects for the visual weight imbalance.
- **Play/chevron triangles:** shift right by 2px from mathematical center — triangles have more visual mass on their left side (the flat edge).
- **SVG icons with irregular bounding box:** inspect the actual glyph bounds, not the viewBox. Add `padding` to compensate for asymmetric whitespace within the SVG.

## 3-Layer Shadow System

Build shadows from three stacked layers, not a single `box-shadow`:

```css
/* Light mode */
.card {
  box-shadow:
    0 1px 2px rgba(0,0,0,0.06),   /* sharp close shadow — elevation definition */
    0 4px 8px rgba(0,0,0,0.06),   /* soft ambient — depth blending */
    0 8px 16px rgba(0,0,0,0.04);  /* wide diffuse — air gap */
}

/* Dark mode */
.card {
  box-shadow:
    0 1px 2px rgba(0,0,0,0.3),
    0 4px 8px rgba(0,0,0,0.3),
    0 8px 16px rgba(0,0,0,0.2),
    inset 0 1px 0 rgba(255,255,255,0.08); /* subtle top rim on dark */
}
```

The inset rim on dark mode (`rgba(255,255,255,0.08)`) simulates a light source from above, which is the visual cue that makes dark cards feel like physical surfaces rather than holes in the UI.

Scale the multipliers for elevation levels:
- Level 0 (flat): no shadow
- Level 1 (card): values above
- Level 2 (dropdown): multiply blur radii by ~2
- Level 3 (modal): add a full-screen scrim behind

## Image Outlines

Images always look better with a subtle outline that separates them from the background:

```css
img {
  outline: 1px solid rgba(0,0,0,0.08);   /* light mode */
  outline-offset: -1px;                   /* inside the image boundary */
}

/* Dark mode */
img { outline: 1px solid rgba(255,255,255,0.08); }
```

**Hard rule:** Never tint the outline with a color. Use pure black at low opacity (light) or pure white at low opacity (dark). A tinted outline competes with the image colors and creates visual noise.

This applies to:
- Avatar photos
- Product images
- Screenshots
- User-uploaded content

Not needed for: SVG illustrations (they have their own defined boundary), icons, decorative graphics.

## Hit Area Extension

Interactive elements smaller than 40×40px must have their tap target extended without changing visual size:

```css
.icon-button {
  position: relative;
  width: 20px;
  height: 20px;
}

.icon-button::after {
  content: '';
  position: absolute;
  inset: -10px; /* extends each side by 10px → 40×40 total */
}
```

For primary actions, extend to 48×48px (`inset: -14px` for a 20px icon).

**Collision rule:** when two interactive elements are adjacent (e.g., toolbar icons), calculate whether the extended hit areas overlap. If overlap exceeds 4px, reduce the extension on the shared side. Never let invisible hit areas steal taps from adjacent elements.

Target sizes:
- Secondary/icon-only actions: 40×40px minimum
- Primary CTAs: 48×48px minimum
- Navigation items (mobile): 48×48px minimum
- Touch-critical actions (checkout, send): 48×48px minimum
