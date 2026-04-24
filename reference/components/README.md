# Component Benchmark Corpus

Per-component design specifications harvested from 18 major design systems.
Each spec is ≤350 lines, greppable, diff-friendly, and agent-consumable.

**Spec shape**: `TEMPLATE.md` — Purpose · Anatomy · Variants · States · Sizing ·
Typography · Keyboard/a11y · Motion · Do/Don't · Anti-patterns · Citations · Grep signatures

**Harvest source list**: `connections/design-corpora.md` (18 systems)
**Tooling**: `agents/component-benchmark-harvester.md` → `agents/component-benchmark-synthesizer.md`
**CLI**: `/gdd:benchmark <component>` — see `skills/benchmark/SKILL.md`

---

## Wave 1 — Inputs (foundational)

| Component | Spec | Purpose |
|-----------|------|---------|
| Button | [button.md](button.md) | Triggers actions; primary, secondary, ghost, destructive variants |
| Input | [input.md](input.md) | Single-line text entry with label, error, helper text |
| Select / Combobox | [select-combobox.md](select-combobox.md) | Choose one option from a list; keyboard-navigable dropdown |
| Checkbox | [checkbox.md](checkbox.md) | Binary or indeterminate choice; groupable with fieldset |
| Radio | [radio.md](radio.md) | Mutually exclusive choice within a group |
| Switch | [switch.md](switch.md) | Binary toggle with immediate effect (vs. checkbox form submission) |
| Link | [link.md](link.md) | Navigation anchor; inline or standalone; external-link pattern |
| Label | [label.md](label.md) | Accessible association between caption and form control |

---

## Wave 2 — Containers

| Component | Spec | Purpose |
|-----------|------|---------|
| Card | [card.md](card.md) | Contained content surface; clickable or static |
| Modal / Dialog | [modal-dialog.md](modal-dialog.md) | Blocking overlay with focus trap and backdrop |
| Drawer / Sheet | [drawer.md](drawer.md) | Side or bottom sliding panel |
| Popover | [popover.md](popover.md) | Anchored overlay; dismisses on outside-click or Escape |
| Tooltip | [tooltip.md](tooltip.md) | Hover/focus-triggered label; no interactive content |
| Accordion | [accordion.md](accordion.md) | Collapsible content sections; single or multi-open |
| Tabs | [tabs.md](tabs.md) | Horizontal/vertical tab navigation with keyboard support |

---

## Wave 3 — Feedback

| Component | Spec | Purpose |
|-----------|------|---------|
| Toast / Snackbar | [toast.md](toast.md) | Ephemeral status notification; auto-dismisses 4–8s |
| Alert / Banner | [alert.md](alert.md) | Persistent inline status message; four severity variants |
| Progress | [progress.md](progress.md) | Linear and circular completion indicator; determinate + indeterminate |
| Skeleton | [skeleton.md](skeleton.md) | Loading placeholder matching content shape |
| Badge | [badge.md](badge.md) | Numeric or status indicator overlaid on another element |
| Chip / Tag | [chip.md](chip.md) | Compact toggleable/removable label; filter, input, suggestion, display |

---

## Wave 4 — Navigation & Data *(v1.17.0 · plan 17-02)*

| Component | Spec | Purpose |
|-----------|------|---------|
| Menu | [menu.md](menu.md) | Dropdown and context menu; action list with ARIA menu roles |
| Navbar | [navbar.md](navbar.md) | Top navigation bar; primary nav + skip link + mobile hamburger |
| Sidebar | [sidebar.md](sidebar.md) | Collapsible side navigation panel; icon+label / icon-only states |
| Breadcrumbs | [breadcrumbs.md](breadcrumbs.md) | Hierarchical location trail; aria-current + hidden separators |
| Pagination | [pagination.md](pagination.md) | Page-set navigation; previous/next + page buttons + per-page |
| Table | [table.md](table.md) | Data table with sorting, selection, sticky header, virtualisation |
| List | [list.md](list.md) | Display list (`<ul>/<ol>`) and interactive listbox (`role="listbox"`) |
| Tree | [tree.md](tree.md) | Hierarchical tree view; expand/collapse with full ARIA tree roles |
| Command Palette | [command-palette.md](command-palette.md) | Global Cmd/Ctrl+K launcher; dialog + combobox + listbox pattern |

---

## Wave 5 — Data & Advanced

| Component | Spec | Purpose |
|-----------|------|---------|
| Date Picker | [date-picker.md](date-picker.md) | Calendar-based date/range selection; input + popover variants |
| Slider | [slider.md](slider.md) | Single-value and range thumb on a track; full keyboard contract |
| File Upload | [file-upload.md](file-upload.md) | Drag-drop zone + accessible file input; per-file progress list |
| Rich-Text Editor | [rich-text-editor.md](rich-text-editor.md) | WYSIWYG authoring with contenteditable + toolbar + mentions |
| Stepper / Wizard | [stepper.md](stepper.md) | Sequential multi-step flow; role="list" (not tablist) |

---

## Coverage Summary

| Wave | Specs | Status |
|------|-------|--------|
| Wave 1 — Inputs | 8 | v1.16.0 |
| Wave 2 — Containers | 7 | v1.16.0 |
| Wave 3 — Feedback | 6 | v1.17.0 |
| Wave 4 — Navigation & Data | 9 | v1.17.0 |
| Wave 5 — Data & Advanced | 5 | v1.17.0 |
| **Total** | **35** | — |
