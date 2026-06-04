---
name: gdd-bootstrap-ds
description: "Bootstraps a design system for a GREENFIELD project that has none - no Figma, no tokens, no component library. Takes a brand input (primary color + optional secondary + tone tags + target framework) and emits a coherent OKLCH token system (color tints, modular type scale, 4pt/8pt spacing, radius + motion defaults) in 3 variants to pick from, then scaffolds proof components (button/input/card). Use at the start of a brand-new project, or when /gdd:explore finds no existing design system. Never invents a brand; never overwrites an existing DS."
argument-hint: "[--primary <color>] [--secondary <color>] [--tone <tags>] [--framework web|native-ios|native-android|flutter]"
user-invocable: true
tools: Read, Write, Bash, Glob, Grep, AskUserQuestion, Task
---

# /gdd:bootstrap-ds

Greenfield design-system bootstrap. Closes the gap that GDD's `design-context-builder` assumes a design system already exists (in code or Figma) - a brand-new project has none. This skill is the **front door**: it collects a brand input and hands it to `agents/ds-generator.md`, which emits the token system + proof components per `reference/ds-bootstrap-rubric.md` (deterministic math in `scripts/lib/ds/token-scale.cjs`).

## When to use

- At the start of a brand-new project (no `tailwind.config`, no token file, no DS).
- When `/gdd:discover` / `design-context-builder` reports **no existing design system** and the user opts to bootstrap one.

If a design system **already exists**, do NOT run this - defer to `design-context-builder` (it maps the existing one). State that and stop.

## Steps

1. **Collect the brand input.** From flags, or via `AskUserQuestion` for anything missing:
   - **primary** (required) - the brand color (hex / rgb / `oklch()`).
   - **secondary** (optional) - a second brand color (emitted only if supplied - the rubric's ≤2-brand-colors rule).
   - **tone tags** (optional) - `calm` / `corporate` / `editorial` / `playful` / `bold` (maps to the type ratio + chroma treatment).
   - **target framework** (optional) - `web` (default) / `native-ios` / `native-android` / `flutter`. Detect from the project if absent (Phase 34 routing).
2. **Delegate to `ds-generator`** (via `Task`): it resolves the primary to OKLCH, runs `token-scale.cjs` for **3 variants** (conservative / balanced / bold), and presents them.
3. **Pick a variant.** Surface the 3 variants (primary `500`, type ratio, spacing baseline, radius, feel); the user picks ONE.
4. **Emit + scaffold (proposal → confirm).** `ds-generator` emits the chosen token set (role-named CSS custom properties + the framework mapping) and scaffolds **button / input / card** as a coherence proof. Nothing is written to `src/` without confirmation.

## Do Not

- Do not invent a brand (no logomark, no typeface choice, no third brand color) - emit a token *system*, not an identity.
- Do not overwrite an existing design system - defer to `design-context-builder`.
- Do not add a color-conversion dependency - `token-scale.cjs` emits native CSS `oklch()`.

## Output

End with:

```
## BOOTSTRAP-DS COMPLETE
```
