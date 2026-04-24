# Radio — Benchmark Spec

**Harvested from**: Material 3, Carbon, Fluent 2, Mantine, WAI-ARIA APG, Polaris, Ant Design, Chakra UI
**Wave**: 1 · **Category**: Inputs

---

## Purpose

A radio button represents one option within a mutually exclusive group. Selecting one radio button deselects all others in the same group. Always wrap radio buttons in a `<fieldset>` + `<legend>` and group them with the same `name` attribute. Never use a single radio button — it creates an unresettable state. Use a checkbox for binary choices.

---

## Anatomy

```
<fieldset>
  <legend>Shipping method</legend>

  ( ) Standard shipping  ← <input type="radio" name="shipping" id="standard">
  (●) Express shipping   ← <input type="radio" name="shipping" id="express" checked>
  ( ) Overnight          ← <input type="radio" name="shipping" id="overnight">
</fieldset>
```

| Part | Required | Notes |
|------|----------|-------|
| `<fieldset>` | Yes | Groups the radio set |
| `<legend>` | Yes | Names the group; read by screen readers before each option |
| `<input type="radio">` | Yes | Native element; same `name` within group |
| `<label for="id">` | Yes | Click zone extends to label text |
| Helper text | No | Below individual item or below legend |
| Error message | Conditional | Group-level error via `aria-describedby` on `<fieldset>` |

---

## Variants

| Variant | Description | Systems |
|---------|-------------|---------|
| Default (stacked) | Vertical list of options | All |
| Horizontal | Side-by-side for short labels (2–3 options) | Material 3, Carbon, Mantine |
| Radio card | Clickable card with radio indicator | Polaris, Mantine, shadcn |
| Button group | Segmented-control appearance | Material 3, Fluent 2, Carbon |

**Norm** (≥6/18): vertical stacking default; horizontal allowed for ≤3 short labels.
**Diverge**: button-group vs. radio-card — visual styling differs but keyboard contract is identical.

---

## States

| State | Trigger | Visual | ARIA |
|-------|---------|--------|------|
| unselected | default | Empty circle | — |
| selected | user interaction / programmatic | Filled dot | `checked` attr |
| hover | pointer over | Circle border darkens | — |
| focus | keyboard (Tab into group) | 2px focus ring on currently selected / first | — |
| disabled | `disabled` attr | 38% opacity | `aria-disabled="true"` |
| error | group-level | Red border on legend/container | `aria-describedby` on `<fieldset>` |

---

## Sizing & Spacing

| Property | Value | Notes |
|----------|-------|-------|
| Control diameter | 16–20px | *(Material 3: 20px, Carbon: 16px, Polaris: 16px)* |
| Dot diameter | 8–10px (center of control) | |
| Gap: control → label | 8px | |
| Item spacing (vertical) | 8–12px | *(Carbon: 8px, Material 3: 8px)* |
| Touch target | 44×44px via pseudo-element | `reference/surfaces.md` |

Cross-link: `reference/surfaces.md` — hit-area pseudo-element pattern

---

## Typography

- Label: 14px/400 — same as body; option is a choice, not a heading
- Legend: 14px/500 or 12px/600 uppercase — distinct from option labels
- Helper/error: 12px/400

---

## Keyboard & Accessibility

> **WAI-ARIA role**: `radio` (implicit on `<input type="radio">`)
> **Group role**: `radiogroup` (via `<fieldset>` + ARIA, or `role="radiogroup"` explicitly)
> **Required attributes**: `name` (groups radios), `id` + `<label for>` per item

### Keyboard Contract

*Quoted verbatim from WAI-ARIA APG — https://www.w3.org/WAI/ARIA/apg/patterns/radio/ — W3C — 2024*

| Key | Action |
|-----|--------|
| Tab | Moves focus into group (to the checked radio, or first if none checked) |
| Tab (from within group) | Moves focus out of group to next focusable element |
| Arrow Right / Arrow Down | Moves focus to next radio AND selects it |
| Arrow Left / Arrow Up | Moves focus to previous radio AND selects it |
| Space | If the focused radio is not selected, selects it |

**Key insight**: Arrow keys move AND select simultaneously (auto-advance). This differs from checkboxes (Space toggles, Tab moves). Tab navigates in/out of the whole group as one focusable unit.

### Accessibility Rules

- `<fieldset>` + `<legend>` MUST wrap the entire group — legend text is prepended to each option announcement
- All radios in a group MUST share the same `name` attribute
- Tab focuses the selected radio (or first, if none selected) — arrow keys navigate within the group
- Never use a single radio button — it creates a state the user cannot unset; use a checkbox
- Error state applies to the group: `aria-describedby` on the `<fieldset>` or `role="radiogroup"` container
- `required`: apply to all radios in the group or use `aria-required` on the group container

---

## Motion

| Transition | Duration | Easing | Notes |
|------------|----------|--------|-------|
| Dot fill | 120ms | ease-out | Scale 0→1 from center |
| Deselect | 80ms | ease | Dot scale 1→0 |
| Hover border | 80ms | ease | Border colour only |

Cross-link: `reference/motion.md` — `prefers-reduced-motion`: skip dot animation, show fill instantly

---

## Do / Don't

### Do
- Always use `<fieldset>` + `<legend>` for the group *(WAI-ARIA APG, Carbon, Polaris)*
- Use the same `name` attribute for all radios in a group *(HTML spec, all systems)*
- Pre-select a default option where appropriate to reduce cognitive load *(Material 3, Polaris)*
- Use arrow keys to navigate within a group — Tab moves to the group, not each item *(WAI-ARIA APG)*

### Don't
- Don't use a single radio button — use a checkbox instead *(Material 3, Carbon, WAI-ARIA APG)*
- Don't use radio buttons for mutually exclusive options that require confirmation — use a select *(Polaris)*
- Don't mix radio and checkbox styles in the same group *(Carbon, Polaris)*
- Don't require the user to make a selection before seeing other page content (premature required state) *(Polaris)*

---

## Anti-patterns Cross-links

| Anti-pattern | Entry |
|--------------|-------|
| Lone radio button | `reference/anti-patterns.md` |

---

## Benchmark Citations

| Claim | Sources |
|-------|---------|
| Arrow keys move + select simultaneously | WAI-ARIA APG §3.6 |
| Tab focuses whole group as one unit | WAI-ARIA APG |
| fieldset+legend required | WAI-ARIA APG, Carbon, Polaris |
| Single radio = anti-pattern | Material 3, Carbon, WAI-ARIA APG |

Full system URLs: `connections/design-corpora.md`

---

## Grep Signatures

```bash
# Single radio button (no group = unresettable state)
grep -rn 'type="radio"' src/ | sort | uniq -c | sort -n | head

# Radio group missing name attribute
grep -rn 'type="radio"' src/ | grep -v 'name='

# Radio group without fieldset or role="radiogroup"
grep -rn 'type="radio"' src/ | grep -v 'fieldset\|role="radiogroup"'

# Arrow key handler missing in custom radio implementation
grep -rn 'role="radio"' src/ | grep -v 'ArrowDown\|ArrowUp\|onKeyDown'
```

---

## Failing Example

```html
<!-- BAD: radio group without fieldset/legend and with keyboard nav broken -->
<div>
  <input type="radio" id="a" name="plan"> <label for="a">Starter</label>
  <input type="radio" id="b" name="plan"> <label for="b">Pro</label>
</div>
```

**Why it fails**: Screen reader announces each option without the group question. The `<div>` provides no semantic grouping; `<legend>` is not present, so users don't know what "Starter" and "Pro" refer to.
**Grep detection**: `grep -B3 'type="radio"' src/ | grep '<div' | grep -v 'fieldset'`
**Fix**:
```html
<fieldset>
  <legend>Select your plan</legend>
  <input type="radio" id="a" name="plan"> <label for="a">Starter</label>
  <input type="radio" id="b" name="plan"> <label for="b">Pro</label>
</fieldset>
```
