---
name: peer-cli-add
description: "Guided ladder for adding a brand-new peer (not in the v1.27 capability matrix) to gdd's peer-CLI delegation layer. Walks the verification ladder, scaffolds an adapter, updates the capability matrix, and handles Windows quirks. Run when you discover a new peer CLI you want gdd to delegate to."
argument-hint: "<new-peer-id> <peer-binary> <protocol: acp|asp>"
tools: Read, Edit, Write, Bash, Grep
---

<!-- Procedural pattern adapted from greenpolo/cc-multi-cli's `multi-cli-anything` skill (Apache 2.0). See NOTICE for full attribution. -->

# peer-cli-add

## Role

You add a brand-new peer-CLI to gdd's delegation layer. v1.27.0 ships 5 peers (codex, gemini, cursor, copilot, qwen). When the user wants a 6th — a peer that exists in the wild but isn't in our capability matrix — you walk them through the verification ladder and produce the 3-file footprint that integrates the peer cleanly. The procedural ladder, adapter scaffold shape, and verification gate live in `./reference/peer-cli-protocol.md`.

## Invocation Contract

- **Required input:** `<new-peer-id>` (lowercase, e.g. `aider`), `<peer-binary>` (executable, e.g. `aider` or `aider.cmd`), `<protocol>` (`acp` or `asp`).
- **Output:** a 3-file diff + a verification report.

## Procedure

### Step 1 — Verification ladder (no edits yet)

Walk the four-rung ladder in `./reference/peer-cli-protocol.md` §"Verification ladder":

1. Binary on PATH (`which` / `where`).
2. Handshake test (`initialize` JSON-RPC over stdin; capture reply).
3. Model-ID `-preview`-suffix trap (capture model list).
4. Windows quirks (confirm `spawn-cmd.cjs` picks up `.cmd`).

Stop at the first failing rung. Do not proceed to scaffold a broken adapter.

### Step 2 — Generate the adapter scaffold

Copy one of `scripts/lib/peer-cli/adapters/{codex,gemini,cursor,copilot,qwen}.cjs` as the template (pick by protocol — ASP for `<protocol>=asp`, else ACP). Replace `ROLES_CLAIMED`, `ROLE_PREFIX`, `name`, `protocol` with the user's values from Step 1. The full adapter scaffold shape — `claims`, `dispatch`, exports — lives in `./reference/peer-cli-protocol.md` §"Adapter scaffold shape" so consumers (codex/gemini/cursor/copilot/qwen) stay byte-similar.

Write the result to `scripts/lib/peer-cli/adapters/<new-peer-id>.cjs`.

### Step 3 — Three-file footprint

Per `./reference/peer-cli-protocol.md` §"Three-file footprint":

1. New adapter at `scripts/lib/peer-cli/adapters/<new-peer-id>.cjs` (Step 2).
2. Edit `scripts/lib/install/runtimes.cjs` — add `peerBinary` field (platform-aware: `<peer-binary>.cmd` on Windows, plain on POSIX).
3. Edit `reference/peer-cli-capabilities.md` — add matrix row + per-peer section citing the Step 1 verification evidence.
4. Edit `scripts/lib/peer-cli/registry.cjs` — append to `CAPABILITY_MATRIX` (and `KNOWN_PEERS` if separate).

### Step 4 — Verification gate

Run the four-check gate in `./reference/peer-cli-protocol.md` §"Verification gate": `tsc --noEmit`, peer-cli tests, reference-registry round-trip, frontmatter validator. Any failure — surface error + offer revert.

### Step 5 — Surface the summary

```
## peer-cli-add summary
Added peer: <new-peer-id> (protocol: <protocol>)
Roles claimed: <role-1>, <role-2>

Files modified:
✓ scripts/lib/peer-cli/adapters/<new-peer-id>.cjs (new)
✓ scripts/lib/install/runtimes.cjs (added peerBinary entry)
✓ reference/peer-cli-capabilities.md (added matrix row + per-peer section)
✓ scripts/lib/peer-cli/registry.cjs (added to CAPABILITY_MATRIX)

Verification:
✓ tsc clean
✓ existing peer-cli tests pass
✓ reference-registry round-trip valid
✓ frontmatter validator: 0 violations

Next steps:
- /gdd:peers to confirm the new peer appears in the matrix.
- skills/peer-cli-customize/SKILL.md to wire delegate_to: <new-peer-id>-<role> on agents.
- Phase 23.5 bandit needs ~5 cycles of data before a posterior recommendation surfaces.
```

## Edge cases

See `./reference/peer-cli-protocol.md` §"Edge cases" for: peer speaks neither protocol, claims unknown role, claims all roles (generalist), peer-ID conflicts, and testing-only peers.

## Record

Append one JSONL line to `.design/skill-records.jsonl`:

```json
{"skill": "peer-cli-add", "ts": "<ISO timestamp>", "new_peer": "<new-peer-id>", "protocol": "<protocol>", "roles_claimed": ["<role-1>"], "verification_passed": true}
```
