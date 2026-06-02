---
name: copy-quality
type: heuristic
version: 1.0.0
phase: 48
tags: [copy, microcopy, ux-writing, ctas, errors, empty-states, aria, alt-text, i18n, voice, pillar-1]
last_updated: 2026-06-03
---

# Copy Quality - Microcopy Rubric

This file is the rubric the Copy pillar (Pillar 1 of `agents/design-auditor.md`) scores against, and the detailed reference that `agents/copy-auditor.md` applies. The design-auditor's Pillar 1 carries the 1-4 score and a one-line finding; this file holds the per-category criteria, the failure patterns, and the i18n lens that produce that score.

Voice and tone are owned by [`brand-voice.md`](./brand-voice.md): the five axes (formal/casual, serious/playful, expert/approachable, reverent/irreverent, authoritative/collaborative), the 12 archetypes, and the tone-by-context table. This file does not restate those. It checks whether the implemented strings honor the voice the product declared, and whether each microcopy surface does its specific job.

Cultural and locale meaning is owned by [`rtl-cjk-cultural.md`](./rtl-cjk-cultural.md); engineering primitives for localized strings are owned by [`i18n.md`](./i18n.md). This file consumes the i18n text-expansion table as a copy-length lens (see Internationalization Lens below).

## Why Copy Is a Pillar

Generic or default copy is the most common quiet failure in shipped UI. A "Submit" button, a "No data" empty state, and a raw stack-trace error each pass a functional test and each fail the user. Specific, purposeful language is a craft signal: it shows the team pictured a real person reading the screen. The Copy pillar measures that gap between functional text and intentional text.

## Category Rubrics

Each category below lists what good looks like and the failure patterns to grep for. A category is "weak" when the failure patterns dominate; "absent" when the surface exists with no considered copy at all.

### Button and CTA labels

Good labels are verb-first and name the object: "Export CSV", "Add member", "Send invite", "Delete project". The user reads the label and knows the outcome before clicking. Primary actions carry the specific verb; secondary actions ("Cancel", "Back") may stay plain because they are reversible and conventional.

Failure patterns: bare "Submit", "OK", "Go", "Click here", "Button", or a noun with no verb ("Form", "Settings" on an action). A primary action labeled "Save" with no object on a screen that saves several distinct things is weak, not broken.

```bash
grep -rEn ">(Submit|Click Here|OK|Go|Button|Done)<" src/ --include="*.tsx" --include="*.jsx" 2>/dev/null | head -10
```

### Error messages

Good error copy names the cause and the recovery, and never blames the user. State what happened, then what to do: "We could not save your changes. Check your connection and try again." For validation, point at the field and the fix: "Enter a date in the future." The tone matches the stakes (see the tone-by-context table in `brand-voice.md`); data-loss and payment failures are calm and serious, never playful.

Failure patterns: raw codes or stack traces shown to users ("Error 500", "undefined is not a function"), blame language ("You entered an invalid value", "Your input was wrong"), and dead ends that state the failure with no next step.

```bash
grep -rEn "went wrong|Error [0-9]|invalid input|you entered|try again" src/ --include="*.tsx" --include="*.jsx" 2>/dev/null | head -10
```

### Empty states

Good empty states orient and offer the first action. They explain why the screen is empty and give one clear thing to do: "No projects yet. Create your first project to get started." A first-run empty state is an onboarding moment, not an error.

Failure patterns: "No data", "Nothing here", a bare zero, or an empty container with no copy. An empty state that explains the emptiness but offers no action is weak.

```bash
grep -rEn "No data|No results|Nothing here|No items|empty" src/ --include="*.tsx" --include="*.jsx" 2>/dev/null | head -10
```

### Loading and skeleton copy

Good loading copy reassures and signals progress without nagging: "Getting your data...", "Almost there." Skeleton screens are preferred to spinner-plus-text for content that has a known shape; when text is shown, it is brief and specific to what is loading. Long operations name the step ("Uploading 3 of 12 files").

Failure patterns: "Loading..." with no context on a multi-second operation, a spinner with no label on a process that can fail, or jokey loading copy on a high-stakes action.

```bash
grep -rEn "Loading|Please wait|spinner|Skeleton" src/ --include="*.tsx" --include="*.jsx" 2>/dev/null | head -10
```

### ARIA text quality

ARIA strings are copy the screen-reader user hears. They must describe purpose, not implementation. `aria-label="Close dialog"` is good; `aria-label="button"` or `aria-label="icon"` is noise. Live-region announcements (`aria-live`, `role="status"`, `role="alert"`) carry the same cause-plus-recovery standard as visible errors. Labels must not duplicate adjacent visible text in a way that makes the reader say it twice.

Failure patterns: `aria-label` set to the element type, `aria-label` that restates a visible label verbatim, missing `aria-label` on icon-only controls, and silent live regions on async state changes.

```bash
grep -rEn "aria-label=\"(button|icon|link|image|click)\"" src/ --include="*.tsx" --include="*.jsx" 2>/dev/null | head -10
```

### Alt-text quality

Good alt text conveys the function or meaning of an image in context. A logo links home: `alt="Acme home"`, not `alt="logo"`. A decorative image takes empty alt (`alt=""`) so the reader skips it. An informative chart names its takeaway, not its file. Alt text never starts with "image of" or "picture of"; the reader already knows it is an image.

Failure patterns: `alt="image"`, `alt="photo"`, filename alt (`alt="IMG_2043.jpg"`), missing alt on informative images, and non-empty alt on purely decorative images.

```bash
grep -rEn "alt=\"(image|photo|picture|img|logo)\"|alt=\"[^\"]*\\.(png|jpg|jpeg|svg|webp)\"" src/ --include="*.tsx" --include="*.jsx" 2>/dev/null | head -10
```

### Form labels, helper, and validation copy

Every input has a persistent visible label (placeholders are not labels). Helper text sets expectations before the user types ("Use 8 or more characters"). Validation copy is specific and arrives at the right time: inline after blur for format rules, on submit for cross-field rules. Required and optional states are stated in words, not color alone.

Failure patterns: placeholder-as-label, helper text that only appears as an error after failure, generic "This field is required" with no field name when several are blank, and validation copy that says what is wrong but not how to fix it.

```bash
grep -rEn "placeholder=|required|This field|is invalid" src/ --include="*.tsx" --include="*.jsx" 2>/dev/null | head -10
```

### Voice and tone alignment

Read the declared voice from `.design/DESIGN-CONTEXT.md` (axis positions and archetype, if recorded) and check the implemented strings against it. A Caregiver health app with a curt, blaming error message is off-voice even if the error is technically clear. A formal finance app with "Oops!" on a failed transfer is off-voice. Use the tone-by-context table in `brand-voice.md` as the per-surface contract: error, empty state, success, onboarding, loading, destructive confirmation each have a recommended register.

Failure patterns: one tone for marketing copy and a flatly different tone for in-product copy, playful language on high-stakes actions, and copy that contradicts the declared archetype.

## Internationalization Lens

Apply this lens to copy-heavy components (anything where text drives width: buttons, nav, tabs, chips, table headers, banners). It folds the [`i18n.md`](./i18n.md) text-expansion table into the copy score.

Two probes:

1. **Hardcoded user-facing strings.** Strings rendered to users should flow through the project's i18n layer, not sit as literals in JSX. A literal English string in a component is a copy defect for any product that ships, or plans to ship, more than one locale.

   ```bash
   grep -rEn ">[A-Z][a-z]+ [a-z]+.*<|aria-label=\"[A-Z][a-z]+ " src/ --include="*.tsx" --include="*.jsx" 2>/dev/null | head -10
   ```

2. **Expansion-overflow at +40%.** German expands English by about +30%, Russian by about +40% (see the expansion table in `i18n.md`). A fixed-width control sized to English is the worst case. The lens: for each copy-bearing component with a width constraint, ask whether the label survives a +40% expansion without clipping or truncating mid-word. Containers sized to `EN base x 1.4` clear the worst row of that table. Flag fixed pixel widths on text controls and single-line labels with no wrap or ellipsis strategy.

   ```bash
   grep -rEn "w-\[[0-9]+px\]|width:\s*[0-9]+px|truncate|whitespace-nowrap" src/ --include="*.tsx" --include="*.jsx" 2>/dev/null | head -10
   ```

A copy-heavy component that hardcodes strings, or that clips at +40%, drops the Copy pillar by one point and appears in the findings with the `i18n_readiness` lens tag (see `audit-scoring.md` Lens-Tags).

## Scoring Guide (Copy Pillar, 1-4)

This scale matches the 1-4 definitions in `agents/design-auditor.md`. The Copy pillar score is a single 1-4 value; the categories above supply the evidence.

| Score | Label | Criteria |
|-------|-------|----------|
| 4 | Exemplary | CTAs are verb-object specific; error messages name cause and recovery without blame; empty states orient and offer a first action; ARIA and alt text describe purpose; form copy guides before and during input; voice matches the declared axes and archetype; copy-heavy components survive a +40% expansion and route strings through i18n. |
| 3 | Solid | Most copy is intentional; one or two generic labels remain (a plain "Save" on a single-purpose form); error and empty states are present and human but plain; minor voice drift only. |
| 2 | Present but weak | Mix of intentional and generic copy; some empty states missing; errors show raw codes or blame; ARIA or alt text restates element type; hardcoded strings or +40% overflow risk in copy-heavy components. |
| 1 | Absent or broken | Majority generic ("Submit", "OK", "Cancel"); empty states absent or "No data"; errors are developer-facing; ARIA labels are noise; alt text is "image" or filenames; no voice considered. |

## How findings feed the audit

`agents/copy-auditor.md` runs these probes, scores the pillar, and writes `.design/COPY-AUDIT.md` as a supplement. `agents/design-auditor.md` folds that score and the top finding into Pillar 1 of `.design/DESIGN-AUDIT.md`. Neither file changes the separate 7-category 0-10 system in `audit-scoring.md`; the Copy pillar is a qualitative 1-4 signal, not a weighted metric.
