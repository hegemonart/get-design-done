# Menu (Dropdown / Context Menu) — Benchmark Spec

**Harvested from**: Radix UI, WAI-ARIA APG, Carbon, Atlassian, Material 3, Polaris
**Wave**: 4 · **Category**: Navigation

---

## Purpose

A menu presents a list of actions or options in a temporary overlay anchored to a trigger element. It differs from a Select/Combobox (which chooses a value) — a menu executes commands or navigates. Use a Dropdown Menu for trigger-button scenarios; use a Context Menu for right-click/long-press on an element. *(Radix DropdownMenu, Carbon OverflowMenu, Atlassian DropdownMenu, WAI-ARIA APG Menu agree: menus are action lists, not value selectors)*

---

## Anatomy

```
[ Trigger Button ▾ ]
┌─────────────────────┐
│  ✓ Menu Item        │  role="menuitemcheckbox"
│  ── Separator ──    │  role="separator"
│  › Sub-menu Item    │  role="menuitem" aria-haspopup="menu"
│    Edit             │  role="menuitem"
│    Delete           │  role="menuitem"
└─────────────────────┘
```

| Part | Required | Notes |
|------|----------|-------|
| Trigger | Yes | `<button>` with `aria-haspopup="menu"` + `aria-expanded` |
| Menu container | Yes | `role="menu"` + `aria-labelledby` pointing to trigger |
| Menu item | Yes | `role="menuitem"` on each action |
| Separator | No | `role="separator"` — groups related items |
| Checkbox item | No | `role="menuitemcheckbox"` + `aria-checked` |
| Radio item | No | `role="menuitemradio"` + `aria-checked`; group in `role="group"` |
| Sub-menu trigger | No | `role="menuitem"` + `aria-haspopup="menu"` + `aria-expanded` |
| Focus indicator | Yes | 2px focus-visible ring on keyboard-active item |

---

## Variants

| Variant | Description | Systems |
|---------|-------------|---------|
| Dropdown menu | Opens from a button trigger; anchored below/above | Radix, Carbon, Atlassian, Polaris |
| Context menu | Opens at pointer position on right-click or long-press | Radix, Material 3, Carbon |
| Overflow menu | Icon-only trigger (⋯ or ⋮); common in dense UIs | Carbon OverflowMenu, Atlassian |
| Sub-menu | Cascading child menu opening on ArrowRight | Radix, Atlassian, Carbon |
| Checkbox/radio menu | Items with persistent checked state | Radix, Carbon, Material 3 |

**Norm** (≥4 systems agree): flat action list with separator groups; avoid > 2 nesting levels.
**Diverge**: Polaris uses ActionList as a shared primitive for both menus and select options; Carbon splits OverflowMenu from ContextMenu as separate components.

---

## States

| State | Trigger | Visual | ARIA |
|-------|---------|--------|------|
| closed | — | Trigger visible; overlay hidden | `aria-expanded="false"` on trigger |
| open | Click trigger | Overlay visible; first item focused | `aria-expanded="true"` on trigger |
| item-hover / focus | Arrow keys or pointer | Item highlight (8% overlay) | `tabindex="-1"` managed via roving tabindex |
| item-disabled | `disabled` prop | 38% opacity, cursor: default | `aria-disabled="true"` on item |
| checked | Toggle menuitemcheckbox | Checkmark icon visible | `aria-checked="true"` |
| submenu-open | ArrowRight on parent | Child menu visible | `aria-expanded="true"` on parent item |

---

## Sizing & Spacing

| Element | Value | Notes |
|---------|-------|-------|
| Min menu width | 160px | Prevents awkward narrow menus |
| Max menu width | 320px | Truncate labels with ellipsis beyond |
| Item height | 36px (md) | 32px compact, 40px comfortable |
| Item padding H | 12px | Icon if present: 16px left + 8px gap |
| Separator height | 1px + 4px V margin | Divider line |
| Icon size | 16px | Left-aligned, consistent with label baseline |

**Norm**: 36px item height (Radix default, Carbon, Atlassian). Min-width 160px prevents single-word menus.

---

## Typography

- Item label: body-sm (13–14px), weight 400 — not bold; action labels read as text, not controls
- Destructive items: same weight, color token `--color-text-danger`
- Keyboard shortcut hints: body-xs (11–12px), muted color, right-aligned, `aria-hidden="true"`
- Truncate item labels with `text-overflow: ellipsis`; never wrap item text

Cross-link: `reference/typography.md` — body-sm scale

---

## Keyboard & Accessibility

> **WAI-ARIA role**: `menu` (container), `menuitem` / `menuitemcheckbox` / `menuitemradio` (items)
> **Required attributes**: `aria-haspopup="menu"` + `aria-expanded` on trigger; `aria-labelledby` on `role="menu"`

### Keyboard Contract

*Quoted verbatim from WAI-ARIA APG — https://www.w3.org/WAI/ARIA/apg/patterns/menu-button/ — W3C — 2024*

| Key | Action |
|-----|--------|
| Enter / Space | Opens menu from trigger; activates focused item |
| ArrowDown | Moves focus to next item (wraps to first) |
| ArrowUp | Moves focus to previous item (wraps to last) |
| Escape | Closes menu; returns focus to trigger |
| Tab | Closes menu; moves focus to next focusable element (does not cycle through items) |
| Home | Moves focus to first item |
| End | Moves focus to last item |
| A–Z / a–z | Moves focus to next item starting with that character |
| ArrowRight | Opens sub-menu; moves focus to first item of sub-menu |
| ArrowLeft | Closes sub-menu; returns focus to parent item |

### Accessibility Rules

- Menu MUST open on click only — never on hover for primary open (hover may preview sub-menus)
- All items MUST be reachable by keyboard; no mouse-only items
- Focus returns to the trigger element when the menu closes
- Keyboard shortcut labels (e.g. "⌘K") are `aria-hidden="true"` — the shortcut must be registered separately
- `role="separator"` dividers are not focusable
- Disabled items use `aria-disabled="true"` (keep focusable so AT users know the option exists)

Cross-link: `reference/accessibility.md` — focus management, roving tabindex

---

## Motion

| Transition | Duration | Easing | Notes |
|------------|----------|--------|-------|
| Menu enter | 120ms | ease-out | Scale 0.95→1 + opacity 0→1 from anchor point |
| Menu exit | 80ms | ease-in | Opacity 1→0; skip scale-down for speed |
| Item highlight | 80ms | ease-out | Background color transition only |
| Sub-menu enter | 120ms | ease-out | Same as menu enter |

**BAN**: `transition: all` on menu items — triggers layout thrash on width changes.

Cross-link: `reference/motion.md` — overlay entry pattern, BAN-04

---

## Do / Don't

### Do
- Use `role="menu"` + `role="menuitem"` for all action menus *(WAI-ARIA APG)*
- Group related items with `role="separator"` — keep groups ≤ 7 items *(Carbon, Atlassian)*
- Return focus to the trigger on close *(WAI-ARIA APG)*
- Use `role="menuitemcheckbox"` for persistent toggle states *(Radix, Material 3)*

### Don't
- Don't open the menu on hover as the primary interaction — keyboard users can't discover hover *(WCAG 1.3.3)*
- Don't exceed 2 levels of sub-menus — deeply nested menus are cognitively expensive *(Atlassian, Carbon)*
- Don't put form controls (inputs, sliders) inside a menu — use a Popover instead *(WAI-ARIA APG)*
- Don't use `<div>` items without `role="menuitem"` — invisible to screen readers *(WAI-ARIA)*

---

## Anti-patterns Cross-links

| Anti-pattern | Entry |
|--------------|-------|
| BAN-04 | `transition: all` on interactive elements — `reference/anti-patterns.md#ban-04` |

---

## Benchmark Citations

| Claim | Sources |
|-------|---------|
| role="menu" + role="menuitem" contract | WAI-ARIA APG Menu Button pattern |
| Click-only open (not hover) | WAI-ARIA APG, WCAG 1.3.3, Carbon |
| ArrowRight/Left for sub-menu navigation | WAI-ARIA APG, Radix DropdownMenu |
| Focus returns to trigger on close | WAI-ARIA APG, Radix |
| 36px item height | Radix default, Carbon OverflowMenu, Atlassian |

Full system URLs: `connections/design-corpora.md`

---

## Grep Signatures

```bash
# Menu container missing role="menu"
grep -rn 'dropdown\|context-menu\|overflow-menu' src/ | grep -v 'role="menu"'

# Items using <div> without role="menuitem"
grep -rn '<div' src/ | grep -i 'menu-item\|menuitem\|menu__item' | grep -v 'role='

# Trigger missing aria-haspopup
grep -rn 'aria-expanded' src/ | grep -i 'menu\|dropdown' | grep -v 'aria-haspopup'

# Missing aria-labelledby on menu container
grep -rn 'role="menu"' src/ | grep -v 'aria-labelledby\|aria-label'
```

---

## Failing Example

```html
<!-- BAD: div list with click handlers but no ARIA roles -->
<div class="dropdown-menu">
  <div class="dropdown-item" onclick="handleEdit()">Edit</div>
  <div class="dropdown-item" onclick="handleDelete()">Delete</div>
</div>
```

**Why it fails**: No `role="menu"` or `role="menuitem"` — screen readers cannot announce this as a menu; items are not keyboard-navigable; no arrow-key navigation; trigger lacks `aria-haspopup` and `aria-expanded`.
**Grep detection**: `grep -rn '<div.*onclick\|<div.*onClick' src/ | grep -i 'menu\|dropdown'`
**Fix**: Use `<ul role="menu">` with `<li role="menuitem" tabindex="-1">` items, or a headless menu primitive (Radix DropdownMenu, Downshift).
