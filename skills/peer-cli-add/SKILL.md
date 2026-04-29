---
name: peer-cli-add
description: "Guided ladder for adding a brand-new peer (a peer not in the v1.27 capability matrix) to the gdd peer-CLI delegation layer. Verification ladder + adapter scaffolding + capability-matrix update + Windows quirks documented. Run when you discover a new peer CLI you want gdd to delegate to."
argument-hint: "<new-peer-id> <peer-binary> <protocol: acp|asp>"
tools: Read, Edit, Write, Bash, Grep
---

<!-- Procedural pattern adapted from greenpolo/cc-multi-cli's `multi-cli-anything` skill (Apache 2.0). See NOTICE for full attribution. -->

# peer-cli-add

## Role

You add a brand-new peer-CLI to gdd's delegation layer. v1.27.0 ships 5 peers (codex, gemini, cursor, copilot, qwen). When the user wants a 6th — a peer that exists in the wild but isn't in our capability matrix yet — they run this skill. It walks them through a verification ladder (does the peer actually speak ACP or ASP?) and produces the 3-file footprint that integrates the peer cleanly.

## Invocation Contract

- **Required input**: `<new-peer-id>` (lowercase identifier, e.g., `aider`), `<peer-binary>` (the executable name, e.g., `aider` or `aider.cmd`), `<protocol>` (`acp` or `asp`).
- **Output**: a 3-file diff + a verification report.

## Procedure

### Step 1 — Verification ladder (no edits yet)

Before touching any code, confirm the peer actually speaks the protocol it claims.

#### 1a. Binary on PATH

`which <peer-binary>` (POSIX) or `where <peer-binary>` (Windows). If exit non-zero, stop and ask user to install the peer first.

#### 1b. Handshake test

Spawn the peer with the appropriate protocol entry point:
- ACP peers: `<peer-binary> acp` (or whatever the peer documents as its ACP entry — Gemini uses `gemini acp`; some peers use a flag).
- ASP peers: `<peer-binary> app-server` (Codex's convention; other ASP peers may differ).

Send an `initialize` JSON-RPC message over stdin with `protocolVersion: '2025-06-18'` (ACP) or `service_name: 'gdd_peer_delegation'` (ASP).

Capture the reply on stdout. If the reply is a valid JSON-RPC response with `result.protocolVersion` (ACP) or `result.threadId` (ASP), the peer speaks the protocol.

If no valid reply within 5 seconds, the peer either doesn't speak this protocol or uses a non-standard entry point. Stop and ask the user for the correct invocation.

#### 1c. Model-ID `-preview`-suffix trap

Many peers expose preview models with a `-preview` suffix (e.g., `gpt-5-preview` vs `gpt-5`). The suffix drifts: today's preview is tomorrow's GA. Capture the peer's current model list (most peers expose `<peer-binary> models` or similar). Note any model that has `-preview` in its name and document the parent name in the new entry's `provider_model_id` field — so the runtime-models.md entry can survive the suffix flipping.

#### 1d. Windows quirks

If the peer-binary ends in `.cmd` and the user is on Windows, confirm the spawn-cmd shell-escape logic from `scripts/lib/peer-cli/spawn-cmd.cjs` will pick it up (it should — that module already handles `.cmd` detection per Plan 27-03 / D-04). Document any other Windows-specific quirks in the new adapter's leading comment.

### Step 2 — Generate the adapter scaffold

Use the existing 5 adapters at `scripts/lib/peer-cli/adapters/{codex,gemini,cursor,copilot,qwen}.cjs` as templates. Pick the closest match to your new peer's protocol (ASP if `<protocol> = asp`, otherwise ACP).

Use the `Write` tool to create `scripts/lib/peer-cli/adapters/<new-peer-id>.cjs`:

```js
'use strict';

const { createAcpClient } = require('../acp-client.cjs');
// OR for ASP peers: const { createAspClient } = require('../asp-client.cjs');

const ROLES_CLAIMED = ['<role-1>', '<role-2>'];   // ASK USER which roles this peer claims
const ROLE_PREFIX = {
  '<role-1>': '<prompt prefix or empty string>',
  '<role-2>': '<prompt prefix or empty string>',
};

function claims(role) { return ROLES_CLAIMED.includes(role); }

async function dispatch({ command, args, cwd, env }, role, text, opts) {
  if (!claims(role)) {
    throw new Error(`<new-peer-id> does not claim role: ${role}`);
  }
  const client = createAcpClient({ command, args, cwd, env });
  try {
    await client.initialize({ protocolVersion: '2025-06-18' });
    const prompt = (ROLE_PREFIX[role] || '') + text;
    return await client.prompt(prompt, { onNotification: opts?.onNotification });
  } finally {
    await client.close();
  }
}

module.exports = { claims, dispatch, ROLES_CLAIMED, ROLE_PREFIX, name: '<new-peer-id>', protocol: '<protocol>' };
```

Replace placeholders with the user's input from Step 1's verification.

### Step 3 — Add `peerBinary` to runtimes.cjs

Edit `scripts/lib/install/runtimes.cjs` to add an entry for the new peer. Mirror the shape of the 5 existing peer entries. Add the `peerBinary` field with platform-aware resolution:

```js
{
  id: '<new-peer-id>',
  // ... existing fields per Phase 24 runtime matrix shape ...
  peerBinary: process.platform === 'win32' ? '<peer-binary>.cmd' : '<peer-binary>',
}
```

### Step 4 — Add the capability-matrix entry

Edit `reference/peer-cli-capabilities.md`. Add a new row to the top capability matrix table AND a new per-peer section. Follow the existing format. Cite the verification evidence from Step 1.

### Step 5 — Update the registry capability matrix

Edit `scripts/lib/peer-cli/registry.cjs`. Add the new peer to the `CAPABILITY_MATRIX` constant (and `KNOWN_PEERS` if that's a separate list). Mirror the shape of the 5 existing entries.

### Step 6 — Verify the integration

Run, in this order, until each passes:

1. `npx tsc --noEmit` — clean.
2. `node --test tests/peer-cli-registry.test.cjs tests/peer-cli-adapters.test.cjs` — no regression on existing tests.
3. `node --test tests/reference-registry.test.cjs` — capability-matrix doc is in registry.json (if you added it).
4. `npm run validate:frontmatter` — no agent's `delegate_to:` field is broken by the new entry.

If any step fails, surface the error and offer to revert the changes.

### Step 7 — Surface a 3-file footprint summary

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
- Run /gdd:peers to confirm the new peer shows up in the capability matrix.
- Run skills/peer-cli-customize/SKILL.md to wire delegate_to: <new-peer-id>-<role> on specific agents.
- Phase 23.5 bandit will need ~5 cycles of data before the posterior surfaces a recommendation for this peer.
```

## Edge cases

- **Peer speaks neither ACP nor ASP** — gdd v1.27 ships only those two protocols. Stop and document the gap in `.design/RESEARCH.md` for a future phase to consider adding a new protocol layer.
- **Peer claims a role no existing peer claims** (e.g., `translate`) — fine, capability matrix is open. But document the role in `reference/peer-cli-capabilities.md` so future peers can compete on it.
- **Peer claims ALL roles** (e.g., a generalist peer) — accept, but flag in the per-peer section. Generalist peers are usually weaker than specialist peers; the bandit will sort it out via measurement.
- **Peer name conflicts with an existing peer-id** — fail. Peer-IDs must be globally unique. Suggest a disambiguating suffix.
- **User wants to add a peer for testing only** — same flow, but suggest committing under a separate branch and not adding to the install-time detection nudge until the peer is production-ready.

## Cross-references

- `scripts/lib/peer-cli/registry.cjs` (Plan 27-05) — capability matrix data.
- `scripts/lib/peer-cli/adapters/*.cjs` (Plan 27-04) — adapter template.
- `scripts/lib/peer-cli/spawn-cmd.cjs` (Plan 27-03) — Windows .cmd handling.
- `reference/peer-cli-capabilities.md` (Plan 27-05) — capability-matrix doc.
- `skills/peer-cli-customize/SKILL.md` — once new peer is added, use customize to wire it on specific agents.
- `.planning/phases/27-peer-cli-delegation/CONTEXT.md` D-02, D-05 — decision lineage.

## Record

After execution, append one JSONL line to `.design/skill-records.jsonl`:

```json
{"skill": "peer-cli-add", "ts": "<ISO timestamp>", "new_peer": "<new-peer-id>", "protocol": "<protocol>", "roles_claimed": ["<role-1>"], "verification_passed": true}
```
