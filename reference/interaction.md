# Interaction - Domain Index

This domain covers how users trigger, navigate, and recover from actions: accessibility requirements, component API quality, form patterns, information architecture, onboarding, and the emotional layer.

<!-- Phase 45 domain-index: loads this file instead of individual interaction fragments -->

---

## Mission

Interaction is the broadest design domain. It governs every point where a user acts on the interface and the interface responds. Load only the specific fragment for the task at hand using the index below. Does not cover visual placement of interactive elements (see `spatial.md`) or copy for UI elements (see `ux-writing.md`).

---

## Fragment Index

| Fragment | When to load |
|---|---|
| `./accessibility.md` | WCAG 2.1 AA thresholds, keyboard navigation, focus management, ARIA roles. Required for every interactive surface without exception. |
| `./component-authoring.md` | Designing or reviewing component APIs: P-01 Minimal API through P-06 Edge Honesty, composability, defaults, animation-as-state |
| `./form-patterns.md` | Forms are in scope: label position, validation timing, autofill tokens, password UX, CAPTCHA ethics |
| `./information-architecture.md` | Navigation structure is in scope: hub-and-spoke, faceted nav, card sort benchmarks, wayfinding |
| `./onboarding-progressive-disclosure.md` | First-run experience is in scope: empty-state patterns, product tours, checklist onboarding, Aha-moment mapping |
| `./emotional-design.md` | Holistic quality overlay after pillar scoring: Norman visceral/behavioral/reflective three-level lens |
| `./components/README.md` | Auditing a specific component against benchmark: entry to 38 spec files (accordion through tree) |

---

## Rules of Thumb

1. Accessibility is not a final checklist - build it in from the start. Every interactive component begins with the WAI-ARIA contract from `accessibility.md`, not a retrofit after design is complete.
2. P-01 Minimal API from `component-authoring.md`: a component's API surface is its test surface. Every prop that can be removed should be removed.
3. Form label position: top-aligned is the default for all but settings-page scan forms. Placeholder-as-label is a WCAG 1.3.5 failure on any form with more than 3 fields.
4. Empty-state onboarding outperforms product tours by completion rate for creation tools. Only use a tour when unfamiliar terminology requires context, and cap it at 5 steps.
5. The emotional design lens applies after technical and usability requirements are met. Visceral quality (appearance) and behavioral quality (task flow) both need to be solid before reflective quality (brand meaning) is addressed.

---

## Cross-Domain See Also

- Gesture animation and animation-as-state: `reference/motion.md`
- Spatial grouping informs IA mental models: `reference/spatial.md`
- Touch target sizing differs by platform: `reference/responsive.md`
- Error message copy and empty-state copy: `reference/ux-writing.md`
- Healthcare form patterns (PHI isolation): `reference/domains/healthcare-patterns.md`
- Civic one-thing-per-page forms: `reference/domains/civic-patterns.md`
- Typography: `reference/typography.md`
- Color: `reference/color.md`
