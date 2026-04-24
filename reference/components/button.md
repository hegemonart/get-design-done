# Button — Benchmark Spec

**Harvested from**: Material 3, Polaris, Carbon, Fluent 2, Radix, shadcn/ui, Primer, Atlassian
**Wave**: 1 · **Category**: Inputs

---

## Purpose

A button triggers a discrete action in the current context — submitting a form, opening a dialog, executing a command. It is not a navigation element (use Link for href-based navigation). Buttons have an explicit visual affordance of clickability and must communicate their current state (loading, disabled) clearly. *(Material 3, Carbon, Polaris agree: button = action trigger, not navigation)*

---

## Anatomy

```
[ icon? ] [ label ] [ trailing-icon? ]
    └── role="button" or <button>
        └── focus-visible ring (2px offset)
```

| Part | Required | Notes |
|------|----------|-------|
| Label | Yes (or `aria-label`) | Visible text preferred; `aria-label` for icon-only |
| Root element | Yes | Must be `<button>` or element with `role="button"` + `tabindex="0"` |
| Leading icon | No | Left-aligned, 16–20px, optical spacing ~8px |
| Trailing icon | No | Right-aligned; use sparingly (chevron for split buttons) |
| Focus ring | Yes | 2px solid, 2px offset from border; never hidden |
| Loading indicator | No | Spinner replaces or overlays label; `aria-busy="true"` |

---

## Variants

| Variant | Description | Systems |
|---------|-------------|---------|
| Primary / Filled | Highest emphasis; one per view section | Material 3, Carbon, Polaris, Fluent, Primer |
| Secondary / Outlined | Medium emphasis; alternate action | Material 3, Carbon, Polaris, Fluent |
| Ghost / Text | Low emphasis; tertiary or inline actions | Material 3 (text), Carbon (ghost), Polaris (plain) |
| Destructive | Irreversible actions (delete, remove) | Polaris (critical), Carbon (danger), shadcn |
| Icon-only | No visible label; requires `aria-label` | All systems |
| Link-style | Looks like link, behaves as button | Carbon, Primer |

**Norm** (≥6/18 systems agree): primary/secondary/ghost hierarchy; one primary per viewport section.
**Diverge**: "tertiary" naming (Material 3) vs. "ghost" (Carbon) vs. "plain" (Polaris) — same visual intent, different labels.

---

## States

| State | Trigger | Visual | ARIA |
|-------|---------|--------|------|
| default | — | Resting fill/border | — |
| hover | pointer over | 8% overlay (light) / 8% overlay (dark) | — |
| focus | keyboard focus | 2px focus-visible ring, 2px offset | — |
| active / pressed | mousedown / Space / Enter | 12% overlay; scale 0.96 | — |
| disabled | `disabled` attr | 38% opacity; cursor: not-allowed | `disabled` attr |
| loading | async action in flight | Spinner, `aria-busy="true"` | `aria-busy="true"` |

**Norm**: 96% scale on press (Material 3, shadcn, Carbon confirm). 38% opacity for disabled (Material 3 spec).
**Diverge**: hover overlay vs. background tint — systems use either approach; overlay is more theme-portable.

---

## Sizing & Spacing

| Size | Height | Padding H | Min-width | Font |
|------|--------|-----------|-----------|------|
| sm | 32px | 12px | 64px | 13px/500 |
| md (default) | 40px | 16px | 80px | 14px/500 |
| lg | 48px | 24px | 96px | 16px/500 |

**Norm**: 40px default height (Carbon, Polaris, Fluent all confirm). Min-width prevents single-character buttons.
Cross-link: `reference/surfaces.md` — hit-area rule (minimum 44×44px accessible tap target via padding, not height).

---

## Typography

- Weight: 500 (medium) — not bold; distinguishes from body text without being heavy *(Material 3, Carbon)*
- Letter-spacing: +0.01em for sm/md, 0 for lg
- No text truncation — resize button or use icon-only variant; truncated button labels break affordance

Cross-link: `reference/typography.md` — tabular-nums rule (use on loading counters, not labels)

---

## Keyboard & Accessibility

> **WAI-ARIA role**: `button`
> **Required attributes**: none if `<button>`; `role="button"` + `tabindex="0"` if `<div>`/`<span>`

### Keyboard Contract

*Quoted verbatim from WAI-ARIA APG — https://www.w3.org/WAI/ARIA/apg/patterns/button/ — W3C — 2024*

| Key | Action |
|-----|--------|
| Enter | Activates the button |
| Space | Activates the button |

### Accessibility Rules

- Icon-only buttons MUST have `aria-label` or `aria-labelledby` — a tooltip is not a substitute
- Loading state: set `aria-busy="true"` and disable pointer events; announce completion via `aria-live`
- Disabled: use native `disabled` attribute (not `aria-disabled`) unless button must remain focusable for tooltip explanation
- Never use `<div>` or `<a>` as a button trigger without `role="button"` and keyboard handlers
- Focus ring must never be `outline: none` without a visible CSS custom alternative

Cross-link: `reference/accessibility.md`

---

## Motion

| Transition | Duration | Easing | Notes |
|------------|----------|--------|-------|
| hover overlay | 120ms | ease-out | Subtle; background/border only |
| press scale (0.96) | 80ms | ease-in | Immediate tactile feedback |
| loading spinner in | 150ms | ease-out | Replaces or overlays label |

**BAN**: `transition: all` — catches width change on loading and causes layout jank.

Cross-link: `reference/motion.md` — canonical scale-on-press 0.96, BAN-04 (`transition: all`)

---

## Do / Don't

### Do
- Use one primary button per section of a view *(Material 3, Carbon, Polaris)*
- Write labels as verb phrases: "Save changes", "Delete account" *(Polaris content guidelines)*
- Provide `aria-label` for icon-only variants *(WAI-ARIA APG)*
- Maintain 8px minimum spacing between adjacent buttons *(Carbon, Fluent)*

### Don't
- Don't use a button for navigation to another page — use `<a href>` (Link) *(Carbon, Primer)*
- Don't disable a button without explaining why — prefer showing error state after submission *(Polaris)*
- Don't use "Click here" or "Submit" as labels — be specific about the action *(Polaris, Carbon)*
- Don't truncate button labels — buttons must fit their content *(Fluent, Atlassian)*

---

## Anti-patterns Cross-links

| Anti-pattern | Entry |
|--------------|-------|
| BAN-04 | `transition: all` on interactive elements — `reference/anti-patterns.md#ban-04` |

---

## Benchmark Citations

| Claim | Sources |
|-------|---------|
| 40px default height | Carbon, Polaris, Fluent 2 |
| 96% press scale | Material 3, shadcn, Carbon |
| One primary per section | Material 3, Carbon, Polaris, Fluent |
| Space/Enter activation | WAI-ARIA APG §4.2 |
| 38% opacity disabled | Material 3 |

Full system URLs: `connections/design-corpora.md`

---

## Grep Signatures

```bash
# Icon-only button missing aria-label
grep -rn '<button' src/ | grep -v 'aria-label\|aria-labelledby' | grep 'icon\|svg'

# div/span used as button without role
grep -rn '<div\|<span' src/ | grep 'onClick\|on:click' | grep -v 'role="button"'

# transition: all on button (BAN-04)
grep -rn 'transition:\s*all' src/ | grep -i 'button\|btn'

# Missing focus-visible — outline: none without alternative
grep -rn 'outline:\s*none\|outline:\s*0' src/ | grep -i 'button\|btn\|focus'
```

---

## Failing Example

```html
<!-- BAD: div used as button — no keyboard access, no role, no focus management -->
<div class="btn" onclick="handleClick()">
  <svg><!-- icon --></svg>
</div>
```

**Why it fails**: Not reachable by keyboard; no ARIA role; Space/Enter do nothing; no accessible name.
**Grep detection**: `grep -rn '<div.*onClick\|<div.*on:click' src/ | grep -v 'role='`
**Fix**: Use `<button type="button" aria-label="[action]">` with the icon inside.
