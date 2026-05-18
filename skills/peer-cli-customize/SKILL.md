---
name: peer-cli-customize
description: "Rewire role->peer mappings on a per-agent basis. File-edit-driven (touches frontmatter delegate_to: per agent), no runtime config layer. Run when you want a specific agent to delegate to a different peer than the default capability-matrix mapping suggests."
argument-hint: "[<agent-name>] [<new-delegate-target>]"
tools: Read, Edit, Bash, Grep
---

<!-- Procedural pattern adapted from greenpolo/cc-multi-cli's `customize` skill (Apache 2.0). See NOTICE for full attribution. -->

# peer-cli-customize

## Role

You help the user rewire which peer-CLI delegate handles which agent's calls. The mechanism is direct file-edits to agent frontmatter (`delegate_to:` field added in Plan 27-06) — there is no runtime config layer. Your job is to make this safe and validatable. The rewire discipline (per-edit validation, three frontmatter cases, validator gate) lives in `./reference/peer-cli-protocol.md` §"Rewire discipline" so the procedure stays canonical across consumers.

## Invocation Contract

- **Optional input**: agent-name + new delegate target. If absent, the skill runs in interactive discovery mode.
- **Output**: a diff summary listing each `agents/*.md` file modified, the old vs new `delegate_to:` value, and the validation result.

## Procedure

### Step 1 — Show current state

Read the capability matrix from `scripts/lib/peer-cli/registry.cjs#describeCapabilities()`. Surface the 5 peers and their claimed roles to the user. Then scan `agents/*.md` and grep for `delegate_to:` frontmatter values. Render a two-column table (`Agent | delegate_to (current)`) listing every agent's current setting (or `(unset)` for absent fields).

### Step 2 — Confirm rewire intent

Accept the user's explicit `<agent-name> <new-delegate-target>` arguments OR ask: "Which agent do you want to rewire? What should `delegate_to:` become?"

Valid `<new-delegate-target>` values:

- `<peer>-<role>` from the capability matrix (e.g., `gemini-research`, `codex-execute`, `cursor-debug`, `cursor-plan`, `copilot-review`, `copilot-research`, `qwen-write`).
- `none` — explicit opt-out.
- Empty / `(unset)` — remove the field entirely; revert to default behavior.

### Step 3 — Validate the proposed rewire

Cross-check against the capability matrix per `./reference/peer-cli-protocol.md` §"Rewire discipline":

1. The peer must exist in the matrix.
2. The role must be in the peer's `claims` list.
3. Runtime allowlisting (`peer_cli.enabled_peers`) is a runtime concern, NOT a frontmatter validation concern.

If validation fails, surface the error and stop. Do not edit the file.

### Step 4 — Apply the edit

Use the `Edit` tool. Three cases (per `./reference/peer-cli-protocol.md` §"Rewire discipline"):

- **Field absent, user wants to add:** insert `delegate_to: <new-target>` into frontmatter (between `default-tier:` and the next field, or at the end of frontmatter).
- **Field present, user wants to change:** replace the value; preserve indentation.
- **Field present, user wants to remove:** delete the entire `delegate_to:` line.

### Step 5 — Re-validate

Run `npm run validate:frontmatter`. Confirm the modified agent passes. If validation fails, surface the error and offer to revert (re-run `Edit` with inverse old/new strings).

### Step 6 — Surface a diff summary

```
## Rewire summary
✓ design-verifier: delegate_to: gemini-research → cursor-debug
✓ design-reflector: delegate_to (unset) → codex-execute

frontmatter validator: 0 violations (40 files checked)
Next time these agents are spawned, session-runner dispatches through the new peer.

Verify: /gdd:peers (shows updated allowlist + capability matrix).
```

## Edge cases

See `./reference/peer-cli-protocol.md` §"Edge cases" for: rewire-to-unmatrixed-peer (direct user to `peer-cli-add` first), rewire-to-unclaimed-role (refuse with helpful list), bulk-rewire (require explicit confirmation), validator-fails-post-edit (revert and surface).

## Cross-references

- `./reference/peer-cli-protocol.md` — rewire discipline, three frontmatter cases, edge cases.
- `scripts/validate-frontmatter.ts` (Plan 27-06) — `delegate_to` validation.
- `scripts/lib/peer-cli/registry.cjs` (Plan 27-05) — capability matrix.
- `skills/peer-cli-add/SKILL.md` — for adding a NEW peer (this skill rewires among existing peers).
- `.planning/phases/27-peer-cli-delegation/CONTEXT.md` D-06 — decision lineage.

## Record

After execution, append one JSONL line to `.design/skill-records.jsonl`:

```json
{"skill": "peer-cli-customize", "ts": "<ISO timestamp>", "agents_rewired": ["design-verifier", "design-reflector"], "validator_passed": true}
```
