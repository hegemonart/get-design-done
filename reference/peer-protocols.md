# Peer-CLI Protocols — ACP + ASP Cheat Sheet

**Phase 27 (v1.27.0).** This file is the protocol-level reference for gdd's peer-CLI delegation layer. If you're authoring a new peer adapter or debugging a protocol-level issue, start here.

For ops-level guidance (when delegation fires, how to enable/disable, fallback diagnostics), see `docs/PEER-DELEGATION.md`.

Protocol shapes are adapted from [`greenpolo/cc-multi-cli-plugin`](https://github.com/greenpolo/cc-multi-cli-plugin) under Apache 2.0 — see `NOTICE` for full attribution.

---

## Two protocols, two transports

| Protocol | Used by | Transport | Lifecycle |
|----------|---------|-----------|-----------|
| **ACP** (Agent Client Protocol) | Gemini, Cursor, Copilot, Qwen | Line-delimited JSON-RPC over stdio | Per-prompt request/response |
| **ASP** (App Server Protocol) | Codex | Line-delimited JSON-RPC over stdio | Thread-oriented, multi-turn |

Both protocols use the same line-delimited JSON-RPC framing (one JSON message per `\n`-terminated line on stdin/stdout). Both can be wrapped by gdd's broker (`scripts/lib/peer-cli/broker-lifecycle.cjs`) for long-lived sessions per `(peer, workspace)`.

Line-buffer overflow guard: 16 MiB per line (both clients reject lines longer than this with a structured error).

---

## ACP — Agent Client Protocol

### Initialize handshake

Client → server, first message after spawn:

```json
{
  "id": 1,
  "jsonrpc": "2.0",
  "method": "initialize",
  "params": {
    "protocolVersion": "2025-06-18",
    "clientCapabilities": {}
  }
}
```

Server → client (reply correlated by `id`):

```json
{
  "id": 1,
  "jsonrpc": "2.0",
  "result": {
    "protocolVersion": "2025-06-18",
    "serverCapabilities": { "...": "..." }
  }
}
```

If `serverCapabilities.protocolVersion` does not match the client's, the client logs a `protocol_mismatch` event and aborts the session.

### Prompt method

Client → server:

```json
{
  "id": 2,
  "jsonrpc": "2.0",
  "method": "prompt",
  "params": {
    "text": "Research best React state libs"
  }
}
```

Server → client streams notifications (no `id`, no `result`) until the final `result` for the prompt's `id`:

```json
{ "jsonrpc": "2.0", "method": "agent_message_chunk", "params": { "text": "..." } }
{ "jsonrpc": "2.0", "method": "tool_call",          "params": { "tool": "...", "input": "..." } }
{ "jsonrpc": "2.0", "method": "file_change",        "params": { "path": "...", "diff": "..." } }
{ "id": 2, "jsonrpc": "2.0", "result": { "content": "...", "finish_reason": "stop", "usage": { "input_tokens": 1234, "output_tokens": 5678 } } }
```

Notifications are surfaced via the `onNotification` callback the gdd caller passes:

```js
const result = await acpClient.prompt('Research ...', {
  onNotification: (n) => console.log(n.method, n.params),
});
```

### Per-peer ACP entry points

Each peer documents its own way to enter ACP mode:

- **Gemini**: `gemini acp` (subcommand).
- **Cursor**: `cursor-agent acp` (subcommand on the CLI binary, not the IDE).
- **Copilot**: `copilot --acp` (flag).
- **Qwen**: `qwen acp` (subcommand).

Verify via the `peer-cli-add` skill's verification ladder (Step 1) before adding a new peer.

---

## ASP — App Server Protocol (Codex)

### Service identification

Client → server, declared during initial communication:

- `service_name = "gdd_peer_delegation"` (the canonical service identifier gdd uses)
- `experimentalRawEvents = false` (we don't want raw model-token events; just structured turn output)

These fields appear in both `threadStart` params and (where relevant) in handshake metadata.

### Thread lifecycle

ASP is thread-oriented. Each conversation has a `threadId`; turns happen within a thread.

#### threadStart

Client → server:

```json
{
  "id": 1,
  "jsonrpc": "2.0",
  "method": "threadStart",
  "params": {
    "service_name": "gdd_peer_delegation",
    "experimentalRawEvents": false
  }
}
```

Server → client:

```json
{
  "id": 1,
  "jsonrpc": "2.0",
  "result": {
    "threadId": "thread-abc123"
  }
}
```

#### threadResume

Useful for cross-cycle conversation continuity (out of scope for v1.27.0 — gdd always creates fresh threads per delegated call — but the API surface exists):

```json
{
  "id": 2,
  "jsonrpc": "2.0",
  "method": "threadResume",
  "params": { "threadId": "thread-abc123" }
}
```

Server replies with the thread's current state (turn history, last-known result).

#### turn

Client → server:

```json
{
  "id": 3,
  "jsonrpc": "2.0",
  "method": "turn",
  "params": {
    "threadId": "thread-abc123",
    "text": "Execute the build command"
  }
}
```

Server streams turn-progress notifications, ends with a structured result:

**Completion path:**

```json
{
  "id": 3,
  "jsonrpc": "2.0",
  "result": {
    "threadId": "thread-abc123",
    "turnId": "turn-xyz",
    "status": "complete",
    "content": "...",
    "usage": { "input_tokens": 1234, "output_tokens": 5678 }
  }
}
```

**Error path** (does NOT throw on the client side — resolves with the error structure):

```json
{
  "id": 3,
  "jsonrpc": "2.0",
  "result": {
    "threadId": "thread-abc123",
    "turnId": "turn-xyz",
    "status": "error",
    "error": {
      "code": "rate_limit",
      "message": "Rate limit exceeded for thread-abc123"
    }
  }
}
```

The caller decides retry vs fallback per session-runner contract — gdd's session-runner falls back to local Anthropic on `status: "error"` per D-07.

### Codex ASP entry point

`codex app-server` (subcommand on the Codex CLI binary).

---

## Common framing rules (both protocols)

### Line-delimited JSON-RPC

- Each message is a single JSON object on stdin/stdout, terminated by `\n`.
- Multiple messages may arrive in one chunk → client buffers until `\n`.
- One message may split across chunks → client buffers until `\n`.
- Lines longer than **16 MiB** are rejected with a structured error (the line buffer overflows, the client tears down and rejects all pending promises).

### Request/response correlation

- Requests carry `id` (monotonic integer per session).
- Responses carry the same `id` in `result` or `error`.
- Notifications have no `id` and no `result` — they are routed to the active request's `onNotification` callback (each protocol allows only one "active" request at a time per session — half-duplex).

### Process lifecycle

- The peer process is spawned via `scripts/lib/peer-cli/spawn-cmd.cjs` (handles Windows `.cmd` EINVAL workaround per D-04).
- The client connects directly OR through gdd's broker (`broker-lifecycle.cjs`) — both surfaces present the same `{initialize, prompt, close}` (ACP) or `{threadStart, threadResume, turn, close}` (ASP) API.
- On process death mid-request, the client rejects the in-flight promise with a structured `{error_class: "process_exited"}` event for telemetry.

---

## Adding a new protocol

gdd v1.27.0 ships only ACP and ASP. If a new peer speaks neither (e.g., a future REST-only or HTTP/2-streaming protocol), the path forward is:

1. Document the gap in `.design/RESEARCH.md` for a future phase to scope a new protocol layer.
2. Do **not** stretch ACP/ASP to fit — they're documented contracts, not generalist multiplexers.
3. The `peer-cli-add` skill (Step 1's verification ladder) refuses to scaffold a peer that doesn't speak ACP or ASP — by design.

A future phase may add a new `scripts/lib/peer-cli/<protocol>-client.cjs` mirror following the same shape (line-buffer + JSON-RPC framing if applicable, or whatever the new protocol natively uses).

---

## Cross-references

- `scripts/lib/peer-cli/acp-client.cjs` — ACP client implementation.
- `scripts/lib/peer-cli/asp-client.cjs` — ASP client implementation.
- `scripts/lib/peer-cli/spawn-cmd.cjs` — Windows `.cmd` EINVAL workaround.
- `scripts/lib/peer-cli/broker-lifecycle.cjs` — long-lived broker.
- `scripts/lib/peer-cli/adapters/*.cjs` — per-peer thin wrappers.
- `scripts/lib/peer-cli/registry.cjs` — central dispatch.
- `tests/peer-cli-{acp,asp,spawn,registry,adapters}.test.cjs` — protocol-level tests.
- `docs/PEER-DELEGATION.md` — ops guide.
- `NOTICE` — Apache 2.0 attribution for cc-multi-cli.
- `.planning/phases/27-peer-cli-delegation/CONTEXT.md` — decision lineage (D-01, D-02, D-03, D-04).
