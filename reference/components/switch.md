# Switch — Benchmark Spec

**Harvested from**: Apple HIG, Material 3, Radix UI, Spectrum (Adobe), Polaris, Fluent 2, Mantine, shadcn/ui
**Wave**: 1 · **Category**: Inputs

---

## Purpose

A switch (toggle) represents an immediate binary action — changes take effect without a confirm step, like enabling dark mode or activating a feature. It differs from a checkbox in this immediacy: a checkbox is a form option submitted later; a switch acts now. Do not use a switch inside a form that requires a submit button to apply changes. *(Apple HIG, Material 3, Polaris all distinguish switch from checkbox this way)*

---

## Anatomy

```
Label                     ← visible text describing the setting
 ◉───────  ON             ← track + thumb; thumb slides right on ON
 ○───────  OFF            ← thumb left on OFF
 Helper text (opt.)
```

| Part | Required | Notes |
|------|----------|-------|
| Track | Yes | Background bar; 28–52px wide, 14–32px tall |
| Thumb | Yes | Circular indicator that slides |
| Label | Yes (or `aria-label`) | Describes what the switch controls |
| State text (ON/OFF) | No | Optional inside or beside track; not required by a11y |
| Helper text | No | Clarifies effect of the switch |

---

## Variants

| Variant | Description | Systems |
|---------|-------------|---------|
| Default | Label left/right, switch right/left | All |
| With icon | Icon inside thumb (check/x) | Material 3, Fluent 2 |
| With state text | ON/OFF inside track | Apple HIG (iOS), Fluent 2 |
| Small | Compact size (24px height) | Mantine, shadcn |
| Large | 32px height | Material 3, Apple HIG |

**Norm** (≥5/18): label appears to the left of the switch (LTR); toggle is right-aligned.
**Diverge**: thumb icon vs. bare thumb — Material 3 adds check icon on ON, x on OFF; most others use bare thumb. Bare is simpler and more portable across themes.

---

## States

| State | Visual | ARIA |
|-------|--------|------|
| OFF (unchecked) | Thumb left, track muted | `aria-checked="false"` |
| ON (checked) | Thumb right, track colored | `aria-checked="true"` |
| hover | Thumb scale up slightly (1.1×) | — |
| focus | 2px focus ring around track | — |
| disabled OFF | 38% opacity, thumb left | `aria-disabled="true"` |
| disabled ON | 38% opacity, thumb right | `aria-disabled="true"` |

---

## Sizing & Spacing

| Size | Track W×H | Thumb diameter | Touch target |
|------|-----------|----------------|--------------|
| sm | 36×20px | 16px | 44×44px via pseudo-element |
| md (default) | 44×24px | 20px | 44×44px |
| lg | 52×28px | 24px | 48×48px |

Track radius: `border-radius: 9999px` (pill shape — all 8 systems agree).
Thumb travel: track width − thumb diameter − (2 × inset padding ≈ 2px).

Cross-link: `reference/surfaces.md` — concentric radius rule does NOT apply here (pill shape is intentional, not nested radius)

---

## Typography

- Label: 14px/400 body weight; not distinguished from surrounding text
- State text (optional): 10–11px/600 uppercase inside track — ensure ≥4.5:1 contrast against track colour

---

## Keyboard & Accessibility

> **WAI-ARIA role**: `switch`
> **Required attributes**: `aria-checked` ("true" / "false"); `aria-label` or visible associated label

### Keyboard Contract

*Quoted verbatim from WAI-ARIA APG — https://www.w3.org/WAI/ARIA/apg/patterns/switch/ — W3C — 2024*

| Key | Action |
|-----|--------|
| Space | Toggles the switch state |
| Enter | (Optional) Toggles the switch state |

### Accessibility Rules

- `role="switch"` with `aria-checked="true/false"` — not `role="checkbox"` (different semantic contract; switch implies immediate action)
- Label MUST be associated: `<label>` with `for` on the switch element, or `aria-label`/`aria-labelledby`
- State text ("ON"/"OFF") inside the track is a visual enhancement only — it MUST NOT be the sole accessible name
- Disabled: use `aria-disabled="true"` (not native `disabled` attr) if keyboard focus should remain (e.g. to explain why it's disabled via tooltip)
- Announce state change via `aria-live="polite"` if switching triggers a significant UI change distant from the control

---

## Motion

| Transition | Duration | Easing | Notes |
|------------|----------|--------|-------|
| Thumb slide | 150ms | spring (bounce: 0) | Smooth, satisfying; canonical spring values |
| Track colour | 150ms | ease | Simultaneous with thumb |
| Thumb scale on hover | 80ms | ease | 1→1.1× scale |
| Press scale | 80ms | ease | 1→0.96× (canonical press scale) |

Cross-link: `reference/motion.md` — spring bounce=0 canonical values, canonical scale-on-press 0.96

---

## Do / Don't

### Do
- Use `role="switch"` not `role="checkbox"` for toggle-with-immediate-effect *(WAI-ARIA APG, Radix)*
- Animate the thumb sliding — static snap removes the "toggle" affordance *(Apple HIG, Material 3)*
- Place label to the left of the switch in LTR layouts *(Apple HIG, Material 3, Polaris)*
- Apply changes immediately on toggle — no submit button required *(Apple HIG, Polaris)*

### Don't
- Don't use a switch inside a form where the user must click "Save" — use a checkbox *(Apple HIG, Polaris)*
- Don't rely on track colour alone to communicate state (colour blind users) — add icon or label *(Spectrum, Material 3)*
- Don't use the same `aria-label` for ON and OFF states — screen readers read the current state via `aria-checked` *(WAI-ARIA APG)*
- Don't animate thumb with `transition: all` — it catches border-radius changes and causes thumb deformation *(BAN-04)*

---

## Anti-patterns Cross-links

| Anti-pattern | Entry |
|--------------|-------|
| BAN-04 | `transition: all` — `reference/anti-patterns.md#ban-04` |
| Checkbox semantics for immediate-action toggle | `reference/anti-patterns.md` |

---

## Benchmark Citations

| Claim | Sources |
|-------|---------|
| Switch = immediate action; checkbox = form submit | Apple HIG, Material 3, Polaris |
| role="switch" not role="checkbox" | WAI-ARIA APG, Radix |
| Pill track (border-radius: 9999px) | Apple HIG, Material 3, Fluent 2 (all 8) |
| Spring motion for thumb | Material 3, Apple HIG |

Full system URLs: `connections/design-corpora.md`

---

## Grep Signatures

```bash
# Switch using role="checkbox" instead of role="switch"
grep -rn 'role="checkbox"' src/ | grep -i 'switch\|toggle'

# Missing aria-checked on switch
grep -rn 'role="switch"' src/ | grep -v 'aria-checked'

# transition: all on switch thumb (BAN-04)
grep -rn 'transition:\s*all' src/ | grep -i 'switch\|thumb\|toggle'

# Switch inside <form> with submit (should be checkbox)
grep -rn 'role="switch"\|type.*switch' src/ | grep -i 'form\|submit'
```

---

## Failing Example

```html
<!-- BAD: input[type="checkbox"] used as a switch — wrong semantic contract -->
<label>
  <input type="checkbox" class="switch-toggle" />
  Enable notifications
</label>
```

**Why it fails**: `type="checkbox"` implies form-submit semantics. Screen reader announces "checkbox" not "switch". Users with mental model of "toggle = immediate effect" are confused.
**Grep detection**: `grep -rn 'class.*switch\|class.*toggle' src/ | grep 'type="checkbox"'`
**Fix**:
```html
<button role="switch" aria-checked="false" id="notif-switch">
  <span class="thumb" aria-hidden="true"></span>
</button>
<label for="notif-switch">Enable notifications</label>
```
