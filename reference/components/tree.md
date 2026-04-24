# Tree View (Hierarchical Navigation) — Benchmark Spec

**Harvested from**: WAI-ARIA APG, Carbon, Atlassian, Radix, Material 3
**Wave**: 4 · **Category**: Navigation & Data

---

## Purpose

A tree view displays hierarchical data in a collapsible structure of parent and child nodes. It is used for file systems, organisational charts, nested settings, and category navigation. Each node can be expanded (revealing children) or collapsed. Nodes may be selectable, checkable, or action-only. *(WAI-ARIA APG Tree View, Carbon TreeView, Atlassian Tree, Radix all define the tree as a hierarchical, keyboard-navigable disclosure widget)*

---

## Anatomy

```
<ul role="tree" aria-label="File explorer">
  <li role="treeitem" aria-expanded="true" aria-level="1">
    <span>📁 src</span>
    <ul role="group">
      <li role="treeitem" aria-level="2" aria-selected="false">
        <span>📄 index.ts</span>
      </li>
      <li role="treeitem" aria-expanded="false" aria-level="2">
        <span>📁 components</span>
        <ul role="group">  <!-- hidden when collapsed -->
          <li role="treeitem" aria-level="3">📄 Button.tsx</li>
        </ul>
      </li>
    </ul>
  </li>
</ul>
```

| Part | Required | Notes |
|------|----------|-------|
| `role="tree"` root | Yes | On the outermost list; `aria-label` or `aria-labelledby` |
| `role="treeitem"` | Yes | On every node `<li>` |
| `role="group"` | Yes (on child lists) | Child `<ul>` inside an expandable `treeitem` |
| `aria-expanded` | Required on expandable nodes | `"true"` / `"false"`; omit on leaf nodes |
| `aria-level` | Yes | Nesting depth; starts at 1 |
| `aria-selected` | Yes on selectable trees | `"true"` / `"false"` on each treeitem |
| `aria-multiselectable` | No | `"true"` on `role="tree"` for multi-select |
| `aria-busy` | Conditional | `"true"` on node while fetching children (lazy load) |

---

## Variants

| Variant | Description | Systems |
|---------|-------------|---------|
| Default | Expand/collapse only; no selection | WAI-ARIA APG, Carbon |
| Single-select | One item selectable; `aria-selected` | WAI-ARIA APG, Carbon, Radix |
| Multi-select | Multiple items selectable; `aria-multiselectable` | WAI-ARIA APG, Carbon |
| Checkbox tree | Each node has a checkbox; indeterminate state for partial parent | Carbon, Material 3 |
| Lazy-loaded | Children fetched on expand; `aria-busy` during fetch | Carbon, Atlassian |
| File explorer | File/folder icons; drag-to-reorder | Carbon, Radix |

**Norm** (≥4 systems agree): `role="tree"` + `role="treeitem"` + `role="group"` on child lists; `aria-expanded` on parent nodes; keyboard navigation with arrow keys.
**Diverge**: Carbon renders `aria-level` as a data attribute for CSS depth indentation; Radix computes `aria-level` implicitly from DOM nesting depth.

---

## States

| State | Trigger | Visual | ARIA |
|-------|---------|--------|------|
| node-default | — | Icon + label; indented by level | — |
| node-hover | pointer over | 8% overlay on row | — |
| node-focus | keyboard focus | 2px focus-visible ring on row | `tabindex="0"` on focused; `-1` on rest |
| node-selected | click or Enter/Space | Filled row highlight | `aria-selected="true"` |
| node-expanded | toggle click or ArrowRight | Children visible; icon rotated/open | `aria-expanded="true"` |
| node-collapsed | toggle click or ArrowLeft | Children hidden; icon closed | `aria-expanded="false"` |
| node-loading | expand triggers fetch | Spinner icon beside label | `aria-busy="true"` |
| node-disabled | disabled prop | 38% opacity; cursor: default | `aria-disabled="true"` |

---

## Sizing & Spacing

| Element | Value | Notes |
|---------|-------|-------|
| Node height | 32–36px | Compact tree; denser than lists |
| Level indent | 16–20px per level | CSS left-padding on `role="group"` |
| Expand icon | 16px | Chevron or ▶ triangle; rotates on expand |
| Node icon | 16px | File/folder/custom; left of label |
| Max nesting depth (recommended) | 5–6 levels | Deeper trees become hard to navigate |

**Norm**: 16–20px per level indentation (Carbon, Atlassian, Radix). 32–36px node height for compact data.

---

## Typography

- Node label: body-sm (13–14px), weight 400; selected node weight 500
- Level depth: visual indentation only — no font-size reduction per level
- Disabled node: same font size, `color: --text-disabled`

Cross-link: `reference/typography.md` — body-sm

---

## Keyboard & Accessibility

> **WAI-ARIA role**: `tree` (root), `treeitem` (each node), `group` (child list)
> **Required attributes**: `aria-expanded` on expandable nodes; `aria-level` on each treeitem; `aria-selected` on selectable treeitems; `aria-label` on root `role="tree"`

### Keyboard Contract

*Quoted verbatim from WAI-ARIA APG — https://www.w3.org/WAI/ARIA/apg/patterns/treeview/ — W3C — 2024*

| Key | Action |
|-----|--------|
| ArrowDown | Moves focus to next visible treeitem (skips collapsed children) |
| ArrowUp | Moves focus to previous visible treeitem |
| ArrowRight | If collapsed: expands node. If expanded: moves focus to first child |
| ArrowLeft | If expanded: collapses node. If collapsed: moves focus to parent |
| Home | Moves focus to first treeitem in tree |
| End | Moves focus to last visible treeitem in tree |
| Enter / Space | Selects or activates focused treeitem |
| Asterisk (*) | Expands all siblings at the same level |
| A–Z / a–z | Jumps to next treeitem matching typed character |

### Accessibility Rules

- ALL expandable nodes MUST have `aria-expanded` — CSS-only expand/collapse is invisible to AT
- `aria-level` must accurately reflect nesting depth (1-based) on every `role="treeitem"`
- Child `<ul>` MUST have `role="group"` — without it, AT cannot perceive the parent-child relationship
- Focus management uses roving `tabindex`: only the active node has `tabindex="0"`; all others `tabindex="-1"`
- Lazy-loaded nodes MUST set `aria-busy="true"` while fetching; remove when complete
- Multi-select tree MUST set `aria-multiselectable="true"` on the `role="tree"` element

Cross-link: `reference/accessibility.md` — tree pattern, roving tabindex, aria-busy

---

## Motion

| Transition | Duration | Easing | Notes |
|------------|----------|--------|-------|
| Expand children | 150ms | ease-out | Height expand via `overflow: hidden` |
| Collapse children | 120ms | ease-in | Height collapse |
| Chevron rotate | 150ms | ease-in-out | 0° → 90° on expand |
| Node selection highlight | 100ms | ease-out | Background color only |
| Lazy-load spinner | continuous | linear | Replace with content on load |

**BAN**: Do not use CSS-only `display: none` / `display: block` to toggle children without updating `aria-expanded` — both changes must happen atomically.

Cross-link: `reference/motion.md` — disclosure animations

---

## Do / Don't

### Do
- Use `role="tree"` + `role="treeitem"` + `role="group"` on every tree *(WAI-ARIA APG)*
- Update `aria-expanded` in the same event handler that toggles child visibility *(WAI-ARIA APG)*
- Use `aria-busy="true"` on a node while its children are loading *(WAI-ARIA APG, Carbon)*
- Limit tree depth to 5–6 levels to prevent cognitive overload *(Carbon, Atlassian HIG)*

### Don't
- Don't use `<ul>/<li>` tree without `role="tree"` + `role="treeitem"` — semantically invisible to AT *(WCAG 1.3.1)*
- Don't forget `role="group"` on child `<ul>` — AT cannot infer parent-child structure without it *(WAI-ARIA APG)*
- Don't manage expand/collapse with CSS only (no `aria-expanded`) — blind users cannot discover collapsed state *(WCAG 4.1.2)*
- Don't indent via `aria-level` alone — also apply visual CSS indentation for sighted users *(Material 3, Carbon)*

---

## Anti-patterns Cross-links

| Anti-pattern | Entry |
|--------------|-------|
| BAN-04 | `transition: all` on tree nodes — `reference/anti-patterns.md#ban-04` |

---

## Benchmark Citations

| Claim | Sources |
|-------|---------|
| role="tree" + role="treeitem" + role="group" structure | WAI-ARIA APG tree pattern |
| aria-expanded required on all expandable nodes | WAI-ARIA APG, Carbon, Atlassian |
| aria-level for nesting depth | WAI-ARIA APG |
| Roving tabindex focus management | WAI-ARIA APG |
| aria-busy="true" during lazy load | WAI-ARIA APG, Carbon |

Full system URLs: `connections/design-corpora.md`

---

## Grep Signatures

```bash
# <ul>/<li> tree without role="tree" + role="treeitem"
grep -rn 'tree\|file.*explorer\|folder.*tree' src/ | grep '<ul\|<li' | grep -v 'role="tree"\|role="treeitem"'

# Expandable node missing aria-expanded
grep -rn 'role="treeitem"' src/ | grep 'expand\|collaps' | grep -v 'aria-expanded'

# Child list missing role="group"
grep -rn 'role="treeitem"' src/ | grep -A 2 'aria-expanded' | grep '<ul' | grep -v 'role="group"'

# Tree missing aria-label
grep -rn 'role="tree"' src/ | grep -v 'aria-label\|aria-labelledby'
```

---

## Failing Example

```html
<!-- BAD: CSS-only expand/collapse with no aria-expanded updates -->
<ul class="tree">
  <li class="tree-node has-children expanded">  <!-- CSS class only; no ARIA -->
    <span onclick="toggle(this)">📁 src</span>
    <ul class="children">  <!-- no role="group" -->
      <li class="tree-node">📄 index.ts</li>
    </ul>
  </li>
</ul>
```

**Why it fails**: No `role="tree"` or `role="treeitem"`; no `aria-expanded` — screen readers cannot tell if the node is open or closed; `role="group"` missing on child list; no `aria-level`; expand/collapse is click-only (no keyboard).
**Grep detection**: `grep -rn 'class.*tree\|treeview' src/ | grep '<ul\|<li' | grep -v 'role='`
**Fix**: Add `role="tree"` to root `<ul>`; `role="treeitem"` + `aria-expanded` + `aria-level` to each node; `role="group"` to child `<ul>`; implement arrow-key navigation with roving tabindex.
