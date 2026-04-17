---
name: get-design-done
description: "Master design pipeline for Claude Code. Includes a one-time scanner (scan) plus a 4-stage workflow: Discover → Plan → Design → Verify. Run 'scan' first in any new repo to map existing design system and generate a debt roadmap. Then use 'discover' to start the pipeline. Invoke without arguments for status and auto-routing."
argument-hint: "[scan|discover|plan|design|verify|status|style|darkmode|compare]"
user-invocable: true
---

# Get Design Done — Pipeline Router

Entry point for the get-design-done toolkit:

```
scan → Discover → Plan → Design → Verify
```

`scan` is a one-time initializer. The pipeline stages are iterative — run them in order, or use `status` to resume where you left off.

Each stage produces artifacts in `.design/` inside the current project.

## Command Reference

| Command | Skill | Purpose |
|---|---|---|
| `scan` | `get-design-done:scan` | Map existing design system, generate DESIGN.md + debt roadmap |
| `discover` | `get-design-done:discover` | Discovery interview + baseline audit → DESIGN-CONTEXT.md |
| `plan` | `get-design-done:plan` | Decompose into tasks → DESIGN-PLAN.md |
| `design` | `get-design-done:design` | Execute tasks → DESIGN-SUMMARY.md |
| `verify` | `get-design-done:verify` | Score + audit → DESIGN-VERIFICATION.md |
| `style [ComponentName]` | `get-design-done:style` | Generate component handoff doc → .design/DESIGN-STYLE-[Name].md |
| `darkmode` | `get-design-done:darkmode` | Audit dark mode architecture + contrast + anti-patterns → .design/DARKMODE-AUDIT.md |
| `compare` | `get-design-done:compare` | Delta between DESIGN.md baseline and DESIGN-VERIFICATION.md → .design/COMPARE-REPORT.md |

## Routing Logic

When invoked without arguments (or with `status`), show pipeline state and suggest next action:

```
1. No DESIGN.md and no .design/ → Suggest scan first: "New repo detected — run /get-design-done scan to map the design system."
2. DESIGN.md exists, no DESIGN-CONTEXT.md → Suggest discover
3. DESIGN-CONTEXT.md missing → Route to discover
4. DESIGN-CONTEXT.md exists, DESIGN-PLAN.md missing → Route to plan
5. DESIGN-PLAN.md exists, DESIGN-SUMMARY.md missing → Route to design
6. DESIGN-SUMMARY.md exists, DESIGN-VERIFICATION.md missing → Route to verify
7. DESIGN-VERIFICATION.md exists → Show summary + offer to start new session
```

## Status Display

```
━━━ Get Design Done Pipeline ━━━
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
/get-design-done scan     → Skill("get-design-done:scan")
/get-design-done discover → Skill("get-design-done:discover")
/get-design-done plan     → Skill("get-design-done:plan")
/get-design-done design   → Skill("get-design-done:design")
/get-design-done verify   → Skill("get-design-done:verify")
/get-design-done style    → Skill("get-design-done:style")
/get-design-done darkmode → Skill("get-design-done:darkmode")
/get-design-done compare  → Skill("get-design-done:compare")
```

Pass remaining arguments through: `/get-design-done scan --quick` → `Skill("get-design-done:scan", "--quick")`

## Do Not

- Do not perform any design work yourself — route to the stage skill.
- Do not skip stages unless the user explicitly passes a stage argument.
- Do not create or modify `.design/` files — the stage skills own their artifacts.
