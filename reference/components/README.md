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

## Wave 3 — Feedback *(Phase 17)*

| Component | Spec | Purpose |
|-----------|------|---------|
| Toast / Snackbar | — | Ephemeral status notification |
| Alert / Banner | — | Persistent inline status message |
| Progress | — | Linear and circular completion indicator |
| Skeleton | — | Loading placeholder matching content shape |
| Badge | — | Numeric or status indicator overlaid on another element |
| Chip / Tag | — | Compact, dismissible label |

---

## Wave 4 — Navigation *(Phase 17)*

| Component | Spec | Purpose |
|-----------|------|---------|
| Breadcrumb | — | Hierarchical location trail |
| Pagination | — | Page-set navigation |
| Stepper | — | Sequential multi-step progress indicator |
| Navigation Menu | — | Top-level or sidebar navigation |
| Command Menu | — | Keyboard-first search + action launcher |

---

## Wave 5 — Data & Advanced *(Phase 17)*

| Component | Spec | Purpose |
|-----------|------|---------|
| Table / Data Grid | — | Tabular data with sorting, filtering, selection |
| Date Picker | — | Calendar-based date/range selection |
| File Upload | — | Drag-drop or browse file input |
| Rich Text Editor | — | WYSIWYG content authoring |
| Virtualized List | — | Windowed rendering for large datasets |

---

## Coverage Summary

| Wave | Specs | Status |
|------|-------|--------|
| Wave 1 — Inputs | 8 | v1.16.0 |
| Wave 2 — Containers | 7 | v1.16.0 |
| Wave 3 — Feedback | 6 | Phase 17 |
| Wave 4 — Navigation | 5 | Phase 17 |
| Wave 5 — Data & Advanced | 5 | Phase 17 |
| **Total** | **31** | — |
