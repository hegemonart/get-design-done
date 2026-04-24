<!-- Source: React Native — Libraries/Animated/SpringConfig.js (MIT License) -->
<!-- Attribution: Facebook, Inc. and its affiliates -->

# Motion Springs

Spring animations model physical mass-spring-damper systems. Unlike tween animations, springs are driven by physics rather than duration — they respond to velocity and settle naturally, making them ideal for interactions that require a sense of weight.

---

## The Spring Parameter Triad

Every spring is defined by three parameters:

### Stiffness (`k`)

The spring constant — how strongly the spring pulls toward the target.

- **Low stiffness** (80–150): soft, gentle, slow to accelerate
- **Medium stiffness** (150–300): standard UI feel
- **High stiffness** (300–600): snappy, responsive, fast

Higher stiffness = faster animation, more acceleration. Does not affect whether the spring overshoots.

---

### Damping (`c`)

The friction coefficient — how quickly oscillation energy is removed.

- **Low damping relative to stiffness**: spring oscillates (undershooted)
- **Damping at critical value**: spring settles exactly without oscillation
- **High damping**: spring creeps slowly to target (overdamped)

Damping controls the *character* of the settle. Lower damping = more bounce.

---

### Mass (`m`)

The simulated mass attached to the spring.

- **Low mass** (< 1): snappy, light feel
- **Mass = 1**: standard (most presets)
- **High mass** (> 1): heavy, sluggish, long tail

Mass scales settle time proportionally. Doubling mass approximately doubles settle time.

---

## Critical Damping Condition

A spring is critically damped when:

```
c = 2 * sqrt(k * m)
```

At this value, the spring reaches its target in minimum time without oscillating. Below this threshold, the spring overshoots. Above it, the spring is overdamped (sluggish).

```js
const { criticalDamping } = require('./scripts/lib/spring.cjs');

const c = criticalDamping(400, 1);   // stiffness=400, mass=1 → c ≈ 40
```

Most UI springs use damping *below* the critical value to add character and life to motion.

---

## Canonical Presets

### `gentle`

```
stiffness: 120  |  damping: 14  |  mass: 1
settle time: ~400ms  |  overshoots: yes (mild)
```

A soft, friendly spring. Overshoots slightly. Good for content reveals, cards expanding, or any motion that should feel unhurried.

```js
// Framer Motion
<motion.div animate={{ y: 0 }} transition={{ type: 'spring', stiffness: 120, damping: 14, mass: 1 }} />

// React Spring
useSpring({ from: { y: -40 }, to: { y: 0 }, config: { tension: 120, friction: 14, mass: 1 } });
```

---

### `wobbly`

```
stiffness: 180  |  damping: 12  |  mass: 1
settle time: ~600ms  |  overshoots: yes (pronounced, 2–3 cycles)
```

High energy, bouncy. Use for playful or expressive interactions — celebratory states, game-like UIs, avatar reactions. Not appropriate for productivity or enterprise UIs.

```js
// Framer Motion
<motion.div animate={{ scale: 1 }} transition={{ type: 'spring', stiffness: 180, damping: 12, mass: 1 }} />

// React Spring
useSpring({ from: { scale: 0.8 }, to: { scale: 1 }, config: { tension: 180, friction: 12, mass: 1 } });
```

---

### `stiff`

```
stiffness: 400  |  damping: 30  |  mass: 1
settle time: ~200ms  |  overshoots: minimal
```

Fast and tight. Feels responsive and precise. Good for small UI elements: toggles, checkboxes, icon state changes, cursor-tracking components. Near-critical damping means it barely overshoots.

```js
// Framer Motion
<motion.div animate={{ opacity: 1 }} transition={{ type: 'spring', stiffness: 400, damping: 30, mass: 1 }} />

// React Spring
useSpring({ from: { opacity: 0 }, to: { opacity: 1 }, config: { tension: 400, friction: 30, mass: 1 } });
```

---

### `slow`

```
stiffness: 280  |  damping: 60  |  mass: 1
settle time: ~800ms  |  overshoots: no (overdamped)
```

Overdamped spring — creeps gently to target with no oscillation. Feels heavy and deliberate. Good for large layout changes, full-screen transitions, onboarding sequences.

```js
// Framer Motion
<motion.div animate={{ x: 0 }} transition={{ type: 'spring', stiffness: 280, damping: 60, mass: 1 }} />

// React Spring
useSpring({ from: { x: -200 }, to: { x: 0 }, config: { tension: 280, friction: 60, mass: 1 } });
```

---

## Preset Summary Table

| Name | Stiffness | Damping | Mass | Settle | Character |
|---|---|---|---|---|---|
| `gentle` | 120 | 14 | 1 | ~400ms | Soft, mild overshoot |
| `wobbly` | 180 | 12 | 1 | ~600ms | Bouncy, 2–3 cycles |
| `stiff` | 400 | 30 | 1 | ~200ms | Snappy, minimal bounce |
| `slow` | 280 | 60 | 1 | ~800ms | Heavy, no overshoot |

---

## CSS `linear()` Approximation

CSS does not have a native spring primitive, but the `linear()` timing function (Chrome 113+, Firefox 112+) can approximate a spring by sampling it at many points.

```js
// scripts/lib/spring.cjs — bake a spring to CSS linear()
const { step, settleTime } = require('./scripts/lib/spring.cjs');

function bakeSpringToCSS(stiffness, damping, mass, samples = 60) {
  const duration = settleTime(stiffness, damping, mass);
  const dt = duration / samples / 1000;  // convert ms to seconds
  const points = [];

  let pos = 0, vel = 0;
  for (let i = 0; i <= samples; i++) {
    points.push(pos.toFixed(4));
    const result = step(stiffness, damping, mass, vel, dt);
    pos = result.position;
    vel = result.velocity;
  }

  return `linear(${points.join(', ')})`;
}
```

```css
/* Example output for stiff preset (stiffness=400, damping=30, mass=1) */
:root {
  --spring-stiff: linear(
    0, 0.081, 0.301, 0.567, 0.789, 0.913, 0.972, 0.997, 1.006,
    1.004, 1.001, 1.000, 1.000 100%
  );
}

.toggle {
  transition: transform 200ms var(--spring-stiff);
}
```

The baked approximation loses velocity responsiveness (a real spring reacts to initial velocity; a CSS timing function does not), but is acceptable for state-driven transitions.

---

## When to Use Spring vs Tween

### Use spring when:

- **Drag release / throw** — the animation should carry the momentum from the gesture. Springs naturally handle initial velocity; tweens cannot.
- **Toggle state** — a checkbox, switch, or button that needs to feel responsive and alive. The `stiff` preset is standard here.
- **Interactive hover / follow** — cursor-tracking, magnetic elements. Springs give a sense of physical weight.
- **Interrupt-safe sequences** — if the user reverses a motion mid-way, springs handle the reversal gracefully by inheriting the current velocity.

### Use tween (eased duration) when:

- **Navigation transitions** — page or route changes should complete in a fixed, predictable time. A spring may not settle in time if interrupted.
- **Data-driven state changes** — tab switches, accordion open/close, tooltip appear. A 200–300ms cubic-out tween is predictable and familiar.
- **Reduced motion** — when `prefers-reduced-motion` is active, replace all springs with short (150ms) linear or ease-out tweens. Springs are inherently bouncy; motion-sensitive users should never see oscillation.
- **Synchronized choreography** — when multiple elements must start and end together (e.g., a staggered list entrance), tweens with explicit durations are easier to coordinate.

```css
@media (prefers-reduced-motion: reduce) {
  .animated {
    transition-timing-function: var(--ease-linear);
    transition-duration: 150ms;
    /* override any spring-based JS animation via a CSS signal */
  }
}
```

---

## Pairs With

- Easing functions for tween-based alternatives: [motion-easings.md](./motion-easings.md)
- Interpolation for mapping spring output to CSS values: [motion-interpolate.md](./motion-interpolate.md)
- The `scripts/lib/spring.cjs` module exposes `PRESETS`, `criticalDamping`, `settleTime`, and `step` for programmatic use.
