# Accessibility Baseline

## Conformance Score: partial

## Findings
- Color contrast: AA for body text, fails on secondary buttons (3.2:1)
- Keyboard: tab order follows DOM on most views; dropdown menus trap focus incorrectly
- ARIA: landmarks present, but form fields lack aria-describedby for inline validation
- Focus: focus-visible styled; focus-within not consistently applied
- Motion: no prefers-reduced-motion override on the hero animation

## Priority Gaps
1. Secondary button contrast
2. Dropdown focus trap
3. prefers-reduced-motion coverage
