---
name: ultimate-design
description: "Master design pipeline for Claude Code. Includes a one-time scanner (scan) plus a 4-stage workflow: Discover → Plan → Design → Verify. Run 'scan' first in any new repo to map existing design system and generate a debt roadmap. Then use 'discover' to start the pipeline. Invoke without arguments for status and auto-routing."
argument-hint: "[scan|discover|plan|design|verify|status|style]"
user-invocable: true
---

# Ultimate Design — Pipeline Router

Entry point for the ultimate-design toolkit:

```
scan → Discover → Plan → Design → Verify
```

`scan` is a one-time initializer. The pipeline stages are iterative — run them in order, or use `status` to resume where you left off.

Each stage produces artifacts in `.design/` inside the current project.

## Command Reference

| Command | Skill | Purpose |
|---|---|---|
| `scan` | `ultimate-design:scan` | Map existing design system, generate DESIGN.md + debt roadmap |
| `discover` | `ultimate-design:discover` | Discovery interview + baseline audit → DESIGN-CONTEXT.md |
| `plan` | `ultimate-design:plan` | Decompose into tasks → DESIGN-PLAN.md |
| `design` | `ultimate-design:design` | Execute tasks → DESIGN-SUMMARY.md |
| `verify` | `ultimate-design:verify` | Score + audit → DESIGN-VERIFICATION.md |
| `style [ComponentName]` | `ultimate-design:style` | Generate component handoff doc → .design/DESIGN-STYLE-[Name].md |

## Routing Logic

When invoked without arguments (or with `status`), show pipeline state and suggest next action:

```
1. No DESIGN.md and no .design/ → Suggest scan first: "New repo detected — run /ultimate-design scan to map the design system."
2. DESIGN.md exists, no DESIGN-CONTEXT.md → Suggest discover
3. DESIGN-CONTEXT.md missing → Route to discover
4. DESIGN-CONTEXT.md exists, DESIGN-PLAN.md missing → Route to plan
5. DESIGN-PLAN.md exists, DESIGN-SUMMARY.md missing → Route to design
6. DESIGN-SUMMARY.md exists, DESIGN-VERIFICATION.md missing → Route to verify
7. DESIGN-VERIFICATION.md exists → Show summary + offer to start new session
```

## Status Display

```
━━━ Ultimate Design Pipeline ━━━
[✓] Scan       → DESIGN.md + .design/DESIGN-DEBT.md
[✓] Discover   → .design/DESIGN-CONTEXT.md
[✓] Plan       → .design/DESIGN-PLAN.md
[→] Design     ← current stage
[ ] Verify
```

Use `[✓]` for complete, `[→]` for current, `[ ]` for pending, `[!]` for gaps/errors.
Show score delta if DESIGN.md baseline + DESIGN-VERIFICATION.md result both exist.

## Jump Mode

If `$ARGUMENTS` is a stage name — invoke it directly, no state check:

```
/ultimate-design scan     → Skill("ultimate-design:scan")
/ultimate-design discover → Skill("ultimate-design:discover")
/ultimate-design plan     → Skill("ultimate-design:plan")
/ultimate-design design   → Skill("ultimate-design:design")
/ultimate-design verify   → Skill("ultimate-design:verify")
/ultimate-design style    → Skill("ultimate-design:style")
```

Pass remaining arguments through: `/ultimate-design scan --quick` → `Skill("ultimate-design:scan", "--quick")`

## Do Not

- Do not perform any design work yourself — route to the stage skill.
- Do not skip stages unless the user explicitly passes a stage argument.
- Do not create or modify `.design/` files — the stage skills own their artifacts.
