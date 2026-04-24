# Slider — Benchmark Spec

**Harvested from**: WAI-ARIA APG Slider pattern, Material 3, Radix Slider, Carbon Design System
**Wave**: 5 · **Category**: Advanced
**Spec file**: `reference/components/slider.md`

---

## Purpose

A Slider lets users select a numeric value (or range of values) by dragging a thumb along a track. It is appropriate when the range of values is meaningful as a continuum — volume, price, opacity, temperature — and the exact numeric value matters less than relative position. For precise numeric entry, pair the slider with a text input. For a range, use two thumbs. *(Material 3, Carbon, Radix agree: slider = continuous or discrete value selection with visual track.)*

---

## Anatomy

```
Single:
[ ●────────────────────── ]  ← track
   thumb

Range:
[ ──────●────────●──────── ]
        min      max
        thumb    thumb
```

| Part | Required | Notes |
|------|----------|-------|
| Track | Yes | Full-width bar; inactive segments use muted color |
| Active range fill | Yes | Filled portion between min-edge and thumb (single) or between thumbs (range) |
| Thumb | Yes | Draggable handle; visual ≥12px; touch target ≥44px via ::before padding |
| Value label (tooltip) | No | Shows current value above/beside thumb on interaction |
| Tick marks | No | Shown for discrete steps when ≤10 steps |
| Min/Max labels | No | Static text at track ends |
| Numeric input | No | Paired `<input type="number">` for precise entry |

---

## Variants

| Variant | Description | Systems |
|---------|-------------|---------|
| Single | One thumb; selects a scalar value | WAI-ARIA APG, Material 3, Carbon, Radix |
| Range | Two thumbs; selects min and max of a range | Material 3 (RangeSlider), Carbon, Radix |
| Discrete | Step-snapping with tick marks (≤10 steps) | Material 3, Carbon |
| Continuous | No snapping; free movement | Material 3, Carbon, Radix |
| Vertical | `aria-orientation="vertical"`; track runs top-to-bottom | WAI-ARIA APG, Carbon |

**Norm** (≥3/4 systems agree): horizontal orientation is default; thumb is a circle on a horizontal track; active range fills in brand color.
**Diverge**: Carbon shows tick labels below the track; Material 3 shows a floating value tooltip on drag; Radix delegates tooltip entirely to the consumer.

---

## States

| State | Trigger | Visual | ARIA |
|-------|---------|--------|------|
| default | — | Track + thumb at resting position | `aria-valuenow` reflects current value |
| hover | Pointer over thumb | Thumb expands or shows halo | — |
| focus | Keyboard focus on thumb | Focus-visible ring on thumb | — |
| dragging / active | Mousedown / touch on thumb | Value tooltip visible; thumb slightly enlarged | — |
| disabled | `disabled` / `aria-disabled` | 38% opacity; cursor: not-allowed | `aria-disabled="true"` |

---

## Sizing & Spacing

| Size | Track Height | Thumb Visual | Thumb Hit Area | Notes |
|------|-------------|--------------|----------------|-------|
| sm | 2px | 12px | 44px (via ::before) | Compact; pair with numeric input |
| md (default) | 4px | 20px | 44px (via ::before) | Standard; tick labels at 14px |
| lg | 6px | 24px | 44px | High-emphasis; price/volume controls |

**Norm**: 4px track height (Material 3, Carbon). Thumb visual diameter 20px with ::before/::after expanding the touch target to ≥44px without inflating layout.

Cross-link: `reference/surfaces.md` — 44×44px touch-target minimum; use padding trick, not enlarged visual.

---

## Typography

- Value tooltip: caption-sm, weight 500, centered above thumb
- Tick labels: caption-xs, secondary color, centered below tick mark
- Min/Max endpoint labels: caption-sm, secondary color, flush with track ends

Cross-link: `reference/typography.md` — tabular-nums on value tooltip so digits don't shift width during drag.

---

## Keyboard & Accessibility

> **WAI-ARIA role**: `slider`
> **Required attributes**: `aria-valuenow`, `aria-valuemin`, `aria-valuemax`; `aria-valuetext` for human-readable value (e.g., "$45" or "45%"); `aria-label` or `aria-labelledby`; `aria-orientation="vertical"` when vertical

### Keyboard Contract

*Quoted verbatim from WAI-ARIA APG — https://www.w3.org/WAI/ARIA/apg/patterns/slider/ — W3C — 2024*

| Key | Action |
|-----|--------|
| Right Arrow / Up Arrow | Increase value by one step |
| Left Arrow / Down Arrow | Decrease value by one step |
| Page Up | Increase value by a larger step (typically 10% of range) |
| Page Down | Decrease value by a larger step (typically 10% of range) |
| Home | Set value to minimum |
| End | Set value to maximum |

*For vertical slider (`aria-orientation="vertical"`), Up Arrow increases and Down Arrow decreases.*

### Accessibility Rules

- Every slider thumb MUST have `aria-valuenow`; update it continuously during drag
- `aria-valuetext` MUST be provided when raw number is not human-readable (e.g., "Low", "Medium", "High" for a quality setting, or "$45" for a price)
- Range slider: label each thumb distinctly (e.g., `aria-label="Minimum price"` and `aria-label="Maximum price"`) — identical labels confuse screen readers
- Thumb touch target MUST be ≥44×44px; use `::before`/`::after` pseudo-element padding if visual thumb is smaller
- Do not use `<input type="range">` hidden behind a custom div without ARIA — the native element is preferable when no custom styling is required
- Disabled sliders: use `aria-disabled="true"`; keep thumb in tab order so AT can announce the current value

Cross-link: `reference/accessibility.md` — slider role, aria-valuetext guidance.

---

## Motion

| Transition | Duration | Easing | Notes |
|------------|----------|--------|-------|
| Thumb drag | 0ms | — | No easing on drag — follows pointer exactly |
| Keyboard step | 80ms | ease-out | Smooth snap to new position |
| Value tooltip appear | 100ms | ease-out | Fade in on focus/drag |
| Value tooltip dismiss | 150ms | ease-in | Fade out on blur |
| Tick mark appear | 120ms | ease-out | When switching to discrete mode |

**BAN**: Do not add momentum or inertia easing to thumb drag — feels broken and breaks accessibility (thumb does not match pointer).

Cross-link: `reference/motion.md` — reduced-motion: remove keyboard-step animation; thumb jumps instantly.

---

## Do / Don't

### Do
- Provide `aria-valuetext` with a human-readable label when the raw number needs context *(WAI-ARIA APG)*
- Give each range thumb a unique, descriptive `aria-label` *(WAI-ARIA APG, Radix Slider docs)*
- Expand thumb touch target to ≥44px with pseudo-element padding *(Material 3, Carbon)*
- Show tick marks only for discrete sliders with ≤10 steps *(Material 3, Carbon)*

### Don't
- Don't build a slider from `<div>` with mouse events only — no keyboard, no ARIA *(diverges from all 4 systems)*
- Don't omit `aria-valuenow` updates during drag — AT users hear a stale value *(WAI-ARIA APG)*
- Don't let the visual thumb area be smaller than 12px with no hit-area expansion — fails WCAG 2.5.8 *(Material 3)*
- Don't use identical `aria-label` for both range thumbs *(WAI-ARIA APG)*

---

## Anti-patterns Cross-links

| Anti-pattern | Entry |
|--------------|-------|
| BAN-09 | Custom interactive widget with mouse events only, no keyboard — `reference/anti-patterns.md#ban-09` |
| BAN-11 | Touch target below 44px without padding expansion — `reference/anti-patterns.md#ban-11` |

---

## Benchmark Citations

| Claim | Sources |
|-------|---------|
| role="slider" + aria-valuenow/min/max required | WAI-ARIA APG Slider pattern |
| Arrow key step, Page key 10% step, Home/End to extremes | WAI-ARIA APG keyboard contract |
| 4px track height default | Material 3, Carbon |
| Thumb touch target ≥44px via pseudo-element | Material 3, Carbon accessibility guidelines |
| aria-valuetext for non-numeric human-readable values | WAI-ARIA APG, Radix Slider docs |

Full system URLs: `connections/design-corpora.md`

---

## Grep Signatures

```bash
# Slider thumb missing aria-valuenow (ARIA contract violation)
grep -rn 'role="slider"' src/ | grep -v 'aria-valuenow'

# Custom slider div with mouse events only — no keyboard handler
grep -rn 'class.*slider\|\.slider' src/ | grep 'onMouseDown\|mousedown' | grep -v 'onKeyDown\|keydown\|role="slider"'

# Thumb element potentially below 44px with no hit-area expansion
grep -rn '\.thumb\|slider-thumb' src/ | grep 'width:\s*[0-9]\{1,2\}px\|height:\s*[0-9]\{1,2\}px' | grep -v '::before\|::after\|padding'

# Range slider thumbs with identical aria-label
grep -rn 'role="slider"' src/ -A2 | grep 'aria-label' | sort | uniq -d
```

---

## Failing Example

```html
<!-- BAD: custom slider using <div> with mouse events only — no keyboard, no ARIA -->
<div class="slider-track" onmousedown="startDrag(event)">
  <div class="slider-thumb" style="left: 45%"></div>
</div>
```

**Why it fails**: Not reachable by keyboard; no `role="slider"`; no `aria-valuenow`, `aria-valuemin`, or `aria-valuemax`; AT cannot read or change the value; touch users cannot interact via assistive touch.
**Grep detection**: `grep -rn '<div.*slider\|class="slider' src/ | grep -v 'role="slider"'`
**Fix**: Use native `<input type="range">` or add `role="slider"` + `aria-valuenow` + `aria-valuemin` + `aria-valuemax` + `aria-valuetext` + full keyboard event handlers (Arrow, Page, Home, End) to the thumb element.
