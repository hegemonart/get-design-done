---
name: peer-cli-protocol
type: heuristic
version: 1.0.0
phase: 28.5
tags: [peer-cli, acp, asp, protocol, verification-ladder, add-peer, customize, cc-multi-cli]
last_updated: 2026-05-18
---

<!-- Procedural patterns adapted from greenpolo/cc-multi-cli (Apache 2.0). See ../NOTICE for full attribution. -->

# Peer-CLI Protocol — Add + Customize Procedures

Procedural reference for the peer-CLI delegation layer. Centralizes the verification
ladder, adapter scaffolding shape, rewire-discipline, and Windows quirks so the three
peer-CLI skills (`peers`, `peer-cli-add`, `peer-cli-customize`) can cross-link rather
than each carry the full procedure inline. See `./peer-protocols.md` for the protocol
shape (JSON-RPC framing, initialize handshake, error envelope); this file is the
procedure layer that sits above it.

## Verification ladder (run before any code edit when adding a peer)

When a user wants to add a brand-new peer to the capability matrix, walk these four
rungs in order. Stop at the first rung that fails — do not proceed to scaffold a broken
adapter.

### Rung 1 — Binary on PATH

`which <peer-binary>` (POSIX) or `where <peer-binary>` (Windows). If exit non-zero, stop
and ask the user to install the peer first. Adapters cannot be tested without the binary.

### Rung 2 — Handshake test

Spawn the peer with the protocol entry point:

- **ACP peers** — `<peer-binary> acp` (or whatever the peer documents — Gemini uses
  `gemini acp`; some peers use a flag).
- **ASP peers** — `<peer-binary> app-server` (Codex convention; other ASP peers may
  differ).

Send an `initialize` JSON-RPC message over stdin with `protocolVersion: '2025-06-18'`
(ACP) or `service_name: 'gdd_peer_delegation'` (ASP). Capture the reply on stdout. A
valid JSON-RPC response with `result.protocolVersion` (ACP) or `result.threadId` (ASP)
means the peer speaks the protocol. No valid reply within 5 seconds means either
wrong-protocol or non-standard entry point — stop and ask the user for the correct
invocation.

### Rung 3 — Model-ID `-preview`-suffix trap

Many peers expose preview models with a `-preview` suffix (e.g., `gpt-5-preview` vs
`gpt-5`). The suffix drifts: today's preview is tomorrow's GA. Capture the peer's model
list (most peers expose `<peer-binary> models` or similar) and document parent names in
the new entry's `provider_model_id` field so the runtime-models entry survives the
suffix flipping.

### Rung 4 — Windows quirks

If the peer-binary ends in `.cmd` and the user is on Windows, confirm
`scripts/lib/peer-cli/spawn-cmd.cjs` will pick it up. That module handles `.cmd`
detection per Plan 27-03 / D-04. Document any other Windows-specific quirks in the new
adapter's leading comment.

## Adapter scaffold shape

Use the existing five adapters at `scripts/lib/peer-cli/adapters/{codex,gemini,cursor,copilot,qwen}.cjs`
as templates. Pick the closest match by protocol (ASP if `<protocol> = asp`, otherwise
ACP). Each adapter exports:

- `claims(role)` — boolean predicate against `ROLES_CLAIMED`.
- `dispatch({command, args, cwd, env}, role, text, opts)` — async dispatch with optional
  `opts.onNotification` callback.
- `ROLES_CLAIMED` — array of role identifiers the peer claims.
- `ROLE_PREFIX` — per-role prompt prefix object (empty string when no prefix needed).
- `name`, `protocol` — string identifiers.

## Three-file footprint (peer add)

A new peer integrates cleanly with a 3-file diff plus the capability-matrix doc:

1. **`scripts/lib/peer-cli/adapters/<new-peer-id>.cjs`** — new adapter.
2. **`scripts/lib/install/runtimes.cjs`** — add a `peerBinary` field (platform-aware:
   `<binary>.cmd` on Windows, plain `<binary>` elsewhere).
3. **`reference/peer-cli-capabilities.md`** — add a row to the capability matrix and a
   per-peer section with the verification evidence from Rung 1–4 above.
4. **`scripts/lib/peer-cli/registry.cjs`** — append to `CAPABILITY_MATRIX` (and
   `KNOWN_PEERS` if separate).

## Rewire discipline (customize)

When rewiring `delegate_to:` on a specific agent's frontmatter:

- Validate the new value against the capability matrix BEFORE editing the file. The
  peer must exist; the role must be in the peer's `claims` list.
- Three frontmatter cases: field absent + add it, field present + change it, field
  present + remove it (revert to default).
- Re-run `npm run validate:frontmatter` after every edit; offer to revert if it fails.
- The peer must also be in `.design/config.json#peer_cli.enabled_peers` for dispatch
  to fire at runtime — but that's a runtime concern, not a frontmatter validation
  concern.

## Verification gate (after any peer-CLI change)

Run, in order, until each passes:

1. `npx tsc --noEmit` — clean.
2. `node --test tests/peer-cli-registry.test.cjs tests/peer-cli-adapters.test.cjs` —
   no regression on existing tests.
3. `node --test tests/reference-registry.test.cjs` — capability-matrix doc is in
   `reference/registry.json`.
4. `npm run validate:frontmatter` — no agent's `delegate_to:` field is broken.

Any failure: surface the error and offer to revert.

## Edge cases

- **Peer speaks neither ACP nor ASP** — gdd v1.27 ships only those two protocols. Stop
  and document the gap in `.design/RESEARCH.md` for a future phase.
- **Peer claims a role no existing peer claims** — fine, capability matrix is open. But
  document the role in `peer-cli-capabilities.md` so future peers can compete on it.
- **Peer claims ALL roles** (generalist) — accept, but flag in the per-peer section.
  Generalist peers are usually weaker than specialist peers; the bandit will sort it
  out via measurement.
- **Peer-ID collides with an existing peer** — fail. Peer-IDs must be globally unique.
- **Rewire target peer not in capability matrix** — direct user to `peer-cli-add` first;
  do not allow the frontmatter edit until the peer exists in the matrix.
- **Rewire target role peer does not claim** — refuse with a list of what the peer DOES
  claim. Suggest a closer match when obvious.

## Cross-references

- `./peer-protocols.md` — protocol-level reference (JSON-RPC framing, handshake shape).
- `./peer-cli-capabilities.md` — capability matrix doc (per-peer claimed roles).
- `../scripts/lib/peer-cli/registry.cjs` (Plan 27-05) — capability-matrix data source.
- `../scripts/lib/peer-cli/adapters/*.cjs` (Plan 27-04) — adapter template.
- `../scripts/lib/peer-cli/spawn-cmd.cjs` (Plan 27-03) — Windows `.cmd` handling.
- `../scripts/lib/install/runtimes.cjs` (Plan 27-11) — `peerBinary` field per runtime.
- `../skills/peers/SKILL.md` — discovery surface.
- `../skills/peer-cli-add/SKILL.md` — add-peer flow.
- `../skills/peer-cli-customize/SKILL.md` — rewire flow.
- `../NOTICE` — Apache 2.0 attribution to greenpolo/cc-multi-cli.
