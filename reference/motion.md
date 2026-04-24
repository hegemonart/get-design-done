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

---

## Spring Physics

Spring-based animation replaces duration-based tweening with physics parameters
(stiffness, damping, mass). Output feels more organic and adapts to interruption.

### React Spring

```jsx
import { useSpring, animated } from '@react-spring/web';

const styles = useSpring({
  from: { opacity: 0, transform: 'translateY(20px)' },
  to:   { opacity: 1, transform: 'translateY(0px)' },
  config: { tension: 170, friction: 26 }  // default preset
});
```

React Spring presets:

| Preset | tension | friction | Character |
|--------|---------|----------|-----------|
| default | 170 | 26 | balanced |
| gentle | 120 | 14 | smooth, leisurely |
| wobbly | 180 | 12 | playful bounce |
| stiff | 210 | 20 | snappy |
| slow | 280 | 60 | slow and deliberate |
| molasses | 280 | 120 | very slow, no bounce |

### Framer Motion

```jsx
<motion.div
  animate={{ x: 100 }}
  transition={{ type: "spring", stiffness: 100, damping: 15, mass: 1 }}
/>
```

Parameter guidance:

| Param | Range | Effect |
|-------|-------|--------|
| stiffness | 50–300 | higher = snappier arrival |
| damping | 10–40 | higher = less oscillation |
| mass | 0.5–2 | higher = more inertia, slower response |

Rule of thumb: for UI micro-interactions use stiffness 150–250, damping 20–30, mass 1.

---

## Scroll-Triggered Animations

Use IntersectionObserver for scroll-reveal effects — it replaces scroll-event
listeners with a throttled browser-native API.

### Basic pattern

```js
const observer = new IntersectionObserver((entries) => {
  entries.forEach(entry => {
    if (entry.isIntersecting) {
      entry.target.classList.add('in-view');
      // Optional: disconnect after first trigger
      // observer.unobserve(entry.target);
    }
  });
}, {
  threshold: 0.1,
  rootMargin: '0px 0px -100px 0px'  // trigger 100px before entering viewport bottom
});

document.querySelectorAll('.reveal').forEach(el => observer.observe(el));
```

### Threshold guidance

| threshold | Meaning |
|-----------|---------|
| 0.0 | element enters viewport edge |
| 0.1–0.25 | element partially visible (most common for reveals) |
| 0.5 | element half-visible |
| 1.0 | element fully visible |

### Once vs repeat

- **Once** — call `observer.unobserve(entry.target)` after first intersection.
  Use for: hero reveals, one-shot entrance animations, stat counters.
- **Repeat** — leave observer active. Use for: progress indicators, parallax effects,
  sticky nav state changes.

### Performance rules

1. Animate only `transform` and `opacity` (GPU-accelerated). Avoid `top`, `left`, `width`, `height`.
2. No debounce/throttle needed — IntersectionObserver is already throttled by the browser.
3. For many elements, share a single observer instance and call `observe()` once per element.
4. Prefer CSS transitions triggered by a class toggle over requestAnimationFrame loops.
5. Use `will-change: transform, opacity` sparingly (only on elements that animate repeatedly).

---

## MIFB Micro-Motion Extensions
Source: jakubkrehel/make-interfaces-feel-better (MIT) — motion.md

### Interruptible Animations

Use CSS transitions for interactive elements because transitions retarget mid-animation — when a user moves their cursor away before a hover animation completes, the transition reverses smoothly from wherever it currently is. Keyframe animations restart from the beginning, creating a jarring jump.

**Decision rule:**
- Interactive states (hover, focus, active, pressed): always CSS transitions
- Orchestrated sequences, entrance effects, data-driven animations: keyframe or JS animation

```css
/* Good — transition retargets smoothly */
.button { transition: background-color 150ms ease-out; }

/* Avoid for interactive — restarts on interruption */
.button:hover { animation: hover-bg 150ms ease-out forwards; }
```

### Split-and-Stagger Enter/Exit

For multi-element entrances (card grids, lists, feature sections):

- Default stagger: 100ms between elements
- Heading words: 80ms per word
- Entrance transform: `opacity: 0 → 1` + `translateY(12px → 0)` + `blur(4px → 0)`
- Entrance duration: 300ms, `ease-out`
- Exit transform: `opacity: 1 → 0` + `translateY(0 → -12px)` (opposite direction, smaller offset)
- Exit duration: 150ms (half the entrance duration — exits should be faster)

The blur component adds a depth cue that makes entrances feel less flat. Keep blur modest (4px) — the goal is a subtle focus effect, not a visible blur.

### Contextual Icon Animations — Cross-Fade Pattern

When swapping two icons (e.g., play ↔ pause, chevron-up ↔ chevron-down, bookmark ↔ bookmarked), use this exact cross-fade spec:

**Framer Motion spring (preferred):**
- `scale: 0.25 → 1` (entering), `scale: 1 → 0.25` (exiting)
- `opacity: 0 → 1` (entering), `opacity: 1 → 0` (exiting)
- `filter: blur(4px) → blur(0)` (entering), `blur(0) → blur(4px)` (exiting)
- `transition: { type: "spring", duration: 0.3, bounce: 0 }` — **bounce MUST be 0**

**CSS fallback (no Framer):**
- Keep both icons in the DOM, one `position: absolute`
- Use `cubic-bezier(0.2, 0, 0, 1)` easing
- Duration: 200ms

The scale + blur combination creates a focus-snap effect that feels intentional rather than mechanical. The `bounce: 0` hard constraint exists because any bounce on a 0.25-scale origin point makes icons appear to "pop" invasively.

### Scale on Press — Canonical Value

The canonical scale value for press feedback is **`0.96`**.

Rules:
- Never use `scale(0.95)` — too large, feels unresponsive
- Never use `scale(0.97)` — too subtle at high DPI, not perceived as feedback
- Never use `scale(0.98)` or higher — imperceptible
- `0.96` is the ONLY correct value for standard interactive elements

Tailwind: `active:scale-[0.96]`
Framer: `whileTap={{ scale: 0.96 }}`

For primary CTAs where maximum tactility is needed (purchase, send, confirm):
use `0.96` with a shadow reduction: `box-shadow: none` during press.

Deprecation note: earlier versions of `reference/checklists.md` referenced `scale(0.97)`. That entry has been reconciled. **0.96 is the canonical value.**

### AnimatePresence initial={false}

When `AnimatePresence` wraps UI that exists in the DOM before it enters the animation scope (e.g., a tab panel that renders its first tab immediately, a dropdown that's already open on first load), use `initial={false}`:

```tsx
<AnimatePresence initial={false}>
  {isOpen && <motion.div key="panel" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} />}
</AnimatePresence>
```

Without `initial={false}`, Framer will animate the FIRST render of children — meaning UI that's immediately visible on page load will "fade in" unnecessarily. This creates a flash/flicker that signals poor craftsmanship.

**Rule:** Any `AnimatePresence` wrapping persistent UI should have `initial={false}`.

### will-change — GPU Property Table

Only add `will-change` when you observe first-frame stutter on lower-end hardware. Do NOT add it preemptively — it consumes GPU memory continuously for every element that has it.

GPU-compositable properties (safe with will-change):
| Property | will-change value |
|----------|------------------|
| transform (translate, scale, rotate) | `transform` |
| opacity | `opacity` |
| filter (blur, brightness, contrast) | `filter` |
| clip-path | `clip-path` |

Never use `will-change: all` or `will-change: contents` — this forces the entire element and its subtree onto a new compositor layer, thrashing memory.

Remove `will-change` after the animation completes if applied dynamically:
```js
element.addEventListener('transitionend', () => element.style.willChange = 'auto')
```
