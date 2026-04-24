# Label — Benchmark Spec

**Harvested from**: WAI-ARIA APG, Carbon, Material 3, Mantine, Polaris, Atlassian, Fluent 2, shadcn/ui
**Wave**: 1 · **Category**: Inputs

---

## Purpose

A label is the visible text that identifies a form control to the user and to assistive technology. It is the most critical accessibility primitive in forms — every input, select, checkbox, radio, and switch MUST have an associated label. Labels are distinct from placeholders (which disappear) and from hints (which supplement but do not replace). *(WAI-ARIA APG, Carbon, Polaris, Atlassian all agree)*

---

## Anatomy

```
Label text *          ← <label for="id"> (static, above control)
┌──────────────────┐
│ Input            │  ← <input id="id">
└──────────────────┘
  Helper text

Alternative (legend for group):
<fieldset>
  <legend>Group label</legend>  ← <legend> replaces <label> for groups
  ...controls...
</fieldset>
```

| Part | Required | Notes |
|------|----------|-------|
| Label text | Yes | Visible; descriptive; ≤40 chars preferred |
| Required indicator | Conditional | `*` or "(required)"; always explained near form |
| Optional indicator | Conditional | "(optional)" text is clearer than required asterisk |
| Helper text | No | Below control; `aria-describedby` |
| `for` / `id` association | Yes | OR `aria-label` / `aria-labelledby` on control |
| Legend (groups) | Yes (groups) | Replaces `<label>` for `<fieldset>` groups |

---

## Variants

| Variant | Description | Systems |
|---------|-------------|---------|
| Static label (above) | Fixed position above control — most accessible | Carbon, Polaris, Atlassian, Fluent |
| Floating label | Starts inside control, floats up on focus/fill | Material 3, Mantine, shadcn |
| Inline label | Label beside control (radio/checkbox) | All |
| Legend | Group label inside `<fieldset>` | WAI-ARIA APG, all (for groups) |
| Visually hidden | Accessible but not visible (e.g., search icon button) | WAI-ARIA APG, Carbon |

**Norm** (≥5/18): static label above the control is the most accessible and implementation-simple approach — recommended as the default.
**Diverge**: floating label — Material 3 and Mantine use it; Carbon, Polaris, Atlassian explicitly recommend static labels for a11y predictability. Floating labels require JavaScript, break if JS fails, and require careful `aria-*` management.

---

## States

Labels are not interactive — they have no hover/focus states of their own. However:

| Control State | Label Behaviour |
|---------------|-----------------|
| error | Label colour may shift to error colour (optional); error text replaces/appends helper |
| disabled | Label at 38% opacity alongside disabled control |
| required | Required indicator (`*`) added — never remove from DOM |
| focus (on control) | Label may shift colour to primary (Material 3 floating) |

---

## Sizing & Spacing

| Property | Value | Notes |
|----------|-------|-------|
| Font size | 14px (static); 12px (floating — small state) | |
| Weight | 500 | Slightly heavier than body to distinguish |
| Gap: label → control | 4–8px | *(Carbon: 4px, Material 3: 8px)* |
| Required asterisk gap | 2px left of asterisk | |
| Width | Match control width | Labels should not exceed their control |

Cross-link: `reference/typography.md` — label sizing rules

---

## Typography

- Label text: 14px/500 — slightly heavier than body 400; distinguishes from surrounding content
- Required `*`: same size, colour matches error or primary brand colour
- Visually-hidden labels: use CSS `.sr-only` pattern (clip + overflow: hidden + absolute), never `display:none` or `visibility:hidden`

```css
/* sr-only — label hidden visually but present for screen readers */
.sr-only {
  position: absolute;
  width: 1px; height: 1px;
  padding: 0; margin: -1px;
  overflow: hidden;
  clip: rect(0,0,0,0);
  white-space: nowrap;
  border: 0;
}
```

---

## Keyboard & Accessibility

> **WAI-ARIA role**: `label` (implicit on `<label>`)
> **Required attributes**: `for="control-id"` on `<label>`, matching `id` on control

### Association Methods (in order of preference)

*Per WAI-ARIA APG — https://www.w3.org/WAI/ARIA/apg/ — W3C — 2024*

1. **`<label for="id">`** — native HTML; best browser + AT support; clicking label focuses control
2. **`aria-labelledby="label-id"`** — when label cannot use `for` (complex composites)
3. **`aria-label="string"`** — when no visible label is possible (icon-only controls); last resort
4. **`<legend>` inside `<fieldset>`** — for groups of related controls; not replaceable by `aria-label`

### Accessibility Rules

- NEVER use `placeholder` as the only label — it disappears on input and fails colour contrast *(WAI-ARIA APG, WCAG 1.3.1)*
- Required fields: mark with `aria-required="true"` on the control AND `*` visually; provide a form-level note explaining the `*` convention
- Optional fields: prefer marking optional fields with "(optional)" text over marking every required field with `*` — reduces asterisk clutter in long forms *(Polaris, Carbon)*
- Group labels: `<legend>` inside `<fieldset>` is the ONLY proper group label technique — `aria-label` on a `<div>` group is inadequate for radio/checkbox groups in most AT
- Visually hidden labels: use `.sr-only` CSS — never `display:none` (removes from AT tree) or `visibility:hidden`

---

## Do / Don't

### Do
- Place labels above controls, not beside them, for forms wider than 240px *(Carbon, Polaris, Atlassian)*
- Use `<label for="id">` — the click zone extends to the full label, improving usability *(WAI-ARIA APG, all)*
- Explain the `*` required indicator once near the top of the form *(Polaris, Carbon)*
- Use `<legend>` for groups — it is read before each option in the group *(WAI-ARIA APG)*

### Don't
- Don't use `placeholder` as the only label — it fails at 3 accessibility criteria *(WAI-ARIA APG, WCAG 1.3.1, 1.4.3)*
- Don't use `display:none` on labels — removes them from the AT accessibility tree *(WAI-ARIA APG)*
- Don't write labels as questions ("What is your name?") — prefer noun phrases ("Full name") *(Polaris, Carbon)*
- Don't truncate label text — ellipsis hides required information from all users *(Atlassian, Carbon)*

---

## Anti-patterns Cross-links

| Anti-pattern | Entry |
|--------------|-------|
| Placeholder-as-label | `reference/anti-patterns.md` |
| display:none on accessible label | `reference/anti-patterns.md` |

---

## Benchmark Citations

| Claim | Sources |
|-------|---------|
| `<label for>` clicking focuses control | HTML spec, WAI-ARIA APG |
| legend for group labels (not aria-label) | WAI-ARIA APG, Carbon |
| Static label above preferred over floating | Carbon, Polaris, Atlassian |
| .sr-only pattern for hidden labels | WAI-ARIA APG, Carbon, Tailwind |
| placeholder fails 3 a11y criteria | WAI-ARIA APG, WCAG 1.3.1, 1.4.3 |

Full system URLs: `connections/design-corpora.md`

---

## Grep Signatures

```bash
# Input with no associated label (no for/id, no aria-label)
grep -rn '<input' src/ | grep -v 'type="hidden"\|type="submit"\|type="button"' \
  | grep -v 'id=\|aria-label\|aria-labelledby'

# Label using display:none (removed from AT tree)
grep -rn 'display:\s*none\|display:none' src/ | grep -i 'label\|<label'

# Placeholder used without separate label
grep -rn 'placeholder=' src/ | grep -v 'aria-label\|<label\|aria-labelledby'

# Group without fieldset/legend
grep -rn 'type="radio"\|type="checkbox"' src/ | grep -v 'fieldset\|legend'
```

---

## Failing Example

```html
<!-- BAD: label using display:none — completely removed from accessibility tree -->
<label for="search" style="display:none">Search</label>
<input type="text" id="search" placeholder="Search…">
```

**Why it fails**: `display:none` removes the label from the DOM accessibility tree. Screen readers see only the placeholder (which disappears on type and has low contrast). The input has no persistent accessible name.
**Grep detection**: `grep -rn 'display:.*none' src/ | grep '<label\|label.*for'`
**Fix**:
```html
<label for="search" class="sr-only">Search</label>
<input type="text" id="search" placeholder="Search products…">
```
