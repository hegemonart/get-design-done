---
name: framer-motion
kind: motion
composes_into: [motion-mapper]
phase: 54
---
<!-- Vendor docs: https://motion.dev/docs/react-animation. -->

# Framer Motion

## Conventions

- Declarative: `motion.*` elements take `initial` / `animate` / `exit` plus gesture props `whileHover` / `whileTap` / `whileDrag` / `whileInView` / `drag`.
- Named `variants` propagate parent to child; `staggerChildren` sequences them.
- `transition.type` is the model: `spring` (stiffness/damping/mass, or duration+bounce, default bounce ~0.25, keep <0.1 for UI) vs `tween` (duration plus named ease).
- `AnimatePresence` (stable `key`) enables `exit`; `layout` / `layoutId` drive FLIP and shared-element morphs.

## File patterns

- `import { motion, AnimatePresence } from "motion/react"` (or legacy `"framer-motion"`).
- Markers: `motion.div`, `whileHover`, `variants`, `layoutId`, `useScroll`.
- Identify via: the `motion/react` import plus `motion.*` JSX.

## Gotchas

- Unit trap: tween `duration` is SECONDS, so multiply by 1000 BEFORE bucketing; the `spring()` value-fn duration is milliseconds.
- Extract a duration bucket via the taxonomy: instant <100ms, quick 100-200, standard 200-300, slow 300-500, narrative 500+.
- Easing class: read `transition.type` (spring is physics; tween is named or cubic-bezier).
- Gesture vs tween: `whileHover` / `whileTap` / `whileDrag` / `whileInView` are gesture fragments; `initial`->`animate`/`exit` are transitions.
- A matched `layoutId` pair is a shared-element link, emitted as `transitions-to`.

## Example output

```json
{
  "schema_version": "52.0",
  "nodes": [
    { "id": "mf.button.hover", "type": "motion-fragment", "name": "Button whileHover", "summary": "Pointer-reactive spring lift on hover.", "complexity": "simple", "tags": ["motion", "gesture", "hover"] },
    { "id": "mf.card.enter", "type": "motion-fragment", "name": "Card entrance", "summary": "Quick tween fade-and-rise on mount.", "complexity": "simple", "tags": ["motion", "transition", "enter", "duration"] }
  ],
  "edges": [
    { "source": "mf.card.enter", "target": "mf.button.hover", "type": "composes", "direction": "forward", "weight": 0.5 }
  ]
}
```
