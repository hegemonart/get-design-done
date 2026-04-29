# Peer-CLI Capabilities

Last verified: 2026-04-29

Authoritative capability matrix for the peer-CLI delegation layer (Phase 27).
The registry at `scripts/lib/peer-cli/registry.cjs` reads this map (encoded as
data in the `.cjs` source — this doc is the human-readable mirror) to decide
which peer-CLI claims which agent role and which protocol to speak.

If you change this matrix, you MUST also change `CAPABILITY_MATRIX` in
`scripts/lib/peer-cli/registry.cjs` and re-run `tests/peer-cli-registry.test.cjs`.
The two are version-locked by Phase 27 D-05.

## Capability matrix

Each peer claims a fixed set of agent roles. The registry refuses to dispatch
a role to a peer that does not claim it — this prevents accidental
mis-delegations like "let's try `design-auditor` against Qwen" that produce
garbage output (Phase 27 CONTEXT D-05).

| Peer | Protocol | Claimed roles | Slash commands (within peer CLI) |
| --- | --- | --- | --- |
| `codex` | ASP | `execute` | `/exec` |
| `copilot` | ACP | `review`, `research` | `/review`, `/search` |
| `cursor` | ACP | `debug`, `plan` | `/debug`, `/plan` |
| `gemini` | ACP | `research`, `exploration` | `/search`, `/explore` |
| `qwen` | ACP | `write` | `/write` |

Slash-command translation lives in each per-peer adapter
(`scripts/lib/peer-cli/adapters/<peer>.cjs`, landed by Plan 27-04). The
registry never invokes slash commands directly — it routes the role and
delegates prompt-prefixing + slash translation to the adapter.

## Tie-breaking when two peers claim the same role

`research` is claimed by both `gemini` and `copilot`. When the registry's
`findPeerFor('research', tier)` runs, it walks peers in alphabetical order
of peer ID — `codex` < `copilot` < `cursor` < `gemini` < `qwen` — and
returns the first one that passes the health probe. So `copilot` wins
`research` over `gemini` when both are installed and allowlisted.

Users can override this by removing one of the two from
`.design/config.json#peer_cli.enabled_peers` — the unlisted peer is treated
as absent regardless of installation status (Phase 27 D-11 opt-in gating).

## Opt-in gating (D-11)

A peer is dispatched to ONLY when:

1. The peer ID appears in `.design/config.json#peer_cli.enabled_peers`
   (an array of allowlisted peer IDs). Default: `[]` — empty, nothing
   dispatches.
2. The peer's adapter module loads at `scripts/lib/peer-cli/adapters/<peer>.cjs`.
3. The adapter's `peerBinary()` resolver returns a path that exists on disk.

Failure on any of the three → registry returns `null` and the caller
(session-runner, Plan 27-06) falls back to the local Anthropic SDK call.
This is the **transparent-fallback** contract from Phase 27 D-07: a missing
or broken peer must never break the cycle.

## Per-peer notes

### `codex` (ASP)

OpenAI Codex CLI invoked as `codex app-server`. Speaks the App Server
Protocol — thread-oriented, supports resume across calls (currently unused;
v1.27 always starts fresh threads).

- **Provenance:** runtime entry in `scripts/lib/install/runtimes.cjs` (`id: 'codex'`).
- **Example invocation:** registry routes `(role='execute', tier='opus', text='apply this diff')`
  through `adapters/codex.cjs`, which in turn drives `asp-client.cjs`.
- **Known limitations:** Codex' app-server cold start is ~1-2s on macOS;
  the broker (Plan 27-03) keeps the session warm across cycles to amortize.

### `gemini` (ACP)

Google Gemini CLI invoked in ACP mode. One-shot prompt per call from the
host's perspective, but the adapter may multiplex many calls onto a single
broker session.

- **Provenance:** runtime entry in `scripts/lib/install/runtimes.cjs` (`id: 'gemini'`).
- **Example invocation:** registry routes `(role='research', tier='sonnet', text='find prior art for X')`
  through `adapters/gemini.cjs`.
- **Known limitations:** rate-limit headers vary by Gemini auth tier. The
  adapter surfaces a 429 as a peer-error → registry returns null → caller
  falls back. No retry logic at the registry level.

### `cursor` (ACP)

Cursor's `cursor` CLI in ACP mode. Strong on `debug` and `plan` roles
because Cursor's editor-side context tracking transfers well to those
workflows.

- **Provenance:** runtime entry in `scripts/lib/install/runtimes.cjs` (`id: 'cursor'`).
- **Known limitations:** Cursor' ACP mode requires an active Cursor login
  on the host; an unauthenticated session surfaces as a connect-time error.

### `copilot` (ACP)

GitHub Copilot CLI in ACP mode. Claims `review` and `research`. Tends to
win `research` against `gemini` on alphabetical tie-break — users who
prefer Gemini for research should remove `copilot` from `enabled_peers`.

- **Provenance:** runtime entry in `scripts/lib/install/runtimes.cjs` (`id: 'copilot'`).
- **Known limitations:** Copilot's `review` role expects a diff in the
  prompt; the adapter handles the framing.

### `qwen` (ACP)

Alibaba Qwen Code CLI in ACP mode. Claims `write` only. Useful when the
session-runner wants a long-form code-generation pass and the host runtime
is on a low tier.

- **Provenance:** runtime entry in `scripts/lib/install/runtimes.cjs` (`id: 'qwen'`).
- **Known limitations:** Qwen's ACP implementation is the newest of the
  five; expect occasional protocol-version drift. The adapter pins
  `protocolVersion: '2025-06-18'` per `acp-client.cjs` defaults.

## Adding a new peer

To add a new peer-CLI to the matrix:

1. Run the guided ladder in `skills/peer-cli-add/SKILL.md` (lands with
   Plan 27-10). It walks the protocol-fit check, the role-claim audit, the
   adapter scaffold, and the test coverage required.
2. Append the peer to `CAPABILITY_MATRIX` in `scripts/lib/peer-cli/registry.cjs`
   AND to the table at the top of this file. The two MUST stay in sync —
   the test suite (`tests/peer-cli-registry.test.cjs`) asserts the matrix
   shape.
3. Add a `<peer>.cjs` adapter under `scripts/lib/peer-cli/adapters/`.
4. Add a `peerBinary?: string` field on the corresponding entry in
   `scripts/lib/install/runtimes.cjs` (Plan 27-11 introduces the field;
   new peers added after that plan ships must include it).
5. Update `tests/peer-cli-registry.test.cjs` and the phase-20 baseline locks.

To temporarily disable a peer without removing the adapter, drop the peer
ID from `.design/config.json#peer_cli.enabled_peers`. To permanently remove
a peer, reverse the steps above plus update `tests/phase-27-baseline.test.cjs`.

## Cross-references

- `scripts/lib/peer-cli/registry.cjs` — central dispatch, single source of
  truth for the capability matrix as code.
- `scripts/lib/peer-cli/adapters/*.cjs` — per-peer thin adapters
  (Plan 27-04).
- `scripts/lib/peer-cli/{acp,asp}-client.cjs` — protocol clients
  (Plans 27-01 / 27-02).
- `scripts/lib/peer-cli/broker-lifecycle.cjs` — long-lived session per
  `(peer, workspace)` (Plan 27-03).
- Phase 27 CONTEXT.md — decision log including D-05 (this matrix),
  D-07 (transparent fallback), D-11 (opt-in gating).
