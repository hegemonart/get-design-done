# Statsig — Connection Specification

This file is the connection specification for Statsig within the get-design-done pipeline. It lives in `connections/` alongside other connection specs (see [`connections/slack.md`](slack.md) for the structural sibling — an API/env-based connection with a three-value probe and degrade-to-noop, and [`connections/launchdarkly.md`](launchdarkly.md) for the experiment-source sibling this file mirrors).

---

Statsig is an **experiment-source** for the outcome-learning layer (Phase 38). GDD **reads** A/B experiment results and feature-gate / Pulse metric outcomes from Statsig and feeds each variant→outcome into the `design_arms` posterior, so shipped design decisions get reinforced or discounted by what actually performed in production. GDD never runs, creates, edits, starts, or stops experiments or gates — it is strictly **read-only** (D-04). Reads degrade to a noop when unconfigured or disabled; outcome learning simply pauses and the pipeline never blocks.

---

## Setup

**Prerequisites:** read-only access to a Statsig project's experiment / Pulse results — either a Statsig **console API key** (a read-scoped key, not a server-write key) exported as `STATSIG_API_KEY`, **or** the Statsig MCP if it is installed in your runtime.

**Token (env, never committed):**

```bash
export STATSIG_API_KEY="<read-scoped-console-api-key>"
```

Use the narrowest scope Statsig offers (a read-only console key). The key is a credential — never commit it (not in source, not in `.env`, not in config), never log it, rotate if exposed. GDD reads it from env only and never requests a write scope.

**Verification:**

```bash
test -n "${STATSIG_API_KEY}" && echo "statsig key present" || echo "statsig key absent"
```

---

## Availability Probe

Probe is **MCP-first**, env-fallback, kill-switch-aware:

1. If `GDD_DISABLE_STATSIG=1` → short-circuit to `not_configured` (treated as disabled; never probe further).
2. Run `ToolSearch({ query: "statsig" })`. If a Statsig MCP tool resolves → `statsig: available`.
3. Else check the env key: `test -n "${STATSIG_API_KEY}"`.
   - Non-empty → `statsig: available`
   - Empty → `statsig: not_configured`
4. Source present (MCP or key) but a read errored at fetch time → `statsig: unavailable`.

Write the `statsig` status to `.design/STATE.md` `<connections>` after probing:

```xml
<connections>
statsig: not_configured
</connections>
```

| Value | Meaning |
|---|---|
| `available` | Statsig MCP resolves OR `STATSIG_API_KEY` set, AND not disabled |
| `unavailable` | source present but a result read errored |
| `not_configured` | no MCP and no `STATSIG_API_KEY`, or `GDD_DISABLE_STATSIG=1` |

The kill-switch `GDD_DISABLE_STATSIG=1` forces `not_configured` regardless of MCP/key presence (mirrors the Phase 30 / 35.1 disable convention). `gsd-health` surfaces the state.

---

## Pipeline Integration

Statsig contributes the **experiment-source** capability. The flow is read-only and one-directional (results in, never experiments out):

1. The probe marks `statsig: available` in `.design/STATE.md`.
2. The experiment-result ingester (`agents/experiment-result-ingester.md`) reads completed experiment results and feature-gate / Pulse metric outcomes from Statsig — variant (group) identifiers plus their measured metric lift.
3. It maps each variant to the matching `design_arms` arm and records the outcome (win / loss / lift) against that arm's posterior, so the next design decision is informed by production evidence.
4. For each mapped result it emits an `experiment_result` event into the pipeline's event stream for downstream learning and audit.

The ingester reads results only; it issues no experiment-creation, gate-toggle, assignment, or mutation calls against Statsig (D-04).

**Injectable fetch (hermetic tests):** the ingester takes an injectable `fetchImpl` (defaulting to the resolved MCP tool or global `fetch`). Tests pass a stub `fetchImpl` so `npm test` exercises the variant→outcome mapping with no real egress — no live Statsig call in CI. There is **no bundled Statsig SDK and no new dependency**; reads go through the MCP tool or the injectable `fetchImpl`.

---

## Fallback Behavior

`not_configured` (no MCP, no key) or disabled (`GDD_DISABLE_STATSIG=1`) → the experiment-source **degrades to a noop**: the ingester is skipped, no `experiment_result` events are emitted, and the `design_arms` posterior simply does not get the outcome update this cycle. Design decisions still ship — they just rely on prior evidence instead of fresh experiment results.

A read failure when a source *is* present → `statsig: unavailable`; that cycle's ingestion is skipped (no error surfaced to the pipeline) and retried on the next probe. The ingester returns a skipped/empty result and never throws, so outcome learning is best-effort and **never blocks the pipeline** (mirrors the notify degrade-to-noop in [`connections/slack.md`](slack.md)). Statsig and [`connections/launchdarkly.md`](launchdarkly.md) are parity experiment-sources — the read-only contract is identical; only the metric-payload shape the ingester maps differs.

---

Do NOT edit the connection index here — the 38 wiring plan adds the Active-Connections row + the experiment-source matrix column.
