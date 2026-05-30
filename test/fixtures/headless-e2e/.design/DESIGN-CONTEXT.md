---
cycle: e2e-001
---

# Design Context

## Decisions
- D-01: Use CSS custom properties (`--color-primary`) for tokens; no CSS-in-JS.
- D-02: Base spacing is 8px; halve to 4px allowed for tight layouts.
- D-03: Button variants = primary | secondary | ghost; no size variants in v1.

## Must-Haves
- M-01: Every hardcoded hex color in src/ extracted into a token.
- M-02: All padding values are multiples of 4px.

## Connections
(none for this fixture)
