# Input — Benchmark Spec

**Harvested from**: Material 3, Carbon, Ant Design, Mantine, Polaris, Fluent 2, Atlassian, shadcn/ui
**Wave**: 1 · **Category**: Inputs

---

## Purpose

A single-line text input collects short textual data from the user. It always has an associated visible label (never placeholder-only), optionally shows a helper text or character count below, and surfaces error state with an accessible message. Multi-line content belongs in a textarea; structured data (dates, phones) may warrant a specialised input type.

---

## Anatomy

```
Label *                     ← <label for="id"> — always visible
┌─────────────────────────┐
│ placeholder / value     │  ← <input type="text"> or type="search" / "email" / etc.
└─────────────────────────┘
  Helper text / Error msg  ← aria-describedby linked
  Character count (opt.)   ← aria-live="polite" region
```

| Part | Required | Notes |
|------|----------|-------|
| Label | Yes | Visible; never placeholder-only |
| Input element | Yes | Native `<input>` preferred; `type` set explicitly |
| Helper text | No | Persistent instructional text below input |
| Error message | Conditional | Shown on invalid state; replaces or joins helper text |
| Character count | No | `aria-live="polite"` region; announced on pause |
| Required indicator | No | `*` with `aria-required="true"` on input; legend explains `*` |
| Leading icon / adornment | No | 16–20px; left-inset with 12px gap from text |
| Trailing icon / clear button | No | Clear action must be keyboard-accessible |

---

## Variants

| Variant | Description | Systems |
|---------|-------------|---------|
| Outlined | Border box with floating/static label | Material 3, Ant, Mantine, shadcn |
| Filled | Filled background, underline only | Material 3, Carbon |
| Underline / Simple | Bottom border only | Carbon (fluid), Fluent |
| Search | Leading search icon; clear button on value | All systems |
| Password | Trailing show/hide toggle | All systems |
| Number | `type="number"` or `inputmode="numeric"` | Material 3, Ant, Mantine |

**Norm** (≥6/18): outlined with floating or static label is the most-cited default.
**Diverge**: floating vs. static label — Material 3 uses floating; Carbon, Polaris, Atlassian use static (above). Static label is safer for a11y (floating requires JavaScript + ARIA management).

---

## States

| State | Trigger | Visual | ARIA |
|-------|---------|--------|------|
| default | — | Resting border | — |
| hover | pointer over | Border lightens 20% | — |
| focus | keyboard / click | 2px focus-visible ring or thickened border | — |
| filled | has value | Label lifts (floating) or stays static | — |
| disabled | `disabled` attr | 38% opacity; cursor: not-allowed | `disabled` attr |
| read-only | `readonly` attr | No border change; cursor: default | `readonly` attr |
| error | invalid | Red/error border + icon + error message | `aria-invalid="true"` + `aria-describedby` |
| success | valid (opt.) | Green border + check icon | — |

---

## Sizing & Spacing

| Size | Height | Padding H | Font | Label size |
|------|--------|-----------|------|------------|
| sm | 32px | 12px | 13px | 12px |
| md (default) | 40px | 16px | 14px | 14px |
| lg | 48px | 16px | 16px | 16px |

**Norm**: 40px default height (Carbon, Polaris, Fluent, Atlassian confirm).
Minimum width: 200px — narrower inputs invite input truncation and frustrate users.

Cross-link: `reference/surfaces.md` — hit area ≥44px via padding; `reference/typography.md` — label sizing.

---

## Typography

- Label: 14px/500 above input; 12px when floating in focus/filled state
- Placeholder: 14px/400; color at 40% contrast minimum — never the only label
- Helper/error: 12px/400; full contrast for error messages
- **Placeholder is not a label**: it disappears on type, fails contrast, and cannot be announced by screen readers as a persistent label

Cross-link: `reference/typography.md` — text-wrap, font-smoothing rules

---

## Keyboard & Accessibility

> **WAI-ARIA role**: `textbox` (implicit on `<input type="text">`)
> **Required attributes**: `id` + matching `<label for>`, or `aria-label`; `aria-describedby` linking error/helper

### Keyboard Contract

*Quoted verbatim from WAI-ARIA APG — https://www.w3.org/WAI/ARIA/apg/patterns/textbox/ — W3C — 2024*

| Key | Action |
|-----|--------|
| Any printable character | Types character into field |
| Backspace / Delete | Removes character |
| Home | Moves caret to start |
| End | Moves caret to end |
| Ctrl+A | Selects all |
| Tab | Moves focus to next element |
| Shift+Tab | Moves focus to previous element |

Password toggle and clear button must be keyboard accessible (Enter/Space activate).

### Accessibility Rules

- Label MUST be associated via `<label for="id">` or `aria-label` — `placeholder` alone is not sufficient
- Error message MUST be linked via `aria-describedby` and triggered before or alongside visual indicator
- `aria-invalid="true"` MUST be set on the input when in error state
- `aria-required="true"` for required fields (supplement with visual `*` + legend)
- Character count region: `aria-live="polite"` to avoid over-announcing on every keystroke

Cross-link: `reference/accessibility.md`

---

## Motion

| Transition | Duration | Easing | Notes |
|------------|----------|--------|-------|
| label float | 150ms | ease-out | Floating label only; avoid if complex JS needed |
| border colour | 100ms | ease | Focus/error state border change |
| error message in | 150ms | ease-out | Slide-down + fade; respect prefers-reduced-motion |

Cross-link: `reference/motion.md` — `prefers-reduced-motion` guard required on label float

---

## Do / Don't

### Do
- Always show a visible label above or beside the input *(Carbon, Polaris, Atlassian, WAI-ARIA APG)*
- Show inline error messages immediately below the failing field *(Material 3, Carbon, Polaris)*
- Associate helper text and errors via `aria-describedby` *(WAI-ARIA APG)*
- Use `autocomplete` attributes for common fields (name, email, address) *(Polaris, Fluent)*

### Don't
- Don't use `placeholder` as the only label — it disappears and fails contrast *(Carbon, Polaris, Atlassian)*
- Don't show error state before the user has had a chance to input (premature validation) *(Polaris)*
- Don't remove the label on focus to create space — floating labels break screen readers *(Atlassian)*
- Don't use `type="number"` for things that aren't math operands (phone, ZIP) — use `inputmode` instead *(Mantine, Carbon)*

---

## Anti-patterns Cross-links

| Anti-pattern | Entry |
|--------------|-------|
| Placeholder-as-label | `reference/anti-patterns.md` — no dedicated BAN yet; cross-ref accessibility.md |

---

## Benchmark Citations

| Claim | Sources |
|-------|---------|
| 40px default height | Carbon, Polaris, Fluent 2, Atlassian |
| Placeholder not a label | Carbon, Polaris, Atlassian, WAI-ARIA APG |
| aria-describedby for errors | WAI-ARIA APG, Carbon, Mantine |
| Static label safer than floating | Atlassian, Carbon, Polaris |

Full system URLs: `connections/design-corpora.md`

---

## Grep Signatures

```bash
# Placeholder-as-label (no <label> associated)
grep -rn 'placeholder=' src/ | grep -v 'aria-label\|<label'

# Missing aria-invalid on error state
grep -rn 'error\|invalid' src/ | grep '<input' | grep -v 'aria-invalid'

# Missing aria-describedby on input with helper/error
grep -rn '<input' src/ | grep -v 'aria-describedby'

# type="number" on non-numeric semantic fields
grep -rn 'type="number"' src/ | grep -i 'phone\|zip\|postal\|card'
```

---

## Failing Example

```html
<!-- BAD: placeholder as label — disappears on type, fails contrast, not announced persistently -->
<input type="text" placeholder="Email address" />
```

**Why it fails**: Placeholder has 40% opacity (below 4.5:1 AA), disappears when user types, and screen readers do not treat it as a persistent label.
**Grep detection**: `grep -rn '<input' src/ | grep 'placeholder=' | grep -v 'aria-label\|id='`
**Fix**:
```html
<label for="email">Email address</label>
<input type="email" id="email" autocomplete="email" />
```
