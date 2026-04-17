# Motion & Animation Framework

Based on Emil Kowalski's design engineering philosophy. Apply these rules in order — do not skip to "how should this animate" before answering "should this animate."

---

## Decision Framework (Run In Order)

### Question 1: Should This Animate At All?

| Action frequency | Decision |
|---|---|
| 100+/day — keyboard shortcuts, command palette, list navigation | **No animation. Ever.** |
| Tens/day — hover states, toggles, tab switching | Remove or keep to <80ms. No delay. |
| Occasional — modals opening, drawers, toasts | Standard animation (150–300ms) |
| Rare — onboarding, celebrations, first-time flows | Can add personality and delight |
| Once — loading splash, page transitions | Full animation budget |

**Critical rule**: Never animate keyboard-initiated actions. They repeat hundreds of times daily. Every ms of animation is felt.

### Question 2: What Is The Purpose?

Valid animation purposes only. If it doesn't serve one of these, remove it.

| Purpose | Example |
|---|---|
| **Spatial consistency** | Toast enters/exits same edge each time |
| **State indication** | Button morphs to show loading → success |
| **Cause-effect explanation** | Item deletion — item flies to trash |
| **Feedback** | Button scales 0.97 on press |
| **Prevent jarring changes** | Content appearing/disappearing needs transition |

Invalid purposes: "It looks cool", "It feels modern", "Other apps do it."

### Question 3: What Easing?

| Element state | Easing | Rationale |
|---|---|---|
| **Entering** | `ease-out` (fast start, slow end) | Feels responsive — starts immediately |
| **Exiting** | `ease-in` (slow start, fast end) | Gets out of the way — doesn't linger |
| **State transition** (same element) | `ease-in-out` | Natural — neither abrupt start nor end |
| **Interactive/draggable** | Spring physics | Follows finger/cursor naturally |
| **Bounce/elastic** | **Never** | Feels toy-like and dated |

CSS:
```css
/* Enter */
transition: transform 200ms cubic-bezier(0, 0, 0.2, 1); /* ease-out */

/* Exit */
transition: transform 150ms cubic-bezier(0.4, 0, 1, 1); /* ease-in */

/* Transition */
transition: all 200ms cubic-bezier(0.4, 0, 0.2, 1); /* ease-in-out */
```

### Question 4: What Duration?

| Animation type | Duration | Notes |
|---|---|---|
| Micro-interactions | 80–150ms | Hover, press, toggle |
| Component enter/exit | 150–250ms | Modals, drawers, dropdowns |
| Page transitions | 200–350ms | Route changes |
| Complex/orchestrated | ≤400ms | Multi-step, staggered reveals |
| **Never exceed** | 400ms | Anything longer feels broken |

**Exit faster than enter**: Exit animations should run at **60–70%** of the enter duration. Exiting elements should get out of the way fast.

```
Enter: 250ms
Exit: 150ms (60% of 250)
```

### Question 5: Only Animate `transform` and `opacity`

**Only these properties animate on the GPU:**
```css
/* SAFE */
transform: translateX(), translateY(), scale(), rotate()
opacity: 0 → 1

/* DANGEROUS — triggers layout/paint */
width, height, top, left, margin, padding, font-size
```

Exception: `filter` (blur) is GPU-accelerated in modern browsers but battery-expensive on mobile.

---

## Stagger Rules

When animating a list of items entering:
- Stagger delay: **30–50ms** per item
- Maximum stagger depth: **6–8 items** (items beyond that appear simultaneously)
- Direction: top-to-bottom OR left-to-right — never random

```css
.item:nth-child(1) { animation-delay: 0ms; }
.item:nth-child(2) { animation-delay: 40ms; }
.item:nth-child(3) { animation-delay: 80ms; }
/* etc. — cap at ~6 staggered items */
```

---

## Press Feedback

Every clickable element must give visual feedback within **100ms** of interaction.

```css
button:active {
  transform: scale(0.97); /* NOT 0.90 — too dramatic */
  transition: transform 80ms ease-out;
}

/* On release */
button:not(:active) {
  transform: scale(1);
  transition: transform 150ms ease-out;
}
```

Scale range: **0.95–0.98** for buttons. **0.97** is the safest default.
Never scale below 0.90 — it looks broken.

---

## `prefers-reduced-motion`

Always respect this. It's not optional.

```css
@media (prefers-reduced-motion: reduce) {
  *,
  *::before,
  *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
    scroll-behavior: auto !important;
  }
}
```

Or in JavaScript:
```js
const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
if (!prefersReduced) {
  // Run animation
}
```

---

## What Never To Animate

- Keyboard shortcuts and commands (too frequent)
- Tab switching within a page
- Filter/sort toggles on data tables
- Expanding/collapsing sidebar navigation items during heavy use
- Any interaction the user will perform 50+ times in a session

---

## The Invisible Detail Rule

The best animations are ones users cannot describe but notice when absent. Signs of this:
- The interaction feels "snappy" or "responsive" without thinking about why
- Removing the animation makes the UI feel broken
- Users say "it feels premium" but can't point to any specific feature

This is the goal. Not "look at this animation" — "why does this feel so good to use?"

---

## Quick Animation Audit Checklist

- [ ] No animation on keyboard-triggered actions
- [ ] All durations ≤ 400ms
- [ ] Exit < enter duration
- [ ] Only `transform` and `opacity` for performance
- [ ] `prefers-reduced-motion` implemented
- [ ] Stagger ≤ 50ms per item, capped at 6–8 items
- [ ] Press feedback on all interactive elements
- [ ] No bounce/elastic easing anywhere
- [ ] All animations have a defined purpose
