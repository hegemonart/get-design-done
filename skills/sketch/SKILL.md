---
name: gdd-sketch
description: "Multi-variant HTML design exploration that creates .design/sketches/<slug>/ with N standalone variants (default 3), browser-openable directly via file:// without a build step. Use when answering 'what could this look like?' before committing to a direction."
argument-hint: "[topic] [--variants N] [--quick]"
tools: Read, Write, AskUserQuestion, Bash
---

# Get Design Done — Sketch

**Role:** Multi-variant HTML exploration. Answers "what could this look like?" by generating N standalone HTML variants from a topic prompt. Variants are browser-openable directly — no build step — and can be screenshot by Phase 8 Preview/Playwright tooling later.

Unlike `/gdd:spike` (which tests feasibility), `/gdd:sketch` explores visual/directional variants.

## Flag parsing

Parse `$ARGUMENTS`:
- `[topic]` → kebab-case slug (e.g., "hero-redesign")
- `--variants N` → number of variants (default: 3)
- `--quick` → skip intake, use DESIGN-CONTEXT.md tokens + sensible defaults

## Step 1 — Intake (unless `--quick`)

AskUserQuestion, one at a time:
1. "What are you sketching? (component, layout, page)"
2. "What directions should the variants explore? (minimal/maximal, dense/spacious, flat/layered, playful/restrained, etc.)"
3. "Which design tokens apply? (pick from DESIGN-CONTEXT.md, or use defaults)"

If `--quick`: derive directions from topic + pull tokens from `.design/DESIGN-CONTEXT.md` if present, else defaults.

## Step 2 — Create sketch directory

- Derive `<slug>` from the topic (kebab-case).
- `mkdir -p .design/sketches/<slug>/` via Bash.

## Step 3 — Write INTAKE.md

Write `.design/sketches/<slug>/INTAKE.md` with:
- Topic
- Directions (one bullet per variant)
- Token references (link to DESIGN-CONTEXT.md or inline list)
- Timestamp

## Step 4 — Generate N standalone HTML variants

For each of N variants (default 3), write `variant-<n>.html` as a **complete standalone HTML file**:
- `<!DOCTYPE html>` + `<html>` + `<head>` + `<body>`
- `<style>` block inline with CSS custom properties for tokens (`--color-*`, `--space-*`, `--font-*`)
- Semantic HTML5 (`<header>`, `<main>`, `<nav>`, `<section>`, etc.)
- No imports, no bundler, no JS framework — opens in a browser directly via `file://`
- Each variant explores a different direction from intake

## Step 5 — Write README.md

Write `.design/sketches/<slug>/README.md` with:
- Topic + one-line summary
- List of variants: `variant-1.html` — direction label — one-line description
- How to view: "Open each `variant-*.html` in a browser."
- Next step: "Run `/gdd:sketch-wrap-up <slug>` when ready to pick a winner."

## After writing

```
━━━ Sketches created ━━━
Slug: <slug>
Directory: .design/sketches/<slug>/
Variants: N standalone HTML files
Open variant-*.html in a browser.
Next: /gdd:sketch-wrap-up <slug>
━━━━━━━━━━━━━━━━━━━━━━━━
```

## Do Not

- Do not write to `src/` — sketches live in `.design/sketches/` only.
- Do not use build-step syntax (JSX, TS, imports). Standalone HTML only.
- Do not overwrite an existing sketch slug without asking.

## SKETCH COMPLETE
