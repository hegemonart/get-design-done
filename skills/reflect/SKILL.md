---
name: gdd-reflect
description: "Run design-reflector on demand — produces .design/reflections/<cycle-slug>.md with improvement proposals. Review proposals with /gdd:apply-reflections."
argument-hint: "[--dry-run] [--cycle <slug>]"
tools: Read, Write, Task
---

# /gdd:reflect

Run `design-reflector` on demand against the current (or specified) cycle. Produces `.design/reflections/<cycle-slug>.md` with numbered improvement proposals. Every proposal requires explicit user review — nothing is auto-applied.

## Steps

1. **Parse args**: extract `--dry-run` flag and `--cycle <slug>` value.

2. **Resolve cycle slug**:
   - If `--cycle <slug>` given: use that slug directly
   - Else: read `.design/STATE.md`, extract the active `cycle:` ID from the `<position>` block
   - If STATE.md not found: abort with "No .design/STATE.md found. Run `/gdd:new-project` first."

3. **Build required-reading list**:
   ```
   .design/STATE.md
   .design/DESIGN-VERIFICATION.md
   .design/learnings/*.md (glob)
   .design/telemetry/costs.jsonl
   .design/agent-metrics.json
   .design/learnings/question-quality.jsonl
   .design/cycles/<slug>/CYCLE-SUMMARY.md
   ```
   Use the resolved slug where `<slug>` appears.

4. **Spawn design-reflector**:
   ```
   Task("design-reflector", """
   <required_reading>
   @.design/STATE.md
   @.design/DESIGN-VERIFICATION.md
   @.design/agent-metrics.json
   @.design/telemetry/costs.jsonl
   @.design/learnings/question-quality.jsonl
   </required_reading>

   Cycle slug: <slug>
   Dry-run: <true|false>

   Produce .design/reflections/<slug>.md with all reflection sections and proposals.
   If dry-run is true, print proposals to stdout only — do not write the file.
   """)
   ```

5. **After completion**:
   - If `--dry-run`: print the agent output directly; skip steps below
   - Else: read `.design/reflections/<slug>.md`
   - Count proposals by type (scan for `[FRONTMATTER]`, `[REFERENCE]`, `[BUDGET]`, `[QUESTION]`, `[GLOBAL-SKILL]`)
   - Print summary:
     ```
     Reflection complete — cycle: <slug>
     Proposals: N total
       [FRONTMATTER] N
       [REFERENCE] N
       [BUDGET] N
       [QUESTION] N
       [GLOBAL-SKILL] N

     Review and apply: /gdd:apply-reflections
     ```

## Do Not

- Do not auto-apply any proposal.
- Do not modify agent files, reference files, or budget.json.
- Do not run the full audit pipeline — this is a standalone reflection run.
