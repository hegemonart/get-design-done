# Link — Benchmark Spec

**Harvested from**: Carbon, Polaris, Primer (GitHub), Fluent 2, WAI-ARIA APG, Material 3, Mantine, Atlassian
**Wave**: 1 · **Category**: Inputs

---

## Purpose

A link navigates the user to a new resource — another page, section, or external URL. It is the semantic counterpart to Button: if clicking takes the user somewhere, it is a `<a href>` link; if it triggers an action in the current context, it is a button. Never reverse these roles. *(Carbon, Primer, WAI-ARIA APG all enforce this boundary)*

---

## Anatomy

```
Inline: Read the [full documentation] for details.
         └── <a href="..."> — inline, within body text

Standalone: [→ View report]
             └── <a href="..."> — block-level, not inline in prose

External: [Open dashboard ↗]
           └── <a href="..." target="_blank" rel="noopener noreferrer">
               + aria-label="Open dashboard (opens in new tab)"
```

| Part | Required | Notes |
|------|----------|-------|
| `<a href>` | Yes | Native element; href MUST be a real URL or `#anchor` |
| Visible label | Yes | Descriptive of destination — not "click here" or "read more" |
| Underline | Conditional | Required for inline links in body text; optional for standalone/nav |
| Visited state | No | Encouraged for inline links in long-form content |
| External icon | Conditional | Required when `target="_blank"`; 12–14px, inline-aligned |
| `rel="noopener noreferrer"` | Yes (external) | Security — prevents opener access |

---

## Variants

| Variant | Description | Systems |
|---------|-------------|---------|
| Inline | Within prose; always underlined | All |
| Standalone | Block-level CTA; underline optional | Carbon, Polaris, Primer |
| Nav / breadcrumb | In navigation contexts; no underline | All |
| External | `target="_blank"` with external icon | All |
| Destructive | Rare; red colour for delete-via-link patterns | Polaris (critical link) |
| Disabled | `aria-disabled="true"` + `tabindex="-1"` | Carbon, Primer |

**Norm** (≥6/18): inline links in body text MUST be underlined — colour alone fails WCAG 1.4.1.
**Diverge**: visited state — Primer and Carbon use it for documentation; most SaaS systems omit it.

---

## States

| State | Visual | ARIA / HTML |
|-------|--------|-------------|
| default | Underline + colour | `href` present |
| hover | Colour shift (10% darker/lighter) | — |
| focus | 2px focus-visible ring | — |
| active / pressed | Colour darkens + subtle scale 0.98 | — |
| visited | Distinct colour (purple conventional) | `:visited` pseudo-class |
| disabled | 38% opacity; pointer-events: none | `aria-disabled="true"` + `tabindex="-1"` |

---

## Sizing & Spacing

- Links inherit parent font-size and line-height — do not override
- Standalone link min-height: 44px via padding for touch targets
- Icon size (external/leading): 12–14px; `vertical-align: middle`; 4px gap from text

Cross-link: `reference/surfaces.md` — hit-area pattern for standalone links

---

## Typography

- Inline links: same weight as surrounding text (400); underline distinguishes them
- Standalone links: 400–500 weight; may have leading icon or trailing arrow
- Never use ALL CAPS for links — reduces readability and implies different semantics
- Truncate with ellipsis + `title` attribute only when space is genuinely constrained

---

## Keyboard & Accessibility

> **WAI-ARIA role**: `link` (implicit on `<a href>`)
> **Required attributes**: `href` — without it, the element is not a link and has no keyboard access

### Keyboard Contract

*Quoted verbatim from WAI-ARIA APG — https://www.w3.org/WAI/ARIA/apg/patterns/link/ — W3C — 2024*

| Key | Action |
|-----|--------|
| Enter | Activates the link and navigates to its destination |
| Tab | Moves focus to the next focusable element |
| Shift+Tab | Moves focus to the previous focusable element |

### Accessibility Rules

- Link text MUST describe the destination — "click here" and "read more" fail 2.4.6 (descriptive labels)
- External links opening in new tab MUST disclose this: append "(opens in new tab)" to `aria-label`, or use a visually-hidden span
- `target="_blank"` MUST always be paired with `rel="noopener noreferrer"` (security + performance)
- Disabled links: `aria-disabled="true"` + `tabindex="-1"` — never `href=""` or `href="#"`
- Inline links in body text MUST be underlined — colour alone is insufficient for WCAG 1.4.1 (non-text contrast)
- Icon-only links (e.g., social icons) MUST have `aria-label` describing the destination

---

## Motion

| Transition | Duration | Easing | Notes |
|------------|----------|--------|-------|
| Colour on hover | 100ms | ease | Subtle; avoid opacity changes (readability) |
| Underline decoration | 80ms | ease | Underline grow or fade for standalone variants |

---

## Do / Don't

### Do
- Use descriptive link text: "View account settings" not "click here" *(Polaris, Carbon, WAI-ARIA APG)*
- Underline inline links in body text *(Carbon, Polaris, WAI-ARIA APG — WCAG 1.4.1)*
- Add `rel="noopener noreferrer"` to all `target="_blank"` links *(Primer, Carbon, Fluent 2)*
- Disclose new-tab behavior in `aria-label` or visually-hidden text *(WAI-ARIA APG, Primer)*

### Don't
- Don't use `<a>` without `href` — it's not a link, not keyboard-accessible, and will confuse screen readers *(WAI-ARIA APG)*
- Don't use `<button>` when the action is navigation *(Carbon, Primer)*
- Don't rely on colour alone to distinguish links from surrounding text *(WCAG 1.4.1)*
- Don't open links in new tabs unexpectedly without disclosure *(Polaris, Primer, WCAG 3.2.5)*

---

## Anti-patterns Cross-links

| Anti-pattern | Entry |
|--------------|-------|
| Anchor without href | `reference/anti-patterns.md` |
| Non-descriptive link text | `reference/anti-patterns.md` |

---

## Benchmark Citations

| Claim | Sources |
|-------|---------|
| Enter activates link | WAI-ARIA APG §3.3 |
| Underline required for inline links | Carbon, Polaris, WCAG 1.4.1 |
| rel="noopener noreferrer" for _blank | Primer, Carbon, Fluent 2 |
| "click here" is anti-pattern | Polaris, Carbon, WAI-ARIA APG |

Full system URLs: `connections/design-corpora.md`

---

## Grep Signatures

```bash
# <a> without href (not a link — no keyboard access)
grep -rn '<a ' src/ | grep -v 'href='

# target="_blank" without rel="noopener noreferrer"
grep -rn 'target="_blank"' src/ | grep -v 'rel=.*noopener'

# Non-descriptive link text
grep -rn '>click here\|>read more\|>learn more\|>here<' src/ | grep -i '<a'

# Colour-only link distinction (no text-decoration)
grep -rn 'text-decoration:\s*none' src/ | grep -i 'link\|<a'
```

---

## Failing Example

```html
<!-- BAD: non-descriptive link text + missing rel on external link -->
<a href="https://docs.example.com" target="_blank">Click here</a>
```

**Why it fails**: "Click here" gives no destination context (fails WCAG 2.4.6). Missing `rel="noopener noreferrer"` is a security vulnerability. No disclosure of new-tab behavior.
**Grep detection**: `grep -rn '>click here\|>here<\|>read more' src/`
**Fix**:
```html
<a href="https://docs.example.com" target="_blank" rel="noopener noreferrer"
   aria-label="View documentation (opens in new tab)">
  View documentation <span aria-hidden="true">↗</span>
</a>
```
