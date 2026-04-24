# Pre-Delivery Checklists

Run these before saying "done." Each checklist below is **gated** — if any item fails, you cannot ship.

## Master pre-ship checklist

Use this before any design artifact goes to the user or into a PR.

### Discovery check
- [ ] Pulled ≥3 real references via refero (or awesome-design-md library if refero unavailable)
- [ ] Wrote down 3 concrete brand-voice words (not "modern"/"elegant")
- [ ] Identified 1–2 North Star brand references
- [ ] Cited references in output so user can redirect

### Context check
- [ ] `DESIGN-CONTEXT.md` (or `DESIGN.md`) exists at project root with direction stated
- [ ] `DESIGN.md` exists at project root
- [ ] Design direction explicitly stated (brutalist / editorial / …)
- [ ] User approved direction before Phase 3

### AI-slop check (see anti-patterns.md)
- [ ] Did NOT default to Inter / DM Sans / Space Grotesk / Plus Jakarta Sans
- [ ] No purple→blue or teal→cyan gradient
- [ ] No glassmorphism + rounded rect + drop shadow combo
- [ ] No card-in-card
- [ ] No `border-left`/`border-right` > 1px on cards/alerts
- [ ] No gradient text
- [ ] No sparkline as decoration
- [ ] No emoji as UI icon
- [ ] Empty states give context + positive framing + one CTA (not just "No items")

### Accessibility check
- [ ] Body text ≥ 16px; contrast ≥ 4.5:1
- [ ] UI components contrast ≥ 3:1
- [ ] `:focus-visible` style defined (2–3px ring)
- [ ] Touch targets ≥ 44×44pt iOS / 48×48dp Android
- [ ] No color-only meaning (pair with icon/text)
- [ ] `prefers-reduced-motion` respected on all animations
- [ ] Keyboard can reach and operate every interactive element
- [ ] Form labels above fields (not placeholder-only)
- [ ] Semantic heading hierarchy (h1→h6, no skipping)

### Motion check (if any animations)
- [ ] All animations use transform / opacity (not width/height/top/left)
- [ ] Custom easing curves (not built-in `ease`)
- [ ] Exit duration ~75% of enter duration
- [ ] No animation on keyboard-initiated actions
- [ ] No `scale(0)` entries (min `scale(0.95)` + opacity)
- [ ] Popovers use `transform-origin: var(...content-transform-origin)`, not `center`

### Token check
- [ ] No raw hex in component files (all colors via `var(--...)`)
- [ ] No `padding: 13px` (off 4pt grid)
- [ ] All interactive components have: default / hover / focus-visible / active / disabled / loading / error / success
- [ ] Dark mode defined (not inverted light; tinted oklch 14-18% base)
- [ ] Typography uses the committed scale (no one-off sizes)

### Copy check (if any text)
- [ ] Button labels are verb-first and outcome-specific (not "OK" / "Submit" / "Click here")
- [ ] Error messages: what happened + how to fix (not just what's wrong)
- [ ] Empty state acknowledges state + explains value + one CTA
- [ ] No "Oops!" / forced cheer in errors
- [ ] No 3-adjective pile-up ("beautiful, seamless, intuitive")
- [ ] Placeholders show format, not restated label

### Technical check (code artifacts)
- [ ] Browser: running in preview; no console errors
- [ ] Dev server responds with HTTP 200 on expected routes
- [ ] Mobile viewport tested (320px, 375px, 390px, 428px breakpoints)
- [ ] Tap delay removed (`touch-action: manipulation`)
- [ ] Images use WebP/AVIF + `srcset` + lazy-loading where appropriate

### Handoff check (if cross-team)
- [ ] Ran `Skill(design:design-handoff)` to produce spec sheet
- [ ] Spec lists every state, every token, every breakpoint
- [ ] Figma and code token names match (or explicit rename map documented)
- [ ] Known-unimplemented edge cases flagged with severity

---

## Quick checklist — Small changes

When the change is a single-screen tweak, use this shortened list:

- [ ] Pulled 1–2 references before touching code
- [ ] Change respects stated brand direction from `DESIGN-CONTEXT.md` (no tone drift)
- [ ] Interactive element has all 8 states
- [ ] No item on the absolute-ban list (anti-patterns.md)
- [ ] Contrast AA
- [ ] Focus ring present
- [ ] Touch target ≥ 44pt
- [ ] Tested in the preview browser
- [ ] Review presented as Before/After table

---

## Checklist for design system contributions

When adding tokens/components to the design system:

- [ ] New tokens follow `[category].[variant].[property].[state]` naming
- [ ] No primitive token used directly in a component — route through semantic
- [ ] Component has full anatomy doc (slots + variants + states + behavior + platform notes + do/don't)
- [ ] Figma spec frame exists OR explicit note that it doesn't
- [ ] Component validated against: same-structure-variant rule, not-a-new-component rule
- [ ] 30-min audit performed — no off-grid spacings, no duplicate color tokens

---

## Checklist for presentations

Before presenting to stakeholders:

- [ ] 6-step narrative spine applied (Orient → Shape → Decision → Why → Defuse → Ask)
- [ ] Opened with a decision, not exploration
- [ ] Anticipated top 2–3 objections with pre-addressed slides
- [ ] Design language translated to business language (efficiency, conversion, a11y reach)
- [ ] Closed with ONE specific ask (not "thoughts?")
- [ ] Parking lot section ready if detail derail starts
- [ ] Decision log slide referenced if revisiting prior choices

---

## Mega-smoke-test for full pages/features

For flagship work:

1. **Squint test.** Blur the screen; most important element still identifiable? Second most? Groupings?
2. **Zoom to 200%.** No horizontal scroll; nothing clipped; hierarchy holds.
3. **Tab test.** Tab through every interactive element. Focus visible? Order logical? Nothing skipped?
4. **Kill CSS test.** Disable all styles. Page still has logical reading order? Headings hierarchical?
5. **Kill JS test.** Form still submittable via HTML action? Content still visible?
6. **Throttle test.** Simulate 3G. Skeletons/placeholders in place? LCP < 2.5s?
7. **Dark mode test.** Toggle. Any broken contrast? Any colors that failed to theme?
8. **Reduced motion test.** Enable it at OS level. Functional animations preserved, spatial ones killed?
9. **Mobile test.** Real device or Chrome DevTools mobile emulation. Touch targets? Safe areas? Viewport zoom allowed?
10. **The AI-slop self-check** (see anti-patterns.md). Honest answer: would someone believe this was AI-generated? If yes, which elements? Fix those.

---

## Micro-Polish Check
Source: jakubkrehel/make-interfaces-feel-better (MIT)

Use this checklist after the main design review for pixel-level craft verification:

### Typography micro
- [ ] Headings use `text-wrap: balance`
- [ ] Body/caption uses `text-wrap: pretty` (or no wrap setting — not `balance`)
- [ ] Font smoothing applied at `:root` only, not per-element
- [ ] Dynamic numbers (counters, prices, timers) use `font-variant-numeric: tabular-nums`

### Surfaces
- [ ] Nested elements use concentric radius (`innerRadius = outerRadius − padding`)
- [ ] No same-radius parent+child within padded container (see BAN-10 same-radius-nested)
- [ ] Images have `outline: 1px solid rgba(0,0,0,0.08)` — no tinted outlines
- [ ] Interactive elements <40px have `::after` hit-area extension to 40×40

### Motion
- [ ] Press feedback uses `scale(0.96)` — not 0.95, not 0.97, not 0.98
- [ ] `AnimatePresence` on persistent UI has `initial={false}`
- [ ] Icon cross-fade spring has `bounce: 0`
- [ ] No `transition: all` anywhere (see BAN-12 transition-all)
- [ ] No `will-change: all` anywhere (see BAN-13 will-change-all)
- [ ] `prefers-reduced-motion` respected via `MotionConfig` or `useReducedMotion()`

---

## Rams Lens — 10 Design Questions

Dieter Rams's 10 principles of good design (Vitsœ/Braun, 1970s–80s) applied as a self-audit lens. Each question maps to one principle.

- [ ] **Innovative** — Does this design solve the problem in a way that was not possible or obvious before?
- [ ] **Useful** — Does every element serve the primary function? Nothing decorative that doesn't earn its place?
- [ ] **Aesthetic** — Is the visual appearance the minimum necessary for legibility and emotional resonance?
- [ ] **Understandable** — Can the user figure out how to use this without reading documentation or a tooltip?
- [ ] **Unobtrusive** — Does the design stay in the background and let the content or task take focus?
- [ ] **Honest** — Does the design not imply capabilities, quality, or status that the product doesn't have?
- [ ] **Long-lasting** — Is this design free of trend-dependent choices (gradients, micro-styles) that will age in 12 months?
- [ ] **Thorough** — Have edge cases been considered and handled (empty states, error states, loading states, overflow text)?
- [ ] **Environmentally friendly** — Is the performance footprint minimal? (image sizes, JS bundle, font weight)
- [ ] **As little design as possible** — If you removed 20% of the design decisions, would the product be worse? If not, remove them.

---

## Sonner / Component-Authoring Lens — 6 Questions

Emil Kowalski's component-authoring principles applied as a per-component self-audit. Full reference: `reference/component-authoring.md`.

- [ ] **P-01 API surface** — Does this component work correctly in 1 line with zero configuration?
- [ ] **P-02 Composability** — Does this component compose via slots/children, not via style-configuration props?
- [ ] **P-03 Defaults** — Are the defaults so sensible that most consumers never need to pass any props?
- [ ] **P-04 Animation** — Does every animation in this component communicate a state change? No decorative loops?
- [ ] **P-05 Accessibility** — Does this component have a complete ARIA contract before any visual styling?
- [ ] **P-06 Edge honesty** — Are known failure modes documented with `// KNOWN:` or `// EDGE:` comments?
