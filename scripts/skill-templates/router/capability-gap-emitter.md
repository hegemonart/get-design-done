# hone-router - capability_gap emitter (Phase 29 / D-02 / D-08)

Co-located reference for `skills/router/SKILL.md` - split out per Phase 28.5
contract (router SKILL ≤100 lines) and the Phase 28.6 co-location pattern.

## When to emit

If the router cannot resolve `intent-string` to a known agent (no agent's
`description` field matches, no `default-tier` rule applies, and the fallback
path-selection table returns nothing meaningful), emit ONE `capability_gap`
event before returning the conservative-fallback JSON output to the caller.

This feeds Phase 29 Stage-0 telemetry - the reflector pattern-detection pass
(Plan 29-02) and aggregation (Plan 29-03) read these events from the chain
file (`.design/gep/events.jsonl`) to surface recurring router-unmatched
intents as candidate agents in `{{command_prefix}}apply-reflections`.

## Synchronous emitter snippet

Same shape as fast, with `source: "router"`:

```bash
node -e '
const { appendChainEvent } = require("./scripts/lib/event-chain.cjs");
const { createHash, randomUUID } = require("node:crypto");
const intent = process.env.GDD_INTENT || "";
const payload = {
  event_id: randomUUID(),
  parent_event_id: null,
  source: "router",
  context_hash: createHash("sha256").update(intent).digest("hex"),
  intent_summary: intent.slice(0, 256),
  suggested_kind: "agent",
  evidence_refs: [],
};
appendChainEvent({
  agent: "router",
  outcome: "capability_gap",
  payload,
  type: "capability_gap",
  timestamp: new Date().toISOString(),
  sessionId: process.env.GDD_SESSION_ID || "router-cli",
});
'
```

## Notes

- `suggested_kind` is `"agent"` because router unmatched intents typically
  describe multi-step workflows (the unit the router resolves).
- Router-unmatched is NOT the same as MCP-probe failure (per D-08). If
  hone-router returns a fallback because a peer-CLI connection is down, do
  NOT emit capability_gap - that's a Phase 22 connection-status concern.
- The emitter is the LAST step before returning the fallback JSON. Router
  output is unchanged (back-compat per the existing `## Output schema
  versioning` table in `SKILL.md`); the event is a SIDE EFFECT, not a
  payload addition.
- Router output JSON contract is UNCHANGED - back-compat preserved.
- The 7-field payload flows through `appendChainEvent`'s opaque-extras
  pattern verbatim; the chain row carries `type`, `timestamp`, `sessionId`,
  `payload` as opaque extras and is projected back to the events-schema
  envelope by Plan 29-03 aggregation.

MCP-probe failures (connection down, transport-layer errors) do NOT emit
`capability_gap` - those are Phase 22 connection-status concerns (D-08).
