# Jira — Connection Specification

This file is the connection specification for Jira within the get-design-done pipeline — the parity of `connections/linear.md`. See `connections/connections.md` for the index + capability matrix (the jira row is added at the 35.3 closeout).

---

Jira is a **bidirectional ticket-sync surface** (Team Surfaces layer) — identical contract to Linear, only the MCP server differs. GDD links a design cycle to a Jira issue, **reads** the issue's comments as context when a `.design/**.md` opens, and **writes** a redacted status transition + summary on cycle completion. MCP-based (the **Atlassian MCP**, `mcp__atlassian__*`) — GDD calls MCP tools, not raw HTTP; no new outbound egress.

---

## Setup

**Prerequisites:** the Atlassian MCP server connected to your Jira site (OAuth on first use). No GDD-held token.

```
# register the Atlassian MCP per Atlassian's MCP docs, then restart the session
```

(Alternative for non-MCP runtimes: `JIRA_BASE_URL` + `JIRA_API_TOKEN` env — documented for parity; GDD ships MCP-based.)

**Verification:**

```
ToolSearch({ query: "atlassian jira", max_results: 10 })
```

Expect Atlassian/Jira issue/comment tools (`mcp__atlassian__*`). If empty → `jira: not_configured`. Verify exact tool names via ToolSearch; do not hardcode.

---

## What GDD does (bidirectional, via `agents/ticket-sync-agent.md`)

- **READ (decision-injector):** on `.design/**.md` open, the linked Jira issue's recent comments are surfaced as cycle context.
- **WRITE (cycle completion):** on `/gdd:complete-cycle`, the agent transitions the linked issue (e.g., In Review → Done) and posts a **redacted** summary. The link map lives in STATE `<ticket_links>` (`jira:PROJ-45`).

See `reference/ticket-sync.md` for the `<ticket_links>` schema + the read/write contract.

## Redaction + kill-switch + degrade

- Every body written to Jira passes through `scripts/lib/redact.cjs`.
- Kill-switch: `GDD_DISABLE_JIRA=1` (env) or `.design/config.json` `"ticket_sync": { "jira": { "enabled": false } }`. `gsd-health` surfaces it.
- **Degrade-to-noop:** `jira: not_configured` / disabled / an MCP error → skip (no error); the pipeline never blocks (D-04).

## STATE.md integration + probe

```xml
<connections>
jira: not_configured
</connections>
```

| Value | Meaning |
|---|---|
| `available` | ToolSearch returned `mcp__atlassian__*` tools AND not disabled |
| `unavailable` | tools present but a call errored |
| `not_configured` | ToolSearch empty — Atlassian MCP not registered |

**Probe (ToolSearch-only):** `ToolSearch({ query: "atlassian jira", max_results: 5 })` → empty → `not_configured`, non-empty → `available`.

## Anti-pattern

Don't auto-transition to an undefined workflow state; don't post un-redacted excerpts; don't create/triage issues (Phase 30). Conflict resolution: when the Jira status and the GDD `<ticket_links>` state diverge, **Jira wins** (external source of truth) and GDD reconciles on next sync with an explicit notice (ROADMAP open-Q default). Linear is the sibling surface (`connections/linear.md`).
