# Phase 1: Foundation + Distribution + Infrastructure — Research

**Researched:** 2026-04-17
**Domain:** Claude Code plugin authoring, POSIX bash, git tracking, markdown artifact design
**Confidence:** HIGH — all findings derived from direct inspection of working production files

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Distribution cleanup:**
- `.gitignore` additions: `.planning/`, `.claude/memory/`, `.claude/settings.local.json`
- Untracking strategy: `git rm --cached -r` — keeps history, stops forward tracking
- History-rewrite (filter-repo) explicitly rejected — history documents how the plugin was built
- README.md gets a "Distribution" section documenting what ships vs what is dev-only

**Cross-platform bash:**
- Grep pattern migration: `grep -E "a|b|c"` replaces `grep "a\|b\|c"` across all skills
- `.gitattributes` enforces LF for `*.md`, `*.sh`, and `*.json` files
- Bootstrap script path normalization: convert Windows paths to forward-slash style before string operations
- Apply same grep fixes in scan/SKILL.md AND verify/SKILL.md in one pass (they share duplicated patterns — fixing only one creates divergence)

**SCAN-04 fallback path priority:**
- Check order: `src/` → `app/` → `pages/` → `lib/`
- Log matched path in DESIGN.md under `source_roots:` for transparency

**State machine (`.design/STATE.md`):**
- Format: markdown with XML tags (matches existing DESIGN-CONTEXT.md pattern)
- Location: `.design/STATE.md` (pipeline runtime) — separate from `.planning/STATE.md` (GSD dev state)
- Sections: `<position>`, `<decisions>`, `<must_haves>`, `<connections>`, `<blockers>`, `<timestamps>`
- Write contract: every stage reads at entry, updates at completion; resume from last checkpoint
- Initialization: scan creates if missing with minimal skeleton; discover fills `<decisions>` and `<must_haves>`

**`agents/` directory README scope:**
- Rich authoring documentation for 14 future agents
- Sections: frontmatter schema (name, description, tools, color, model), required_reading pattern, completion markers, how stages invoke agents (Task tool), worked example with placeholder agent
- Reference GSD's agent patterns directly

**`connections/` directory:**
- `connections.md` index with active (Figma, Refero) and future (Storybook, Linear, GitHub) connections
- Capability matrix: rows = connections, columns = stages
- Extensibility guide: how to add a new connection
- `refero.md` moves from `reference/refero.md` → `connections/refero.md` via `git mv`

### Claude's Discretion

- Exact wording of README files
- Specific grep pattern rewrites per file (derived from existing patterns)
- `.gitattributes` additional extensions beyond `*.md`, `*.sh`, `*.json`
- Order of plan execution within the phase (plans are mostly independent)

### Deferred Ideas (OUT OF SCOPE)

- Root SKILL.md status line for pipeline state — defer to Phase 2 or later
- Pipeline STATE.md ↔ GSD STATE.md cross-reference — defer to Phase 6
- Extension beyond `.md`/`.sh`/`.json` in `.gitattributes` — add as needed in later phases
- Agent completion marker registry as a standalone file — defer to Phase 2

</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| DIST-01 | `.gitignore` excludes `.planning/`, `.claude/memory/`, `.claude/settings.local.json` | Direct: current `.gitignore` has `.design/` + `.DS_Store`; additions are straightforward appends |
| DIST-02 | `.planning/` and `.claude/memory/` removed from git tracking via `git rm --cached` | Direct: confirmed files tracked — see Git Tracking section; untrack procedure documented |
| DIST-03 | README.md documents what ships vs dev-only | Direct: README.md exists, needs a "Distribution" section; ship list from CONTEXT.md |
| PLAT-01 | All bash grep patterns use POSIX-compatible `-E` syntax | Direct: 19 specific GNU `\|` lines identified in scan/SKILL.md + 4 in verify/SKILL.md — exact inventory below |
| PLAT-02 | `grep` calls across all skills include `-E` flag and work on macOS, Windows, Linux | Direct: same 23 lines are the complete scope — STACK.md cross-platform patterns apply |
| PLAT-03 | `.gitattributes` enforces LF for `*.md` and `*.sh` files | Research: exact format for `.gitattributes` documented below |
| PLAT-04 | Bootstrap script path normalization works on Windows | Direct: bootstrap.sh has partial handling; path normalization pattern documented |
| STATE-01 | `.design/STATE.md` template defined | Direct: GSD STATE.md structure adapted; XML-tag format from DESIGN-CONTEXT.md pattern |
| STATE-02 | Every pipeline stage reads STATE.md at entry and writes at completion | Note: CONTRACT is defined in this phase; stage rewrites are Phase 2 — template documents the contract |
| STATE-03 | Resume capability — stages detect mid-wave state from STATE.md | Note: implemented in Phase 2 stage rewrites; STATE-01 template must have the checkpoint fields |
| AGENT-00 | `agents/` directory with README.md | Direct: GSD agent frontmatter patterns confirmed; completion marker conventions confirmed |
| CONN-00 | `connections/` directory with `connections.md` | Direct: refero.md content (112 lines) ready to move; capability matrix columns known from pipeline stages |
| SCAN-04 | Fallback paths handle non-standard layouts | Direct: STACK.md has the portable fallback loop pattern; check order from CONTEXT.md |

</phase_requirements>

---

## Summary

Phase 1 is pure infrastructure — no new features, no stage rewrites. It has three areas: (1) git hygiene (gitignore additions + untracking already-committed files), (2) bash portability fixes (23 specific lines in scan + verify skills that use GNU-only `\|` alternation, plus 4 `find` commands to assess), and (3) scaffolding (STATE.md template, agents/ README, connections/ directory + connections.md, refero.md move).

All research is HIGH confidence because every finding comes from direct inspection of working production files. No external tools were needed — the codebase is self-documenting.

**Primary recommendation:** Execute in 5 independent plans: (A) distribution cleanup, (B) bash portability, (C) STATE.md template, (D) agents/ scaffold, (E) connections/ scaffold. Plans A and B are prerequisites for nothing — all 5 can be sequenced arbitrarily or merged.

---

## Standard Stack

### Core (already in project — no new installs)

| Artifact | Role | Standard Pattern |
|----------|------|-----------------|
| `.gitignore` | Exclude dev artifacts | Append-only; one entry per line |
| `.gitattributes` | Enforce LF endings | `*.ext text eol=lf` pattern |
| `git rm --cached -r` | Untrack committed files | Standard git, safe — preserves history |
| `git mv` | Move file preserving blame | Standard git; blame follows rename in GitHub/GitLab |
| SKILL.md with YAML frontmatter | Skill authoring | Confirmed: name, description, argument-hint, user-invocable |
| XML-tagged markdown | Pipeline artifact format | Confirmed pattern: `<decisions>`, `<must_haves>`, etc. |

**No new dependencies.** This phase operates entirely on existing infrastructure.

---

## Architecture Patterns

### Recommended Directory Structure After Phase 1

```
ultimate-design/
├── agents/
│   └── README.md          # authoring contract for 14 future agents
├── connections/
│   ├── connections.md     # index + capability matrix + extensibility guide
│   └── refero.md          # moved from reference/refero.md via git mv
├── reference/             # unchanged (refero.md removed)
├── scripts/
│   └── bootstrap.sh       # updated: Windows path normalization added
├── skills/
│   ├── scan/SKILL.md      # updated: grep → grep -E, fallback paths
│   └── verify/SKILL.md    # updated: grep → grep -E (same lines)
├── .gitattributes         # new: LF enforcement
├── .gitignore             # updated: add .planning/, .claude/memory/, .claude/settings.local.json
└── README.md              # updated: add Distribution section
```

### Pattern 1: `.gitattributes` LF Enforcement

**What:** Force LF line endings for text files that must be consistent across platforms.

**Standard format** (HIGH confidence — git documentation):
```
# Force LF for all plugin text files
*.md    text eol=lf
*.sh    text eol=lf
*.json  text eol=lf
```

Place at repo root. Apply after adding: `git add .gitattributes && git commit`, then optionally `git rm --cached -r . && git reset --hard HEAD` to renormalize existing files (only if CRLF files exist in repo). Since bootstrap.sh is already noted to use Unix line endings correctly, renormalization is likely cosmetic only.

**Note:** `.gitattributes` is itself a text file — list it as tracked, not gitignored.

### Pattern 2: Git-Safe Untracking Procedure

**What:** Remove files from git tracking without deleting them or rewriting history.

**Procedure** (HIGH confidence — standard git):
```bash
# Step 1: Add to .gitignore FIRST (before rm --cached)
# Add .planning/ and .claude/memory/ to .gitignore

# Step 2: Remove from tracking (keeps local files)
git rm --cached -r .planning/
git rm --cached -r .claude/memory/

# Step 3: Commit the untracking
git commit -m "chore: untrack dev artifacts (.planning/, .claude/memory/)"

# Files remain on disk. Future sessions will not track new changes.
```

**Confirmed tracked files that will be untracked:**
- `.planning/PROJECT.md`, `REQUIREMENTS.md`, `ROADMAP.md`, `STATE.md`, `config.json`
- `.planning/phases/01-foundation-distribution-infrastructure/01-CONTEXT.md`
- `.planning/research/ARCHITECTURE.md`, `FEATURES.md`, `PITFALLS.md`, `STACK.md`, `SUMMARY.md`
- `.claude/memory/MEMORY.md`, `design_philosophy.md`, `polish_backlog.md`, `project_context.md`

**`.claude/settings.local.json`:** This file does not appear in current git tracking — it is likely already absent or untracked. The `.gitignore` entry is still needed to prevent future accidental commits.

### Pattern 3: `git mv` for Blame Preservation

**What:** Move `reference/refero.md` → `connections/refero.md` without losing git blame history.

**Procedure** (HIGH confidence — standard git):
```bash
# Ensure connections/ directory exists first
mkdir -p connections/

# Move with git mv — git tracks as rename, blame is preserved
git mv reference/refero.md connections/refero.md

# Commit
git commit -m "chore: move refero.md to connections/"
```

After this, `git log --follow connections/refero.md` shows full history including the rename.

### Pattern 4: POSIX Grep Migration

**What:** Replace all GNU-only `\|` alternation with POSIX `-E` flag and `|`.

**19 lines in scan/SKILL.md** that need migration (line numbers confirmed by direct grep):

| Line | Pattern | Fix |
|------|---------|-----|
| 54 | `grep -roh "oklch([^)]*)\|hsl([^)]*)\|rgb([^)]*)"` | `grep -rEoh "oklch\([^)]*\)\|hsl\([^)]*\)\|rgb\([^)]*\)"` — wait, this is regex, needs `-E` and `|` not `\|` |
| 57 | `grep -roh "\-\-[a-z]...\|..."` | `grep -rEoh "..."` with `|` not `\|` |
| 82 | `grep -roh "font-family:...\|fontFamily:..."` | `grep -rEoh "..."` with `|` |
| 85 | `grep -roh "font-size:...\|text-\(xs\|sm\|..."` | `grep -rEoh "..."` with `|` and no backslash-parens |
| 88 | `grep -roh "font-weight:...\|fw-[0-9]*\|font-\(thin\|..."` | `grep -rEoh "..."` |
| 91 | `grep -roh "line-height:...\|leading-..."` | `grep -rEoh "..."` with `|` |
| 113 | `grep -roh "padding:...\|margin:...\|gap:..."` | `grep -rEoh "..."` with `|` |
| 119 | `grep -roh "\-\-space...\|\-\-spacing..."` | `grep -rEoh "..."` |
| 134 | `grep -rn "border-left:...\|border-right:..."` | `grep -rEn "..."` |
| 135 | `grep -rn "background-clip:...\|text-fill-color:..."` | `grep -rEn "..."` |
| 136 | `grep -rn "cubic-bezier(...-[0-9]\|bounce\|elastic"` | `grep -rEn "..."` |
| 138 | `grep -rn "#000000\b\|rgb(0,\s*0,\s*0)"` | `grep -rEn "..."` |
| 139 | `grep -rn "user-scalable=no\|maximum-scale=1"` | `grep -rEn "..."` |
| 143 | `grep -rn "#6366f1\|#8b5cf6\|#06b6d4"` | `grep -rEn "..."` |
| 147 | `grep -rn "outline:\s*none\|outline:\s*0"` | `grep -rEn "..."` |
| 149 | `grep -rn "onClick.*div\|<div.*onClick"` | `grep -rEn "..."` |
| 150 | `grep -rn "font-size:\s*1[0-5]px\|font-size:\s*[0-9]px"` | `grep -rEn "..."` |
| 166 | `grep -rln "className=\|class=\|styled\."` | `grep -rEln "..."` |
| 169 | `grep -rln "Button\|Modal\|Dialog\|..."` | `grep -rEln "..."` |

**4 lines in verify/SKILL.md** (lines 43, 45, 48, 52 — confirmed subset of scan patterns):

| Line | Pattern |
|------|---------|
| 43 | `grep -rn "background-clip:\s*text\|text-fill-color:..."` |
| 45 | `grep -rn "user-scalable=no\|maximum-scale=1"` |
| 48 | `grep -rn "#6366f1\|#8b5cf6\|#06b6d4"` |
| 52 | `grep -rn "outline:\s*none\|outline:\s*0"` |

**Transformation rule:** For every `grep` command (with any flags), add `-E` to the flags, and replace every `\|` with `|`. Also replace `\(group\)` with `(group)` since `-E` mode uses unescaped parens for grouping.

**Critical:** With `-E`, the meaning of `(` changes — it now groups. Existing patterns like `"font-size:\s*[0-9\.]*\(rem\|px\|em\)"` must become `"font-size:\s*[0-9.]*\(rem|px|em\)"` — the literal parens in CSS values must be backslash-escaped, but `\|` becomes `|`. Do each pattern carefully.

**`find` commands in scan (lines 33, 34, 37, 40, 163):** Per CONTEXT.md and STACK.md, these can stay as-is for PLAT-01/PLAT-02 scope (the requirement is about grep patterns specifically). However, SCAN-04 (fallback paths) overlaps with line 163 — that `find` invocation should become the portable fallback loop per the locked decision.

### Pattern 5: SCAN-04 Fallback Loop

**What:** Replace hardcoded `src/` assumptions with a check-order loop.

**Locked check order:** `src/` → `app/` → `pages/` → `lib/`

**Pattern** (from STACK.md, HIGH confidence):
```bash
# Determine source root — used throughout scan steps
SRC_DIR=""
for d in src app pages lib; do
  if [ -d "$d" ]; then SRC_DIR="$d"; break; fi
done
if [ -z "$SRC_DIR" ]; then
  echo "No standard source directory found. Manual audit required." >&2
  # Continue scan with empty SRC_DIR; grep commands will produce no output (handled by 2>/dev/null)
fi
```

This runs at Step 1 (Orient) and sets `$SRC_DIR`. All subsequent steps in scan that reference `src/` literally become `${SRC_DIR}/`. The matched path is logged in DESIGN.md frontmatter as `source_roots: [matched_dir]`.

**Note on multiple directories:** Some grep commands in scan Step 5 pass multiple directories (`src/ styles/ app/`). After SCAN-04, these should reference `${SRC_DIR}` for the primary component directory, while `styles/` can remain as a secondary check (with `2>/dev/null` to handle absence). Do not replace all multi-dir patterns wholesale — only the primary component root matters for fallback.

### Pattern 6: Bootstrap.sh Windows Path Normalization

**Current state of bootstrap.sh:** The script handles `CLAUDE_PLUGIN_DATA` and `CLAUDE_PLUGIN_ROOT` resolution. It uses `set -u` (not `set -e`). It has idempotency via manifest comparison. It does NOT currently normalize Windows-style backslash paths.

**What to add:** Before string operations that use `${PLUGIN_ROOT}` in path concatenation, normalize separators:

```bash
# Normalize PLUGIN_ROOT path separators for Windows Git Bash compatibility
# On Windows, CLAUDE_PLUGIN_ROOT may be C:\Users\... — convert to forward slashes
PLUGIN_ROOT="${PLUGIN_ROOT//\\//}"
```

**Why this is needed:** `${PLUGIN_ROOT}/scripts/bootstrap-manifest.txt` will fail if `PLUGIN_ROOT` contains backslashes. The `diff` command and `mkdir -p` handle mixed separators inconsistently on Git Bash.

**Placement:** Immediately after the `PLUGIN_ROOT=...` line (line 19 of bootstrap.sh). Also apply to `PLUGIN_DATA` for symmetry.

**Existing bootstrap.sh line 19:**
```bash
PLUGIN_ROOT="${CLAUDE_PLUGIN_ROOT:-$(cd "$(dirname "$0")/.." && pwd)}"
```
The `$(pwd)` expansion already uses forward slashes on Git Bash. The risk is when `CLAUDE_PLUGIN_ROOT` is injected by Claude Code from Windows registry and contains backslashes. The normalization handles that case.

### Pattern 7: `.design/STATE.md` Template

**Design rationale:** Matches the XML-tagged artifact convention from DESIGN-CONTEXT.md. Separate from `.planning/STATE.md` (GSD development state). Created by scan if missing; filled by discover.

**Template structure** (adapted from GSD STATE.md pattern + CONTEXT.md specification):

```markdown
---
pipeline_state_version: 1.0
stage: scan
wave: 1
started_at: [ISO 8601]
last_checkpoint: [ISO 8601]
---

# Pipeline State — [Project Name]

<position>
stage: scan
wave: 1
task_progress: 0/0
status: initialized
</position>

<decisions>
<!-- Filled by discover stage -->
<!-- Format: D-NN: [decision text] (locked | tentative) -->
</decisions>

<must_haves>
<!-- Filled by discover stage -->
<!-- Format: M-NN: [description] | status: pending | pass | fail -->
</must_haves>

<connections>
<!-- Filled at scan entry; updated as connections are detected -->
<!-- Format: figma: available | unavailable | not_configured -->
figma: not_configured
refero: not_configured
</connections>

<blockers>
<!-- Active blockers preventing stage completion -->
<!-- Format: [stage] [ISO date]: [description] -->
</blockers>

<timestamps>
started_at: [ISO 8601]
last_checkpoint: [ISO 8601]
scan_completed_at: ~
discover_completed_at: ~
plan_completed_at: ~
design_completed_at: ~
verify_completed_at: ~
</timestamps>
```

**Write contract** (documented in template, implemented in Phase 2 stage rewrites):
- Entry: read STATE.md; detect if `stage` matches current stage and `status: in_progress` → resume from `task_progress`
- Exit: update `stage`, increment `task_progress`, set `last_checkpoint`, fill completed timestamp

**STATE-02 and STATE-03 note:** CONTEXT.md states "scan creates STATE.md if missing; discover fills decisions + must_haves". Phase 2 owns the stage-rewrite implementation. Phase 1 only needs to define the template and document the contract. The template is complete enough that Phase 2 implementors have no ambiguity.

### Pattern 8: `agents/README.md` Structure

**GSD agent frontmatter** (confirmed from gsd-executor.md, gsd-planner.md, gsd-verifier.md):

```yaml
---
name: agent-name
description: One sentence — what it does + when it's spawned.
tools: Read, Write, Edit, Bash, Grep, Glob
color: yellow | green | blue | red
model: inherit   # for quality-tier; omit for balanced (uses profile default)
---
```

**GSD completion marker conventions** (confirmed from executor/planner/verifier outputs):
- Research complete: `## RESEARCH COMPLETE` section header
- Planning complete: `## PLANNING COMPLETE`
- Execution complete: `## EXECUTION COMPLETE`
- Verification complete: `## VERIFICATION COMPLETE`

**GSD `<required_reading>` pattern** (confirmed from verifier and others):
```markdown
<required_reading>
@path/to/file.md
@path/to/other.md
</required_reading>
```
When the prompt contains this block, the agent MUST Read every listed file before acting.

**Stage invocation pattern** (Claude Code Task tool):
```
Task("agent-name", prompt_string)
```
The prompt must be fully self-contained — no session state passes through.

**`agents/README.md` sections to include:**
1. Overview — what agents are and why (thin orchestration model)
2. Frontmatter schema — exact fields, types, accepted values
3. `<required_reading>` pattern — format, where to list files
4. Completion markers — exact heading strings for each agent type
5. How stages invoke agents — Task tool syntax, self-contained prompt requirement
6. What to include in an agent prompt — task spec, context, paths, acceptance criteria, output format
7. Worked example — placeholder agent showing all sections
8. Naming convention — `design-[role].md` kebab-case

### Pattern 9: `connections/connections.md` Structure

**Capability matrix columns** (derived from pipeline stages):
- scan | discover | plan | design | verify

**Active connections for matrix:**
- Figma — uses `mcp__claude_ai_Figma__*` or `mcp__figma__*` tools
- Refero — uses `mcp__refero__*` tools

**Future connections (in matrix as placeholders):**
- Storybook, Linear, GitHub

**Structure:**
```markdown
# Connections

## Active Connections
| Connection | Status | Config |
|-----------|--------|--------|
| Figma | Active — connections/figma.md | System MCP |
| Refero | Active — connections/refero.md | User MCP token |

## Capability Matrix
| Connection | scan | discover | plan | design | verify |
|-----------|------|----------|------|--------|--------|
| Figma | tokens | decisions | — | — | — |
| Refero | — | references | — | — | — |
| Storybook | — | — | — | — | components |
| Linear | — | — | — | — | tickets |
| GitHub | — | — | — | commits | PRs |

## Extensibility Guide
[How to add a new connection — file format, detection pattern, where to wire]

## Connection Detection Pattern
[Bash pattern for checking MCP availability at stage entry]
```

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| File move with history | Custom copy + delete script | `git mv` | git tracks renames; blame and log --follow work automatically |
| Untracking files | Custom git filter-repo script | `git rm --cached -r` | History-safe, reversible, no branch rewrite risk |
| LF enforcement | Shell script to convert files | `.gitattributes` | Git handles on checkout/commit automatically, no manual step |
| Portable grep alternation | Per-platform detection | `-E` flag with `\|` → `|` | POSIX extended regex is universal across GNU grep, BSD grep, and Git Bash grep |
| Windows path detection | Complex OS detection | `${VAR//\\//}` bash substitution | Simple, handles mixed separators, works in Git Bash |

---

## Common Pitfalls

### Pitfall 1: `-E` Changes Parenthesis Semantics

**What goes wrong:** When adding `-E` to grep, bare `(` and `)` become grouping operators. Existing patterns that match literal CSS parens — e.g., `oklch([^)]*)` — will break because `(` now opens a group.

**How to avoid:** When migrating any pattern that contains literal parentheses for CSS function syntax, escape them: `oklch\([^)]*\)` in `-E` mode. The `[^)]` character class is unaffected — only bare `(` and `)` outside `[...]` need escaping.

**Concrete example:**
```bash
# BEFORE (GNU grep only):
grep -roh "oklch([^)]*)\|hsl([^)]*)" src/

# WRONG migration (breaks on BSD — unescaped ( in -E mode):
grep -rEoh "oklch([^)]*)|hsl([^)]*)" src/

# CORRECT migration:
grep -rEoh "oklch\([^)]*\)|hsl\([^)]*\)" src/
```

### Pitfall 2: Fixing scan But Not verify (Pattern Divergence)

**What goes wrong:** CONTEXT.md explicitly calls this out. scan/SKILL.md and verify/SKILL.md share 4 identical grep patterns (lines 43, 45, 48, 52 of verify). If only scan is fixed, verify produces GNU-incompatible output on macOS/Windows and the behavior diverges silently.

**How to avoid:** Fix both files in the same plan/commit. The executor should fix scan first, then immediately apply identical transformations to verify's 4 affected lines.

### Pitfall 3: `git rm --cached` After `.gitignore` Is Updated

**What goes wrong:** Running `git rm --cached -r .planning/` before adding `.planning/` to `.gitignore` will remove the files from tracking, but they may be re-staged on the next `git add .` (if someone runs it). The gitignore entry must be committed first.

**How to avoid:** Commit the `.gitignore` update in the same commit as or before the `git rm --cached` operation. The correct sequence is: update `.gitignore` → `git add .gitignore` → `git rm --cached -r .planning/` → `git rm --cached -r .claude/memory/` → `git commit`.

### Pitfall 4: `SRC_DIR` Variable Not Propagated

**What goes wrong:** SCAN-04 sets `$SRC_DIR` in a bash code block in Step 1 of scan/SKILL.md. Claude will read this as instructions and execute the block when running scan. But if `$SRC_DIR` is set in one bash block and referenced in another (separate tool call), it won't persist — each `Bash` tool call has an isolated shell.

**How to avoid:** The fallback pattern in SKILL.md must be written as prose that Claude executes conceptually, not as shell variables that persist across tool calls. The pattern should say: "Detect the source root once, store as a known value, use that value in all subsequent grep commands." Claude substitutes the detected value (`src`, `app`, etc.) literally into each subsequent command. The SKILL.md should express this as a prose instruction: "Use the detected source root in all subsequent grep commands."

### Pitfall 5: STATE.md Template Conflated with Write Contract

**What goes wrong:** STATE-02 says every stage reads/writes STATE.md, but Phase 1 only creates the template — stages are NOT rewritten in Phase 1. If the plan attempts to wire STATE.md reads/writes into existing stages, it crosses the Phase 2 boundary.

**How to avoid:** The Phase 1 STATE.md deliverable is ONLY: (a) the file template, (b) documentation of the read/write contract in the template's comments. No existing SKILL.md files are modified for STATE.md integration in Phase 1. This is explicitly stated in CONTEXT.md code_context section.

### Pitfall 6: connections/refero.md Missing Content Update

**What goes wrong:** Moving `reference/refero.md` to `connections/refero.md` is just a file move. But the file references "Phase 1 (Discover)" using the old pipeline stage naming. The connections/ file should be updated slightly to reflect its new context as a connection spec (not just a how-to guide).

**How to avoid:** After `git mv`, update the frontmatter or top section to reflect it is now the connection specification, not just a usage guide. Keep content preservation as the primary goal — this is a minor editorial update, not a rewrite.

---

## Code Examples

### .gitattributes (verified format)

```
# Enforce LF line endings for plugin text files
*.md    text eol=lf
*.sh    text eol=lf
*.json  text eol=lf
```

Source: git-scm.com documentation (gitattributes `text` and `eol` attributes). HIGH confidence.

### .gitignore additions

```
# Development planning artifacts (not part of plugin distribution)
.planning/
.claude/memory/
.claude/settings.local.json
```

Append to existing `.gitignore` (which already has `.design/` and `.DS_Store`).

### Bootstrap.sh path normalization (new lines after existing line 19)

```bash
PLUGIN_ROOT="${CLAUDE_PLUGIN_ROOT:-$(cd "$(dirname "$0")/.." && pwd)}"
# Normalize path separators: Windows may inject backslashes via CLAUDE_PLUGIN_ROOT
PLUGIN_ROOT="${PLUGIN_ROOT//\\//}"
PLUGIN_DATA="${CLAUDE_PLUGIN_DATA:-$HOME/.claude/plugins/data/ultimate-design}"
PLUGIN_DATA="${PLUGIN_DATA//\\//}"
```

### Correct grep -E migration examples

```bash
# CSS alternation patterns — escape literal parens for CSS function syntax
grep -rEoh "oklch\([^)]*\)|hsl\([^)]*\)|rgb\([^)]*\)" src/ styles/ --include="*.css" --include="*.scss" 2>/dev/null | sort | uniq -c | sort -rn | head -20

# BAN patterns — no literal parens, straightforward
grep -rEn "background-clip:\s*text|text-fill-color:\s*transparent" src/ 2>/dev/null | head -5

# Color slop — no structural changes, just drop the backslash
grep -rEn "#6366f1|#8b5cf6|#06b6d4" src/ 2>/dev/null | head -5

# Typography font-weight — has escaped parens for CSS keyword groups
# Before: grep -roh "font-weight:\s*[0-9]*\|fw-[0-9]*\|font-\(thin\|light\|normal\|...\)"
# After: (drop the \( \) grouping — not needed in -E for this pattern)
grep -rEoh "font-weight:\s*[0-9]*|fw-[0-9]*|font-(thin|light|normal|medium|semibold|bold|extrabold|black)" src/ styles/ --include="*.css" --include="*.scss" --include="*.tsx" 2>/dev/null | sort | uniq -c | sort -rn | head -20
```

### SCAN-04 fallback pattern (for scan/SKILL.md Step 1)

```
Detect source root — check in order: src/ → app/ → pages/ → lib/. Use the first directory
that exists. If none exist, log "No standard source directory found" and continue with empty
source root (all grep commands will produce no output via 2>/dev/null — this is correct 
behavior for a project with no standard layout). Log the matched directory in DESIGN.md
frontmatter as `source_roots: [detected_dir]`.

Use the detected source root in ALL subsequent grep commands that referenced `src/` as the
primary component directory. `styles/` directory references remain as secondary checks with
2>/dev/null guards.
```

### GSD agent frontmatter (for agents/README.md)

```yaml
---
name: design-planner
description: Reads DESIGN-CONTEXT.md → produces DESIGN-PLAN.md with wave-ordered tasks. Spawned by plan stage.
tools: Read, Write, Bash, Grep
color: green
---
```

Fields: `name` (kebab-case, unique), `description` (what + when spawned), `tools` (comma-separated Claude tool names), `color` (yellow/green/blue/red for terminal display), `model` (omit for profile default, `inherit` for quality-tier bypass).

---

## State of the Art

| Old Pattern | Current Pattern | Impact for Phase 1 |
|-------------|----------------|-------------------|
| Single monolithic skill with inline logic | Thin orchestrator + specialized agents (GSD model) | agents/ scaffold is the foundation |
| Hardcoded `src/` in grep commands | Fallback loop: src → app → pages → lib | SCAN-04 implementation |
| GNU `\|` in grep patterns | POSIX `-E` with `|` | PLAT-01/PLAT-02 fixes |
| Dev artifacts committed to plugin repo | gitignore + untrack | DIST-01/DIST-02 |
| No pipeline runtime state | `.design/STATE.md` | STATE-01 scaffold |

---

## Open Questions

1. **`.claude/settings.local.json` tracking status**
   - What we know: Not found in `git ls-files .claude/` output (only memory/ files appear)
   - What's unclear: Whether it exists but is already untracked, or simply doesn't exist yet
   - Recommendation: Add the gitignore entry regardless (defensive) — `git rm --cached` on a non-tracked file is a no-op

2. **`find` commands in scan Step 1 (lines 33, 34, 37, 40)**
   - What we know: PLAT-01/PLAT-02 scope is "grep patterns" specifically; these are `find` commands for config file detection (tailwind.config.*, *.tokens.json), not grepping source code
   - What's unclear: Whether `find` is reliable enough on Windows Git Bash for these patterns
   - Recommendation: STACK.md says `find` has "path separator and quoting issues on Windows Git Bash" but these particular `find` usages (searching for config files by name) are lower-risk than multi-file grep. Leave them as-is for Phase 1 — PLAT-01/PLAT-02 requirements are specific to grep patterns. Flag for Phase 3 if Windows issues surface.

3. **verify/SKILL.md Phase 1 section heading vs scan/SKILL.md Step 5**
   - What we know: Both files have Anti-Pattern Scan sections with identical grep patterns; the verify patterns are at lines 43, 45, 48, 52
   - What's unclear: VRFY-02 (Phase 3) says "Phase 1 re-audit references shared grep patterns rather than duplicating scan logic verbatim" — this is a deeper fix than just `-E` migration
   - Recommendation: For Phase 1, just apply the `-E` migration to the 4 verify lines. The structural deduplication (VRFY-02) is correctly deferred to Phase 3.

---

## Validation Architecture

> nyquist_validation not set to false in config — validation section included.

### Test Framework

| Property | Value |
|----------|-------|
| Framework | None — this phase produces markdown files and git operations, not code |
| Test type | Manual verification via checklist |
| Quick check | `git status` + `git ls-files .planning/` returning empty |
| Full check | `claude plugin validate .` must pass after any SKILL.md edits |

### Phase Requirements → Verification Map

| Req ID | Behavior | Verification | Automated? |
|--------|----------|-------------|-----------|
| DIST-01 | `.planning/` in `.gitignore` | `git check-ignore .planning/STATE.md` outputs path | Yes — bash |
| DIST-02 | `.planning/` untracked | `git ls-files .planning/` returns empty | Yes — bash |
| DIST-03 | README has Distribution section | `grep -c "Distribution" README.md` returns ≥ 1 | Yes — bash |
| PLAT-01 | No `\|` in skill grep commands | `grep -c '\\\\|' skills/scan/SKILL.md skills/verify/SKILL.md` returns 0 | Yes — bash |
| PLAT-02 | All grep commands have `-E` | Manual review — grep for `grep -r[^E]` patterns | Manual |
| PLAT-03 | `.gitattributes` exists with LF entries | `cat .gitattributes` shows `*.md text eol=lf` | Yes — bash |
| PLAT-04 | Bootstrap has path normalization | `grep -c 'PLUGIN_ROOT.*//\\' scripts/bootstrap.sh` ≥ 1 | Yes — bash |
| STATE-01 | `.design/STATE.md` template exists | Template file at `skills/scan/SKILL.md` references it, or standalone template file | Manual |
| STATE-02 | Contract documented | STATE.md template comments describe read/write contract | Manual |
| STATE-03 | Resume fields present in template | Template has `task_progress` and `last_checkpoint` fields | Manual |
| AGENT-00 | `agents/README.md` exists | `ls agents/README.md` | Yes — bash |
| CONN-00 | `connections/connections.md` exists | `ls connections/connections.md connections/refero.md` | Yes — bash |
| SCAN-04 | Fallback loop in scan Step 1 | Manual review of scan/SKILL.md Step 1 prose | Manual |

### Wave 0 Gaps

None — no test framework gaps. All verification is bash-checkable or manual review. `claude plugin validate .` is the gate for structural correctness.

---

## Sources

### Primary (HIGH confidence)

- Direct inspection: `skills/scan/SKILL.md` — 19 GNU-only grep lines inventoried
- Direct inspection: `skills/verify/SKILL.md` — 4 shared grep lines confirmed
- Direct inspection: `scripts/bootstrap.sh` — current path handling confirmed, normalization gap identified
- Direct inspection: `git ls-files` — exact list of tracked files to untrack confirmed
- Direct inspection: `.gitignore` — current entries confirmed; additions documented
- Direct inspection: `reference/refero.md` — 112-line content confirmed; ready for move
- Direct inspection: `.planning/get-shit-done-main/agents/gsd-executor.md`, `gsd-planner.md`, `gsd-verifier.md` — frontmatter schema and completion marker conventions confirmed
- Direct inspection: `.planning/get-shit-done-main/get-shit-done/templates/state.md` — GSD STATE.md structure confirmed

### Secondary (MEDIUM confidence)

- `.gitattributes` `text eol=lf` format — standard git documentation pattern; not verified against current git version but stable for 10+ years
- bash `${VAR//\\//}` substitution for path normalization — standard POSIX parameter expansion, works in bash 3.2+

### Tertiary (LOW confidence)

- None for this phase — all findings are from direct inspection of working production files

---

## Metadata

**Confidence breakdown:**
- Distribution cleanup: HIGH — exact files to untrack confirmed by `git ls-files`
- POSIX grep migration: HIGH — exact line numbers and patterns confirmed by direct grep
- Bootstrap path normalization: HIGH — gap identified, fix pattern is standard bash
- `.gitattributes` format: HIGH — stable git standard
- STATE.md template design: HIGH — adapted directly from GSD pattern + CONTEXT.md spec
- agents/README.md content: HIGH — GSD agent patterns confirmed from source
- connections/ structure: HIGH — capability matrix columns derived from confirmed pipeline stages

**Research date:** 2026-04-17
**Valid until:** Stable indefinitely — findings from local file inspection, not external services
