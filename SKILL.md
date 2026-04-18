---
name: get-design-done
short_name: gdd
description: "Master design pipeline for Claude Code. 5-stage workflow: Brief → Explore → Plan → Design → Verify. Run 'brief' first in any new project to capture the design problem, then 'explore' to inventory the codebase and interview for context. Invoke without arguments for status and auto-routing."
argument-hint: "[brief|explore|plan|design|verify|handoff|map|next|help|status|style|darkmode|compare|figma-write|discuss|list-assumptions|progress|health|todo|stats|note|plant-seed|add-backlog|review-backlog|scan|discover|settings|update|reapply-patches|audit|pause|resume|new-cycle|debug|quick|new-project|complete-cycle|fast|do|ship|undo|pr-branch|sketch|sketch-wrap-up|spike|spike-wrap-up]"
user-invocable: true
---

# Get Design Done — Pipeline Router

Entry point for the get-design-done toolkit. Establishes the `/gdd:` command namespace.

```
Brief → Explore → Plan → Design → Verify  →  next
```

The 5-stage pipeline. `scan` and `discover` are now merged into `explore` — their old aliases still route through for backward compatibility.

Each stage produces artifacts in `.design/` inside the current project.

## Command Reference

| Command | Skill | Purpose |
|---|---|---|
| `brief` | `get-design-done:gdd-brief` | Stage 1 of 5 — capture problem, audience, constraints, metrics, scope → BRIEF.md |
| `explore` | `get-design-done:gdd-explore` | Stage 2 of 5 — inventory scan + design interview → DESIGN.md, DESIGN-DEBT.md, DESIGN-CONTEXT.md |
| `plan` | `get-design-done:plan` | Stage 3 of 5 — decompose into tasks → DESIGN-PLAN.md |
| `design` | `get-design-done:design` | Stage 4 of 5 — execute tasks → DESIGN-SUMMARY.md |
| `verify` | `get-design-done:verify` | Stage 5 of 5 — score + audit → DESIGN-VERIFICATION.md |
| `handoff <path>` | inline | Skip scan/discover/plan; initialize from Claude Design bundle; route to verify |
| `map` | `get-design-done:gdd-map` | Parallel codebase mapping — spawns 5 mappers → `.design/map/*.md` + `.design/DESIGN-MAP.md` |
| `next` | `get-design-done:gdd-next` | Route to the next pipeline stage based on STATE.md |
| `help` | `get-design-done:gdd-help` | List all commands with one-line descriptions |
| `style [ComponentName]` | `get-design-done:style` | Generate component handoff doc → .design/DESIGN-STYLE-[Name].md |
| `darkmode` | `get-design-done:darkmode` | Audit dark mode architecture + contrast + anti-patterns → .design/DARKMODE-AUDIT.md |
| `compare` | `get-design-done:compare` | Delta between DESIGN.md baseline and DESIGN-VERIFICATION.md → .design/COMPARE-REPORT.md |
| `figma-write <mode>` | `get-design-done:figma-write` | Write design decisions to Figma (annotate/tokenize/mappings) |
| `discuss [topic] [--all] [--spec] [--cycle <name>]` | `get-design-done:gdd-discuss` | Adaptive design interview — spawns design-discussant; appends D-XX decisions to STATE.md |
| `list-assumptions [--area]` | `get-design-done:gdd-list-assumptions` | Surface implicit design assumptions baked into the codebase |
| **Audit & Session** | | |
| `audit [--retroactive] [--quick]` | `get-design-done:gdd-audit` | Wraps design-verifier + design-auditor; `--retroactive` audits full cycle scope |
| `pause [context]` | `get-design-done:gdd-pause` | Write session handoff to `.design/HANDOFF.md` |
| `resume` | `get-design-done:gdd-resume` | Restore session context from `.design/HANDOFF.md` and route to next step |
| **Lifecycle** | | |
| `new-project [--name <n>]` | `get-design-done:gdd-new-project` | Initialize project — PROJECT.md + STATE.md + cycle-1 |
| `new-cycle [<goal>]` | `get-design-done:gdd-new-cycle` | Start a new design cycle; writes `.design/CYCLES.md` entry |
| `complete-cycle [<note>]` | `get-design-done:gdd-complete-cycle` | Archive cycle artifacts to `.design/archive/cycle-N/`; reset STATE.md |
| **Execution speed** | | |
| `quick [--skip <agent>] [stage]` | `get-design-done:gdd-quick` | Run pipeline skipping optional agents for speed |
| `fast <task>` | `get-design-done:gdd-fast` | Trivial inline task — no subagents, no pipeline, no artifacts |
| **Debug & Workflow** | | |
| `debug [<symptom>]` | `get-design-done:gdd-debug` | Symptom-driven design investigation; persistent state in `.design/DEBUG.md` |
| `do <natural language>` | `get-design-done:gdd-do` | Natural-language router — parses intent, confirms, dispatches |
| **Ship & Safety** | | |
| `ship [--title <t>] [--draft]` | `get-design-done:gdd-ship` | Post-verify PR flow — clean branch + `gh pr create` |
| `pr-branch [<base>]` | `get-design-done:gdd-pr-branch` | Strip `.design/` and `.planning/` commits for clean code-review branch |
| `undo [<sha>]` | `get-design-done:gdd-undo` | Safe revert with dependency check |
| **Ops** | | |
| `progress [--forensic]` | `get-design-done:gdd-progress` | Pipeline position + recommended next action; `--forensic` runs 6-check integrity audit |
| `health` | `get-design-done:gdd-health` | Artifact health report for `.design/` |
| `todo <add\|list\|pick> [text]` | `get-design-done:gdd-todo` | Design todo list → `.design/TODO.md` |
| `stats` | `get-design-done:gdd-stats` | Cycle metrics — decisions, commits, todos |
| **Idea capture** | | |
| `note <add\|list\|promote> [text]` | `get-design-done:gdd-note` | Zero-friction notes → `.design/NOTES.md` |
| `plant-seed [--trigger <cond>] [text]` | `get-design-done:gdd-plant-seed` | Forward-looking idea with trigger → `.design/SEEDS.md` |
| `add-backlog [text]` | `get-design-done:gdd-add-backlog` | Park an idea → `.design/backlog/BACKLOG.md` |
| `review-backlog` | `get-design-done:gdd-review-backlog` | Walk parked items; promote/archive |
| **Exploration** | | |
| `sketch [topic] [--variants N] [--quick]` | `get-design-done:gdd-sketch` | Multi-variant HTML exploration → `.design/sketches/<slug>/variant-*.html` |
| `sketch-wrap-up [slug]` | `get-design-done:gdd-sketch-wrap-up` | Pick winner + rationale → writes `./.claude/skills/design-<area>-conventions.md` |
| `spike [hypothesis] [--timebox N]` | `get-design-done:gdd-spike` | Timeboxed feasibility experiment → `.design/spikes/<slug>/` |
| `spike-wrap-up [slug]` | `get-design-done:gdd-spike-wrap-up` | Capture findings + D-XX decision → `.design/spikes/<slug>/FINDINGS.md` |
| `scan` *(deprecated)* | `get-design-done:scan` | Alias — use `explore` instead |
| `discover` *(deprecated)* | `get-design-done:discover` | Alias — use `explore` instead |
| **Configuration** | | |
| `settings <profile\|parallelism\|cleanup\|show>` | `get-design-done:gdd-settings` | Manage `.design/config.json` — model profile, parallelism, cleanup |
| **Maintenance** | | |
| `update [--dry-run] [--version <tag>]` | `get-design-done:gdd-update` | Update plugin to latest release; preserves config + local skills |
| `reapply-patches [--dry-run]` | `get-design-done:gdd-reapply-patches` | Reapply `reference/` customizations after an update |

## Handoff Routing

**Check FIRST** — before any other routing logic. If `$ARGUMENTS` starts with `handoff` OR contains `--from-handoff`:

1. **Extract bundle path:**
   - `handoff <path>` → bundle path is the second argument
   - `--from-handoff <path>` → bundle path is the value after the flag
   - Neither has a path → check STATE.md `handoff_path`; if absent, error: "Provide a bundle path: /gdd:handoff ./path/to/bundle.html"
   - Verify the file exists; if not, error: "Bundle not found at <path>"

2. **Initialize STATE.md:**
   - If `.design/STATE.md` does not exist: copy `reference/STATE-TEMPLATE.md` to `.design/STATE.md`
   - Set in `<position>`: `handoff_source: claude-design-html`, `handoff_path: <resolved path>`, `skipped_stages: scan, discover, plan`, `status: handoff-sourced`, `stage: verify`
   - Set in `<connections>`: `claude_design: available`; all others remain `not_configured`

3. **Spawn design-research-synthesizer** in handoff mode:
   ```
   Task("design-research-synthesizer", """
   mode: handoff
   handoff_path: <resolved bundle path>
   state_path: .design/STATE.md
   """)
   ```
   Wait for `## SYNTHESIZE COMPLETE`.

4. **Spawn design-discussant** in `--from-handoff` mode:
   ```
   Task("design-discussant", """
   <mode>--from-handoff</mode>
   <required_reading>.design/STATE.md</required_reading>
   """)
   ```
   Wait for `## DISCUSS COMPLETE`.

5. **Route to verify** with `--post-handoff` flag:
   ```
   Skill("get-design-done:verify", "--post-handoff")
   ```

6. **Optional: Bidirectional write-back** (post-verify, offered to user)
   After verify completes without FAIL-level gaps:
   - Check STATE.md `<connections>` for `figma_writer`
   - `figma_writer: not_configured` → skip (no offer)
   - `figma_writer: available` → offer: "Write implementation status back to Figma? (annotates frames + Code Connect mappings)"
     Options: [yes, write back] [dry-run, show proposal only] [skip]
   - If yes or dry-run: spawn `agents/design-figma-writer.md` with `mode: implementation-status`, `dry_run: <true|false>`

---

## Routing Logic

When invoked without arguments (or with `status`), show pipeline state and suggest next action:

```
1. No .design/ and no BRIEF.md → Suggest brief first: "New project — run /gdd:brief to capture the problem."
2. BRIEF.md exists, no DESIGN.md → Route to explore
3. DESIGN.md + DESIGN-CONTEXT.md exist, no DESIGN-PLAN.md → Route to plan
4. DESIGN-PLAN.md exists, DESIGN-SUMMARY.md missing → Route to design
5. DESIGN-SUMMARY.md exists, DESIGN-VERIFICATION.md missing → Route to verify
6. DESIGN-VERIFICATION.md exists → Show summary + offer to start new cycle
```

## Status Display

```
━━━ Get Design Done Pipeline ━━━
[✓] Brief      → .design/BRIEF.md
[✓] Explore    → DESIGN.md + DESIGN-DEBT.md + DESIGN-CONTEXT.md   (stage 2-of-5; replaces scan+discover)
[→] Plan       ← current stage (3-of-5)
[ ] Design     (4-of-5)
[ ] Verify     (5-of-5)
```

Use `[✓]` for complete, `[→]` for current, `[ ]` for pending, `[!]` for gaps/errors.

## Jump Mode

If `$ARGUMENTS` is a stage or command name — invoke it directly, no state check:

```
/gdd:brief     → Skill("get-design-done:gdd-brief")
/gdd:explore   → Skill("get-design-done:gdd-explore")
/gdd:plan      → Skill("get-design-done:plan")          # stage 3-of-5
/gdd:design    → Skill("get-design-done:design")        # stage 4-of-5
/gdd:verify    → Skill("get-design-done:verify")        # stage 5-of-5
/gdd:handoff   → [Handoff Routing] (inline — see ## Handoff Routing above)
/gdd:map       → Skill("get-design-done:gdd-map")       # parallel codebase mapping
/gdd:next      → Skill("get-design-done:gdd-next")
/gdd:help      → Skill("get-design-done:gdd-help")
/gdd:style     → Skill("get-design-done:style")
/gdd:darkmode     → Skill("get-design-done:darkmode")
/gdd:compare      → Skill("get-design-done:compare")
/gdd:figma-write  → Skill("get-design-done:figma-write")
/gdd:discuss          → Skill("get-design-done:gdd-discuss")
/gdd:list-assumptions → Skill("get-design-done:gdd-list-assumptions")
/gdd:progress         → Skill("get-design-done:gdd-progress")
/gdd:health           → Skill("get-design-done:gdd-health")
/gdd:todo             → Skill("get-design-done:gdd-todo")
/gdd:stats            → Skill("get-design-done:gdd-stats")
# --- Idea capture ---
/gdd:note           → Skill("get-design-done:gdd-note")
/gdd:plant-seed     → Skill("get-design-done:gdd-plant-seed")
/gdd:add-backlog    → Skill("get-design-done:gdd-add-backlog")
/gdd:review-backlog → Skill("get-design-done:gdd-review-backlog")
/gdd:scan      → Skill("get-design-done:gdd-explore")   # deprecated alias → explore
/gdd:discover  → Skill("get-design-done:gdd-explore")   # deprecated alias → explore
# --- Configuration ---
/gdd:settings        → Skill("get-design-done:gdd-settings")
# --- Maintenance ---
/gdd:update          → Skill("get-design-done:gdd-update")
/gdd:reapply-patches → Skill("get-design-done:gdd-reapply-patches")
# --- Audit & Session ---
/gdd:audit           → Skill("get-design-done:gdd-audit")
/gdd:pause           → Skill("get-design-done:gdd-pause")
/gdd:resume          → Skill("get-design-done:gdd-resume")
# --- Lifecycle ---
/gdd:new-project     → Skill("get-design-done:gdd-new-project")
/gdd:new-cycle       → Skill("get-design-done:gdd-new-cycle")
/gdd:complete-cycle  → Skill("get-design-done:gdd-complete-cycle")
# --- Execution speed ---
/gdd:quick           → Skill("get-design-done:gdd-quick")
/gdd:fast            → Skill("get-design-done:gdd-fast")
# --- Debug & Workflow ---
/gdd:debug           → Skill("get-design-done:gdd-debug")
/gdd:do              → Skill("get-design-done:gdd-do")
# --- Ship & Safety ---
/gdd:ship            → Skill("get-design-done:gdd-ship")
/gdd:pr-branch       → Skill("get-design-done:gdd-pr-branch")
/gdd:undo            → Skill("get-design-done:gdd-undo")
# --- Exploration ---
/gdd:sketch          → Skill("get-design-done:gdd-sketch")
/gdd:sketch-wrap-up  → Skill("get-design-done:gdd-sketch-wrap-up")
/gdd:spike           → Skill("get-design-done:gdd-spike")
/gdd:spike-wrap-up   → Skill("get-design-done:gdd-spike-wrap-up")
```

Pass remaining arguments through: `/gdd:explore --skip-interview` → `Skill("get-design-done:gdd-explore", "--skip-interview")`.

## Do Not

- Do not perform any design work yourself — route to the stage skill.
- Do not skip stages unless the user explicitly passes a stage argument.
- Do not create or modify `.design/` files — the stage skills own their artifacts.
