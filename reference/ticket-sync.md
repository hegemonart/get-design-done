# Ticket Sync — the `<ticket_links>` contract for `agents/ticket-sync-agent.md`

How GDD links a design cycle to a Linear/Jira ticket, reads its comments as context, and writes a redacted status update on completion — all via MCP tools (no raw HTTP, no bundled SDK). The per-system probe + tool detail live in `connections/linear.md` + `connections/jira.md`.

---

## The `<ticket_links>` STATE block

GDD records the cycle→ticket map in `.design/STATE.md`:

```xml
<ticket_links>
cycle: <cycle-id>
linear: ABC-123
jira: PROJ-45
</ticket_links>
```

- A cycle may link a Linear issue, a Jira issue, both, or neither.
- The link is set by the user (or a future `/gdd:link-ticket`); the agent **reads** it, never invents a link.
- No link for the current cycle → the agent is a noop on both paths.

## Read path (decision-injector — `.design/**.md` open)

When a design artifact opens and the cycle has a link to an `available` system, the agent fetches the linked ticket's recent comments (via the resolved `mcp__linear__*` / `mcp__atlassian__*` tool) and surfaces a short **redacted** digest as cycle context — so a decision made in the ticket reaches the pipeline. Read-only; nothing is written on this path.

## Write path (`/gdd:complete-cycle`)

On cycle completion, for each linked + available system:

1. **Transition** the ticket status — the default map (overridable in `.design/config.json#ticket_sync.transitions`):

   | Cycle outcome | Ticket transition |
   |---|---|
   | verify passed | → Done / Closed |
   | verify failed | → In Progress (reopened) |
   | shipped (PR open) | → In Review |

2. **Post** a **redacted** one-paragraph summary (verify pass/fail + top-line audit + PR URL if present) via the ticket's comment tool.

## Conflict resolution (tracker wins)

If the ticket's current status diverges from what `<ticket_links>` last recorded (a human moved it), **the tracker is the source of truth** — the agent reconciles `<ticket_links>` to the tracker's state and posts an explicit "GDD observed an external status change; reconciling" note, rather than force-overwriting the human transition. (ROADMAP Phase-35 open-Q default.)

## Redaction (mandatory)

Every body written to a ticket — the status comment, the summary — passes through `scripts/lib/redact.cjs` (11 secret/token patterns) before the MCP call. The agent is the single egress chokepoint; no raw artifact excerpt reaches Linear/Jira.

## Kill-switches (per system)

A system is a noop when **either** `GDD_DISABLE_LINEAR=1` / `GDD_DISABLE_JIRA=1` (env) **or** `.design/config.json` `ticket_sync.<system>.enabled === false`. `gsd-health` surfaces each system's state (mirrors Phase 30 / 35.1 / 35.2).

## Degrade-to-noop (never blocks the cycle)

`not_configured` (MCP absent) / disabled / no link / an MCP error → the agent skips that system and **never throws** into the pipeline — ticket-sync is a best-effort side surface, never a cycle gate (D-04).

## Out of scope (per Phase 35 split)

PR-inline (35.1); Slack/Discord notifications (35.2); issue **creation**/triage (Phase 30 territory — this is sync of an already-linked ticket); a bundled Linear/Jira SDK (MCP-based, D-02); `pseudonymize.cjs` (Phase 30 — redact for secrets is the must here); Microsoft Teams / Asana.
