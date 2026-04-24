# Stepper / Wizard — Benchmark Spec

**Harvested from**: Carbon (ProgressIndicator + StepNavigation), Material 3 Stepper, Atlassian Design System, Mantine Stepper
**Wave**: 5 · **Category**: Advanced
**Spec file**: `reference/components/stepper.md`

---

## Purpose

A Stepper (or Wizard) guides users through a sequential multi-step flow — onboarding, checkout, multi-page forms, settings setup. It communicates how many steps exist, which step is current, which are complete, and which are upcoming. Unlike Tabs (free navigation), a linear Stepper enforces order: the user must complete the current step before advancing. *(Carbon, Material 3, Atlassian, Mantine agree: step indicator list + content area + explicit Next/Back buttons is the canonical wizard pattern.)*

---

## Anatomy

```
Step indicator (role="list"):
  ● Step 1: Account    ✓ Step 2: Profile    ○ Step 3: Confirm
  aria-current="step"  completed             upcoming

Content area:
  [ Current step form/content ]

Actions:
  [ Back ]                              [ Next ] / [ Submit ]
```

| Part | Required | Notes |
|------|----------|-------|
| Step indicator list | Yes | `role="list"`; each step is `role="listitem"` |
| Step labels | Yes | Visible text per step; described state (e.g., "completed") |
| Current step marker | Yes | `aria-current="step"` on active step |
| Content area | Yes | Shows current step content (single panel or accordion) |
| Next button | Yes | Explicit label "Next" or "Continue"; validates current step first |
| Back button | Yes (if non-first step) | Returns to previous step; "Back" label |
| Submit button | Yes (final step) | "Submit" or context-specific label; replaces Next on last step |
| Step connector line | No | Visual line between step dots; decorative, `aria-hidden="true"` |

---

## Variants

| Variant | Description | Systems |
|---------|-------------|---------|
| Linear / locked | Must complete steps in order; no jumping ahead | Carbon, Material 3, Atlassian, Mantine |
| Non-linear | Can jump to any previously completed step | Carbon (StepNavigation), Mantine (allowNextStepsSelect) |
| Horizontal | Step indicators in a row across the top | All systems (default) |
| Vertical | Step indicators stacked on the left | Carbon, Material 3 |
| Accordion stepper | All steps visible; current step expanded | Material 3 (docked), Mantine (vertical) |
| Simple (no icons) | Text + number only, no check icons | Atlassian (compact) |

**Norm** (≥3/4 systems agree): horizontal orientation is default; completed steps show a checkmark; current step is visually distinct; upcoming steps are muted.
**Diverge**: Material 3 uses filled circles with numbers; Carbon uses custom step icons; Mantine supports icons per step; Atlassian uses numbered circles.

---

## States

| State | Trigger | Visual | ARIA |
|-------|---------|--------|------|
| upcoming | Step not yet reached | Muted circle/number, secondary text color | — |
| current | Active step | Brand-color filled circle; bold label | `aria-current="step"` |
| completed | Step passed + valid | Check icon; full-opacity; clickable if non-linear | `aria-label="Step N: [name] - completed"` |
| error | Step has validation errors | Error color circle; error icon | `aria-label="Step N: [name] - has errors"` |
| disabled | Future step in linear flow | Muted; not clickable | Implicit (no click handler; cursor: default) |

---

## Sizing & Spacing

| Size | Step Circle | Connector Height | Label Font | Gap Between Steps |
|------|-------------|-----------------|------------|-------------------|
| sm | 20px | 1px | 12px | 32px |
| md (default) | 32px | 2px | 14px | 48px |
| lg | 40px | 2px | 16px | 64px |

**Norm**: Step circles 32px default *(Carbon, Mantine)*. Horizontal spacing between steps should scale with the available width so the indicator spans the container. Connector line is centered between circles.

Cross-link: `reference/surfaces.md` — minimum 44×44px touch target for clickable step indicators.

---

## Typography

- Step label: body-sm (completed/upcoming) → body-sm weight 600 (current)
- Step number/icon inside circle: caption-sm, center-aligned
- Step description (optional sub-label): caption-sm, secondary color
- Action buttons: body-md, weight 500 — same as standard button spec

Cross-link: `reference/typography.md` — label weight change for current state.

---

## Keyboard & Accessibility

> **WAI-ARIA role**: `list` (step indicator container), `listitem` (each step), `button` (clickable completed steps in non-linear mode)
> **Required attributes**: `aria-current="step"` on active step; descriptive `aria-label` on completed steps (include state: "Step 2: Profile - completed"); `aria-label` on connector lines if not `aria-hidden`

### Keyboard Contract

*Derived from WAI-ARIA APG list and button patterns — https://www.w3.org/WAI/ARIA/apg/ — W3C — 2024*

| Key | Action |
|-----|--------|
| Tab | Move focus through interactive elements: clickable completed steps (non-linear), Back button, Next/Submit button |
| Enter / Space | Activate focused Back, Next, Submit button; activate clickable completed step (non-linear) |
| (No arrow-key navigation) | Steps are NOT tabs — do not implement roving tabindex / arrow-key navigation between steps |

Steps are NOT `role="tab"` and do not use the tab keyboard pattern. Upcoming steps are not focusable in linear mode. Only completed steps are interactive (and focusable) in non-linear mode.

### Accessibility Rules

- Step indicators MUST use `role="list"` + `role="listitem"` — not `role="tablist"` + `role="tab"` (tabs allow free navigation; wizard steps do not)
- Current step MUST have `aria-current="step"` — this is the correct token (not `aria-selected` or `aria-checked`)
- Completed steps in non-linear mode MUST be `<button>` elements (or have `role="button"` + `tabindex="0"`) with `aria-label` including the step name and "completed" state
- Step connector lines MUST be `aria-hidden="true"` — they are purely decorative
- Validate current step before allowing Next; display inline error messages with `aria-describedby` associations
- "Next", "Back", and "Submit" MUST be explicit text labels — do not use icon-only navigation buttons
- Announce step transitions via `aria-live="polite"` on the content region header (e.g., "Step 2 of 4: Profile")

Cross-link: `reference/accessibility.md` — aria-current values, list semantics.

---

## Motion

| Transition | Duration | Easing | Notes |
|------------|----------|--------|-------|
| Step complete animation | 200ms | ease-out | Circle fill → checkmark draw |
| Content area transition | 250ms | ease-in-out | Fade or slide left/right between steps |
| Error state appear | 150ms | ease-out | Circle color change + icon fade in |
| Back navigation | 200ms | ease-in-out | Slide right (reverse direction) |

**BAN**: Do not use the same slide direction for both forward and backward step navigation — direction must be consistent with the mental model (forward = left, backward = right).

Cross-link: `reference/motion.md` — reduced-motion: skip slide; cross-fade content area only.

---

## Do / Don't

### Do
- Use `role="list"` for the step indicator — steps are a list, not a tab set *(WAI-ARIA APG, Carbon)*
- Set `aria-current="step"` on the active step *(WAI-ARIA spec §aria-current)*
- Validate the current step before advancing and show inline errors *(Carbon, Atlassian)*
- Label Back/Next/Submit buttons explicitly — not icons or chevrons *(Material 3, Carbon, Mantine)*

### Don't
- Don't use `role="tablist"` for steps — tabs allow free navigation; wizard steps are ordered and gated *(diverges from all 4 systems)*
- Don't allow jumping to future unvisited steps in linear mode — breaks the sequential contract *(Carbon, Atlassian)*
- Don't use `aria-selected` on steps — `aria-current="step"` is the correct token *(WAI-ARIA spec)*
- Don't omit the Back button — users must be able to correct previous steps *(Material 3, Atlassian)*

---

## Anti-patterns Cross-links

| Anti-pattern | Entry |
|--------------|-------|
| BAN-14 | Stepper using role="tablist" — semantically incorrect navigation model — `reference/anti-patterns.md#ban-14` |
| BAN-07 | Missing aria-current on active step — `reference/anti-patterns.md#ban-07` |

---

## Benchmark Citations

| Claim | Sources |
|-------|---------|
| Step indicator is role="list", not role="tablist" | WAI-ARIA APG, Carbon, Atlassian design docs |
| aria-current="step" on active step | WAI-ARIA spec §aria-current, Carbon a11y guide |
| Completed steps need aria-label with state | Carbon ProgressIndicator a11y docs, Atlassian |
| Validate before Next; show inline errors | Carbon, Atlassian wizard pattern guidelines |
| Explicit Next/Back/Submit text labels required | Material 3, Carbon, Mantine |

Full system URLs: `connections/design-corpora.md`

---

## Grep Signatures

```bash
# Step indicator using role="tablist" (incorrect — steps are not tabs)
grep -rn 'stepper\|wizard\|step-indicator\|StepIndicator' src/ | grep 'role="tablist"'

# Missing aria-current on active step
grep -rn 'stepper\|wizard\|\.step\b\|step--active\|step--current' src/ | grep -v 'aria-current'

# Step connector lines not aria-hidden (extraneous AT noise)
grep -rn 'step.*connector\|connector.*step\|\.step-line\|StepConnector' src/ | grep -v 'aria-hidden'

# Icon-only Next/Back buttons (no text label)
grep -rn 'wizard.*next\|stepper.*next\|wizard.*back\|stepper.*back' src/ | grep -v 'Next\|Back\|Continue\|Submit\|aria-label'
```

---

## Failing Example

```html
<!-- BAD: stepper using <ul role="tablist"> with <li role="tab"> — semantically wrong -->
<ul role="tablist" class="stepper">
  <li role="tab" aria-selected="true" class="step step--active">
    <span class="step-number">1</span>
    <span class="step-label">Account</span>
  </li>
  <li role="tab" aria-selected="false" class="step step--upcoming">
    <span class="step-number">2</span>
    <span class="step-label">Profile</span>
  </li>
  <li role="tab" aria-selected="false" class="step step--upcoming">
    <span class="step-number">3</span>
    <span class="step-label">Confirm</span>
  </li>
</ul>
```

**Why it fails**: `role="tablist"` implies that all tabs are independently activatable and content switches freely — this is correct for Tabs but wrong for a wizard where steps are gated. AT users expect arrow-key navigation between tabs; in a wizard this would allow jumping to uncompleted future steps. `aria-selected` is the tab token; the correct token for a wizard is `aria-current="step"`.
**Grep detection**: `grep -rn 'role="tablist"' src/ | grep -i 'step\|wizard'`
**Fix**: Replace `<ul role="tablist">` with `<ol role="list">` (ordered list signals sequence), each `<li>` with `role="listitem"`, remove `aria-selected`, and add `aria-current="step"` to the current step. Make only completed steps keyboard-focusable (as `<button>`) in non-linear mode; upcoming steps are not interactive.
