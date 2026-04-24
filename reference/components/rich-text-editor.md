# Rich-Text Editor — Benchmark Spec

**Harvested from**: Tiptap/ProseMirror, Lexical (Meta), Slate.js, Atlassian Fabric Editor
**Wave**: 5 · **Category**: Advanced
**Spec file**: `reference/components/rich-text-editor.md`

---

## Purpose

A Rich-Text Editor (RTE) provides WYSIWYG content authoring with inline formatting (bold, italic, links), block-level elements (headings, lists, blockquotes), and optional advanced features (mentions, embeds, tables). It is appropriate for long-form content where plain `<textarea>` is insufficient and a full CMS-style document editor is overkill. *(Tiptap, Lexical, Atlassian agree: contenteditable + ProseMirror/Lexical model + explicit toolbar is the production-grade RTE pattern.)*

---

## Anatomy

```
┌── role="toolbar" aria-label="Text formatting" ──────────────────┐
│ [B] [I] [U] [S] │ [H1][H2] │ [• List][1. List] │ [Link][Image] │
└──────────────────────────────────────────────────────────────────┘
┌── role="textbox" aria-multiline="true" aria-label="Post body" ──┐
│                                                                  │
│  Start typing here…  (placeholder via CSS ::before)             │
│                                                                  │
└──────────────────────────────────────────────────────────────────┘
```

| Part | Required | Notes |
|------|----------|-------|
| Editable area | Yes | `contenteditable="true"` + `role="textbox"` + `aria-multiline="true"` |
| Toolbar | Yes (for formatting) | `role="toolbar"` + `aria-label`; groups via `role="group"` |
| Toolbar buttons | Yes | `role="button"`; toggle buttons add `aria-pressed` |
| Placeholder | No | CSS `[data-placeholder]::before` — NOT HTML attribute |
| Mention list | No | `role="listbox"` floating suggestion list triggered by `@` |
| Character count | No | `aria-live="polite"` updated region |
| Read-only overlay | No | `contenteditable="false"` + `aria-readonly="true"` |

---

## Variants

| Variant | Description | Systems |
|---------|-------------|---------|
| Minimal | Bold/italic/underline + link only | Tiptap (StarterKit minimal), Atlassian (inline comment) |
| Standard | Full paragraph formatting + lists + links | Tiptap, Lexical, Slate |
| Document | Full editor with headings, tables, embeds, mentions | Atlassian Fabric Editor, Tiptap (full), Lexical (full) |
| Read-only | Rendered content; no editing | All systems |
| Bubble toolbar | Formatting toolbar appears on text selection (tooltip style) | Tiptap, Atlassian inline editor |

**Norm** (≥3/4 systems agree): toolbar at top or on selection; contenteditable with explicit role="textbox"; keyboard shortcuts for core formatting.
**Diverge**: Atlassian uses a floating toolbar on selection; Tiptap supports both fixed and bubble modes; Lexical uses a plugin architecture; Slate treats everything as React tree nodes.

---

## States

| State | Trigger | Visual | ARIA |
|-------|---------|--------|------|
| default | — | Cursor; toolbar buttons at rest | — |
| focused | Click or Tab into editable area | Focus ring on editable container | — |
| toolbar button active | Text with formatting selected | `aria-pressed="true"` on toggle button | `aria-pressed="true"` |
| placeholder | No content in editable area | Placeholder text via CSS ::before | — |
| read-only | `readOnly` prop | No cursor change; grayed toolbar | `aria-readonly="true"`, `contenteditable="false"` |
| disabled | `disabled` prop | 38% opacity; no interaction | `aria-disabled="true"` |
| mention-open | `@` typed | Floating listbox appears | `role="listbox"` visible |
| error | Validation failure | Red border; error message below | `aria-describedby` → error message |

---

## Sizing & Spacing

| Size | Min Height | Toolbar Height | Font |
|------|-----------|----------------|------|
| sm | 80px | 32px | 13px |
| md (default) | 160px | 40px | 14px |
| lg | 320px | 48px | 16px |

**Norm**: Editor area grows with content (auto-height); enforce max-height with overflow scroll if needed. Toolbar buttons follow button-sm/md sizing with 8px gaps between groups *(Atlassian, Tiptap)*.

Cross-link: `reference/surfaces.md` — toolbar button hit targets.

---

## Typography

- Editor content: body-md, line-height 1.6 for readable long-form text
- Heading 1: 2em; Heading 2: 1.5em; Heading 3: 1.25em — relative to editor base font
- Code blocks: monospace, 0.9em, background token surface-code
- Placeholder text: same size/font as body, secondary color via CSS

Cross-link: `reference/typography.md` — heading scale, code font stack.

---

## Keyboard & Accessibility

> **WAI-ARIA role**: `textbox` (editable area), `toolbar` (toolbar container), `group` (toolbar sections), `button` (toolbar actions), `listbox` (mention suggestions)
> **Required attributes**: `role="textbox"` + `aria-multiline="true"` + `aria-label` or `aria-labelledby` on editable area; `aria-pressed` on toggle toolbar buttons; `role="toolbar"` + `aria-label` on toolbar

### Keyboard Contract

*Derived from WAI-ARIA APG toolbar pattern — https://www.w3.org/WAI/ARIA/apg/patterns/toolbar/ — W3C — 2024, and standard contenteditable browser behavior*

| Key | Action |
|-----|--------|
| Tab | Move focus into the editable area from outside; move out of editor |
| Ctrl/Cmd + B | Toggle bold on selected text |
| Ctrl/Cmd + I | Toggle italic on selected text |
| Ctrl/Cmd + U | Toggle underline on selected text |
| Ctrl/Cmd + Z | Undo last action |
| Ctrl/Cmd + Shift + Z | Redo |
| Ctrl/Cmd + K | Insert or edit link |
| @ (in editor) | Trigger mention suggestion list |
| Arrow keys (in listbox) | Navigate mention suggestions |
| Enter / Space (in listbox) | Select mention suggestion |
| Escape (in listbox) | Dismiss mention list |
| F10 or Alt + F10 | Move focus from editable area to toolbar (accessibility shortcut) |
| Arrow keys (in toolbar) | Move between toolbar buttons (roving tabindex) |
| Home / End (in toolbar) | First / last toolbar button |

### Accessibility Rules

- Editable area MUST have `role="textbox"` — bare `contenteditable` is announced as a generic region by most AT
- `aria-multiline="true"` MUST be set — announces correct Enter-key behavior to screen readers
- Toolbar toggle buttons (bold, italic, lists) MUST use `aria-pressed="true/false"` to reflect current selection state
- Placeholder MUST use CSS `[data-placeholder]::before` content — not a `placeholder` HTML attribute on contenteditable (screen readers read it incorrectly or not at all)
- Keyboard shortcuts MUST be documented in a tooltip or help section — not assumed
- Read-only: set both `contenteditable="false"` AND `aria-readonly="true"` — contenteditable="false" alone is insufficient for AT
- Mention listbox MUST use `role="listbox"` with `role="option"` items; focused option uses `aria-selected="true"`

Cross-link: `reference/accessibility.md` — contenteditable accessibility, toolbar pattern.

---

## Motion

| Transition | Duration | Easing | Notes |
|------------|----------|--------|-------|
| Toolbar button active state | 80ms | ease-out | Background fill on aria-pressed change |
| Mention list open | 150ms | ease-out | Fade + slide up from caret position |
| Mention list dismiss | 100ms | ease-in | Fade out |
| Bubble toolbar appear | 150ms | ease-out | Fade in above selection |
| Bubble toolbar dismiss | 80ms | ease-in | Fade out on deselect |

**BAN**: Do not animate text reflow on formatting changes — typing performance is critical; any CSS transition on editor content causes visual jitter.

Cross-link: `reference/motion.md` — reduced-motion: remove mention list slide; keep instant formatting toggle.

---

## Do / Don't

### Do
- Add `role="textbox"` + `aria-multiline="true"` to the contenteditable element *(WAI-ARIA APG)*
- Use `aria-pressed` on all toggle toolbar buttons (bold, italic, list toggles) *(WAI-ARIA APG toolbar pattern)*
- Implement placeholder via CSS `::before` pseudo-element, not HTML attribute *(Tiptap, Atlassian)*
- Document keyboard shortcuts in a tooltip or accessible help dialog *(Atlassian Fabric Editor)*

### Don't
- Don't use bare `contenteditable` without `role="textbox"` — AT announces it as a generic landmark *(diverges from all 4 systems)*
- Don't omit `aria-pressed` on toggle buttons — AT users cannot determine current formatting state *(WAI-ARIA APG)*
- Don't use a `placeholder` HTML attribute on contenteditable — it is not a valid attribute and screen reader behavior is undefined *(MDN, Tiptap docs)*
- Don't suppress `outline` on the editable area without a custom focus-visible ring *(WCAG 2.4.7)*

---

## Anti-patterns Cross-links

| Anti-pattern | Entry |
|--------------|-------|
| BAN-06 | contenteditable without role="textbox" — `reference/anti-patterns.md#ban-06` |
| BAN-04 | transition: all on editor content causing reflow jank — `reference/anti-patterns.md#ban-04` |

---

## Benchmark Citations

| Claim | Sources |
|-------|---------|
| contenteditable needs role="textbox" + aria-multiline="true" | WAI-ARIA spec, Tiptap a11y guide, Atlassian |
| Toolbar toggle buttons need aria-pressed | WAI-ARIA APG toolbar pattern |
| Placeholder via CSS ::before, not HTML attribute | Tiptap docs, Atlassian Fabric Editor |
| Mention list uses role="listbox" + role="option" | Tiptap mention extension, Lexical mention plugin |
| Ctrl/Cmd+B/I/U keyboard shortcuts are standard | Lexical, Tiptap, Slate — all implement these |

Full system URLs: `connections/design-corpora.md`

---

## Grep Signatures

```bash
# contenteditable element missing role="textbox" (announced as generic region)
grep -rn 'contenteditable="true"' src/ | grep -v 'role="textbox"'

# Toolbar toggle buttons missing aria-pressed
grep -rn 'role="toolbar"' src/ -A 50 | grep 'role="button"' | grep -v 'aria-pressed'

# Placeholder set as HTML attribute on contenteditable (invalid)
grep -rn 'contenteditable' src/ | grep 'placeholder='

# Mention listbox missing role="listbox"
grep -rn 'mention\|@mention\|MentionList' src/ | grep -v 'role="listbox"'
```

---

## Failing Example

```html
<!-- BAD: rich-text area using only contenteditable without role="textbox" -->
<div
  contenteditable="true"
  class="editor"
  placeholder="Start writing..."
>
</div>
<div class="toolbar">
  <button onclick="document.execCommand('bold')">B</button>
  <button onclick="document.execCommand('italic')">I</button>
</div>
```

**Why it fails**: (1) Bare `contenteditable` is announced by most AT as a generic region, not a text input — users do not know they can type. (2) `placeholder` is not a valid HTML attribute on `<div>` — screen readers do not announce it. (3) Toolbar buttons have no `aria-pressed` — AT cannot determine if bold/italic is currently active. (4) `document.execCommand` is deprecated.
**Grep detection**: `grep -rn 'contenteditable="true"' src/ | grep -v 'role="textbox"'`
**Fix**: Add `role="textbox"` + `aria-multiline="true"` + `aria-label="Post body"` to the editable div; implement placeholder via CSS `[data-empty]::before { content: attr(data-placeholder) }`; add `aria-pressed="true/false"` to toolbar toggle buttons; use a modern editor library (Tiptap, Lexical) instead of execCommand.
