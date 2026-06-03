---
name: react-spring
kind: motion
composes_into: [motion-mapper]
phase: 54
---
<!-- Vendor docs: https://react-spring.dev/docs/components/use-spring. -->

# React Spring

## Conventions

- Physics-first hooks: `useSpring` (one style), `useTransition` (mount/unmount or list, via from/enter/leave), plus `useTrail` / `useChain` / `useSprings`.
- Config presets tune the spring: default {tension:170,friction:26}, gentle {120,14}, wobbly {180,12}, stiff {210,20}, slow {280,60}, molasses {280,120}.
- Hooks return `animated.*` styles applied to `animated.div` (and friends).
- Gestures come from the companion `@use-gesture/react`, which drives the spring from pointer input.

## File patterns

- `import { useSpring, useTransition, animated, config } from "@react-spring/web"` (or `react-spring`).
- Markers: `useSpring({ from, to, config })`, `animated.div`, `config.gentle`.
- Identify via: a `useSpring` / `useTransition` call plus an `animated.*` element.

## Gotchas

- Unit trap: there is NO fixed duration; record the config preset name plus its tension/friction, since the mapper must normalize before bucketing.
- Map preset to perceived speed (taxonomy): stiff and default read as quick, gentle as standard, slow and molasses as narrative.
- Easing class: this is almost always a spring (physics), so capture the preset, not an ease curve.
- Gesture vs tween: `useTransition` enter/leave are transition fragments; a `useSpring` driven by hover or `@use-gesture` is a gesture fragment.

## Example output

```json
{
  "schema_version": "52.0",
  "nodes": [
    { "id": "mf.modal.transition", "type": "motion-fragment", "name": "Modal useTransition", "summary": "Gentle spring enter and leave, standard speed.", "complexity": "moderate", "tags": ["motion", "transition", "enter", "exit"] },
    { "id": "mf.tile.drag", "type": "motion-fragment", "name": "Tile drag spring", "summary": "Stiff spring driven by pointer drag.", "complexity": "moderate", "tags": ["motion", "gesture", "dragging"] }
  ],
  "edges": [
    { "source": "mf.modal.transition", "target": "mf.tile.drag", "type": "composes", "direction": "forward", "weight": 0.4 }
  ]
}
```
