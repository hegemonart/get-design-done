# Peer-CLI Delegation — Operations Guide

**Phase 27 (v1.27.0).** This guide covers the user-facing surface of gdd's outbound peer-CLI delegation layer: when delegation fires, how to enable/disable it, how the fallback chain works, and how to troubleshoot when something goes wrong.

For the protocol-level cheat sheet (ACP + ASP message formats), see `reference/peer-protocols.md`.
For the architectural decisions and rationale, see `.planning/phases/27-peer-cli-delegation/CONTEXT.md`.

---

## What is peer-CLI delegation?

gdd v1.27.0 lets specific agents OPTIONALLY run on a peer CLI (Codex via App Server Protocol; Gemini/Cursor/Copilot/Qwen via Agent Client Protocol) instead of an in-process Anthropic SDK call. Each agent decides per-role whether delegation makes sense; the bandit router (Phase 23.5) measures cost and quality over time and learns which delegations actually pay off.

**The default is unchanged.** No agent in v1.27.0 ships with `delegate_to:` set in its frontmatter. Existing pipelines run exactly as they did in v1.26.0. Delegation is opt-in per agent AND per peer.

---

## When does delegation fire?

Three conditions must all hold for an agent's call to be delegated to a peer:

1. The agent's frontmatter declares `delegate_to: <peer>-<role>` (e.g., `delegate_to: gemini-research`).
2. The peer-CLI binary exists on `PATH` (gdd checks `peerBinary` from `scripts/lib/install/runtimes.cjs`).
3. The peer is in the user's allowlist at `.design/config.json#peer_cli.enabled_peers`.

If any condition fails, gdd silently falls back to the in-process Anthropic call. The skill never sees the peer failure (per D-07).

The fallback is **transparent**:
- Peer not on `PATH` → local call.
- Peer not allowlisted → local call.
- `delegate_to: none` (explicit opt-out) → local call.
- Frontmatter has no `delegate_to:` → local call.
- Peer responds with an error → local call (failure logged via `peer_call_failed` event).

---

## Enabling delegation

### Step 1 — Install the peer CLI

Each peer has its own installation flow. gdd doesn't install peer CLIs for you — the user owns their peer subscriptions. After installing, confirm the peer is on `PATH`:

```sh
which codex      # or `where codex` on Windows
which gemini
which cursor-agent
which copilot
which qwen
```

### Step 2 — Allowlist the peer

Edit `.design/config.json` and add the peer-IDs you want gdd to dispatch to:

```json
{
  "peer_cli": {
    "enabled_peers": ["codex", "gemini"]
  }
}
```

Until a peer is in `enabled_peers`, gdd will not dispatch to it — even if the binary is on `PATH` and an agent has `delegate_to:` set. This opt-in keeps cost surprises off (per D-11).

### Step 3 — Verify with `/gdd:peers`

Run the discovery command to confirm gdd sees the setup correctly:

```
/gdd:peers
```

Output is a markdown capability matrix. The "Allowlisted" column shows your `enabled_peers` set; the "Installed" column shows what's on `PATH`. The "Posterior delta vs local" column shows the bandit's measured cost/quality delta if there's enough data (≥3 cycles).

### Step 4 — Wire `delegate_to:` on specific agents

Run the customize skill to rewire which peers handle which agents:

```
/gdd:run-skill peer-cli-customize
```

The skill walks you through agent-by-agent rewiring. It edits `agents/*.md` frontmatter directly and re-validates with `npm run validate:frontmatter`.

If you want to add an agent with `delegate_to: gemini-research`, the skill:
1. Confirms `gemini` is in `enabled_peers` (warns if not).
2. Confirms `research` is a role gemini claims (per the capability matrix).
3. Edits the agent's frontmatter.
4. Runs the validator to confirm no regressions.

---

## Disabling per-peer

Three options, in order of permanence:

**Temporary disable (one cycle):** unset the binary on `PATH` (e.g., rename `codex` → `codex.disabled`). gdd's detection probe will report `(not installed)` for that peer until the binary is back.

**Allowlist disable (semi-permanent):** remove the peer-ID from `enabled_peers`:

```json
{ "peer_cli": { "enabled_peers": ["gemini"] } }   // codex removed
```

`/gdd:peers` shows `(opt-in disabled)` in the Posterior column for the removed peer.

**Per-agent disable:** change individual agents' `delegate_to:` to `none` (explicit opt-out, useful for security-sensitive agents) or remove the field entirely (revert to default local-call behavior). Use `/gdd:run-skill peer-cli-customize` for the safe path or hand-edit the frontmatter.

---

## Fallback diagnostics

When a peer call fails, gdd silently falls back to local but logs a `peer_call_failed` event in `events.jsonl` (per D-09). Each row carries:

- `event: "peer_call_failed"`
- `runtime_role: "peer"`
- `peer_id: "<id>"` (e.g., `"gemini"`)
- `role: "<role>"` (e.g., `"research"`)
- `error_class: "<classification>"` (e.g., `"timeout"`, `"protocol_error"`, `"binary_missing"`)
- `ts: <ISO timestamp>`

To inspect recent failures:

```sh
tail -50 .design/telemetry/events.jsonl | grep peer_call_failed
```

Or via the reflector:

```
/gdd:run-skill reflect
```

The reflector (Phase 11/22) surfaces failure trends as structured proposals — e.g., "peer 'gemini' has failed `peer_call_failed` 4 of 5 most recent calls; consider removing from `enabled_peers` or running `/gdd:peers` to investigate."

---

## Broker lifecycle troubleshooting

gdd uses long-lived brokers per `(peer, workspace)` pair to amortize cold-spawn costs across delegated calls in a cycle (per D-03):

- **POSIX:** Unix domain socket at `~/.gdd/peer-brokers/<peer>-<workspace-hash>.sock`.
- **Windows:** named pipe at `\\.\pipe\gdd-peer-broker-<peer>-<workspace-hash>`.

Brokers survive between gdd cycles. They shut down on:

- The peer-CLI process dying.
- The workspace's broker socket/pipe being deleted manually.
- A new gdd session starting with `--reset-brokers` (planned future flag; for now, manual deletion).

If you suspect a stale broker is causing peer-call failures, force-stop it:

```sh
# POSIX
rm -f ~/.gdd/peer-brokers/*.sock

# Windows (PowerShell, requires admin)
Remove-Item \\.\pipe\gdd-peer-broker-*
```

The next delegated call cold-spawns a fresh broker.

---

## Windows `.cmd` quirks

The peer-CLI binaries on Windows often install as `.cmd` shims (e.g., `codex.cmd`, `gemini.cmd`). Node's `child_process.spawn(absolutePath, args)` fails with `EINVAL` on Windows when `absolutePath` ends in `.cmd` — a known long-standing Node bug.

gdd's `scripts/lib/peer-cli/spawn-cmd.cjs` handles this via the cc-multi-cli `transport-decisions.md` workaround:

```js
// On Windows .cmd:
spawn(`"${absolutePath.replace(/\\/g, '/')}" ${args.join(' ')}`, [], { shell: true })
// Elsewhere:
spawn(absolutePath, args)
```

If you're seeing `EINVAL` errors when delegated calls fire on Windows, check that `spawn-cmd.cjs` is being used and that the leading-comment workaround hasn't been "cleaned up" in a refactor (per D-04).

---

## Adding a new peer

The 5 peers shipped in v1.27.0 (codex, gemini, cursor, copilot, qwen) are not the only peer CLIs in the wild. To wire a new peer (e.g., `aider`), run the guided ladder:

```
/gdd:run-skill peer-cli-add aider aider acp
```

The skill walks the verification ladder (does the peer actually speak ACP/ASP?), generates the adapter scaffold at `scripts/lib/peer-cli/adapters/<new-peer>.cjs`, and updates the capability matrix at `reference/peer-cli-capabilities.md` and `scripts/lib/peer-cli/registry.cjs`. It documents the model-ID `-preview`-suffix trap and the Windows `.cmd` quirks inline.

See `skills/peer-cli-add/SKILL.md` for the full procedural detail.

---

## Cost telemetry

Delegated calls are tagged in `costs.jsonl` (per D-08, extended in plan 27-08):

- `runtime_role: "peer"` (vs `"host"` for local Anthropic calls).
- `peer_id: "<id>"`.
- All other Phase 26 fields preserved (`runtime`, `agent`, `model_id`, `tier`, `tokens_in`, `tokens_out`, `cost_usd`, `ts`).

Aggregation rolls up per-runtime AND per-peer AND per-tier. The reflector's cost-arbitrage analysis (Phase 26-06) extends to surface "agent X tier Y delegated to peer A averaged $N/cycle, the same role on local-Anthropic averaged $M/cycle" arbitrage signals — when the delta exceeds 50%, a structured proposal lands in `/gdd:apply-reflections`.

---

## Cross-references

- `reference/peer-protocols.md` — ACP + ASP protocol cheat sheet.
- `reference/peer-cli-capabilities.md` — full per-peer capability matrix.
- `scripts/lib/peer-cli/registry.cjs` — central dispatch + health probe.
- `scripts/lib/peer-cli/adapters/*.cjs` — per-peer thin adapters.
- `scripts/lib/peer-cli/spawn-cmd.cjs` — Windows `.cmd` workaround.
- `scripts/lib/peer-cli/broker-lifecycle.cjs` — long-lived broker logic.
- `agents/README.md#peer-cli-delegation-delegate_to` — `delegate_to:` field documentation.
- `skills/peers/SKILL.md` — `/gdd:peers` capability matrix command.
- `skills/peer-cli-customize/SKILL.md` — rewire role→peer mappings.
- `skills/peer-cli-add/SKILL.md` — add a brand-new peer.
- `.planning/phases/27-peer-cli-delegation/CONTEXT.md` — full decision register (D-01 through D-14).
- `NOTICE` — Apache 2.0 attribution for cc-multi-cli (the protocol shapes and skill patterns gdd ports).
