---
name: style-doc-procedure
type: meta-rules
version: 1.0.0
phase: 28.5
tags: [style, handoff, component-spec, doc-writer, procedure, extracted]
last_updated: 2026-05-18
---

Source: extracted from `skills/style/SKILL.md` (Phase 28.5 rework — D-10 extract-then-link).
The skill's load-bearing routing + mode-detection stays in `../skills/style/SKILL.md`; this file
holds the agent-spawn payload, source-resolution paths, and the per-section spec the
`design-doc-writer` agent produces. See `./shared-preamble.md#output-contract-reminders` for
the cross-skill output discipline.

# Style Doc Procedure

Detailed procedure for the `get-design-done:style` standalone command — companion to
`../skills/style/SKILL.md`. Read this file when executing the agent-spawn step (Step 4 in the
skill) or when wiring the source-resolution fallback chain. The SKILL.md keeps the load-bearing
mode detection + decision tree; this file holds the deep methodology.

---

## Mode Detection

```
If .design/DESIGN-SUMMARY.md exists:
  mode = post-pipeline   (STYL-03)
  pipeline_complete = true

Elif .design/DESIGN.md exists:
  mode = pre-pipeline    (STYL-04)
  pipeline_complete = false

Else:
  Abort: "No .design/ artifacts found. Run /get-design-done scan first to initialize."
```

The mode controls which files are supplied to the agent in `<required_reading>`.

---

## Component Source Resolution

Search for a source file matching the provided ComponentName (case-insensitive):

1. `src/components/[ComponentName].tsx`
2. `src/components/[ComponentName].jsx`
3. `src/components/[ComponentName].vue`
4. `src/components/[ComponentName].svelte`
5. `src/**/[ComponentName]/index.tsx`
6. `src/**/[ComponentName]/index.jsx`
7. `components/[ComponentName].tsx`
8. `components/[ComponentName].jsx`
9. `components/[ComponentName].vue`
10. `components/[ComponentName].svelte`

**If multiple matches found:** Present the list to the user and prompt them to specify the exact path. Do not proceed until a single file is selected.

**If zero matches found:** Abort with: "Component [ComponentName] not found in expected paths. Verify the name matches a file in src/components/ or components/."

When `$ARGUMENTS` is empty, the skill enters **list mode** — glob the same source roots, also list task names from `.design/tasks/*.md` (if directory exists), display the list, and prompt the user to specify a ComponentName. Exit without generating any file.

---

## Agent Spawn Payload

Once mode and source path are resolved, spawn the `design-doc-writer` agent:

```
Task("design-doc-writer", """
<required_reading>
[If pipeline_complete=true:]
@.design/STATE.md
@.design/DESIGN-SUMMARY.md
@.design/DESIGN-CONTEXT.md
@<component_source_path>
[Else (pipeline_complete=false):]
@.design/DESIGN.md
@<component_source_path>
@reference/anti-patterns.md
@reference/audit-scoring.md
</required_reading>

Generate a handoff spec for component <ComponentName>.

Context:
  component_name: <ComponentName>
  component_source_path: <resolved absolute path>
  pipeline_complete: <true|false>
  output_path: .design/DESIGN-STYLE-<ComponentName>.md

Produce the doc per STYL-05 sections:
  - Spacing Tokens (used by component)
  - Color Tokens (used by component)
  - Typography Scale (used by component)
  - Component States (default, hover, focus, active, disabled, etc.)
  - Token Semantic Health Score (raw-hex-ratio formula — see ./shared-preamble.md#token-first-reasoning)
  - AI-Slop Detection (using ./anti-patterns.md BAN/SLOP patterns)
  [If pipeline_complete=true:]
  - Decisions Applied (D-XX from DESIGN-SUMMARY.md that mention this component)

Emit ## DOC COMPLETE when the output file is written.
""")
```

After the agent emits `## DOC COMPLETE`, confirm the file exists at `output_path` and report success to the user.

---

## STYL-05 Section Spec

Each generated `.design/DESIGN-STYLE-[ComponentName].md` SHOULD contain (in this order):

1. **Spacing Tokens** — every spacing token the component uses (paddings, gaps, margins). Cross-reference `./composition.md` for the 4 px / 8 px modular scale discipline.
2. **Color Tokens** — every color token the component uses (background, foreground, border, focus ring, state-overlays). Cross-reference `./palette-catalog.md` for naming convention and `./shared-preamble.md#token-first-reasoning` for the raw-hex audit threshold.
3. **Typography Scale** — type ramps the component reaches into (label, body, code, etc.) with size + line-height + weight. Cross-reference `./typography.md`.
4. **Component States** — default, hover, focus, active, disabled, loading, error. Each row: token diff vs default.
5. **Token Semantic Health Score** — raw-hex ratio = `raw_hex_count / total_color_uses`. Healthy < 5 %.
6. **AI-Slop Detection** — apply `./anti-patterns.md` `BAN-*` and `SLOP-*` patterns to the component source. List violations.
7. **Decisions Applied** (post-pipeline only) — D-XX entries from `DESIGN-SUMMARY.md` that name or describe this component.

---

## Examples

**Example 1: Named component**

```
/get-design-done style Button
```

- Resolves component: `src/components/Button.tsx`
- Detects mode: DESIGN-SUMMARY.md exists → post-pipeline
- Spawns `design-doc-writer` with `pipeline_complete: true`
- Output: `.design/DESIGN-STYLE-Button.md`

**Example 2: No argument (list mode)**

```
/get-design-done style
```

- Globs component files from `src/components/`
- Displays available components and exits without generating any file.

---

*Imported by: `../skills/style/SKILL.md`. Maintained as part of Phase 28.5 (Bucket 2 rework).*
