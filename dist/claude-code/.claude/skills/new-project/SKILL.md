---
name: gdd-new-project
description: "Initialize a new get-design-done project. Gathers project context, creates PROJECT.md and STATE.md, initializes first cycle. Run once per project before any pipeline stage."
argument-hint: "[--name <project-name>]"
tools: Read, Write, AskUserQuestion, Bash, Glob
---

# /gdd:new-project

One-time project initialization. Replaces "run scan cold" by gathering context up front and producing PROJECT.md + STATE.md + cycle-1.

## Steps

1. **Existing check**: If `.design/STATE.md` exists, ask (AskUserQuestion): "Project already initialized. Re-initialize? (This does not delete existing work.)" Abort if declined.
2. **Create directory**: `mkdir -p .design` via Bash.
3. **Auto-detect from codebase** (do this before asking):
   - Read `package.json` for framework (React/Next.js/Vue/SvelteKit/etc.).
   - Glob for `tailwind.config.*`, `components/`, `src/`, `shadcn.json` to guess the design system.
   - Use directory name as default project name.
4. **Gather context** (AskUserQuestion, one at a time, pre-filled with detected values):
   - Project name
   - Project type (framework)
   - Main design goal
   - Primary user
   - Design system / component library
5. **Write `.design/PROJECT.md`**:
   ```markdown
   # Project: <name>
   **Type**: <framework>
   **Design system**: <system>
   **Main goal**: <goal>
   **Primary user**: <user>
   **Initialized**: <date>
   ```
6. **Initialize STATE.md**: Copy from `reference/STATE-TEMPLATE.md`, fill in project name, set stage to `brief`, cycle to `cycle-1`.
7. **Create `.design/config.json`** with defaults from `reference/config-schema.md`.
8. **Initialize first cycle**: Write `.design/CYCLES.md` with a `cycle-1` entry (goal copied from PROJECT.md main goal, status `active`).
9. **Seed project-local skills directory**: Create `./.claude/skills/` and write `./.claude/skills/README.md`:
   ```markdown
   # Project-Local Skills

   Auto-loaded by gdd pipeline stages. See `reference/project-skills-guide.md` in the plugin.
   Files named `design-*-conventions.md` are read by explore/plan/design.
   Populated by `/gdd:sketch-wrap-up` and manual edits.
   ```
10. Print: "Project initialized. Run `/gdd:brief` to capture your design problem, or `/gdd:explore` to scan directly. Run `/gdd:connections` to wire up optional integrations (Figma, Storybook, Chromatic, etc.)."

## Do Not

- Do not delete or overwrite existing `.design/` artifacts if re-initializing.
- Do not run any pipeline stage automatically — this is init only.

## NEW-PROJECT COMPLETE
