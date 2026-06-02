---
name: gdd-extract-learnings
description: "Extracts project-specific design patterns and decisions from .design/ artifacts and writes them to .design/learnings/. Optionally proposes updates to reference/ files for user review."
tools: Bash, Read, Write, Glob, Grep
---

# /gdd:extract-learnings

**Role:** Scan `.design/` artifacts for recurring patterns, successful decisions, and validated approaches. Write structured learnings to `.design/learnings/`. Optionally propose additions to tracked `reference/` files for the user to review and approve.

## When to run

- After `/gdd:complete-cycle` (auto-suggested by complete-cycle skill)
- After a major verify/audit pass surfaces new patterns
- Manually, to checkpoint what the project has learned

## Protocol

### Step 1 — Gather source artifacts

Collect content from available `.design/` files:

```bash
ls .design/*.md 2>/dev/null
```

Read (if present): DESIGN-CONTEXT.md, DESIGN-VERIFICATION.md, DESIGN-DEBT.md, DESIGN-SUMMARY.md, CYCLES.md

### Step 2 — Invoke gdd-learnings-extractor agent

Delegate extraction to the `gdd-learnings-extractor` agent, passing it the list of available files. The agent extracts structured learning entries.

### Step 3 — Write learnings artifact

The agent writes or appends to `.design/learnings/LEARNINGS.md`.

Layout of `.design/learnings/LEARNINGS.md`:

```markdown
# Project Learnings

## <Category> — <Date>

### L-<NN>: <Title>

**Source:** <which .design/ file and section>
**Pattern type:** decision | anti-pattern | validated-approach | token-convention | component-convention
**Confidence:** high | medium | low
**Summary:** <1-2 sentences>
**Evidence:** <quote or paraphrase from source>
**Proposed reference update:** <yes — see proposal below | no>

---
```

### Step 4 — Reference file proposal (optional)

After writing LEARNINGS.md, check each learning entry with `Proposed reference update: yes`.

For each such entry: generate a proposed addition to the appropriate `reference/` file (e.g., `reference/heuristics.md`, `reference/anti-patterns.md`).

Print the proposal to the terminal and ask the user to review:

```
━━━ Reference update proposal ━━━

Learning L-03 suggests adding to reference/anti-patterns.md:

  ### Anti-pattern: Overloaded primary button
  Using the primary button style for more than one action per screen
  reduces clarity and violates Nielsen's heuristic #4 (consistency).
  Evidence: DESIGN-VERIFICATION.md, cycle 3.

Accept this update? [y/n/edit]
```

If user types `y`: write the addition to the reference file.
If user types `n`: mark the learning as "proposal declined" in LEARNINGS.md.
If user types `edit`: open the proposed text for the user to modify, then write.

### Step 5 — Summary

```
━━━ Learnings extracted ━━━
Source files scanned:    <N>
Learnings written:       <N>
Reference proposals:     <N>  (<M> accepted)
Output: .design/learnings/LEARNINGS.md
━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

## Required reading (conditional)

@.design/intel/decisions.json (if present)
@.design/intel/patterns.json (if present)
@.design/learnings/LEARNINGS.md (if present)

## EXTRACT-LEARNINGS COMPLETE
