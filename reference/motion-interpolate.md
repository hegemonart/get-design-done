<!-- Source: React Native — Libraries/Animated/AnimatedInterpolation.js (MIT License) -->
<!-- Attribution: Facebook, Inc. and its affiliates -->

# Motion Interpolation

Interpolation is the mechanism that maps any changing value — progress, scroll position, pointer delta, elapsed time — into any animated output range. Every animation in a system can be decomposed into a single canonical form.

---

## Core Concept

Any animation decomposes into four parameters:

```
interpolate(inputValue, inputRange, outputRange, extrapolationConfig?)
```

| Parameter | Type | Description |
|---|---|---|
| `inputValue` | `number` | The driver value (a scalar that changes over time) |
| `inputRange` | `number[]` | Ordered list of input breakpoints |
| `outputRange` | `number \| string[]` | Corresponding output values at each breakpoint |
| `extrapolationConfig` | `object?` | What to do when input is outside `inputRange` |

Between any two adjacent breakpoints, the output is linearly interpolated by default. An `easing` function can be applied per-segment to shape the curve. See [motion-easings.md](./motion-easings.md) for the `easing` parameter.

**Principle:** The driver value is always a plain number. The animation is a pure function of that number. This separates *what drives the animation* from *what the animation does*, making it composable and testable.

---

## Extrapolation Modes

When `inputValue` falls outside `inputRange`, the behavior is controlled by the extrapolation config. React Native defines four named modes:

### `extend` (default)

Continues the linear trend of the first/last segment past the range boundary. Output keeps growing (or shrinking) indefinitely.

```js
interpolate(scrollY, [0, 100], [0, 1], { extrapolate: 'extend' })
// scrollY = 200 → output = 2.0
```

**Use when:** The animation should track the input continuously beyond the defined range (e.g., parallax that keeps moving as you scroll past a section).

---

### `clamp`

Pins the output to the boundary value once the input leaves the range.

```js
interpolate(scrollY, [0, 100], [0, 1], { extrapolate: 'clamp' })
// scrollY = 200 → output = 1.0  (clamped at top)
// scrollY = -50 → output = 0.0  (clamped at bottom)
```

**Use when:** An element should be fully visible/hidden after a threshold and not go further (e.g., a header that fades in and stays visible after scrolling 100px).

---

### `identity`

Returns the raw input value itself once outside the range, ignoring the output mapping.

```js
interpolate(t, [0, 1], [0, 100], { extrapolate: 'identity' })
// t = 1.5 → output = 1.5  (not 150 — raw input echoed)
```

**Use when:** You need the value to revert to unscaled behavior outside a zone. Uncommon; most interpolation uses `clamp` or `extend`.

---

### `wrap`

Wraps the input cyclically around the input range before applying the mapping. Produces looping output.

```js
interpolate(t, [0, 1], [0, 360], { extrapolate: 'wrap' })
// t = 1.5 → maps to t=0.5 → output = 180
// t = 2.0 → maps to t=0.0 → output = 0
```

**Use when:** Rotation, looping progress indicators, repeating carousel positions.

---

## Taxonomy of Animation Types

### Progress-linked (`0 → 1`)

The driver is a normalized progress value from 0 to 1. Most explicit animations and transitions fall here.

```
inputRange:  [0, 1]
outputRange: [startValue, endValue]
```

**Examples:** mount/unmount transition, tab indicator position, wizard step progress.

```js
// Framer Motion
const opacity = useTransform(progress, [0, 1], [0, 1]);
const x       = useTransform(progress, [0, 1], ['-100%', '0%']);
```

---

### Scroll-linked (px scroll position)

The driver is the raw pixel scroll offset from a scroll container. Common range is `[0, containerHeight]` or a sub-range for reveal effects.

```
inputRange:  [0, 300]   // px from top of scroll container
outputRange: [1, 0]     // opacity fades out as user scrolls 300px
```

```js
// Framer Motion — scroll-linked opacity
const { scrollY } = useScroll();
const opacity = useTransform(scrollY, [0, 300], [1, 0], { clamp: true });
```

```css
/* CSS Scroll Timeline equivalent */
@keyframes fade-header {
  from { opacity: 1; }
  to   { opacity: 0; }
}

.header {
  animation: fade-header linear both;
  animation-timeline: scroll(root);
  animation-range: 0px 300px;
}
```

---

### Gesture-linked (pointer delta)

The driver is the cumulative pointer displacement in pixels (e.g., drag distance). Input range is typically anchored at 0 with a resistance model at the extremes.

```
inputRange:  [-200, 0, 200]
outputRange: ['-100%', '0%', '100%']
```

**Key difference from scroll-linked:** gesture-linked animations are often bidirectional and involve velocity projection for throw/release behavior.

```js
// Framer Motion — drag with spring release
<motion.div
  drag="x"
  dragConstraints={{ left: -200, right: 200 }}
  style={{ x: dragX }}
/>

// Manual lerp pattern for custom gesture handling
function lerp(a, b, t) {
  return a + (b - a) * t;
}

function interpolateGesture(delta, inputRange, outputRange) {
  const [inMin, inMax] = inputRange;
  const [outMin, outMax] = outputRange;
  const t = Math.max(0, Math.min(1, (delta - inMin) / (inMax - inMin)));
  return lerp(outMin, outMax, t);
}
```

---

### Time-linked (`Date.now()`)

The driver is wall-clock time in milliseconds. Used for ambient animations, looping effects, and time-based sequencing where a spring or tween is not driving the value.

```
inputRange:  [startTime, startTime + durationMs]
outputRange: [0, 1]
extrapolate: 'clamp'
```

```js
// Manual time-linked animation loop
function useTimeLinked(durationMs) {
  const [progress, setProgress] = useState(0);
  const startTime = useRef(Date.now());

  useAnimationFrame(() => {
    const elapsed = Date.now() - startTime.current;
    const t = Math.min(1, elapsed / durationMs);
    setProgress(t);
  });

  return progress;
}
```

---

## Using Easing with Interpolation

The `easing` parameter shapes the interpolation curve within a segment. It accepts any `t → value` function from [motion-easings.md](./motion-easings.md).

```js
import { inOut, cubic } from '../scripts/lib/easings.cjs';

// Framer Motion with easing
const y = useTransform(scrollY, [0, 400], [0, -100], {
  ease: inOut(cubic),  // or any easing function
});
```

```css
/* CSS animation-timing-function applies per-keyframe segment */
@keyframes slide-up {
  from { transform: translateY(0);    animation-timing-function: var(--ease-cubic-out); }
  to   { transform: translateY(-100px); }
}
```

---

## Manual `lerp` Pattern

When you need to interpolate outside a framework, the bare pattern is:

```js
/**
 * Linear interpolation between two values.
 * @param {number} a  - Start value (at t=0)
 * @param {number} b  - End value (at t=1)
 * @param {number} t  - Progress in [0, 1]
 * @returns {number}
 */
function lerp(a, b, t) {
  return a + (b - a) * t;
}

/**
 * Map inputValue from inputRange to outputRange with optional easing and clamping.
 */
function interpolate(inputValue, [inMin, inMax], [outMin, outMax], {
  easing = (t) => t,
  extrapolate = 'clamp',
} = {}) {
  let t = (inputValue - inMin) / (inMax - inMin);

  if (extrapolate === 'clamp') t = Math.max(0, Math.min(1, t));
  // extend: t is unbounded
  // identity: return inputValue if out of range
  // wrap: t = ((t % 1) + 1) % 1

  return lerp(outMin, outMax, easing(t));
}
```

---

## Multi-segment Interpolation

Passing more than two breakpoints produces piecewise interpolation. Each adjacent pair is a separate segment.

```js
// Framer Motion multi-segment
const background = useTransform(
  scrollY,
  [0, 200, 400, 600],
  ['#ffffff', '#f0f0f0', '#e0e0e0', '#000000']
);
```

This is equivalent to three separate interpolations chained by range.

---

## Cross-references

- Easing functions for the `easing` / `ease` parameter: [motion-easings.md](./motion-easings.md)
- Spring-based animation (an alternative driver to progress/scroll): [motion-spring.md](./motion-spring.md)
