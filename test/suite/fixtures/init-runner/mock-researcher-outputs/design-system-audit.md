# Design System Audit

## Tokens
- CSS vars: --color-primary, --color-secondary, --color-bg, --color-fg
- Tailwind config: colors.brand.* (50-900 scale)
- JS exports: no standalone token exports detected

## Components
- Button (src/components/Button.tsx) — variant, size, onClick
- Card (src/components/Card.tsx) — title, children

## Patterns
- Button + Card composition for CTA blocks

## Gaps
- No typography tokens defined
- Spacing scale is ad-hoc (0.25rem increments not systematized)
