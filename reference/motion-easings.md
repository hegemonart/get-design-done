<!-- Source: React Native — Libraries/Animated/Easing.js (MIT License) -->
<!-- Attribution: Facebook, Inc. and its affiliates — see https://github.com/facebook/react-native/blob/main/Libraries/Animated/Easing.js -->

# Motion Easings

Canonical easing curve presets derived from React Native's `Easing` module, adapted for CSS and web animation contexts.

## Quick Reference

| Token | CSS `cubic-bezier` | Character | Settle (spring/bounce) |
|---|---|---|---|
| `--ease-linear` | `cubic-bezier(0,0,1,1)` | Constant rate | — |
| `--ease-quad-in` | `cubic-bezier(0.55,0,1,1)` | Slow start | — |
| `--ease-quad-out` | `cubic-bezier(0,0,0.45,1)` | Slow end | — |
| `--ease-quad-in-out` | `cubic-bezier(0.455,0.03,0.515,0.955)` | Slow both | — |
| `--ease-cubic-in` | `cubic-bezier(0.55,0.055,0.675,0.19)` | Aggressive start | — |
| `--ease-cubic-out` | `cubic-bezier(0.215,0.61,0.355,1)` | Aggressive end | — |
| `--ease-cubic-in-out` | `cubic-bezier(0.645,0.045,0.355,1)` | Strong S-curve | — |
| `--ease-sin-in` | `cubic-bezier(0.47,0,0.745,0.715)` | Gentle start | — |
| `--ease-sin-out` | `cubic-bezier(0.39,0.575,0.565,1)` | Gentle end | — |
| `--ease-sin-in-out` | `cubic-bezier(0.445,0.05,0.55,0.95)` | Smooth S-curve | — |
| `--ease-circle-in` | `cubic-bezier(0.6,0.04,0.98,0.335)` | Circular arc start | — |
| `--ease-circle-out` | `cubic-bezier(0.075,0.82,0.165,1)` | Circular arc end | — |
| `--ease-exp-in` | `cubic-bezier(0.95,0.05,0.795,0.035)` | Explosive start | — |
| `--ease-exp-out` | `cubic-bezier(0.19,1,0.22,1)` | Explosive end | — |
| `--ease-elastic` | `linear(...)` baked | Overshoot + settle | ~500ms |
| `--ease-back-in` | `cubic-bezier(0.6,-0.28,0.735,0.045)` | Anticipation | — |
| `--ease-back-out` | `cubic-bezier(0.175,0.885,0.32,1.275)` | Overshoot | — |
| `--ease-bounce-out` | `linear(...)` baked | Bounces at end | ~420ms |

---

## Preset Groups

### `linear`

Motion at a constant rate. No acceleration or deceleration.

- **Human name:** Linear
- **Character:** Mechanical, robotic. Use only for opacity fades or loading bars where constant rate is intentional.
- **CSS custom property:** `--ease-linear`
- **CSS equivalent:** `cubic-bezier(0, 0, 1, 1)` (also the CSS keyword `linear`)

```css
:root {
  --ease-linear: cubic-bezier(0, 0, 1, 1);
}

.fade {
  transition: opacity 200ms var(--ease-linear);
}
```

```js
// React Native Easing
Easing.linear
```

---

### `quad`

Quadratic — acceleration proportional to `t²`.

- **Human name:** Quad (ease-in-out)
- **Character:** Subtle, polished. Most common choice for UI transitions.
- **CSS custom property:** `--ease-quad-in-out`

```css
:root {
  --ease-quad-in:     cubic-bezier(0.55, 0, 1, 1);
  --ease-quad-out:    cubic-bezier(0, 0, 0.45, 1);
  --ease-quad-in-out: cubic-bezier(0.455, 0.03, 0.515, 0.955);
}
```

```js
Easing.quad          // base: t * t
Easing.in(Easing.quad)
Easing.out(Easing.quad)
Easing.inOut(Easing.quad)
```

---

### `cubic`

Cubic — acceleration proportional to `t³`. More pronounced than quad.

- **Human name:** Cubic (ease-in-out)
- **Character:** Snappy, decisive. Good for panels, drawers, menus.
- **CSS custom property:** `--ease-cubic-in-out`

```css
:root {
  --ease-cubic-in:     cubic-bezier(0.55, 0.055, 0.675, 0.19);
  --ease-cubic-out:    cubic-bezier(0.215, 0.61, 0.355, 1);
  --ease-cubic-out:    cubic-bezier(0.215, 0.61, 0.355, 1); /* "ease-out-cubic" */
  --ease-cubic-in-out: cubic-bezier(0.645, 0.045, 0.355, 1);
}
```

```js
Easing.cubic         // base: t * t * t
Easing.inOut(Easing.cubic)
```

---

### `poly(n)`

Generalised polynomial — `t^n`. Quad is `poly(2)`, cubic is `poly(3)`.

- **Human name:** Poly-n
- **Character:** Tunable. Higher `n` = harder snap.
- **CSS custom property:** No single token; bake to `cubic-bezier` per n.

```js
Easing.poly(4)   // quartic
Easing.poly(5)   // quintic
Easing.in(Easing.poly(4))
```

No direct CSS equivalent — approximate with a `cubic-bezier` or bake to `linear()`.

---

### `sin`

Sinusoidal — easing shaped by the sine function. Smooth and natural.

- **Human name:** Sine
- **Character:** Organic, gentle. Works well for ambient or breathing animations.
- **CSS custom property:** `--ease-sin-in-out`

```css
:root {
  --ease-sin-in:     cubic-bezier(0.47, 0, 0.745, 0.715);
  --ease-sin-out:    cubic-bezier(0.39, 0.575, 0.565, 1);
  --ease-sin-in-out: cubic-bezier(0.445, 0.05, 0.55, 0.95);
}
```

```js
Easing.sin
// Internally: 1 - Math.cos(t * Math.PI / 2)
```

---

### `circle`

Circular arc — based on `sqrt(1 - t²)`. Sharp acceleration at the end of its range.

- **Human name:** Circ
- **Character:** Abrupt, dramatic. Use sparingly for emphasis.
- **CSS custom property:** `--ease-circle-out`

```css
:root {
  --ease-circle-in:  cubic-bezier(0.6, 0.04, 0.98, 0.335);
  --ease-circle-out: cubic-bezier(0.075, 0.82, 0.165, 1);
}
```

```js
Easing.circle
// Internally: 1 - Math.sqrt(1 - t * t)
```

---

### `exp`

Exponential — `2^(10 * (t - 1))`. Starts near-zero, ends explosively.

- **Human name:** Expo
- **Character:** High-impact. Good for reveal animations, hero entrances.
- **CSS custom property:** `--ease-exp-out`

```css
:root {
  --ease-exp-in:  cubic-bezier(0.95, 0.05, 0.795, 0.035);
  --ease-exp-out: cubic-bezier(0.19, 1, 0.22, 1);
}
```

```js
Easing.exp
// Internally: Math.pow(2, 10 * (t - 1))
```

---

### `elastic(bounciness, speed)`

Spring-like oscillation past the target before settling.

- **Human name:** Elastic
- **Character:** Playful, bouncy. Overshoots final value one or more times.
- **Default params:** `bounciness = 1`, `speed = 1`
- **60fps settle time:** ~500ms at defaults
- **CSS custom property:** `--ease-elastic` (must be baked to `linear()`)

```css
/* Baked approximation for CSS linear() — default elastic */
:root {
  --ease-elastic-out: linear(
    0, 0.009, 0.035 2.1%, 0.141, 0.281 6.7%, 0.723 12.9%,
    0.938, 1.017, 1.048, 1.056, 1.046 20.1%, 0.999 24.3%,
    0.984, 0.983, 0.988 29.9%, 1.001 35.5%, 1.004 40.1%, 1 100%
  );
}
```

```js
Easing.elastic(1, 1)           // default
Easing.out(Easing.elastic(1, 1))
```

**Parameter guide:**
- `bounciness`: amplitude of overshoot (0 = no overshoot, higher = more)
- `speed`: controls oscillation frequency (higher = faster settle)

---

### `back(s)`

Anticipation curve — slightly retracts before moving forward (or overshoots then settles).

- **Human name:** Back
- **Character:** Mechanical delight. Communicates intentionality.
- **Default param:** `s = 1.70158`
- **CSS custom property:** `--ease-back-out`

```css
:root {
  /* s = 1.70158 (default) */
  --ease-back-in:  cubic-bezier(0.6, -0.28, 0.735, 0.045);
  --ease-back-out: cubic-bezier(0.175, 0.885, 0.32, 1.275);
}
```

```js
Easing.back(1.70158)           // default overshoot
Easing.out(Easing.back(2.5))   // stronger overshoot
```

---

### `bounce`

Simulates a physical bounce — the value bounces off the endpoint.

- **Human name:** Bounce
- **Character:** Playful, energetic. Use for game-like or informal UIs.
- **60fps settle time:** ~420ms
- **CSS custom property:** `--ease-bounce-out` (must be baked to `linear()`)

```css
:root {
  /* Baked CSS linear() approximation */
  --ease-bounce-out: linear(
    0, 0.004, 0.016, 0.035, 0.063, 0.098, 0.141, 0.191, 0.25,
    0.316, 0.391, 0.469, 0.563, 0.656, 0.765, 0.875, 0.891,
    0.906 45.7%, 0.922, 0.938, 0.953 50%, 0.984, 1.016, 1.031,
    1.047, 1.063, 1.016, 1 100%
  );
}
```

```js
Easing.bounce
// Internally: piecewise quadratic with 4 bounces
```

---

### `bezier(x1, y1, x2, y2)`

Raw cubic Bézier — the same primitive that powers all CSS `cubic-bezier()` calls.

- **Human name:** Custom Bézier
- **Character:** Whatever you specify.

```js
Easing.bezier(0.25, 0.1, 0.25, 1.0)   // CSS ease
Easing.bezier(0.42, 0, 1, 1)           // CSS ease-in
Easing.bezier(0, 0, 0.58, 1)           // CSS ease-out
Easing.bezier(0.42, 0, 0.58, 1)        // CSS ease-in-out
```

```css
/* Direct mapping */
transition-timing-function: cubic-bezier(0.25, 0.1, 0.25, 1.0);
```

---

## Higher-Order Wrappers: `in`, `out`, `inOut`

React Native's `Easing` module exposes three composition functions that transform any base curve into its directional variant. This is the correct pattern for producing all six canonical easing directions from any single base function.

### How it works

Given a base easing function `f(t)` where `t ∈ [0, 1]`:

| Wrapper | Formula | Effect |
|---|---|---|
| `in(f)` | `f(t)` | Acceleration at start — slow → fast |
| `out(f)` | `1 - f(1 - t)` | Deceleration at end — fast → slow |
| `inOut(f)` | `t < 0.5 ? f(2t)/2 : 1 - f(2(1-t))/2` | Slow start and end |

### Examples

```js
import { in as easeIn, out as easeOut, inOut, cubic } from './lib/easings.cjs';

const easeInCubic  = easeIn(cubic);    // t => t³
const easeOutCubic = easeOut(cubic);   // t => 1 - (1-t)³
const easeInOutCubic = inOut(cubic);   // smooth S-curve

// Works identically with any base:
const easeInBounce  = easeIn(bounce);
const easeInElastic = easeIn(elastic(1, 1));
```

```css
/* CSS does the same thing natively for cubic-bezier: */
/* ease-in  = cubic-bezier(x1,y1, x2,y2) with control points in lower-left */
/* ease-out = cubic-bezier(x1,y1, x2,y2) with control points in upper-right */
/* inOut    = symmetric control points */
```

### Design rule

- Use `out` for **enter** transitions (element arrives, decelerates into place).
- Use `in` for **exit** transitions (element departs, accelerates away).
- Use `inOut` for **state changes** (element moves from one state to another, both ends cushioned).

---

## CSS Custom Properties — Full Token Set

```css
:root {
  /* Linear */
  --ease-linear: cubic-bezier(0, 0, 1, 1);

  /* Sine */
  --ease-sin-in:     cubic-bezier(0.47, 0, 0.745, 0.715);
  --ease-sin-out:    cubic-bezier(0.39, 0.575, 0.565, 1);
  --ease-sin-in-out: cubic-bezier(0.445, 0.05, 0.55, 0.95);

  /* Quad */
  --ease-quad-in:     cubic-bezier(0.55, 0, 1, 1);
  --ease-quad-out:    cubic-bezier(0, 0, 0.45, 1);
  --ease-quad-in-out: cubic-bezier(0.455, 0.03, 0.515, 0.955);

  /* Cubic */
  --ease-cubic-in:     cubic-bezier(0.55, 0.055, 0.675, 0.19);
  --ease-cubic-out:    cubic-bezier(0.215, 0.61, 0.355, 1);
  --ease-cubic-in-out: cubic-bezier(0.645, 0.045, 0.355, 1);

  /* Circ */
  --ease-circle-in:  cubic-bezier(0.6, 0.04, 0.98, 0.335);
  --ease-circle-out: cubic-bezier(0.075, 0.82, 0.165, 1);

  /* Expo */
  --ease-exp-in:  cubic-bezier(0.95, 0.05, 0.795, 0.035);
  --ease-exp-out: cubic-bezier(0.19, 1, 0.22, 1);

  /* Back (default s=1.70158) */
  --ease-back-in:  cubic-bezier(0.6, -0.28, 0.735, 0.045);
  --ease-back-out: cubic-bezier(0.175, 0.885, 0.32, 1.275);

  /* Elastic and Bounce — baked linear() — see above for full values */
  --ease-elastic-out: linear(0, 0.009, 0.035 2.1%, 0.141, 0.281 6.7%, 0.723 12.9%, 0.938, 1.017, 1.048, 1.056, 1.046 20.1%, 0.999 24.3%, 0.984, 0.983, 0.988 29.9%, 1.001 35.5%, 1.004 40.1%, 1 100%);
  --ease-bounce-out:  linear(0, 0.004, 0.016, 0.035, 0.063, 0.098, 0.141, 0.191, 0.250, 0.316, 0.391, 0.469, 0.563, 0.656, 0.765, 0.875, 0.891, 0.906 45.7%, 0.922, 0.938, 0.953 50%, 0.984, 1.016, 1.031, 1.047, 1.063, 1.016, 1 100%);
}
```
