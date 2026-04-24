# Command Palette — Benchmark Spec

**Harvested from**: Linear, Raycast, Radix CMDK, GitHub Primer, UUPM (app-interface, MIT)
**Wave**: 4 · **Category**: Navigation & Data

---

## Purpose

A command palette is a keyboard-first global launcher that lets users search across commands, pages, and actions from anywhere in the application without navigating menus. Triggered by Cmd+K (macOS) / Ctrl+K (Windows/Linux), it provides fast access to frequently used actions and deep navigation. It is distinct from a local search input (scoped to one page) and from a Menu (contextual, anchored). *(Linear command palette, Raycast, Radix CMDK, GitHub Primer all converge on Cmd/Ctrl+K trigger + dialog + combobox + listbox pattern)*

---

## Anatomy

```
┌─────────────────────────────────────────────────┐
│ role="dialog" aria-modal="true"                 │
│ aria-label="Command palette"                    │
│ ┌─────────────────────────────────────────────┐ │
│ │ 🔍 [Search commands…              ]         │ │  role="combobox"
│ └─────────────────────────────────────────────┘ │  aria-autocomplete="list"
│ ┌─────────────────────────────────────────────┐ │
│ │ role="listbox" id="cmd-results"             │ │
│ │ ── Recent ──────────  role="group"          │ │
│ │   Dashboard            role="option"        │ │
│ │ ── Commands ──────────  role="group"        │ │
│ │ ▶ New Project          role="option" ●      │ │  aria-selected="true"
│ │   Invite member        role="option"        │ │
│ └─────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────┘
```

| Part | Required | Notes |
|------|----------|-------|
| Dialog overlay | Yes | `role="dialog"` + `aria-modal="true"` + `aria-label="Command palette"` |
| Focus trap | Yes | Tab/Shift+Tab cycle within dialog only |
| Search input | Yes | `role="combobox"` + `aria-expanded` + `aria-autocomplete="list"` + `aria-controls` |
| Results list | Yes | `role="listbox"` + `id` (target of `aria-controls`) |
| Result items | Yes | `role="option"` + `aria-selected` |
| Section groups | No | `role="group"` + `aria-label` per section (Recent, Commands, Pages) |
| Empty state | Yes | "No results for X" text; `aria-live="polite"` on result region |
| Keyboard shortcut hints | No | `aria-hidden="true"`; display-only |

---

## Variants

| Variant | Description | Systems |
|---------|-------------|---------|
| Default | Cmd/Ctrl+K global trigger; full-width results | Linear, Raycast, Radix CMDK |
| Inline search | Embedded within a page; narrower context | Primer, Atlassian |
| Global search | Cross-section nav + recent pages + action shortcuts | UUPM app-interface (MIT) |
| With categories | Grouped results by type (Recent / Commands / Pages) | Linear, Raycast, UUPM |
| With icons | Category and action icons beside results | Linear, Raycast |
| Nested commands | Select a command to reveal sub-commands | Raycast, Radix CMDK |

**Norm** (≥4 systems agree): `role="dialog"` + focus trap + `role="combobox"` input + `role="listbox"` results.
**Diverge**: Raycast supports nested command flows (select command → enter parameters); Linear/CMDK keep it flat for speed.

---

## States

| State | Trigger | Visual | ARIA |
|-------|---------|--------|------|
| closed | — | Dialog hidden | — |
| open | Cmd/Ctrl+K | Dialog visible; input focused | `aria-expanded="true"` on combobox |
| empty | no query | Placeholder or recent items | `aria-expanded="true"` |
| searching | typing | Results update in real-time | `aria-live="polite"` on results region |
| result-focus | ArrowDown/Up | Item highlighted | `aria-selected="true"` on option |
| no-results | no matches | "No results for X" message | `aria-live="polite"` announces update |
| loading | async search | Spinner in input or results | `aria-busy="true"` on listbox |

---

## Sizing & Spacing

| Element | Value | Notes |
|---------|-------|-------|
| Dialog width | 560–640px | Centered horizontally |
| Dialog max-height | 480px | Results region scrolls beyond this |
| Input height | 48–56px | Generous; primary interaction surface |
| Result item height | 40px | Icon + label + shortcut hint |
| Section label height | 28px | Muted heading; non-interactive |
| Backdrop | 40–60% opacity black | `rgba(0,0,0,0.5)`; click to dismiss |

**Norm**: 560–640px width (Linear, Raycast, CMDK all converge). Input height 48px+ for legibility.

---

## Typography

- Input placeholder: body-md (15–16px), `color: --text-placeholder`
- Input value: body-md (15–16px), weight 400
- Result item label: body-sm (13–14px), weight 400; matched substring bold/highlighted
- Section heading: label-xs (11px), uppercase, weight 600, `color: --text-subtle`, `aria-hidden="true"` if role="group" handles it
- Keyboard shortcut hints: label-xs (11px), `color: --text-subtle`, right-aligned, `aria-hidden="true"`

Cross-link: `reference/typography.md` — body-md, label scale

---

## Keyboard & Accessibility

> **WAI-ARIA role**: `dialog` (overlay), `combobox` (input), `listbox` (results), `option` (items), `group` (sections)
> **Required attributes**: `aria-modal="true"` on dialog; `aria-label="Command palette"` on dialog; `aria-expanded` + `aria-autocomplete="list"` + `aria-controls` on combobox; `aria-selected` on options; `aria-label` on each `role="group"`

### Keyboard Contract

*Quoted verbatim from WAI-ARIA APG — https://www.w3.org/WAI/ARIA/apg/patterns/combobox/ and https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/ — W3C — 2024*

| Key | Action |
|-----|--------|
| Cmd+K / Ctrl+K | Opens the command palette (global shortcut) |
| ArrowDown | Moves focus to first result (from input) or next result |
| ArrowUp | Moves focus to previous result; loops to input |
| Home | Moves focus to first result in list |
| End | Moves focus to last result in list |
| Enter | Executes the selected result |
| Escape | Closes the palette; returns focus to trigger element |
| Tab / Shift+Tab | Cycles focus within dialog (focus trap) |

### Accessibility Rules

- Dialog MUST have `aria-modal="true"` — prevents AT from reading content outside the palette
- `role="combobox"` input MUST have `aria-controls` pointing to the `role="listbox"` `id`
- `aria-live="polite"` on the results region ensures AT announces result count changes and empty state
- Focus MUST be trapped within the dialog while it is open (Tab/Shift+Tab cycle inside)
- On close, focus MUST return to the element that triggered the palette (not body)
- Keyboard shortcut hints (`⌘K`, `↵`) MUST be `aria-hidden="true"` — the shortcut must be registered separately

Cross-link: `reference/accessibility.md` — dialog focus trap, combobox pattern, live regions

---

## Motion

| Transition | Duration | Easing | Notes |
|------------|----------|--------|-------|
| Dialog open | 150ms | ease-out | Scale 0.96→1 + opacity 0→1 |
| Dialog close | 100ms | ease-in | Opacity 1→0 |
| Results update | 80ms | ease-out | Fade new results; avoid reflow |
| Backdrop fade in | 150ms | ease-out | Opacity 0→0.5 |
| Item selection flash | 80ms | ease-out | Brief fill before execute |

**BAN**: Do not animate result item reordering as the user types — causes visual instability and is disorienting for AT users with animations enabled.

Cross-link: `reference/motion.md` — dialog entry, BAN-04

---

## Do / Don't

### Do
- Trap focus inside the dialog while open *(WAI-ARIA APG dialog pattern, WCAG 2.1.2)*
- Set `aria-live="polite"` on the results region *(WCAG 4.1.3, Radix CMDK)*
- Return focus to the trigger element on close *(WAI-ARIA APG)*
- Use `role="group"` + `aria-label` for result sections *(WAI-ARIA APG, Linear, Raycast)*

### Don't
- Don't build a custom overlay without `role="dialog"` + `aria-modal` — screen readers will read background content *(WCAG 1.3.1)*
- Don't omit `aria-controls` on the combobox — AT cannot associate input with results *(WAI-ARIA APG combobox)*
- Don't open on hover or auto-focus — Cmd/Ctrl+K is the expected trigger *(Linear, Raycast convention)*
- Don't dismiss on every Escape keypress inside nested command flows — first Escape should exit sub-level, second closes palette *(Raycast, Linear)*

---

## Anti-patterns Cross-links

| Anti-pattern | Entry |
|--------------|-------|
| BAN-04 | `transition: all` on results list — `reference/anti-patterns.md#ban-04` |

---

## Benchmark Citations

| Claim | Sources |
|-------|---------|
| role="dialog" + aria-modal="true" + focus trap | WAI-ARIA APG dialog pattern |
| role="combobox" + aria-controls for input | WAI-ARIA APG combobox pattern |
| Cmd/Ctrl+K universal trigger | Linear, Raycast, GitHub, VS Code (industry convention) |
| aria-live="polite" on results region | WAI-ARIA APG, WCAG 4.1.3 |
| role="group" + aria-label for result sections | WAI-ARIA APG, Radix CMDK |

Full system URLs: `connections/design-corpora.md`

---

## Grep Signatures

```bash
# Dialog overlay missing aria-modal
grep -rn 'command.*palette\|cmdk\|command-menu' src/ | grep 'role="dialog"' | grep -v 'aria-modal'

# Combobox missing aria-controls pointing to listbox
grep -rn 'role="combobox"' src/ | grep -v 'aria-controls'

# Results listbox missing id (needed for aria-controls target)
grep -rn 'role="listbox"' src/ | grep -v 'id='

# Missing aria-live on results region
grep -rn 'command.*palette\|cmd.*results\|cmdk' src/ | grep 'results\|listbox' | grep -v 'aria-live'
```

---

## Failing Example

```html
<!-- BAD: custom overlay with keyboard handling but no ARIA roles -->
<div class="command-palette" style="display:block">  <!-- no role="dialog", no aria-modal -->
  <input type="text" placeholder="Search commands…">  <!-- no role="combobox", no aria-controls -->
  <div class="results">  <!-- no role="listbox" -->
    <div class="result-item active" onclick="execute('new-project')">
      New Project
    </div>
    <div class="result-item" onclick="execute('invite')">
      Invite member
    </div>
  </div>
</div>
```

**Why it fails**: No `role="dialog"` — AT does not treat this as a modal, and screen readers continue reading background content; no focus trap; input lacks `role="combobox"` and `aria-controls`; results have no `role="listbox"`; items have no `role="option"` or `aria-selected`; no `aria-live` region for result updates.
**Grep detection**: `grep -rn 'command.*palette\|cmdk\|command-menu' src/ | grep '<div' | grep -v 'role='`
**Fix**: Use `role="dialog"` + `aria-modal="true"` on the overlay; implement focus trap; add `role="combobox"` + `aria-controls` to input; add `role="listbox"` to results container; add `role="option"` + `aria-selected` to each item; add `aria-live="polite"` to results region.
