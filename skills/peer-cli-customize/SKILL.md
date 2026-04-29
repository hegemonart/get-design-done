---
name: peer-cli-customize
description: "Rewire role→peer mappings on a per-agent basis. File-edit-driven (touches frontmatter delegate_to: per agent), no runtime config layer. Run when you want a specific agent to delegate to a different peer than the default capability-matrix mapping suggests."
argument-hint: "[<agent-name>] [<new-delegate-target>]"
tools: Read, Edit, Bash, Grep
---

<!-- Procedural pattern adapted from greenpolo/cc-multi-cli's `customize` skill (Apache 2.0). See NOTICE for full attribution. -->

# peer-cli-customize

## Role

You help the user rewire which peer-CLI delegate handles which agent's calls. The mechanism is direct file-edits to agent frontmatter (`delegate_to:` field added in Plan 27-06) — there is no runtime config layer. Your job is to make this safe and validatable.

## Invocation Contract

- **Optional input**: agent-name + new delegate target. If absent, the skill runs in interactive discovery mode.
- **Output**: a diff summary listing each `agents/*.md` file modified, the old vs new `delegate_to:` value, and the validation result.

## Procedure

### Step 1 — Show current state

Read the capability matrix from `scripts/lib/peer-cli/registry.cjs#describeCapabilities()`. Surface the 5 peers and their claimed roles to the user.

Then scan `agents/*.md` and grep for `delegate_to:` frontmatter values. Render a table:

```
| Agent                      | delegate_to (current) |
|----------------------------|------------------------|
| design-reflector           | none                   |
| design-context-checker     | (unset)                |
| design-verifier            | gemini-research        |
| ...                        | ...                    |
```

### Step 2 — Confirm rewire intent

Either accept the user's explicit `<agent-name> <new-delegate-target>` arguments OR ask: "Which agent do you want to rewire? What should `delegate_to:` become?"

Valid `<new-delegate-target>` values:
- `<peer>-<role>` from the capability matrix (e.g., `gemini-research`, `codex-execute`, `cursor-debug`, `cursor-plan`, `copilot-review`, `copilot-research`, `qwen-write`).
- `none` (explicit opt-out).
- Empty / `(unset)` to remove the field entirely (revert to default behavior).

### Step 3 — Validate the proposed rewire

Cross-check the new value against the capability matrix:
1. The peer must exist in the matrix.
2. The role must be in the peer's `claims` list.
3. The peer must (eventually, at runtime) be in `.design/config.json#peer_cli.enabled_peers` for dispatch to fire — but that's a runtime concern, not a frontmatter validation concern.

If validation fails, surface the error and stop. Do not edit the file.

### Step 4 — Apply the edit

Use the `Edit` tool to modify the agent's frontmatter. Three cases:

**Case A: Field is absent, user wants to add it.**
Insert `delegate_to: <new-target>` into the frontmatter block (between the existing `default-tier:` and the next field, or at the end of frontmatter). Preserve YAML formatting.

**Case B: Field is present, user wants to change the value.**
Replace the existing value. If the existing value is `none` and the new value is `<peer>-<role>`, just swap. Mirror the existing indentation.

**Case C: Field is present, user wants to remove it.**
Delete the entire `delegate_to:` line. The field is optional — absence === default behavior.

### Step 5 — Re-validate via the frontmatter validator

Run `npm run validate:frontmatter` (or whatever the project's frontmatter check is). Confirm the modified agent passes. If validation fails, surface the error and offer to revert.

### Step 6 — Surface a diff summary

Report back:

```
## Rewire summary

✓ design-verifier: delegate_to: gemini-research → cursor-debug
✓ design-reflector: delegate_to (unset) → codex-execute

frontmatter validator: 0 violations (40 files checked)
next time these agents are spawned, session-runner will dispatch through the new peer.

To verify: /gdd:peers (shows updated allowlist + capability matrix).
```

## Edge cases

- **User asks to rewire to a peer not in the capability matrix** (e.g., a peer they want to add later): direct them to `skills/peer-cli-add/SKILL.md` first; do not allow the frontmatter edit until the peer exists in the matrix.
- **User asks to rewire to a role the peer doesn't claim** (e.g., `codex-debug` — codex only claims `execute`): refuse with a helpful message listing what the peer DOES claim. Suggest a closer match if obvious.
- **User asks to rewire ALL agents to a peer at once** (bulk operation): support but require explicit confirmation. Show the diff of all proposed edits before applying.
- **Validator fails after edit**: revert the edit (re-run `Edit` with the inverse old/new strings). Surface the original error.

## Cross-references

- `scripts/validate-frontmatter.ts` (Plan 27-06) — `delegate_to` field validation.
- `scripts/lib/peer-cli/registry.cjs` (Plan 27-05) — capability matrix.
- `agents/README.md#peer-cli-delegation-delegate_to` — field documentation.
- `skills/peer-cli-add/SKILL.md` — for adding a NEW peer (this skill is for rewiring among existing peers).
- `.planning/phases/27-peer-cli-delegation/CONTEXT.md` D-06 — decision lineage.

## Record

After execution, append one JSONL line to `.design/skill-records.jsonl`:

```json
{"skill": "peer-cli-customize", "ts": "<ISO timestamp>", "agents_rewired": ["design-verifier", "design-reflector"], "validator_passed": true}
```
