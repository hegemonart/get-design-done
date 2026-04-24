# Checkbox — Benchmark Spec

**Harvested from**: Material 3, Carbon, Polaris, Ant Design, WAI-ARIA APG, Mantine, Chakra UI, Atlassian
**Wave**: 1 · **Category**: Inputs

---

## Purpose

A checkbox allows the user to select or deselect a binary option, or to represent an indeterminate state (partially selected group). Checkboxes are independent — selecting one does not affect others. Use radio buttons for mutually exclusive choices within a group. Always group related checkboxes in a `<fieldset>` with a `<legend>`.

---

## Anatomy

```
┌──┐  Label text
│✓ │  ← <input type="checkbox" id="x"> (or role="checkbox")
└──┘  Helper text (opt.)
      Error message (opt.)

Group:
<fieldset>
  <legend>Preferences</legend>
  [checkbox] Option A
  [checkbox] Option B
  [checkbox] Option C (indeterminate)
</fieldset>
```

| Part | Required | Notes |
|------|----------|-------|
| Input / control | Yes | Native `<input type="checkbox">` preferred |
| Label | Yes | `<label for="id">` — click zone includes label text |
| Fieldset + legend | Yes (group) | Required when ≥2 related checkboxes |
| Helper text | No | Below label; `aria-describedby` |
| Error message | Conditional | Field-level or group-level |
| Indeterminate indicator | Conditional | Dash/minus mark; set via `.indeterminate = true` (JS) |

---

## Variants

| Variant | Description | Systems |
|---------|-------------|---------|
| Default | Binary checked / unchecked | All |
| Indeterminate | Partial selection indicator (parent of group) | Material 3, Carbon, Ant, Mantine |
| Standalone | Single checkbox (e.g. "I agree to terms") | All |
| Group | ≥2 checkboxes in `<fieldset>` | All |
| With description | Label + helper text below | Material 3, Polaris, Carbon |

**Norm** (≥6/18): indeterminate state is a visual-only UI state — the underlying `checked` value is still boolean; set via DOM `.indeterminate` property, not HTML attribute.
**Diverge**: size — Material 3 uses 18px; Carbon 16px; Polaris 16px; Ant 14–16px. 16px is the de-facto norm.

---

## States

| State | Trigger | Visual | ARIA |
|-------|---------|--------|------|
| unchecked | default | Empty box | `aria-checked="false"` |
| checked | user interaction | Checkmark | `aria-checked="true"` |
| indeterminate | set via JS | Dash / minus | `aria-checked="mixed"` |
| hover | pointer over | Box border darkens | — |
| focus | keyboard | 2px focus ring around box | — |
| disabled unchecked | `disabled` | 38% opacity | `aria-disabled="true"` |
| disabled checked | `disabled` | 38% opacity + check | `aria-disabled="true"` |
| error | validation | Red box border | `aria-invalid="true"` |

---

## Sizing & Spacing

| Property | Value | Notes |
|----------|-------|-------|
| Control size | 16×16px (20px touch target via pseudo-element) | *(Carbon, Polaris, Material 3)* |
| Gap: control → label | 8px | |
| Label min click zone | Full row width | Increases tap target |
| Group item spacing | 8px vertical between items | *(Carbon, Material 3)* |
| Indentation (nested) | 24px | When showing hierarchical groups |

Cross-link: `reference/surfaces.md` — hit-area pseudo-element pattern (44×44px minimum touch target)

---

## Typography

- Label: 14px/400; same weight as body — checkboxes are options, not headings
- Legend: 14px/500 or 12px/600 uppercase — distinguishes group from items
- Helper/error: 12px/400

---

## Keyboard & Accessibility

> **WAI-ARIA role**: `checkbox` (implicit on `<input type="checkbox">`)
> **Required attributes**: `aria-checked` (if not native); `aria-describedby` for helper/error

### Keyboard Contract

*Quoted verbatim from WAI-ARIA APG — https://www.w3.org/WAI/ARIA/apg/patterns/checkbox/ — W3C — 2024*

| Key | Action |
|-----|--------|
| Tab | Moves focus to the checkbox |
| Space | Toggles the checkbox state (checked / unchecked / indeterminate) |

Within a group: Tab moves between checkboxes (not arrow keys — checkboxes are independent).

### Accessibility Rules

- Label MUST be associated via `<label for="id">` — clicking the label must toggle the checkbox
- `<fieldset>` + `<legend>` MUST wrap every group of related checkboxes — the legend provides group context to screen readers
- Indeterminate state MUST be set via JS `.indeterminate = true` — there is no HTML attribute; `aria-checked="mixed"` must be set simultaneously on `role="checkbox"` elements
- Disabled checkboxes: use native `disabled` attribute for form semantics; `aria-disabled="true"` if the element must remain in tab order (e.g. with explanatory tooltip)
- Error state: `aria-invalid="true"` on the control; group-level error on the `<fieldset>` via `aria-describedby`

---

## Motion

| Transition | Duration | Easing | Notes |
|------------|----------|--------|-------|
| check fill | 120ms | ease-out | SVG path draw or scale from center |
| indeterminate dash | 120ms | ease | Width animation of dash element |
| hover border | 80ms | ease | Border colour only |

Cross-link: `reference/motion.md` — `prefers-reduced-motion`: skip path animation, show fill instantly

---

## Do / Don't

### Do
- Use `<fieldset>` + `<legend>` for every group *(WAI-ARIA APG, Carbon, Polaris)*
- Set indeterminate via `.indeterminate = true` AND `aria-checked="mixed"` *(WAI-ARIA APG, Mantine)*
- Make the entire label row clickable, not just the box *(Material 3, Carbon, Polaris)*
- Align label text to the top of the control in multiline label scenarios *(Carbon)*

### Don't
- Don't use checkboxes for mutually exclusive options — use radio buttons *(Material 3, Carbon, Polaris)*
- Don't use a custom `<div>` checkbox without `role="checkbox"` and keyboard handler *(WAI-ARIA APG)*
- Don't set `aria-checked="mixed"` via HTML attribute — it must be set dynamically *(WAI-ARIA APG)*
- Don't rely on colour alone for checked state — always include a visible checkmark *(WCAG 1.4.1)*

---

## Anti-patterns Cross-links

| Anti-pattern | Entry |
|--------------|-------|
| Custom checkbox without role | `reference/anti-patterns.md` |

---

## Benchmark Citations

| Claim | Sources |
|-------|---------|
| Space toggles checkbox | WAI-ARIA APG §3.5 |
| fieldset+legend required for group | WAI-ARIA APG, Carbon, Polaris |
| .indeterminate = true (JS only) | WAI-ARIA APG, MDN |
| 16px control size | Carbon, Polaris, Material 3 |

Full system URLs: `connections/design-corpora.md`

---

## Grep Signatures

```bash
# Custom checkbox div/span without role="checkbox"
grep -rn 'class.*checkbox\|type.*checkbox' src/ | grep '<div\|<span' | grep -v 'role='

# Missing label association
grep -rn 'type="checkbox"' src/ | grep -v 'id=\|aria-label'

# Group without fieldset
grep -rn 'checkbox' src/ | grep -v 'fieldset\|role="group"'

# Indeterminate set via attribute instead of JS
grep -rn 'indeterminate' src/ | grep 'setAttribute\|attr(' | grep '"true"'
```

---

## Failing Example

```html
<!-- BAD: checkboxes in a group without fieldset/legend — group context lost for screen readers -->
<div>
  <p>Notification preferences</p>
  <input type="checkbox" id="email"> <label for="email">Email</label>
  <input type="checkbox" id="sms"> <label for="sms">SMS</label>
</div>
```

**Why it fails**: Screen readers announce each option without the group context ("Email — checkbox") — users don't know what these options belong to without reading surrounding text.
**Grep detection**: `grep -B5 'type="checkbox"' src/ | grep -v 'fieldset\|role="group"'`
**Fix**:
```html
<fieldset>
  <legend>Notification preferences</legend>
  <input type="checkbox" id="email"> <label for="email">Email</label>
  <input type="checkbox" id="sms"> <label for="sms">SMS</label>
</fieldset>
```
