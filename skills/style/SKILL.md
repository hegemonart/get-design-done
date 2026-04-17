---
name: get-design-done:style
description: "Generate a component handoff doc (.design/DESIGN-STYLE-[ComponentName].md) from existing pipeline artifacts or source files. Two modes: post-pipeline (uses DESIGN-SUMMARY.md) and pre-pipeline fallback (uses DESIGN.md + source). Invoke with a ComponentName argument, or with no argument to list available components."
argument-hint: "[ComponentName]"
user-invocable: true
---

# get-design-done:style — Component Handoff Doc Generator

Generates a per-component style spec at `.design/DESIGN-STYLE-[ComponentName].md`. This is a **standalone command**, not a pipeline stage.

Output artifact naming: `.design/DESIGN-STYLE-[ComponentName].md` — Title-cased component name, one file per invocation.

---

## Scope

This command is **additive and non-destructive**:

- It is NOT a pipeline stage — no `.design/STATE.md` read or write contract.
- Output lives in the `DESIGN-STYLE-*.md` namespace — distinct from the pipeline namespace (`DESIGN.md`, `DESIGN-CONTEXT.md`, `DESIGN-PLAN.md`, `DESIGN-SUMMARY.md`, `DESIGN-VERIFICATION.md`).
- It does not modify any pipeline artifact.
- It does not invoke the pipeline router.
- One doc per invocation — no batch mode in v3.

This separation is a pre-roadmap decision recorded in `.planning/STATE.md`: utility commands use distinct prefixes (`DESIGN-STYLE-[Component].md`); the pipeline owns the `DESIGN-*.md` namespace without qualifiers.

---

## Argument Handling

**If `$ARGUMENTS` contains a ComponentName** → proceed to Mode Detection with that name.

**If `$ARGUMENTS` is empty** → do not generate a doc. Instead:

1. List available component files by globbing:
   - `src/components/*.tsx`
   - `src/components/*.jsx`
   - `src/**/*.vue`
   - `src/**/*.svelte`
   - `components/*.tsx`
   - `components/*.jsx`
2. Also list task names from `.design/tasks/*.md` (if directory exists).
3. Display the list to the user and prompt: "Specify a ComponentName to generate a style spec. Example: `/get-design-done style Button`"
4. Exit without generating any file.

---

## Mode Detection

Before spawning the agent, detect which mode to use:

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

---

## Agent Spawn

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
  - Token Semantic Health Score (raw-hex-ratio formula)
  - AI-Slop Detection (using reference/anti-patterns.md BAN/SLOP patterns)
  [If pipeline_complete=true:]
  - Decisions Applied (D-XX from DESIGN-SUMMARY.md that mention this component)

Emit ## DOC COMPLETE when the output file is written.
""")
```

After the agent emits `## DOC COMPLETE`, confirm the file exists at `output_path` and report success to the user.

---

## Output Location

Output is written by the agent to:

```
.design/DESIGN-STYLE-[ComponentName].md
```

This artifact is **outside the pipeline namespace**. The `DESIGN-STYLE-` prefix is distinct from all pipeline-owned artifacts (`DESIGN.md`, `DESIGN-CONTEXT.md`, `DESIGN-PLAN.md`, `DESIGN-SUMMARY.md`, `DESIGN-VERIFICATION.md`). There is no naming conflict.

The `.design/` directory is gitignored (developer tooling only — not shipped with the plugin).

---

## Constraints

This command MUST NOT:

- MUST NOT write to `DESIGN.md`, `DESIGN-SUMMARY.md`, `DESIGN-VERIFICATION.md`, `DESIGN-CONTEXT.md`, or `.design/STATE.md`
- MUST NOT invoke the pipeline router (this command is a leaf invocation, not a pipeline stage)
- MUST NOT require Figma or Refero MCPs — v3 uses only local source files and `.design/` artifacts (MCP enrichment is reserved for a future version)
- MUST NOT produce more than one output file per invocation — no batch mode in v3

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

---

**Example 2: No argument (list mode)**

```
/get-design-done style
```

- Globs component files from `src/components/`
- Displays list to user:
  ```
  Available components:
    Button
    CardHeader
    Input
    Modal
    Toast
  Specify: /get-design-done style [ComponentName]
  ```
- Exits without generating any file.
