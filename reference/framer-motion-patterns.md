<!-- Source: nextlevelbuilder/ui-ux-pro-max-skill (MIT) — data/stacks/react.csv (framer-motion rows) -->

# Framer Motion Patterns

Framer Motion is the standard animation library for React. It abstracts the browser's animation primitives into a declarative API that stays out of your way for common cases while exposing full physics-based control when you need it. This reference covers implementation patterns — not just the API, but _why_ each pattern exists and when to apply it.

---

## 1. Basics — motion components

Any HTML (or SVG) element can become a motion component by prefixing it with `motion.`. The most common variants are `motion.div`, `motion.span`, `motion.button`, and `motion.li`, but `motion.section`, `motion.a`, `motion.img`, and any other HTML element follow the same pattern.

The four primary animation props are:

- **`initial`** — the state the element starts in before it mounts (or before a transition begins). Without `initial`, the element won't animate _from_ anything — it'll just be in the `animate` state on mount. Always provide `initial` when you want an entrance animation.
- **`animate`** — the state the element should animate _to_. Framer drives the element toward this state whenever it changes.
- **`exit`** — the state the element animates _to_ when it unmounts. Requires `<AnimatePresence>` as a parent — see Section 3.
- **`transition`** — controls how the animation happens (spring, tween, duration, ease). If omitted, Framer applies a spring by default for layout/positional changes and a tween for opacity.

A basic fade-in example:

```tsx
import { motion } from 'framer-motion'

function FadeIn({ children }: { children: React.ReactNode }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: 'tween', duration: 0.2, ease: 'easeOut' }}
    >
      {children}
    </motion.div>
  )
}
```

The slight `y: 8` offset on entry gives the element a sense of emerging from below — a common, subtle entrance pattern. The `easeOut` ease starts fast and slows at the end, which feels responsive.

---

## 2. Spring vs. Tween Configuration

Framer Motion supports two fundamentally different animation models. Choosing between them is not arbitrary — each has a domain where it clearly wins.

### Spring physics (preferred for UI motion)

Springs model the physics of a real spring: the element overshoots slightly and settles. This is why spring motion _feels natural_ — real objects in the world have inertia and settle under physical forces. For UI, spring motion communicates responsiveness and quality.

`type: "spring"` is Framer's default for layout animations and positional changes. Key parameters:

- **`stiffness`** (100–800): controls how forcefully the spring pulls toward the target. High stiffness = arrives fast and decisively. Low stiffness = slow, lazy arrival.
- **`damping`** (10–30): controls oscillation resistance. High damping = settles without overshoot. Low damping = bouncy.
- **`mass`** (0.5–2): adds inertia. Higher mass makes the element feel heavier and slower to respond.

The relationship that matters in practice:
- **High stiffness + high damping = snappy** — fast arrival, no bounce. This is the production UI default.
- **Low stiffness + low damping = bouncy** — never use in production UI. Bounce feels playful and toy-like, which is wrong for most product contexts.

**Hard constraint: `bounce: 0` always for icon cross-fades and micro-interactions.** The `bounce` shorthand parameter is a convenience alias — setting it to 0 ensures no oscillation. "Bounce must be zero" is a non-negotiable rule for any interaction that fires frequently or in information-dense UI.

Recommended production preset:

```tsx
transition={{ type: 'spring', stiffness: 400, damping: 30 }}
```

This is snappy and clean. It arrives fast and settles without any visible oscillation. Use it as the default for hover lifts, modal entries, and element transitions.

### Tween (for duration-controlled, eased animations)

Tween animations run over a fixed duration with a specified easing curve. Use them when exact timing matters — opacity fades, color transitions, anything where you need predictable, duration-controlled behavior rather than physics.

```tsx
transition={{ type: 'tween', duration: 0.2, ease: 'easeOut' }}
```

Ease guidance:
- **`"easeOut"`** for entrances — starts fast (feels responsive), decelerates to rest.
- **`"easeIn"`** for exits — accelerates away, gets out of the way quickly.
- **`"easeInOut"`** for emphasis transitions — smooth acceleration and deceleration, used when the same element transitions between states (not entering/exiting).

The rule of thumb: use springs for movement and scale; use tweens for opacity, color, and blur.

---

## 3. AnimatePresence

`AnimatePresence` is the component that enables exit animations. Without it, React unmounts components immediately, and `exit` props are never executed — the element simply vanishes.

```tsx
import { AnimatePresence, motion } from 'framer-motion'

function ToastContainer({ toasts }) {
  return (
    <AnimatePresence>
      {toasts.map(toast => (
        <motion.div
          key={toast.id}
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -10 }}
          transition={{ type: 'spring', stiffness: 400, damping: 30 }}
        >
          {toast.message}
        </motion.div>
      ))}
    </AnimatePresence>
  )
}
```

Every child of `AnimatePresence` that will be conditionally rendered **must have a `key` prop**. Framer uses the key to track which element is entering and which is exiting. Without a key, exit animations will not fire.

### AnimatePresence `mode` prop

The `mode` prop controls how entering and exiting elements interact during a transition:

- **`mode: "wait"`** — the exiting element completes its exit animation fully before the entering element begins its entrance. Use this for route transitions and tab panel swaps, where showing two elements simultaneously would be confusing.
- **`mode: "sync"`** — enter and exit animations run simultaneously. Use this when you're swapping UI elements (like icon cross-fades) and want both transitions to happen at once.
- **`mode: "popLayout"`** — the exiting element immediately pops out of the document flow so surrounding elements can animate into their new positions right away, while the exiting element still plays its exit animation. Ideal for list item removal.

### Critical rule: `<AnimatePresence initial={false}>`

When `AnimatePresence` wraps persistent UI that already exists on first render — like a tab panel that's visible on page load, or a sidebar that's open by default — you must pass `initial={false}`:

```tsx
<AnimatePresence initial={false}>
  {isOpen && (
    <motion.div key="panel" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
      {children}
    </motion.div>
  )}
</AnimatePresence>
```

Without `initial={false}`, every component inside `AnimatePresence` will play its entrance animation on first mount, even when the user didn't trigger it. This is jarring and wrong — **never animate on initial load for existing UI**.

---

## 4. Layout Animations

The `layout` prop is one of Framer Motion's most powerful features. Add `layout` to a `motion` component, and Framer automatically detects when the component's position or size changes in the DOM and animates it from the old layout to the new one — even if the change was caused by other elements shifting around it.

```tsx
<motion.div layout className="card">
  {isExpanded ? <FullContent /> : <Summary />}
</motion.div>
```

When `isExpanded` changes, Framer measures the old and new layouts and smoothly animates the transition. This works for position changes caused by sibling elements reordering, parent resizing, or content toggling.

**`layoutId` — shared element transitions:** Assign the same `layoutId` to two different components, and Framer will morph between them when one unmounts and the other mounts. This is the canonical implementation for expanding card → detail transitions and hero → full-view animations.

```tsx
// Card in list view
<motion.img layoutId={`product-image-${id}`} src={thumbnail} />

// Same image in expanded modal
<motion.img layoutId={`product-image-${id}`} src={fullImage} />
```

When the list-view card unmounts and the modal mounts, Framer animates the image from its list-view position to its modal position. The two components don't need to coexist — the transition bridges the gap.

**Important:** ensure only one component with a given `layoutId` is mounted at a time. Two simultaneously mounted components with the same `layoutId` will fight each other and produce broken animations.

**`layout="position"`:** Use this variant when you only want to animate the element's position, not its size. This prevents layout animation from attempting to smoothly resize the element when content-length changes cause size changes.

---

## 5. Variants and Orchestration

Variants let you define named animation states as objects and apply them declaratively, rather than repeating animation values inline throughout your component tree.

```tsx
const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.05,
      delayChildren: 0.1,
    },
  },
}

const itemVariants = {
  hidden: { opacity: 0, y: 10 },
  visible: { opacity: 1, y: 0 },
}

function AnimatedList({ items }) {
  return (
    <motion.ul
      variants={containerVariants}
      initial="hidden"
      animate="visible"
    >
      {items.map(item => (
        <motion.li key={item.id} variants={itemVariants}>
          {item.label}
        </motion.li>
      ))}
    </motion.ul>
  )
}
```

**Propagation:** When a parent has `variants` and `animate="visible"`, child `motion` components that also have `variants` will automatically receive the same `animate` value — they don't need their own `animate` prop. Framer propagates the state name down the tree.

**`staggerChildren`** delays each child's animation start by the specified seconds after the previous child. A value of `0.05` means each item enters 50ms after the previous — the standard for list entrance animations. More than `0.08` seconds starts to feel slow; more than 6–8 items should stagger in parallel (`staggerChildren` + `staggerDirection` with a cap).

**`delayChildren`** adds an initial delay before the first child begins, which gives the parent time to render visibly before its children start entering.

---

## 6. Gesture-Driven Motion

Framer Motion provides props that animate elements in response to user gestures without requiring event handlers or state.

**`whileHover`:** The animation state while the pointer is hovering. Prefer subtle transforms — `scale: 1.02` for a gentle grow or `y: -2` for a subtle lift. Avoid large scale values (> 1.05) on UI elements; they feel unstable.

```tsx
<motion.button whileHover={{ scale: 1.02 }} transition={{ type: 'spring', stiffness: 400, damping: 30 }}>
  Save draft
</motion.button>
```

**`whileTap`:** The animation state while the element is pressed. The canonical scale-on-press value is **0.96**. Never go below 0.95 (looks broken) and never above 0.98 (imperceptible) for primary interactive elements.

```tsx
<motion.button
  whileHover={{ scale: 1.02 }}
  whileTap={{ scale: 0.96 }}
  transition={{ type: 'spring', stiffness: 400, damping: 30 }}
>
  Confirm
</motion.button>
```

**`drag` + `dragConstraints`:** Enable drag with `drag` (either `true`, `"x"`, or `"y"`), and bound the drag region with `dragConstraints`. Use `dragElastic: 0.1` for a subtle resistance when dragging beyond the constraint boundaries — this gives physical feedback that the user has reached an edge.

```tsx
<motion.div
  drag="x"
  dragConstraints={{ left: -100, right: 100 }}
  dragElastic={0.1}
  whileDrag={{ scale: 1.05, cursor: 'grabbing' }}
>
  Drag me
</motion.div>
```

**`whileDrag`:** Applies an animation state while the element is being dragged. Use it to provide visual feedback that the element is in motion (subtle scale-up, shadow, cursor change).

---

## 7. Scroll-Linked Animations

**`useScroll()` + `useTransform()`:** For animations that respond continuously to scroll position, use `useScroll` to get `scrollYProgress` (a motion value from 0 to 1 representing document scroll) and `useTransform` to map that range to any animated value.

```tsx
import { useScroll, useTransform, motion } from 'framer-motion'

function ParallaxHero() {
  const { scrollYProgress } = useScroll()
  const y = useTransform(scrollYProgress, [0, 1], [0, -200])

  return (
    <motion.div style={{ y }}>
      <HeroImage />
    </motion.div>
  )
}
```

Use `style={{ y }}` (not `animate`) for scroll-linked values because `animate` creates discrete state transitions, while `style` with a motion value creates continuous, real-time updates.

**`whileInView` + `viewport`:** For elements that should animate when they enter the viewport (the most common scroll animation pattern), `whileInView` is more reliable than `useScroll`. It triggers a state change rather than a continuous value mapping, which is easier to reason about and less prone to performance issues.

```tsx
<motion.section
  initial={{ opacity: 0, y: 20 }}
  whileInView={{ opacity: 1, y: 0 }}
  viewport={{ once: true, margin: '-100px' }}
  transition={{ type: 'tween', duration: 0.4, ease: 'easeOut' }}
>
  <FeatureSection />
</motion.section>
```

**`viewport={{ once: true }}`** is the preferred option for entrance animations — the element animates in once and stays visible. Without `once: true`, the element will animate every time it enters the viewport, which is usually wrong for entrance effects (and can feel janky during fast scrolling).

---

## 8. prefers-reduced-motion Compliance

Respecting `prefers-reduced-motion` is **mandatory** for accessibility compliance. Some users have vestibular disorders or motion sensitivity — for them, unnecessary motion causes real physical discomfort. This is not optional polish; it is a WCAG 2.1 requirement.

### Per-component approach with `useReducedMotion`

```tsx
import { useReducedMotion, motion } from 'framer-motion'

function AnimatedCard() {
  const prefersReducedMotion = useReducedMotion()

  const transition = prefersReducedMotion
    ? { duration: 0 }
    : { type: 'spring', stiffness: 400, damping: 30 }

  return (
    <motion.div
      initial={{ opacity: 0, y: prefersReducedMotion ? 0 : 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={transition}
    >
      Content
    </motion.div>
  )
}
```

When `prefersReducedMotion` is true, set `duration: 0` and remove any positional animation values — the element should appear instantly without motion.

### App-wide approach with `MotionConfig` (preferred)

The cleanest solution for most applications is to wrap the app root with `MotionConfig` using `reducedMotion: "user"`. This instructs Framer to automatically apply reduced-motion behavior for all motion components in the subtree when the OS preference is set — no per-component logic needed.

```tsx
import { MotionConfig } from 'framer-motion'

function App() {
  return (
    <MotionConfig reducedMotion="user">
      <Router />
    </MotionConfig>
  )
}
```

`reducedMotion: "user"` reads the OS setting via `prefers-reduced-motion` media query and disables animations globally when it's set. This is the preferred approach because it's zero-maintenance — adding new animated components automatically inherits the behavior.

---

## 9. 60fps Performance Rules

Animation performance on the web comes down to a single principle: **only animate properties that the browser can handle on the GPU compositor thread**. Everything else requires the browser to recalculate layout or repaint pixels — work that happens on the main thread and causes dropped frames.

### Properties that are GPU-safe (always use these)

- `x`, `y` — map to `translateX()` and `translateY()` in `transform`
- `scale`, `scaleX`, `scaleY` — map to `scale()` in `transform`
- `rotate`, `rotateX`, `rotateY`, `rotateZ`
- `skewX`, `skewY`
- `opacity`

These properties run on the compositor thread and never block the main thread, regardless of how complex the rest of the page is.

### Properties that cause jank (never animate these)

- `width`, `height` — triggers layout recalculation on every frame
- `margin`, `padding` — shifts surrounding elements, triggers full reflow
- `border-width`
- `left`, `top`, `right`, `bottom` (on positioned elements) — triggers layout
- `font-size` — triggers layout and repaint

If you need to animate a size change, use `scale` on a wrapper. If you need to animate position, use `x`/`y` rather than `left`/`top`. This distinction is why Framer's layout animation system (Section 4) works — it uses `transform` internally even when responding to layout-driven position changes.

### `will-change: transform`

Only add `will-change: transform` when you observe a first-frame stutter on a specific element. Do not add it preemptively — it forces the browser to allocate a separate GPU layer for the element immediately, consuming GPU memory whether or not the animation is actually playing. Reserve it for elements with known performance issues after profiling.

---

## 10. MotionConfig

`MotionConfig` is a context provider that configures all `motion` components within its subtree. Use it for:

- **Reduced motion compliance** — as shown in Section 8, `reducedMotion: "user"` is the cleanest global solution.
- **Global transition defaults** — set a default transition for all motion components so individual components don't need to repeat the same `transition` prop.
- **Custom ease functions** — define a custom cubic-bezier ease once and reference it by name throughout the tree.

```tsx
<MotionConfig
  transition={{ type: 'spring', stiffness: 300, damping: 25 }}
  reducedMotion="user"
>
  <App />
</MotionConfig>
```

With this configuration, every `motion` component that doesn't specify its own `transition` will use the spring default, and the reduced-motion preference is respected automatically.

---

## 11. Common Pitfalls (from UUPM react.csv data)

These are the mistakes that appear most frequently in codebases using Framer Motion:

**Missing `initial` with `animate`:** If you add `animate={{ opacity: 1 }}` without `initial={{ opacity: 0 }}`, the element is already at opacity 1 on mount — there's nothing to animate from. Always pair `animate` with `initial` when you want an entrance effect.

**Missing `key` props in `AnimatePresence`:** Exit animations will silently not fire if children of `AnimatePresence` don't have `key` props. Framer can't identify which element is leaving without a stable key.

**Variant propagation only reaches `motion` children:** Parent variants propagate to child `motion` components, but not to plain HTML children or non-motion React components. If a list item is a plain `<li>` instead of `<motion.li>`, it won't receive the parent's variant orchestration.

**`layoutId` conflicts:** If two components with the same `layoutId` are both mounted simultaneously — even briefly during a transition — Framer doesn't know which is the source and which is the target. The result is erratic, broken animation. Ensure mutual exclusivity: when one mounts, the other must have already unmounted.

**Unnecessary `AnimatePresence` nesting:** Nesting `AnimatePresence` inside another `AnimatePresence` complicates exit orchestration — inner exits may not complete before outer exits begin. Keep the tree flat; use a single `AnimatePresence` at the appropriate level.

**Wrapping everything in `motion.div`:** `motion.div` carries a slightly larger bundle footprint than a plain `div` because it registers the element with Framer's animation engine. Don't wrap static, unanimated elements. Only wrap elements that actually need animation. Reserve `motion.*` for elements where animation provides genuine value.
