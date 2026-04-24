# File Upload — Benchmark Spec

**Harvested from**: Polaris (DropZone), Carbon (FileUploader), Atlassian Design System, Material 3
**Wave**: 5 · **Category**: Advanced
**Spec file**: `reference/components/file-upload.md`

---

## Purpose

A File Upload component lets users attach one or more files by dragging them onto a drop zone or clicking to open the native file picker. It must work for all users: keyboard-only users activate the hidden-but-accessible `<input type="file">`, while pointer users can drag-drop. A file list tracks upload progress, status, and provides remove actions. *(Polaris, Carbon, Atlassian agree: drop zone + accessible file input + per-file status list is the canonical pattern.)*

---

## Anatomy

```
┌─────────────────────────────────┐
│  Drop zone                      │
│  [ Cloud icon ]                 │
│  "Drag files here or"           │
│  [ Browse files ] ← triggers    │
│    <input type="file">          │
└─────────────────────────────────┘

File list (appears after selection):
┌────────────────────────────────────────────────┐
│ 📄 report.pdf  245 KB  [========   ] 80%  [✕] │
│ 📄 photo.jpg   1.2 MB  ✓ Done             [✕] │
│ 📄 data.csv    88 KB   ✗ Error            [✕] │
└────────────────────────────────────────────────┘
```

| Part | Required | Notes |
|------|----------|-------|
| Drop zone container | Yes | Dashed border; drag-over changes fill + border color |
| `<input type="file">` | Yes | MUST be accessible (not `display:none`) — keyboard fallback |
| Browse trigger button | Yes | Visually activates the file input; must be a `<button>` or `<label>` |
| File list | Yes (when files selected) | Per-file name, size, status, progress bar, remove button |
| Progress bar | Yes (during upload) | `role="progressbar"` + `aria-valuenow` per file or overall |
| Remove button | Yes | `aria-label="Remove [filename]"` |
| Error region | Yes (on error) | `aria-live="assertive"` for upload errors |

---

## Variants

| Variant | Description | Systems |
|---------|-------------|---------|
| Drop zone | Large dashed-border target area with drag-and-drop | Polaris, Carbon, Atlassian, Material 3 |
| Compact / inline | Small "Attach file" button only; no large drop area | Carbon (FileUploaderItem), Atlassian |
| Avatar/image uploader | Circular or rectangular crop zone for single image | Material 3, Polaris |
| Multi-file | `multiple` attr; list of uploaded files | All systems |
| Single-file | No `multiple`; replaces previous selection | Carbon, Polaris |

**Norm** (≥3/4 systems agree): drop zone + browse button + file list is the standard desktop pattern; progress bar per file during upload.
**Diverge**: Polaris auto-starts upload on drop; Carbon shows "Add files" button after initial selection to allow adding more; Material 3 defers to app logic.

---

## States

| State | Trigger | Visual | ARIA |
|-------|---------|--------|------|
| default | — | Dashed border, instructional text | — |
| drag-over | File dragged over zone | Filled background + solid border color change | `aria-dropeffect="copy"` (deprecated but still useful) |
| drag-invalid | Wrong file type dragged over | Error border color; tooltip/message | — |
| uploading | File being sent | Per-file progress bar animating | `aria-valuenow` on progressbar |
| upload-done | Transfer complete | Check icon; status text "Done" | — |
| upload-error | Transfer failed | Error icon; error message per file | `aria-live="assertive"` error region |
| disabled | `disabled` prop | 38% opacity; drag events ignored | `aria-disabled="true"` on zone |

---

## Sizing & Spacing

| Size | Drop Zone Min Height | Border Radius | Font |
|------|---------------------|---------------|------|
| sm | 80px | 4px | 13px |
| md (default) | 128px | 8px | 14px |
| lg | 200px | 12px | 16px |

**Norm**: Drop zone should be large enough that it is comfortably hittable — 128px minimum height for default. File list rows are 48–56px tall for accessible remove-button target size *(Carbon, Polaris)*.

Cross-link: `reference/surfaces.md` — minimum 44×44px touch targets for remove buttons.

---

## Typography

- Drop zone instruction: body-md, centered, secondary color
- "Browse files" link/button: body-md, primary link or button style
- File name in list: body-sm, truncated with ellipsis (max-width on container), full name in `title` attribute
- File size: caption-sm, secondary color
- Status text (Done / Error): caption-sm, success or error semantic color

Cross-link: `reference/typography.md` — truncation rules.

---

## Keyboard & Accessibility

> **WAI-ARIA role**: `button` (browse trigger); `progressbar` (upload progress); `status` or `log` (file list updates)
> **Required attributes**: `aria-label="Remove [filename]"` on remove buttons; `aria-valuenow` + `aria-valuemin` + `aria-valuemax` on progressbar; `aria-live="assertive"` on error region

### Keyboard Contract

*Derived from native `<input type="file">` behavior and WAI-ARIA APG button pattern — W3C — 2024*

| Key | Action |
|-----|--------|
| Tab | Move focus to browse button / file input |
| Enter / Space | Activate browse button — opens native file picker dialog |
| Tab (in file list) | Move through file items and remove buttons |
| Enter / Space (on remove button) | Remove file from list |

Drag-and-drop is pointer-only; keyboard users MUST be able to complete the entire task via the file input alone.

### Accessibility Rules

- `<input type="file">` MUST NOT use `display:none` or `visibility:hidden` — use `opacity:0` positioned absolutely with dimensions matching the trigger, OR keep a visible file input alongside the drop zone
- The browse trigger MUST be a `<button>` or `<label for="file-input">` so it is keyboard-focusable and activates the input
- Remove buttons MUST have `aria-label="Remove [filename]"` — an icon-only ✕ with no accessible name fails AT users
- Upload errors MUST be announced via `aria-live="assertive"` — do not rely solely on visual indicators
- Progress bars MUST keep `aria-valuenow` updated throughout upload
- `accept` attribute MUST match the visible allowed-types hint text so users are not surprised by rejection
- File list additions/removals should be announced via `aria-live="polite"` on the list container

Cross-link: `reference/accessibility.md` — aria-live regions, accessible file input patterns.

---

## Motion

| Transition | Duration | Easing | Notes |
|------------|----------|--------|-------|
| Drop zone drag-over | 100ms | ease-out | Background fill + border color |
| File list item enter | 200ms | ease-out | Slide-in from top or fade-in |
| File list item remove | 150ms | ease-in | Fade + collapse height |
| Progress bar fill | continuous | linear | Matches upload byte progress |
| Upload complete tick | 200ms | ease-out | Check icon draw animation |

**BAN**: Do not animate progress bar with CSS only at a fixed pace — progress MUST reflect actual upload percentage via `aria-valuenow`.

Cross-link: `reference/motion.md` — reduced-motion: skip slide/collapse animations; keep progress bar updates.

---

## Do / Don't

### Do
- Keep `<input type="file">` accessible at all times (opacity:0 trick or visible) *(WAI-ARIA, Polaris, Carbon)*
- Provide `aria-label="Remove [filename]"` on every remove button *(Carbon, Atlassian)*
- Show file name, size, and status in the file list *(Polaris, Carbon, Atlassian)*
- Announce upload errors via `aria-live="assertive"` *(WCAG 2.1 §4.1.3 Status Messages)*

### Don't
- Don't use `display:none` on the file input — keyboard and AT users cannot trigger the picker *(WCAG 2.1 §2.1.1)*
- Don't omit the `accept` hint text — users should know allowed types before selecting *(Polaris, Carbon)*
- Don't show only drag-drop UI with no browse button — drag is inaccessible to keyboard users *(Carbon, Atlassian)*
- Don't use a generic `aria-label="Remove"` on remove buttons — AT users cannot identify which file *(Carbon)*

---

## Anti-patterns Cross-links

| Anti-pattern | Entry |
|--------------|-------|
| BAN-08 | File input hidden with display:none — keyboard inaccessible — `reference/anti-patterns.md#ban-08` |
| BAN-13 | Icon-only action button without aria-label — `reference/anti-patterns.md#ban-13` |

---

## Benchmark Citations

| Claim | Sources |
|-------|---------|
| input type="file" must not be display:none | WCAG 2.1 §2.1.1, Carbon, Polaris accessibility guides |
| Remove button needs aria-label="Remove [filename]" | Carbon FileUploader, Atlassian, Polaris |
| Upload errors need aria-live="assertive" | WCAG 2.1 §4.1.3, Material 3 |
| Progress bar needs aria-valuenow updates | WAI-ARIA progressbar role spec |
| Drag-over state: background fill + border change | Polaris, Carbon, Atlassian drop zone specs |

Full system URLs: `connections/design-corpora.md`

---

## Grep Signatures

```bash
# File input hidden with display:none (keyboard inaccessible)
grep -rn 'type="file"' src/ | grep -v 'opacity\|position.*absolute' | grep 'display.*none\|visibility.*hidden'

# Remove button missing aria-label (icon-only, no accessible name)
grep -rn 'remove.*button\|btn.*remove\|✕\|×' src/ | grep -v 'aria-label'

# Progress bar missing aria-valuenow
grep -rn 'role="progressbar"' src/ | grep -v 'aria-valuenow'

# Upload error region without aria-live
grep -rn 'upload.*error\|file.*error\|error.*upload' src/ | grep -v 'aria-live'
```

---

## Failing Example

```html
<!-- BAD: drop zone with display:none on the actual <input> — keyboard and AT users can't trigger file picker -->
<div class="drop-zone" ondrop="handleDrop(event)" ondragover="handleDragOver(event)">
  <p>Drag files here</p>
  <input type="file" id="file-input" style="display:none" onchange="handleFiles(event)">
  <button onclick="document.getElementById('file-input').click()">Browse</button>
</div>
```

**Why it fails**: `display:none` removes the input from accessibility tree and tab order. The JavaScript `.click()` workaround does not work reliably with all AT. Keyboard users pressing Enter/Space on "Browse" may get inconsistent behavior across browsers. Screen reader users cannot discover or activate the file input directly.
**Grep detection**: `grep -rn 'type="file".*display.*none\|display.*none.*type="file"' src/`
**Fix**: Use `opacity:0; position:absolute; width:100%; height:100%` on the input (matching the browse button dimensions), or place a visible `<input type="file">` and style the button as a `<label for="file-input">` so clicking the label activates the input natively without JavaScript.
