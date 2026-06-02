# Motion - Animation Domain Index

Based on Emil Kowalski's design engineering philosophy. Apply these rules in order. Do not skip to "how should this animate" before answering "should this animate."

<!-- Phase 45 domain-index: loads this file instead of individual motion fragments -->

---

## Mission

Motion governs animation decisions across the UI: whether to animate, duration budgets, easing choices, spring physics, transition taxonomy, and interpolation. Read this file first for the decision framework and core rules, then drill into the specialist fragment below. Does not cover CSS layout transitions (see `spatial.md`) or OS-level reduced-motion policy (see `responsive.md`).

---

## Fragment Index

| Fragment | When to load |
|---|---|
| `./motion-easings.md` | Choosing or auditing easing curve values: 12 canonical `--ease-*` presets, cubic-bezier equivalents, 60fps settle-times |
| `./motion-spring.md` | Interaction is draggable or needs physics feel: gentle/wobbly/stiff/slow presets, Framer Motion and React Spring syntax |
| `./motion-transition-taxonomy.md` | Classifying page or route transitions: 8 families (3d, blur, cover, destruction, dissolve, distortion, grid, light) |
| `./motion-interpolate.md` | Mapping input-to-output ranges: progress/scroll/gesture/time-linked animations, 4 extrapolation modes |
| `./motion-advanced.md` | Advanced platform APIs: FLIP, scroll-driven, View Transitions, gesture/drag, clip-path, WAAPI |
| `./framer-motion-patterns.md` | Codebase uses Framer Motion: spring/tween config, AnimatePresence, variants, gestures, a11y, bounce:0 rule |

---

## Decision Framework (Run In Order)

### Question 1: Should This Animate At All?

| Action frequency | Decision |
|---|---|
| 100+/day - keyboard shortcuts, command palette, list navigation | **No animation. Ever.** |
| Tens/day - hover states, toggles, tab switching | Remove or keep to <80ms. No delay. |
| Occasional - modals opening, drawers, toasts | Standard animation (150-300ms) |
| Rare - onboarding, celebrations, first-time flows | Can add personality and delight |
| Once - loading splash, page transitions | Full animation budget |

**Critical rule**: Never animate keyboard-initiated actions. They repeat hundreds of times daily. Every ms of animation is felt.

### Question 2: What Is The Purpose?

Valid animation purposes only. If it doesn't serve one of these, remove it.

| Purpose | Example |
|---|---|
| **Spatial consistency** | Toast enters/exits same edge each time |
| **State indication** | Button morphs to show loading to success |
| **Cause-effect explanation** | Item deletion - item flies to trash |
| **Feedback** | Button scales on press |
| **Prevent jarring changes** | Content appearing/disappearing needs transition |

Invalid purposes: "It looks cool", "It feels modern", "Other apps do it."

### Question 3: What Easing?

| Element state | Easing | Rationale |
|---|---|---|
| **Entering** | `ease-out` (fast start, slow end) | Feels responsive - starts immediately |
| **Exiting** | `ease-in` (slow start, fast end) | Gets out of the way - doesn't linger |
| **State transition** (same element) | `ease-in-out` | Natural - neither abrupt start nor end |
| **Interactive/draggable** | Spring physics | Follows finger/cursor naturally |
| **Bounce/elastic** | **Never** | Feels toy-like and dated |

See `reference/motion-easings.md` for the full `--ease-*` token catalog.

### Question 4: What Duration?

| Animation type | Duration | Notes |
|---|---|---|
| Micro-interactions | 80-150ms | Hover, press, toggle |
| Component enter/exit | 150-250ms | Modals, drawers, dropdowns |
| Page transitions | 200-350ms | Route changes |
| Complex/orchestrated | <=400ms | Multi-step, staggered reveals |
| **Never exceed** | 400ms | Anything longer feels broken |

**Exit faster than enter**: Exit animations should run at **60-70%** of the enter duration.

### Question 5: Only Animate `transform` and `opacity`

```css
/* SAFE - GPU-accelerated */
transform: translateX(), translateY(), scale(), rotate()
opacity: 0 to 1

/* DANGEROUS - triggers layout/paint */
width, height, top, left, margin, padding, font-size
```

Exception: `filter` (blur) is GPU-accelerated in modern browsers but battery-expensive on mobile.

---

## Stagger Rules

- Stagger delay: **30-50ms** per item
- Maximum stagger depth: **6-8 items** (items beyond that appear simultaneously)
- Direction: top-to-bottom OR left-to-right, never random

---

## Press Feedback

Every clickable element must give visual feedback within **100ms** of interaction. The canonical scale value for press feedback is **`0.96`**.

- Never use `scale(0.95)` - too large, feels unresponsive
- Never use `scale(0.97)` or higher - imperceptible at high DPI
- `0.96` is the correct value for standard interactive elements

```css
button:active {
  transform: scale(0.96);
  transition: transform 80ms ease-out;
}
```

---

## `prefers-reduced-motion`

Always respect this. It is not optional.

```css
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    transition-duration: 0.01ms !important;
    scroll-behavior: auto !important;
  }
}
```

---

## Quick Audit Checklist

- [ ] No animation on keyboard-triggered actions
- [ ] All durations <=400ms
- [ ] Exit < enter duration
- [ ] Only `transform` and `opacity` for performance
- [ ] `prefers-reduced-motion` implemented
- [ ] Stagger <=50ms per item, capped at 6-8 items
- [ ] Press feedback on all interactive elements
- [ ] No bounce/elastic easing anywhere
- [ ] All animations have a defined purpose

---

## Rules of Thumb

1. Keyboard-initiated actions (command palette, list navigation, shortcuts) must have zero animation. They repeat hundreds of times daily and every ms is felt.
2. Default to named spring presets (gentle/wobbly/stiff/slow) rather than raw stiffness/damping numbers; presets are tuned for 60fps settle-time and predictable feel.
3. Always use `--ease-*` CSS custom property tokens rather than inline `cubic-bezier()` strings; tokens keep easing consistent and respect `prefers-reduced-motion`.
4. OKLCH is the correct color space for animated color transitions; sRGB interpolation produces muddy mid-transition colors. See `reference/color-theory.md` for color interpolation in animation.

---

## Cross-Domain See Also

- Color animation uses OKLCH path: `reference/color.md`
- Gesture semantics (velocity, pointer capture): `reference/interaction.md`
- OS-level reduced-motion: `reference/responsive.md`
- CSS layout transitions: `reference/spatial.md`
- Typography: `reference/typography.md`
- UX writing: `reference/ux-writing.md`
