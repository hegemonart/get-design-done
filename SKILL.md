---
name: hone
short_name: gdd
description: "Master design pipeline for Claude Code. 5-stage workflow: Brief → Explore → Plan → Design → Verify. Run 'brief' first in any new project to capture the design problem, then 'explore' to inventory the codebase and interview for context. Invoke without arguments for status and auto-routing."
argument-hint: "[brief|explore|plan|design|verify|handoff|map|next|help|status|style|darkmode|live|compare|figma-write|graphify|discuss|list-assumptions|progress|health|todo|stats|note|plant-seed|add-backlog|review-backlog|settings|update|reapply-patches|audit|pause|resume|new-cycle|debug|quick|new-project|complete-cycle|fast|do|ship|undo|pr-branch|sketch|sketch-wrap-up|spike|spike-wrap-up|reflect|apply-reflections|analyze-dependencies|extract-learnings|skill-manifest|pin|unpin|list-pins|new-skill|new-addendum|instinct|warm-cache|optimize|cache-manager|watch-authorities|check-update|benchmark|recall|timeline|continue|zoom-out]"
user-invocable: true
---

# Get Design Done - Pipeline Router

Entry point for the hone toolkit. Establishes the `/hone:` command namespace.

```
Brief → Explore → Plan → Design → Verify  →  next
```

The 5-stage pipeline. `scan` and `discover` (previously deprecated aliases of `explore`) have been removed - use `explore` directly.

Each stage produces artifacts in `.design/` inside the current project.

## Command Reference

| Command | Skill | Purpose |
|---|---|---|
| `brief` | `hone:hone-brief` | Stage 1 of 5 - capture problem, audience, constraints, metrics, scope → BRIEF.md |
| `explore` | `hone:hone-explore` | Stage 2 of 5 - inventory scan + design interview → DESIGN.md, DESIGN-DEBT.md, DESIGN-CONTEXT.md |
| `plan` | `hone:plan` | Stage 3 of 5 - decompose into tasks → DESIGN-PLAN.md |
| `design` | `hone:design` | Stage 4 of 5 - execute tasks → DESIGN-SUMMARY.md |
| `verify` | `hone:verify` | Stage 5 of 5 - score + audit → DESIGN-VERIFICATION.md |
| `handoff <path>` | `hone:hone-handoff` | Skip scan/discover/plan; initialize from Claude Design bundle; route to verify |
| `map` | `hone:hone-map` | Parallel codebase mapping - spawns 5 mappers → `.design/map/*.md` + `.design/DESIGN-MAP.md` |
| `next` | `hone:hone-next` | Route to the next pipeline stage based on STATE.md |
| `help` | `hone:hone-help` | List all commands with one-line descriptions |
| `style [ComponentName]` | `hone:hone-style` | Generate component handoff doc → .design/DESIGN-STYLE-[Name].md |
| `darkmode` | `hone:hone-darkmode` | Audit dark mode architecture + contrast + anti-patterns → .design/DARKMODE-AUDIT.md |
| `live [--variants N] [--resume <id>] [url]` | `hone:hone-live` | Phase 47 - in-browser design iteration: pick an element on a running dev server (via the Preview connection), generate N variants, hot-swap via HMR, accept/discard; session persists to .design/live-sessions/. Degraded screenshot-only mode on harnesses without MCP |
| `compare` | `hone:hone-compare` | Delta between DESIGN.md baseline and DESIGN-VERIFICATION.md → .design/COMPARE-REPORT.md |
| `figma-write <mode>` | `hone:hone-figma-write` | Write design decisions to Figma (annotate/tokenize/mappings) |
| `figma-extract <file-url-or-key>` | `hone:hone-figma-extract` | Off-context Figma design-system extraction → compact local digest (DESIGN.md + tokens.json + components.json), zero raw JSON in context |
| `paper-write <mode>` | `hone:hone-paper-write` | Write design decisions back into paper.design via MCP (annotate/tokenize/roundtrip) |
| `pencil-write <mode>` | `hone:hone-pencil-write` | Write design decisions into git-tracked `.pen` spec files (annotate/roundtrip) |
| `graphify <subcommand>` | `hone:hone-graphify` | Manage Graphify knowledge graph (build/query/status/diff) |
| `discuss [topic] [--all] [--spec] [--cycle <name>]` | `hone:hone-discuss` | Adaptive design interview - spawns design-discussant; appends D-XX decisions to STATE.md |
| `list-assumptions [--area]` | `hone:hone-list-assumptions` | Surface implicit design assumptions baked into the codebase |
| **Audit & Session** | | |
| `audit [--retroactive] [--quick] [--no-reflect]` | `hone:hone-audit` | Wraps design-verifier + design-auditor + design-reflector; `--retroactive` audits full cycle scope |
| `reflect [--dry-run] [--cycle <slug>]` | `hone:hone-reflect` | On-demand reflection - reads cycle data, produces improvement proposals → `.design/reflections/<slug>.md` |
| `apply-reflections [--filter <type>] [--dry-run]` | `hone:hone-apply-reflections` | Review + selectively apply reflection proposals (FRONTMATTER/REFERENCE/BUDGET/QUESTION/GLOBAL-SKILL) |
| `pause [context]` | `hone:hone-pause` | Write numbered checkpoint to `.design/checkpoints/NN-*.md` |
| `resume [N]` | `hone:hone-resume` | Restore session from checkpoint N (or list checkpoints if no arg) |
| `continue [N]` | `hone:hone-continue` | Alias for `/hone:resume` |
| `recall <query>` | `hone:hone-recall` | Search cross-cycle memory (decisions, learnings, experience archives) |
| `timeline [N\|N-M\|all]` | `hone:hone-timeline` | Narrative retrospective across completed cycles |
| **Lifecycle** | | |
| `start [--budget <t>] [--skip-interview] [--dismiss-nudge]` | `hone:start` | First-Run Proof Path - scans UI code, returns one concrete first fix. No STATE.md writes. |
| `new-project [--name <n>]` | `hone:hone-new-project` | Initialize project - PROJECT.md + STATE.md + cycle-1 |
| `new-cycle [<goal>]` | `hone:hone-new-cycle` | Start a new design cycle; writes `.design/CYCLES.md` entry |
| `complete-cycle [<note>]` | `hone:hone-complete-cycle` | Archive cycle artifacts to `.design/archive/cycle-N/`; reset STATE.md |
| **Execution speed** | | |
| `quick [--skip <agent>] [stage]` | `hone:hone-quick` | Run pipeline skipping optional agents for speed |
| `fast <task>` | `hone:hone-fast` | Trivial inline task - no subagents, no pipeline, no artifacts |
| **Debug & Workflow** | | |
| `debug [<symptom>]` | `hone:hone-debug` | Symptom-driven design investigation; persistent state in `.design/DEBUG.md` |
| `do <natural language>` | `hone:hone-do` | Natural-language router - parses intent, confirms, dispatches |
| `report-issue [<cmd>] [--force-report]` | `hone:report-issue` | Consent-gated GitHub issue reporter - triage, pseudonymize, draft to disk, submit via `gh` (no auto-mode; hardcoded destination) |
| **Ship & Safety** | | |
| `ship [--title <t>] [--draft]` | `hone:hone-ship` | Post-verify PR flow - clean branch + `gh pr create` |
| `pr-branch [<base>]` | `hone:hone-pr-branch` | Strip `.design/` and `.planning/` commits for clean code-review branch |
| `undo [<sha>]` | `hone:hone-undo` | Safe revert with dependency check |
| **Ops** | | |
| `progress [--forensic]` | `hone:hone-progress` | Pipeline position + recommended next action; `--forensic` runs 6-check integrity audit |
| `health` | `hone:hone-health` | Artifact health report for `.design/` |
| `todo <add\|list\|pick> [text]` | `hone:hone-todo` | Design todo list → `.design/TODO.md` |
| `stats` | `hone:hone-stats` | Cycle metrics - decisions, commits, todos |
| **Idea capture** | | |
| `note <add\|list\|promote> [text]` | `hone:hone-note` | Zero-friction notes → `.design/NOTES.md` |
| `plant-seed [--trigger <cond>] [text]` | `hone:hone-plant-seed` | Forward-looking idea with trigger → `.design/SEEDS.md` |
| `add-backlog [text]` | `hone:hone-add-backlog` | Park an idea → `.design/backlog/BACKLOG.md` |
| `review-backlog` | `hone:hone-review-backlog` | Walk parked items; promote/archive |
| **Exploration** | | |
| `sketch [topic] [--variants N] [--quick]` | `hone:hone-sketch` | Multi-variant HTML exploration → `.design/sketches/<slug>/variant-*.html` |
| `sketch-wrap-up [slug]` | `hone:hone-sketch-wrap-up` | Pick winner + rationale → writes `./.claude/skills/design-<area>-conventions.md` |
| `spike [hypothesis] [--timebox N]` | `hone:hone-spike` | Timeboxed feasibility experiment → `.design/spikes/<slug>/` |
| `spike-wrap-up [slug]` | `hone:hone-spike-wrap-up` | Capture findings + D-XX decision → `.design/spikes/<slug>/FINDINGS.md` |
| **Configuration** | | |
| `settings <profile\|parallelism\|cleanup\|show>` | `hone:hone-settings` | Manage `.design/config.json` - model profile, parallelism, cleanup |
| **Maintenance** | | |
| `update [--dry-run] [--version <tag>]` | `hone:hone-update` | Update plugin to latest release; preserves config + local skills |
| `reapply-patches [--dry-run]` | `hone:hone-reapply-patches` | Reapply `reference/` customizations after an update |
| `analyze-dependencies [--slice <name>]` | `hone:analyze-dependencies` | Query the `.design/intel/` store - dependency slices, graph queries, phase-scoped reads |
| `extract-learnings [--cycle <slug>]` | `hone:extract-learnings` | Extract decisions, lessons, patterns, and surprises from a completed cycle → `.design/cycles/<slug>/LEARNINGS.md` |
| `skill-manifest [--refresh]` | `hone:skill-manifest` | List or refresh the local skill manifest used by the router for discovery |
| `pin <skill>` | `hone:hone-pin` | Phase 46 - write standalone shortcut aliases for a gdd skill across every installed harness dir (so `/audit` resolves alongside `/hone:audit`); metadata comes from the skills.json catalogue |
| `unpin <skill>` | `hone:hone-unpin` | Phase 46 - remove pinned aliases for a skill (only files carrying the hone-pinned-skill marker) |
| `list-pins` | `hone:hone-list-pins` | Phase 46 - show pinned aliases per harness with their source skill and last-pinned timestamp |
| `new-skill <name>` | `hone:hone-new-skill` | Phase 50 - interactive scaffolder for a new Phase 28.5 + v3-compliant skill (multi-paragraph description, lifecycle stage, optional composes_with); writes source/skills/<name>/SKILL.md |
| `new-addendum <kind> <name>` | `hone:hone-new-addendum` | Phase 54 - scaffold a composable reference addendum (kind = system\|framework\|motion); validates the slug, defaults composes_into by kind, writes a 4-section skeleton at reference/{systems\|frameworks\|motion}/<name>.md that an explore mapper composes at spawn time |
| `instinct [list\|query <kw>\|promote <id>]` | `hone:hone-instinct` | Phase 51 - inspect and manage atomic instinct learning units (project + global stores); list, search by keyword, or promote a vetted project instinct to global once it clears the cross-project gate |
| `quality-gate` | `hone:quality-gate` | Phase 25 - parallel lint/type/test/visual command runner; classifies failures via quality-gate-runner agent |
| `turn-closeout` | `hone:turn-closeout` | Phase 25 - Stop-hook mirror skill; finalizes per-turn STATE blocks and emits closeout events |
| `bandit-status` | `hone:bandit-status` | Phase 27.5 - read-only diagnostic surface for the bandit posterior; per-(agent, bin, delegate, tier) snapshots (alpha, beta, mean, stddev, count, last-used). Use `/hone:bandit-reset` to mutate. |
| `bandit-reset [--yes]` | `hone:bandit-reset` | Phase 23.5 - confirm-then-reset mutation companion to `bandit-status`; backs up `.design/telemetry/posterior.json` to `posterior.json.bak`, then clears it to a fresh empty envelope so the next pull rebootstraps from informed priors. |
| `openrouter-status [--refresh]` | `hone:hone-openrouter-status` | Phase 33.6 - read-only OpenRouter catalog + tier-mapping diagnostic; surfaces catalog freshness (vs 24h TTL), last-fetch, resolved opus/sonnet/haiku → model mappings, per-tier preview. `--refresh` re-fetches (needs `OPENROUTER_API_KEY`). |
| `peers` | `hone:peers` | Phase 27 - `/hone:peers` capability matrix command; shows installed peer-CLIs (codex/gemini/cursor/copilot/qwen), allowlist status, claimed roles, posterior delta vs local |
| `peer-cli-customize` | `hone:peer-cli-customize` | Phase 27 - rewire role→peer mappings on a per-agent basis (edits frontmatter `delegate_to:` directly) |
| `peer-cli-add` | `hone:peer-cli-add` | Phase 27 - guided ladder for adding a brand-new peer (verification ladder + adapter scaffolding + capability-matrix update) |
| `watch-authorities [--refresh] [--since <date>] [--feed <name>] [--schedule <cadence>]` | `hone:hone-watch-authorities` | Run design-authority-watcher - fetch curated feeds, diff snapshot, classify new entries → `.design/authority-report.md` (consumed by `/hone:reflect`) |
| `benchmark <component\|--wave N\|--list\|--refresh component>` | `hone:hone-benchmark` | Harvest + synthesize per-component design specs from 18 design systems → `reference/components/<name>.md` |
| `export <cycle> --format html\|pdf\|notion [--pseudonymize] [--pr]` | `hone:hone-export` | Phase 35.5 - package a finished cycle's design output into a stakeholder-shareable artifact (self-contained HTML / Paged.js-print PDF / Notion page); redacts always, `--pseudonymize` masks identity for external sharing, `--pr` posts the HTML preview via pr-commenter |
| `bootstrap-ds [--primary <color>] [--secondary <color>] [--tone <tags>] [--framework <t>]` | `hone:hone-bootstrap-ds` | Phase 37.2 - bootstrap a design system for a GREENFIELD project (no DS): brand input → OKLCH token system (color tints + modular type + 4pt/8pt spacing + radius/motion) in 3 variants to pick, then button/input/card proof scaffolding via `ds-generator` |
| `rollout-status [<cycle>] [--all] [--stuck]` | `hone:hone-rollout-status` | Phase 38.5 - track a shipped cycle's production rollout (unrolled / staging-only / canary-N% / prod-100%) by reading the feature-flag service via `rollout-coordinator`; surfaces STUCK rollouts; feeds `design_arms` by deployed %. Read-only - never advances or rolls back |
| `budget [--cycles N] [--scenario best\|typical\|worst]` | `hone:hone-budget` | Phase 39.2 - forecast design-cycle spend (best/typical/worst from telemetry variance) via `cost-forecaster`; "at the current rate you'll hit your $X project cap in Y cycles." Read-only - never spends, edits `budget.json`, or halts (the budget-enforcer hook halts) |
| `roi [--since <date>] [--window-days 14]` | `hone:hone-roi` | Phase 39.2 - ROI table joining per-cycle cost with commits that shipped (survived ≥14d) vs reverted → cost-per-shipped-commit + stick rate. Read-only markdown report |
| `migrate [--yes] [--dry-run]` | `hone:hone-migrate` | Phase 39.5 - migrate a project off GDD's own deprecated paths after an upgrade; reads `reference/DEPRECATIONS.md` via `deprecation-registry.cjs`, previews a diff, applies on confirm. Preview-first; never edits silently |
| `review-decisions [<id>] [--pending]` | `hone:hone-review-decisions` | Phase 40 - surface the async decision-review queue (`proposed → reviewing → approved → locked`); `--pending` shows decisions still awaiting action. Read-only |
| `unlock-decision <id> --approver <who> [--reason <text>] [--dry-run]` | `hone:hone-unlock-decision` | Phase 40 - reopen a LOCKED decision (the only escape hatch); requires an approver + writes an audit entry; previews before writing |
| `locale [<code>]` | `hone:hone-locale` | Phase 40.5 - inspect or set the GDD CLI locale (en/ru/uk/de/fr/zh/ja) for `--help`, errors, and skill prompt headers; missing keys fall back to English. No arg reports the resolved locale + coverage |
| `context [nodes --type X \| edges --type Z \| path <a> <b> \| consumers-of <id> \| unreachable \| cycles \| coverage]` | `hone:hone-context` | Phase 52 - read-only query front end for the typed DesignContext graph at `.design/context-graph.json`; lists/filters nodes and edges, traces a path between two nodes, finds a node's consumers, and reports unreachable nodes, dependency cycles, and coverage. Never writes |
| `migrate-context [--dry-run]` | `hone:hone-migrate-context` | Phase 52 - migrate a pre-Phase-52 project from flat `.design/map/*.md` mapper notes to the typed DesignContext graph; runs the extract-*.mjs passes, merges fragments, validates with `validate-design-context.cjs`, and flags low-confidence transforms for review. Preview-first; `--dry-run` previews without writing |
| `override <finding-id \| factforce <path>> [--approver <who>] [--reason <text>]` | `hone:hone-override` | Phase 56 - escalation surface for a risk-gate block or a first-write fact-force hold; with an approver and reason, writes a `D-XX` override-tagged decision (audit trail) for a blocked finding, or clears the fact-force `checked[path]` lock for a path you have legitimately reviewed. Mirrors unlock-decision; never overrides silently |
| `state <query "<sql>" \| recover \| demigrate>` | `hone:hone-state` | Phase 57 - operate the opt-in SQLite state backbone: `query` runs a read-only SELECT over the decisions/blockers/plans tables (engine-level readonly), `recover` rebuilds a corrupt `state.sqlite` from the markdown STATE.md, `demigrate` removes `state.sqlite` to fall back to the markdown-only source of truth. Markdown stays the human-editable SoT; SQLite is opportunistic and reversible |

## Handoff Routing

**Check FIRST** - before any other routing logic. If `$ARGUMENTS` starts with `handoff` OR contains `--from-handoff`:

1. **Extract bundle path:**
   - `handoff <path>` → bundle path is the second argument
   - `--from-handoff <path>` → bundle path is the value after the flag
   - Neither has a path → check STATE.md `handoff_path`; if absent, error: "Provide a bundle path: /hone:handoff ./path/to/bundle.html"
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
   Skill("hone:verify", "--post-handoff")
   ```

6. **Optional: Bidirectional write-back** (post-verify, offered to user)
   After verify completes without FAIL-level gaps:
   - Check STATE.md `<connections>` for `figma:` (the unified remote MCP covers both reads and writes as of v1.0.7.1)
   - `figma: not_configured` or `figma: unavailable` → skip (no offer)
   - `figma: available` → offer: "Write implementation status back to Figma? (annotates frames + Code Connect mappings)"
     Options: [yes, write back] [dry-run, show proposal only] [skip]
   - If yes or dry-run: spawn `agents/design-figma-writer.md` with `mode: implementation-status`, `dry_run: <true|false>`

---

## Routing Logic

When invoked without arguments (or with `status`), show pipeline state and suggest next action:

```
1. No .design/ and no BRIEF.md → Suggest brief first: "New project — run /hone:brief to capture the problem."
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

If `$ARGUMENTS` is a stage or command name - invoke it directly, no state check:

> This table lists the common stage and shortcut routes. Every skill in `scripts/lib/manifest/skills.json` is auto-resolvable as `/hone:<name>`; run `/hone:help` for the complete, always-current command reference (rendered from the manifest, never a hardcoded subset).

```
/hone:brief     → Skill("hone:hone-brief")
/hone:explore   → Skill("hone:hone-explore")
/hone:plan      → Skill("hone:plan")          # stage 3-of-5
/hone:design    → Skill("hone:design")        # stage 4-of-5
/hone:verify    → Skill("hone:verify")        # stage 5-of-5
/hone:handoff   → Skill("hone:hone-handoff")
/hone:map       → Skill("hone:hone-map")       # parallel codebase mapping
/hone:next      → Skill("hone:hone-next")
/hone:help      → Skill("hone:hone-help")
/hone:style     → Skill("hone:hone-style")
/hone:darkmode     → Skill("hone:hone-darkmode")
/hone:compare      → Skill("hone:hone-compare")
/hone:figma-write  → Skill("hone:hone-figma-write")
/hone:graphify     → Skill("hone:hone-graphify")
/hone:discuss          → Skill("hone:hone-discuss")
/hone:list-assumptions → Skill("hone:hone-list-assumptions")
/hone:progress         → Skill("hone:hone-progress")
/hone:health           → Skill("hone:hone-health")
/hone:todo             → Skill("hone:hone-todo")
/hone:stats            → Skill("hone:hone-stats")
# --- Idea capture ---
/hone:note           → Skill("hone:hone-note")
/hone:plant-seed     → Skill("hone:hone-plant-seed")
/hone:add-backlog    → Skill("hone:hone-add-backlog")
/hone:review-backlog → Skill("hone:hone-review-backlog")
# --- Configuration ---
/hone:settings        → Skill("hone:hone-settings")
# --- Maintenance ---
/hone:update          → Skill("hone:hone-update")
/hone:reapply-patches → Skill("hone:hone-reapply-patches")
# --- Audit & Session ---
/hone:audit              → Skill("hone:hone-audit")
/hone:reflect            → Skill("hone:hone-reflect")
/hone:apply-reflections  → Skill("hone:hone-apply-reflections")
/hone:watch-authorities  → Skill("hone:hone-watch-authorities")
/hone:benchmark          → Skill("hone:hone-benchmark")
/hone:pause              → Skill("hone:hone-pause")
/hone:resume             → Skill("hone:hone-resume")
/hone:continue           → Skill("hone:hone-continue")
/hone:recall             → Skill("hone:hone-recall")
/hone:timeline           → Skill("hone:hone-timeline")
# --- Lifecycle ---
/hone:start           → Skill("hone:start")          # leaf command, no STATE.md
/hone:new-project     → Skill("hone:hone-new-project")
/hone:new-cycle       → Skill("hone:hone-new-cycle")
/hone:complete-cycle  → Skill("hone:hone-complete-cycle")
# --- Execution speed ---
/hone:quick           → Skill("hone:hone-quick")
/hone:fast            → Skill("hone:hone-fast")
# --- Debug & Workflow ---
/hone:debug           → Skill("hone:hone-debug")
/hone:do              → Skill("hone:hone-do")
/hone:report-issue    → Skill("hone:report-issue")
# --- Ship & Safety ---
/hone:ship            → Skill("hone:hone-ship")
/hone:pr-branch       → Skill("hone:hone-pr-branch")
/hone:undo            → Skill("hone:hone-undo")
# --- Exploration ---
/hone:sketch          → Skill("hone:hone-sketch")
/hone:sketch-wrap-up  → Skill("hone:hone-sketch-wrap-up")
/hone:spike           → Skill("hone:hone-spike")
/hone:spike-wrap-up   → Skill("hone:hone-spike-wrap-up")
# --- Bootstrap (not slash-routed) ---
# using-gdd → injected at SessionStart by hooks/inject-using-gdd.cjs
#   (disable-model-invocation: true). The skill-discipline contract;
#   not a user-invoked command — see skills/using-gdd/SKILL.md.
```

Pass remaining arguments through: `/hone:explore --skip-interview` → `Skill("hone:hone-explore", "--skip-interview")`.

## Do Not

- Do not perform any design work yourself - route to the stage skill.
- Do not skip stages unless the user explicitly passes a stage argument.
- Do not create or modify `.design/` files - the stage skills own their artifacts.
