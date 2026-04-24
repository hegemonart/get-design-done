<!-- Source: Phase 18 — get-design-done -->
<!-- Extends: reference/motion.md (for advanced patterns) -->
<!-- See also: reference/framer-motion-patterns.md, reference/motion-easings.md, reference/motion-spring.md -->

# Motion Advanced Patterns

## Spring Physics

### The Stiffness / Damping / Mass Triad

Spring animations are governed by three parameters that model a physical spring:

- **stiffness** — how tightly wound the spring is; higher = faster, snappier response
- **damping** — friction applied to the oscillation; higher = settles faster with less bounce
- **mass** — inertia of the object; higher = slower start and more overshoot

The damping ratio `ζ = damping / (2 * Math.sqrt(stiffness * mass))` determines behavior:

| Condition | ζ value | Behavior |
|-----------|---------|----------|
| Underdamped | ζ < 1 | Oscillates past target, settles with bounce |
| Critically damped | ζ = 1 | Reaches target exactly once, no overshoot |
| Overdamped | ζ > 1 | Approaches target slowly, no oscillation |

For UI: critically-damped or slightly underdamped (ζ ≈ 0.7–0.9) is almost always correct. Reserve underdamped (bouncy) for playful drag-dismiss moments only.

### Framer Motion Spring Config

```tsx
// Snappy, no bounce — good for menus, drawers
<motion.div
  animate={{ x: 0 }}
  transition={{ type: "spring", stiffness: 400, damping: 40, mass: 1 }}
/>

// Gentle settle — good for page-level transitions
<motion.div
  animate={{ opacity: 1, y: 0 }}
  transition={{ type: "spring", stiffness: 120, damping: 20, mass: 1 }}
/>

// Underdamped bounce — drag-to-dismiss return snap only
<motion.div
  animate={{ x: 0 }}
  transition={{ type: "spring", stiffness: 500, damping: 15, mass: 0.8 }}
/>

// Using bounce shorthand (0 = no bounce, 1 = maximum bounce)
<motion.div
  animate={{ scale: 1 }}
  transition={{ type: "spring", bounce: 0, duration: 0.4 }}
/>
```

### CSS `linear()` Spring Approximation

For environments without a spring library, `linear()` can approximate spring curves by sampling the curve at intervals:

```css
/* Approximated spring: stiffness 300, damping 30 */
.spring-in {
  transition: transform 0.6s linear(
    0, 0.009, 0.035 2.1%, 0.141, 0.281 6.7%, 0.723 12.9%, 0.938 16.7%,
    1.017, 1.077, 1.104 24%, 1.121, 1.121, 1.106, 1.089 30.3%, 1.042 34.2%,
    1.013 38.3%, 0.995 42.9%, 0.988 46.9%, 0.984 50.8%, 0.985 55%,
    0.991 59.6%, 0.998 65.1%, 1.001 70.1%, 1.002 75.1%, 1 100%
  );
}
```

---

## Stagger Patterns

### Index × Delay Formula

The simplest stagger: each item delays by `index * baseDelay`.

```tsx
// Framer Motion stagger via variants
const container = {
  hidden: {},
  show: {
    transition: {
      staggerChildren: 0.06,
      delayChildren: 0.1,
    },
  },
};

const item = {
  hidden: { opacity: 0, y: 12 },
  show: { opacity: 1, y: 0, transition: { type: "spring", stiffness: 300, damping: 28 } },
};

function List({ items }: { items: string[] }) {
  return (
    <motion.ul variants={container} initial="hidden" animate="show">
      {items.map((text, i) => (
        <motion.li key={i} variants={item}>{text}</motion.li>
      ))}
    </motion.ul>
  );
}
```

### Exponential Easing for Natural Cascade

Linear stagger feels mechanical past ~5 items. Use an exponential curve so earlier items feel snappier:

```ts
// delay = base * index^0.7 — compresses stagger for large lists
function staggerDelay(index: number, base = 0.05): number {
  return base * Math.pow(index, 0.7);
}
```

### Directional Stagger

```tsx
// Enter from bottom — items stagger upward into place
const enterFromBottom = {
  hidden: { opacity: 0, y: 20 },
  show: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { delay: i * 0.05, type: "spring", stiffness: 260, damping: 24 },
  }),
};

// Exit to top — reverse order
const exitToTop = {
  show: { opacity: 1, y: 0 },
  hidden: (i: number) => ({
    opacity: 0,
    y: -16,
    transition: { delay: i * 0.03 },
  }),
};

// Usage with custom prop
<motion.li custom={index} variants={enterFromBottom} initial="hidden" animate="show" exit="hidden" />
```

---

## Scroll-Driven Animation

### CSS `animation-timeline: scroll()`

Ties an animation's progress to the scroll position of a scroll container.

```css
.progress-bar {
  animation: grow-width linear;
  animation-timeline: scroll(root block);
  animation-range: 0% 100%;
}

@keyframes grow-width {
  from { transform: scaleX(0); }
  to   { transform: scaleX(1); }
}
```

### CSS `animation-timeline: view()`

Ties progress to an element's visibility within the viewport.

```css
.fade-in-card {
  animation: reveal linear both;
  animation-timeline: view();
  animation-range: entry 0% entry 40%;
}

@keyframes reveal {
  from { opacity: 0; transform: translateY(24px); }
  to   { opacity: 1; transform: translateY(0); }
}
```

`animation-range` accepts: `entry`, `exit`, `cover`, `contain` + percentage offset.

### IntersectionObserver Fallback

```ts
function observeReveal(selector: string) {
  const els = document.querySelectorAll<HTMLElement>(selector);
  const io = new IntersectionObserver(
    (entries) => {
      entries.forEach((e) => {
        if (e.isIntersecting) {
          e.target.classList.add("revealed");
          io.unobserve(e.target);
        }
      });
    },
    { threshold: 0.15 }
  );
  els.forEach((el) => io.observe(el));
}
```

### `ScrollTimeline` JS API

```ts
const timeline = new ScrollTimeline({
  source: document.scrollingElement!,
  axis: "block",
});

el.animate(
  [{ opacity: 0, transform: "translateY(20px)" }, { opacity: 1, transform: "none" }],
  { duration: 1, fill: "both", timeline }
);
```

---

## FLIP (First / Last / Invert / Play)

### The Four Steps

1. **First** — record the element's current bounding rect (`getBoundingClientRect()`)
2. **Last** — apply the DOM change, then record the new rect
3. **Invert** — set a CSS transform that moves the element back to its "First" position
4. **Play** — animate the transform to identity (`0, 0, scale(1)`)

```ts
function flip(el: HTMLElement, applyChange: () => void) {
  // First
  const first = el.getBoundingClientRect();

  // Last
  applyChange();
  const last = el.getBoundingClientRect();

  // Invert
  const dx = first.left - last.left;
  const dy = first.top  - last.top;
  const sx = first.width  / last.width;
  const sy = first.height / last.height;

  el.style.transform = `translate(${dx}px, ${dy}px) scale(${sx}, ${sy})`;
  el.style.transformOrigin = "top left";

  // Play — use rAF to ensure paint
  requestAnimationFrame(() => {
    el.style.transition = "transform 0.35s cubic-bezier(0.4, 0, 0.2, 1)";
    el.style.transform  = "";

    el.addEventListener("transitionend", () => {
      el.style.transition = "";
      el.style.transformOrigin = "";
    }, { once: true });
  });
}
```

### Framer Motion `layoutId` as FLIP Abstraction

```tsx
// The layoutId prop handles FLIP automatically across re-renders and AnimatePresence
function Tabs({ tabs, active, setActive }: TabsProps) {
  return (
    <div className="tabs">
      {tabs.map((tab) => (
        <button key={tab.id} onClick={() => setActive(tab.id)} className="tab">
          {tab.label}
          {active === tab.id && (
            <motion.span
              layoutId="active-pill"
              className="active-pill"
              transition={{ type: "spring", stiffness: 380, damping: 36 }}
            />
          )}
        </button>
      ))}
    </div>
  );
}
```

---

## View Transitions API

### Same-Document Transitions

```ts
function navigateTo(newContent: () => void) {
  if (!document.startViewTransition) {
    newContent();
    return;
  }
  document.startViewTransition(newContent);
}
```

### Cross-Document Transitions

```css
/* In both pages — opt in */
@view-transition {
  navigation: auto;
}
```

### `view-transition-name` for Shared Elements

```css
.hero-image {
  view-transition-name: hero-image;
}

/* Customize the cross-fade */
::view-transition-old(hero-image) {
  animation: fade-out 0.3s ease-out;
}
::view-transition-new(hero-image) {
  animation: fade-in 0.3s ease-in;
}
```

### Progressive Enhancement Pattern

```ts
async function transitionTo(url: string) {
  if (!document.startViewTransition) {
    window.location.href = url;
    return;
  }
  await document.startViewTransition(async () => {
    const res  = await fetch(url);
    const html = await res.text();
    const doc  = new DOMParser().parseFromString(html, "text/html");
    document.body.replaceWith(doc.body);
    history.pushState({}, "", url);
  });
}
```

---

## Route-Level Animation Orchestration

### Exit → Enter Sequencing

The fundamental rule: the exiting page must fully finish before the entering page starts, or both must overlap with a crossfade. Avoid flash by keeping the exiting element mounted until its animation completes.

### AnimatePresence in Next.js (App Router)

```tsx
// app/layout.tsx
"use client";
import { AnimatePresence } from "framer-motion";
import { usePathname } from "next/navigation";

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  return (
    <html>
      <body>
        <AnimatePresence mode="wait">
          <motion.main
            key={pathname}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.22, ease: [0.4, 0, 0.2, 1] }}
          >
            {children}
          </motion.main>
        </AnimatePresence>
      </body>
    </html>
  );
}
```

`mode="wait"` ensures exit completes before enter begins. `mode="sync"` runs both simultaneously for crossfades.

---

## Gesture & Drag Mechanics

### Momentum-Based Dismissal

```ts
const FLICK_THRESHOLD = 0.11; // px/ms — dismiss regardless of distance

let startX = 0;
let startTime = 0;

el.addEventListener("pointerdown", (e) => {
  el.setPointerCapture(e.pointerId); // keep events when pointer leaves bounds
  startX    = e.clientX;
  startTime = performance.now();
  if ((e as TouchEvent).touches?.length > 1) return; // multi-touch guard
});

el.addEventListener("pointermove", (e) => {
  const dx = e.clientX - startX;
  el.style.transform = `translateX(${dx}px)`;
});

el.addEventListener("pointerup", (e) => {
  const dx      = e.clientX - startX;
  const elapsed = performance.now() - startTime;
  const velocity = Math.abs(dx) / elapsed; // px/ms

  if (velocity > FLICK_THRESHOLD || Math.abs(dx) > el.offsetWidth * 0.5) {
    dismiss(dx > 0 ? "right" : "left");
  } else {
    snapBack();
  }
});
```

### Boundary Damping with Increasing Friction

```ts
function dampedPosition(raw: number, limit: number): number {
  if (Math.abs(raw) <= limit) return raw;
  const overflow   = Math.abs(raw) - limit;
  const sign       = raw > 0 ? 1 : -1;
  // Logarithmic damping — resistance grows as overflow grows
  const dampedOver = Math.log1p(overflow) * 18;
  return sign * (limit + dampedOver);
}
```

### Swipe-to-Dismiss Pattern (Framer Motion)

```tsx
function SwipeCard({ onDismiss }: { onDismiss: () => void }) {
  const x         = useMotionValue(0);
  const opacity   = useTransform(x, [-200, 0, 200], [0, 1, 0]);
  const rotate    = useTransform(x, [-200, 200], [-15, 15]);

  return (
    <motion.div
      style={{ x, opacity, rotate }}
      drag="x"
      dragConstraints={{ left: 0, right: 0 }}
      dragElastic={0.15} // built-in boundary damping
      onDragEnd={(_, info) => {
        const velocity = Math.abs(info.velocity.x);
        const offset   = Math.abs(info.offset.x);
        if (velocity > 400 || offset > 120) onDismiss();
      }}
    />
  );
}
```

---

## Clip-Path Animation Patterns

### `inset()` Morphing

```css
.panel {
  clip-path: inset(0 100% 0 0); /* fully clipped right */
  transition: clip-path 0.4s cubic-bezier(0.4, 0, 0.2, 1);
}
.panel.open {
  clip-path: inset(0 0% 0 0); /* fully revealed */
}
```

### Hold-to-Delete Fill

```ts
let timer: ReturnType<typeof setTimeout> | null = null;
let startTime = 0;
let raf = 0;

btn.addEventListener("pointerdown", () => {
  startTime = performance.now();
  function tick() {
    const progress = Math.min((performance.now() - startTime) / 2000, 1);
    const right    = 100 - progress * 100;
    fill.style.clipPath = `inset(0 ${right}% 0 0)`;
    if (progress < 1) raf = requestAnimationFrame(tick);
    else triggerDelete();
  }
  raf = requestAnimationFrame(tick);
});

btn.addEventListener("pointerup", () => {
  cancelAnimationFrame(raf);
  fill.style.transition  = "clip-path 0.2s ease-out";
  fill.style.clipPath     = "inset(0 100% 0 0)";
  fill.addEventListener("transitionend", () => { fill.style.transition = ""; }, { once: true });
});
```

### Image Reveal on Scroll

```ts
const io = new IntersectionObserver((entries) => {
  entries.forEach((e) => {
    if (!e.isIntersecting) return;
    const img = e.target as HTMLElement;
    img.style.transition = "clip-path 0.7s cubic-bezier(0.4, 0, 0.2, 1)";
    img.style.clipPath   = "inset(0 0 0% 0)";
    io.unobserve(img);
  });
}, { threshold: 0.1 });

document.querySelectorAll<HTMLElement>(".reveal-image").forEach((img) => {
  img.style.clipPath = "inset(0 0 100% 0)";
  io.observe(img);
});
```

### Tab Active-State Color Mask

```tsx
// Two stacked lists: default style below, active style above, clipped to active tab width
function MaskedTabs({ tabs, active }: { tabs: Tab[]; active: string }) {
  const activeTab = tabs.find((t) => t.id === active);

  return (
    <div className="relative">
      {/* Base layer */}
      <ul className="tabs text-neutral-500">{tabs.map(renderTab)}</ul>

      {/* Active layer — clipped to active tab bounds */}
      <motion.ul
        className="tabs text-brand absolute inset-0 pointer-events-none"
        style={{ clipPath: `inset(0 ${/* right offset */ 0}px 0 ${activeTab?.left ?? 0}px)` }}
        animate={{ clipPath: `inset(0 ${activeTab?.right ?? 0}px 0 ${activeTab?.left ?? 0}px)` }}
        transition={{ type: "spring", stiffness: 380, damping: 36 }}
      >
        {tabs.map(renderTab)}
      </motion.ul>
    </div>
  );
}
```

### Drag-Comparison Slider

```tsx
function CompareSlider({ before, after }: { before: string; after: string }) {
  const [pos, setPos] = useState(50); // percent

  return (
    <div
      className="relative select-none overflow-hidden"
      onPointerMove={(e) => {
        const rect = e.currentTarget.getBoundingClientRect();
        setPos(((e.clientX - rect.left) / rect.width) * 100);
      }}
    >
      <img src={after} className="w-full" alt="after" />
      <img
        src={before}
        className="absolute inset-0 w-full h-full object-cover"
        style={{ clipPath: `inset(0 ${100 - pos}% 0 0)` }}
        alt="before"
      />
      <div
        className="absolute top-0 bottom-0 w-0.5 bg-white cursor-ew-resize"
        style={{ left: `${pos}%` }}
      />
    </div>
  );
}
```

---

## Blur-to-Mask Crossfades

Use a short `filter: blur()` during state transitions to bridge the visual gap between two overlapping states — it softens the hard edge that appears when opacity alone creates a ghost.

```tsx
<motion.div
  animate={isLoading ? "loading" : "ready"}
  variants={{
    loading: { filter: "blur(2px)", scale: 0.98, opacity: 0.7 },
    ready:   { filter: "blur(0px)", scale: 1,    opacity: 1 },
  }}
  transition={{ duration: 0.22, ease: "easeOut" }}
/>
```

**Rules:**
- Cap blur under 20px on non-animated elements — Safari allocates GPU memory per blurred layer, causing stutter at high values
- Pair with `scale(0.97)` for press feedback; the scale signals physical depth while blur softens content churn
- Use for: skeleton → content, loading → loaded image, optimistic update → confirmed state
- Do NOT use for layout shifts — blur does not mask reflow artifacts

---

## CSS Transitions vs Keyframes for Interruptible UI

**Transitions** retarget mid-flight: if you change the target value while a transition is running, the animation smoothly redirects from its current position to the new target.

**Keyframes** restart from zero: interrupting a keyframe animation jumps to the start of the keyframe sequence, causing a visual pop.

**Critical rule:** Always use transitions for toasts, toggles, drag handles, and optimistic-UI state flips.

```css
/* CORRECT — transition retargets smoothly when toggled rapidly */
.toggle-thumb {
  transform: translateX(0);
  transition: transform 0.2s cubic-bezier(0.4, 0, 0.2, 1);
}
.toggle-thumb.checked {
  transform: translateX(20px);
}

/* WRONG for interruptible UI — keyframe restarts from translateX(0) on interrupt */
.toggle-thumb.checked {
  animation: slide-right 0.2s forwards;
}
@keyframes slide-right {
  from { transform: translateX(0); }
  to   { transform: translateX(20px); }
}
```

Use keyframes for: looping indicators, attention animations (shake, pulse), entrance sequences that must always play from the beginning.

---

## WAAPI (Web Animations API) for Programmatic CSS

Hardware-accelerated, interruptible, no library required.

```ts
// Basic syntax
const anim = el.animate(
  [
    { opacity: 0, transform: "translateY(8px)" },
    { opacity: 1, transform: "translateY(0)" },
  ],
  {
    duration: 280,
    easing: "cubic-bezier(0.4, 0, 0.2, 1)",
    fill: "forwards",
  }
);

// Cancel mid-flight (e.g., element removed before animation ends)
anim.cancel();

// Reverse mid-flight (e.g., hover-out before hover-in finished)
anim.reverse();

// Await completion
await anim.finished;
```

**When to reach for WAAPI over Framer Motion:**
- Vanilla JS components (no React)
- Imperative animations triggered by scroll/pointer math
- Cases where bundle size matters and you need only one or two animations
- Animations that must be cancelled/reversed programmatically based on external state

---

## Framer Motion Hardware-Acceleration Gotcha

### The Problem

`motion.div` with shorthand props (`x`, `y`, `scale`) computes values on the **main thread via rAF** and writes to `style.transform`. This is fine at rest but causes jank during heavy renders (page load, data fetching, React Suspense boundaries resolving).

Passing a plain string via the `style` prop (`transform: "translateX(100px)"`) sets the value directly as a CSS property, allowing the **GPU compositor** to handle it without main-thread involvement.

```tsx
// Main thread — can jank during heavy renders
<motion.div animate={{ x: 100 }} />

// GPU compositor — unaffected by main-thread load
<motion.div style={{ transform: "translateX(100px)" }} />

// Hybrid: use CSS variables for dynamic values that stay on compositor
<motion.div style={{ "--x": x } as React.CSSProperties} className="translate-x-[--x]" />
```

### When This Matters

- Initial page loads with concurrent data fetching
- Lists with 50+ animated items
- Shared layout animations during route transitions
- Any animation that must feel smooth during React's reconciliation work

### Canonical Example: Vercel Shared-Layout → CSS Migration

Vercel's site previously used Framer Motion `layoutId` for shared layout animations on their nav. Under heavy page-load conditions, the animations janked because motion values were being computed on the same thread as hydration. They migrated to CSS `view-transition-name` + `::view-transition-old/new`, which runs entirely off the main thread, eliminating the jank.

---

## Motion Cohesion & Personality

Motion values are a **design decision**, not a technical default. They communicate the personality of the product.

| Context | Recommended style | Why |
|---------|------------------|-----|
| Data dashboards, admin UIs | Crisp, fast `ease-out` (150–200ms) | Respects user's task focus; no distraction |
| Consumer apps, notifications | Slightly slower `ease` (220–280ms) | Feels polished; Sonner toast is the reference |
| Drag-to-dismiss, physical affordances | Underdamped spring with bounce | Mimics real physics; satisfying snap-back |
| Interruptible UI (toggles, toasts) | `bounce: 0`, transitions not keyframes | Must retarget without pop |
| Height + opacity combos | Trial and error per library | `height: auto` is not animatable in CSS; each library handles it differently |

**Do not mix** snappy dashboard animations with bouncy spring animations in the same product — the conflicting personalities create a sense that the UI was assembled from parts.

---

## Next-Day Slow-Motion Review Process

Fresh eyes catch what in-the-moment iteration misses. Animations feel correct when you are building them because your brain fills in the intent.

### Process

1. Come back the next day before reopening the feature branch
2. Temporarily multiply all durations by 2–5× in a local override
3. Open DevTools → Animations panel → step frame by frame
4. Test on a real device via USB (Safari remote devtools for iOS; Chrome remote debugger for Android)

### Checklist

- [ ] Color transitions are smooth with no intermediate hue shift
- [ ] Easing feel matches the intended personality (crisp vs playful)
- [ ] `transform-origin` is correct (elements scale/rotate from the right anchor point)
- [ ] Multiple properties animating together stay in sync (opacity and translate should peak together)
- [ ] Touch and gesture animations respond correctly to mid-gesture interruption
- [ ] Animation does not interfere with screen readers (`prefers-reduced-motion` respected)

```css
/* Local slow-motion override — remove before commit */
*, *::before, *::after {
  animation-duration: 4s !important;
  transition-duration: 4s !important;
}
```

---

## Disney's 12 Principles — UX Mapping

<!-- STUB: Disney's 12 Principles UX mapping — Phase 19.6 will author this section -->
<!-- Cross-reference: reference/motion-easings.md, reference/motion-spring.md -->

*This section is reserved for Phase 19.6 (Design Philosophy Layer). A full UX mapping of all 12 principles will be authored there and this stub will be replaced.*

See also: `reference/motion-easings.md`, `reference/motion-spring.md`, `reference/framer-motion-patterns.md`
