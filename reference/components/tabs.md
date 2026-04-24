# Tabs — Benchmark Spec

**Harvested from**: WAI-ARIA APG, Radix UI, Carbon, Mantine, Material 3, Chakra UI, Atlassian, Fluent 2
**Wave**: 2 · **Category**: Containers

---

## Purpose

Tabs organize content into parallel sections where only one section is visible at a time. Users navigate between tab panels without a page reload. Tabs differ from accordion (tabs are horizontal, panels mutually exclusive) and navigation (tabs do not change the URL in most implementations). The tab strip uses arrow-key navigation within the tablist, not Tab key. *(WAI-ARIA APG, Radix, Carbon all define this contract)*

---

## Anatomy

```
┌──────┬──────────┬──────┐
│ Tab1 │  Tab 2   │ Tab3 │  ← role="tablist"
└──────┴──────────┴──────┘    Each tab: role="tab" + aria-selected + aria-controls
────────────────────────────  Panel separator (visual only)
  Panel content               ← role="tabpanel" + aria-labelledby

Vertical tabs (sidebar):
┌──────────┬──────────────────┐
│ Tab 1    │                  │
│ Tab 2    │  Panel content   │
│ Tab 3    │                  │
└──────────┴──────────────────┘
```

| Part | Required | Notes |
|------|----------|-------|
| `role="tablist"` container | Yes | Wraps all tabs; `aria-label` or `aria-labelledby` |
| Tab triggers | Yes | `role="tab"`, `aria-selected`, `aria-controls` |
| Tab panels | Yes | `role="tabpanel"`, `aria-labelledby` (matching tab id) |
| Tab strip indicator | No | Underline or filled; shows selected tab |
| Overflow handling | Conditional | Scroll or dropdown when tabs overflow container |

---

## Variants

| Variant | Description | Systems |
|---------|-------------|---------|
| Default (horizontal) | Tab strip above panel | All |
| Vertical | Tab strip left of panel | Carbon, Material 3, Fluent |
| Underline | Underline indicator below selected tab | Material 3, shadcn, Atlassian |
| Filled / boxed | Selected tab has filled background | Carbon, Mantine, Fluent |
| Pill | Rounded tab shape | Mantine, Chakra |
| Scrollable | Horizontal scroll when tabs overflow | Material 3, Carbon |
| Icon + label | Icon above or beside label | Material 3, Carbon |

**Norm** (≥6/18): arrow keys navigate between tabs; Tab key moves to active panel content.
**Diverge**: automatic vs. manual activation — automatic (arrow key selects immediately) vs. manual (arrow key moves focus, Enter selects). WAI-ARIA APG recommends manual for complex panels; Radix defaults to automatic.

---

## States

| State | ARIA |
|-------|------|
| Selected tab | `aria-selected="true"`, `tabindex="0"` |
| Unselected tab | `aria-selected="false"`, `tabindex="-1"` |
| Focused tab | 2px focus ring; `tabindex="0"` moves to tab |
| Disabled tab | `aria-disabled="true"`, `tabindex="-1"` |
| Active panel | `role="tabpanel"`, visible, focusable |
| Inactive panel | `hidden` or `display:none` (removed from AT) |

---

## Sizing & Spacing

| Property | Value | Notes |
|----------|-------|-------|
| Tab height | 40–48px | Touch target compliance |
| Tab padding H | 16px | Minimum; increase for wider labels |
| Min tab width | 80px | Prevent cramped labels |
| Indicator thickness | 2–3px (underline) | On bottom edge of selected tab |
| Panel padding | 16–24px | |

---

## Typography

- Tab label: 14px/500 (selected), 14px/400 (unselected)
- Vertical tab label: 14px/400; left-aligned
- Tab count badge: 12px/600 in a pill; `aria-label` on tab includes count

---

## Keyboard & Accessibility

> **WAI-ARIA role**: `tablist` (container), `tab` (each trigger), `tabpanel` (each content panel)
> **Tab attributes**: `aria-selected`, `aria-controls` (panel id), `tabindex` (0 if selected, -1 if not)
> **Panel attributes**: `role="tabpanel"`, `aria-labelledby` (tab id), `tabindex="0"` (makes panel focusable)

### Keyboard Contract

*Quoted verbatim from WAI-ARIA APG — https://www.w3.org/WAI/ARIA/apg/patterns/tabs/ — W3C — 2024*

| Key | Action |
|-----|--------|
| Tab | When focus moves into the tab list, sets focus on the active tab. When the tab list has focus, Tab moves focus to the next element in the page tab sequence (the tabpanel or element after tablist). |
| Arrow Right | Moves focus to the next tab. If focus is on the last tab, moves to the first tab. |
| Arrow Left | Moves focus to the previous tab. If focus is on the first tab, moves to the last tab. |
| Arrow Down | (Vertical tabs) Moves focus to the next tab |
| Arrow Up | (Vertical tabs) Moves focus to the previous tab |
| Space / Enter | (Manual activation only) Activates the focused tab |
| Home | Moves focus to the first tab |
| End | Moves focus to the last tab |

### Activation Modes

- **Automatic**: arrow key moves focus AND activates the tab/panel simultaneously
- **Manual**: arrow key moves focus only; Enter/Space activates. Preferred for panels that have expensive load operations

### Accessibility Rules

- Only the selected tab has `tabindex="0"` — all other tabs have `tabindex="-1"` (roving tabindex pattern)
- `tablist` MUST have a label: `aria-label="[Section name]"` or `aria-labelledby`
- Inactive panels MUST be hidden with `hidden` attribute (not just CSS) so AT skips them
- Panel SHOULD have `tabindex="0"` to allow focusing the panel after Tab from the tablist
- Icon-only tabs MUST have `aria-label` on the tab element
- Linked tabs (tabs that change URL): use `role="link"` semantics or native `<a>` within tab — but note this changes the keyboard contract

---

## Motion

| Transition | Duration | Easing | Notes |
|------------|----------|--------|-------|
| Indicator slide | 200ms | ease-out | Underline slides between tabs |
| Panel fade | 150ms | ease | Crossfade between panels |
| Scroll reveal | 200ms | ease | When scrolling to new active tab in overflow |

Cross-link: `reference/motion.md` — `prefers-reduced-motion`: disable indicator slide + panel fade

---

## Do / Don't

### Do
- Use roving tabindex — `tabindex="0"` on selected, `tabindex="-1"` on all others *(WAI-ARIA APG)*
- Navigate with arrow keys between tabs, not Tab key *(WAI-ARIA APG)*
- Label the tablist with `aria-label` or `aria-labelledby` *(WAI-ARIA APG)*
- Hide inactive panels with `hidden` attribute so AT skips them *(WAI-ARIA APG)*

### Don't
- Don't use Tab key to navigate between tabs — Tab moves in/out of the tablist *(WAI-ARIA APG)*
- Don't show all tab panel content simultaneously — defeats the purpose of tabs *(all systems)*
- Don't use more than 7 tabs in a horizontal tab strip — prefer a select or dropdown for overflow *(Carbon, Atlassian)*
- Don't use tabs for steps that must be completed in order — use a stepper *(Material 3, Atlassian)*

---

## Anti-patterns Cross-links

| Anti-pattern | Entry |
|--------------|-------|
| Tab navigation with Tab key (not arrow keys) | `reference/anti-patterns.md` |
| All panels visible simultaneously | `reference/anti-patterns.md` |

---

## Benchmark Citations

| Claim | Sources |
|-------|---------|
| Arrow keys navigate tablist | WAI-ARIA APG §3.2 |
| Tab moves in/out of tablist | WAI-ARIA APG §3.2 |
| Roving tabindex pattern | WAI-ARIA APG |
| hidden attr on inactive panels | WAI-ARIA APG |
| aria-selected="true" on active tab | WAI-ARIA APG, all systems |

Full system URLs: `connections/design-corpora.md`

---

## Grep Signatures

```bash
# Tabs using Tab key navigation instead of arrow keys
grep -rn 'role="tab"' src/ | xargs grep -l 'onKeyDown.*Tab\|key.*Tab' 2>/dev/null | grep -v 'ArrowLeft\|ArrowRight'

# Tab missing aria-selected
grep -rn 'role="tab"' src/ | grep -v 'aria-selected'

# Inactive panel not hidden (just CSS)
grep -rn 'role="tabpanel"' src/ | grep -v 'hidden\|aria-hidden'

# tablist missing accessible label
grep -rn 'role="tablist"' src/ | grep -v 'aria-label\|aria-labelledby'
```

---

## Failing Example

```html
<!-- BAD: tabs using Tab key for navigation + no aria attributes -->
<div class="tab-list">
  <button class="tab active">Overview</button>
  <button class="tab">Details</button>
  <button class="tab">Reviews</button>
</div>
<div class="tab-panel active">Overview content</div>
<div class="tab-panel">Details content</div>
<div class="tab-panel">Reviews content</div>
```

**Why it fails**: No `role="tablist"`, `role="tab"`, `role="tabpanel"`. No `aria-selected`. No `aria-controls`/`aria-labelledby`. Tab key moves between buttons instead of arrow keys. Inactive panels are not hidden from AT.
**Grep detection**: `grep -rn 'class.*tab\b' src/ | grep -v 'role='`
**Fix**: Use Radix `<Tabs>` or implement WAI-ARIA tabs pattern with `role="tablist"`, `role="tab"` (with `aria-selected`, `aria-controls`, roving tabindex), `role="tabpanel"` (with `aria-labelledby`), and arrow-key handlers.
