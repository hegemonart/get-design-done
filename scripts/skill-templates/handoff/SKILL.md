---
name: hone-handoff
description: "Handoff-first entry point that initializes a cycle from a Claude Design handoff bundle (URL, ZIP, HTML, PDF, or PPTX), skips the explore/plan stages, and routes straight to post-handoff verify. Thin wrapper over the Handoff Routing logic in the root pipeline router and the claude-design connection. Use when a Claude Design bundle was sent or dropped into the project and you want to implement and verify it without re-running discovery, or when arguments start with handoff or contain --from-handoff."
argument-hint: "<bundle-path-or-url>"
user-invocable: true
tools: Read, Write, Bash, Glob, Grep, Task
---

# gdd-handoff

Initialize a design cycle from a Claude Design handoff bundle, then route to verify in
post-handoff mode. This skill is the named home for the inline **Handoff Routing** block in
the root pipeline router (`SKILL.md`); invoking `{{command_prefix}}handoff <path>` runs the
same sequence. See `connections/claude-design.md` for bundle formats and parsing rules.

## Role

You do no design work yourself. You resolve a handoff bundle, seed `.design/STATE.md` for a
handoff-sourced cycle, dispatch the synthesizer + discussant agents, and hand off to the
verify skill. Stages scan/discover/plan are skipped by design - a handoff bundle replaces them.

## Invocation Contract

- **Input**: a bundle path or hosted URL as the argument, OR `--from-handoff <path>`, OR a
  previously-recorded `handoff_path` in `.design/STATE.md`.
- **Output**: a handoff-sourced `.design/STATE.md` and a routed call to
  `Skill("get-design-done:verify", "--post-handoff")`.

## Procedure

### 1. Resolve the bundle path

- `{{command_prefix}}handoff <path>` -> bundle path is the argument.
- `--from-handoff <path>` -> bundle path is the value after the flag.
- A `https://api.anthropic.com/v1/design/h/<hash>` URL in the arguments -> treat as the bundle.
- None of the above -> read `handoff_path` from `.design/STATE.md`. Still absent -> error:
  "Provide a bundle path: {{command_prefix}}handoff ./path/to/bundle.html".
- For a file path: verify the file exists; if not, error "Bundle not found at <path>".

### 2. Initialize STATE.md

- If `.design/STATE.md` does not exist, copy `reference/STATE-TEMPLATE.md` to `.design/STATE.md`.
- In `<position>` set: `handoff_source` (per the bundle format - see the claude-design
  connection table), `handoff_path: <resolved path>`, `skipped_stages: scan, discover, plan`,
  `status: handoff-sourced`, `stage: verify`.
- In `<connections>` set `claude_design: available`; leave every other connection unchanged.

### 3. Spawn the synthesizer in handoff mode

```
Task("design-research-synthesizer", """
mode: handoff
handoff_path: <resolved bundle path>
state_path: .design/STATE.md
""")
```

Wait for `## SYNTHESIZE COMPLETE`.

### 4. Spawn the discussant in from-handoff mode

```
Task("design-discussant", """
<mode>--from-handoff</mode>
<required_reading>.design/STATE.md</required_reading>
""")
```

Wait for `## DISCUSS COMPLETE`. This step surfaces every `(tentative)` decision for user
confirmation; do not skip it - implementing against unconfirmed inferred values is the primary
handoff failure mode.

### 5. Route to verify

```
Skill("get-design-done:verify", "--post-handoff")
```

Verify relaxes the DESIGN-PLAN.md prerequisite for handoff flows and adds a Handoff
Faithfulness section to DESIGN-VERIFICATION.md.

### 6. Optional write-back (post-verify)

After verify completes without FAIL-level gaps, check STATE.md `<connections>` for `figma:`.
If `figma: available`, offer to write implementation status back to Figma (annotates frames +
Code Connect mappings) via `agents/design-figma-writer.md` with `mode: implementation-status`.
Skip silently when figma is `not_configured` or `unavailable`.

## Do Not

- Do not run scan, discover, or plan - the bundle replaces them.
- Do not promote PDF/PPTX-sourced decisions to `(locked)` without explicit user confirmation.
- Do not commit raw extracted bundle files - only persist decisions to STATE.md.

## Cross-references

- `connections/claude-design.md` - bundle formats, field catalogue, confidence tagging.
- Root `SKILL.md` `## Handoff Routing` - the inline routing this skill wraps.
- `get-design-done:verify` (`--post-handoff`) - the stage this skill routes to.
