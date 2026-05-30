# gdd-router — router_pick emitter (Phase 32-08 / D-02)

Co-located reference for `skills/router/SKILL.md` — split out per the Phase 28.5
contract (router SKILL ≤100 lines) and the Phase 28.6 co-location pattern (same
convention as the sibling `./capability-gap-emitter.md`).

## When to emit

When the router resolves an intent to a concrete pick — i.e. it has selected the
`path` / `complexity_class` / `resolved_models` decision and is about to return
its decision JSON — emit ONE `router_pick` event recording WHICH skill/agent it
auto-picked. Emit exactly once per resolved pick, as the LAST step before
returning the decision JSON to the caller.

This is the D-02 router_pick instrument: GDD routes by description-match but has
no record of what the router actually reaches for, so there is no data on
under-reached skills. Phase 33 reads these events from the chain file
(`.design/gep/events.jsonl`) to baseline per-skill auto-pick rates (the
"pick-rate regression" expansion in the ROADMAP).

`router_pick` is NOT `capability_gap`: emit `router_pick` when the router DID
resolve a pick; emit `capability_gap` (see `./capability-gap-emitter.md`) only
when it could not resolve the intent at all. They are disjoint surfaces.

## Synchronous emitter snippet

Builds the 7-field `RouterPickPayload` and writes it via `appendChainEvent`.
The intent is hashed — the raw prompt is NEVER stored (no PII). `picked_skill`,
`rank`, and `alternatives` come from the router's resolved decision:

```bash
node -e '
const { appendChainEvent } = require("./scripts/lib/event-chain.cjs");
const { createHash, randomUUID } = require("node:crypto");
const intent = process.env.GDD_INTENT || "";
const payload = {
  event_id: randomUUID(),
  source: "router",
  picked_skill: process.env.GDD_PICKED_SKILL || "",
  context_hash: createHash("sha256").update(intent).digest("hex"),
  rank: Number(process.env.GDD_PICK_RANK || 0),
  alternatives: (process.env.GDD_ALTERNATIVES || "").split(",").filter(Boolean),
  ts: new Date().toISOString(),
};
appendChainEvent({
  agent: "router",
  outcome: "router_pick",
  payload,
  type: "router_pick",
  timestamp: new Date().toISOString(),
  sessionId: process.env.GDD_SESSION_ID || "router-cli",
});
'
```

`GDD_PICKED_SKILL` is the resolved pick; `GDD_PICK_RANK` is its rank among
candidates (0 = top pick); `GDD_ALTERNATIVES` is a comma-separated list of the
OTHER candidate skill/agent names the router considered (names only — no scores,
no prompt text). `GDD_INTENT` is hashed in-process and is never written to disk.

## Notes

- **No PII**: only `context_hash` (sha256 of the intent) is stored — never the
  raw prompt or intent string. The `RouterPickPayload` is
  `additionalProperties: false`, so a stray `raw_prompt` field would be rejected
  by `events.schema.json` validation. This mirrors `capability_gap`'s hash
  discipline.
- **Router output JSON contract is UNCHANGED** — `router_pick` is a SIDE EFFECT,
  not a new output field. Back-compat is preserved exactly as the existing
  `## Output schema versioning` table in `SKILL.md` guarantees; the emitter runs
  AFTER the decision is computed and does not alter the returned blob.
- The 7-field payload flows through `appendChainEvent`'s opaque-extras pattern
  verbatim; the chain row carries `type`, `timestamp`, `sessionId`, `payload` as
  opaque extras and is projected back to the events-schema envelope by Phase 33
  aggregation (same projection the capability_gap aggregation uses).
- Validated against the additive `RouterPickPayload` branch (allOf[2]) in
  `reference/schemas/events.schema.json` — see
  `test/suite/router-pick-event.test.cjs`.
