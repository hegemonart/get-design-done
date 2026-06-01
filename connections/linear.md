# Linear — Connection Specification

This file is the connection specification for Linear within the get-design-done pipeline. See `connections/connections.md` for the full index + capability matrix (the linear row is added at the 35.3 closeout).

---

Linear is a **bidirectional ticket-sync surface** (Team Surfaces layer). GDD links a design cycle to a Linear issue, **reads** the issue's comments as context when a `.design/**.md` file opens, and **writes** a redacted status update + summary on cycle completion. MCP-based (`mcp__linear__*`) — GDD calls MCP tools, not raw HTTP, so there is no new outbound egress.

---

## Setup

**Prerequisites:** the Linear MCP server connected to your workspace (OAuth on first use). No GDD-held token.

```
# register the Linear MCP per Linear's MCP docs, then restart the session
```

(Alternative for non-MCP runtimes: a `LINEAR_API_KEY` env — documented for parity, but GDD ships MCP-based.)

**Verification:**

```
ToolSearch({ query: "linear", max_results: 10 })
```

Expect Linear issue/comment tools (`mcp__linear__*`). If empty → `linear: not_configured`. Verify exact tool names via ToolSearch before calling; do not hardcode.

---

## What GDD does (bidirectional, via `agents/ticket-sync-agent.md`)

- **READ (decision-injector):** when a `.design/**.md` opens, the linked Linear issue's recent comments are surfaced as cycle context (so a decision made in the ticket reaches the pipeline).
- **WRITE (cycle completion):** on `/gdd:complete-cycle`, the agent updates the linked issue's status (e.g., In Review → Done) and posts a **redacted** one-paragraph summary (verify result + top-line audit). The link map lives in STATE `<ticket_links>`.

See `reference/ticket-sync.md` for the `<ticket_links>` schema + the read/write contract.

## Redaction + kill-switch + degrade

- Every body written to Linear passes through `scripts/lib/redact.cjs` (the single chokepoint).
- Kill-switch: `GDD_DISABLE_LINEAR=1` (env) or `.design/config.json` `"ticket_sync": { "linear": { "enabled": false } }`. `gsd-health` surfaces it.
- **Degrade-to-noop:** `linear: not_configured` / disabled / an MCP error → skip ticket-sync (no error); the pipeline never blocks on it (D-04).

## STATE.md integration + probe

```xml
<connections>
linear: not_configured
</connections>
```

| Value | Meaning |
|---|---|
| `available` | ToolSearch returned `mcp__linear__*` tools AND not disabled |
| `unavailable` | tools present but a call errored (auth/rate) |
| `not_configured` | ToolSearch empty — Linear MCP not registered |

**Probe (ToolSearch-only — no token cost):** `ToolSearch({ query: "linear", max_results: 5 })` → empty → `not_configured`, non-empty → `available`. Which stages probe: cycle entry (decision-injector read) + complete-cycle (status write).

## Anti-pattern

Don't auto-transition a ticket to a state the team didn't define; don't post raw artifact excerpts (always redacted); don't create/triage issues (Phase 30 territory — this is sync of an already-linked ticket). Jira is the parity surface (`connections/jira.md`); the contract is identical.
