---
name: get-design-done:style
description: "Generate a component handoff doc at `.design/DESIGN-STYLE-<ComponentName>.md` by dispatching the `design-doc-writer` agent in one of two modes: post-pipeline (uses `DESIGN-SUMMARY.md`) or pre-pipeline fallback (uses `DESIGN.md` + source). Use when the user wants a single-component spec covering tokens, states, and AI-slop detection. Invoke with a ComponentName, or with no argument to list available components."
argument-hint: "[ComponentName]"
user-invocable: true
---

# get-design-done:style — Component Handoff Doc Generator

Generates a per-component style spec at `.design/DESIGN-STYLE-[ComponentName].md`. This is a **standalone command**, not a pipeline stage.

For the full mode-detection logic, source-resolution fallback chain (10 paths), agent-spawn payload, and STYL-05 section spec, see `../../reference/style-doc-procedure.md`. For the cross-skill output discipline (artifact prefix, completion marker, MUST-NOT-write list), see `../../reference/shared-preamble.md#output-contract-reminders`. For the raw-hex audit signal used in Token Semantic Health Score, see `../../reference/shared-preamble.md#token-first-reasoning`.

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

## Workflow

1. **Argument check** — if `$ARGUMENTS` is empty, enter list mode (see `../../reference/style-doc-procedure.md#component-source-resolution`); display available components from `src/components/` + `.design/tasks/`, then exit.
2. **Mode detect** — `DESIGN-SUMMARY.md` exists → post-pipeline; else `DESIGN.md` exists → pre-pipeline; else abort with a "run /get-design-done scan first" message. Full decision tree at `../../reference/style-doc-procedure.md#mode-detection`.
3. **Source resolve** — search the 10-path fallback chain for a file matching the ComponentName. On zero matches: abort. On multiple matches: prompt the user to disambiguate.
4. **Agent spawn** — dispatch `design-doc-writer` with the mode-specific `<required_reading>` block and the STYL-05 section list. The full Task payload + STYL-05 spec live in `../../reference/style-doc-procedure.md#agent-spawn-payload`.
5. **Confirm + report** — after the agent emits `## DOC COMPLETE`, verify the output path exists and report success.

---

## Constraints

This command MUST NOT (per `../../reference/shared-preamble.md#output-contract-reminders`):

- Write to `DESIGN.md`, `DESIGN-SUMMARY.md`, `DESIGN-VERIFICATION.md`, `DESIGN-CONTEXT.md`, or `.design/STATE.md`
- Invoke the pipeline router (this command is a leaf invocation, not a pipeline stage)
- Require Figma or Refero MCPs — v3 uses only local source files and `.design/` artifacts (MCP enrichment is reserved for a future version)
- Produce more than one output file per invocation — no batch mode in v3

---

## Examples

**Example 1: Named component**

```
/get-design-done style Button
```

Resolves `src/components/Button.tsx`, detects post-pipeline mode (DESIGN-SUMMARY.md exists), spawns `design-doc-writer` with `pipeline_complete: true`, writes `.design/DESIGN-STYLE-Button.md`.

**Example 2: No argument (list mode)**

```
/get-design-done style
```

Globs component files and prompts the user to specify a ComponentName. Exits without generating any file. See `../../reference/style-doc-procedure.md#component-source-resolution` for the full glob path list.

## STYLE COMPLETE
