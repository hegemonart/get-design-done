# GrowthBook — Connection Specification

This file is the connection specification for GrowthBook within the get-design-done pipeline. It lives in `connections/` alongside other connection specs (see [`connections/slack.md`](slack.md) for the structural sibling — an API/env-based connection with a three-value probe and degrade-to-noop).

---

GrowthBook is an open-source **experiment-source** for the outcome-learning layer (Phase 38). GDD **reads** A/B experiment results from GrowthBook and feeds each variant→outcome into the `design_arms` posterior, so shipped design decisions get reinforced or discounted by what actually performed in production. GDD never runs, creates, edits, or stops experiments — it is strictly **read-only** (D-04). Reads degrade to a noop when unconfigured or disabled; outcome learning simply pauses and the pipeline never blocks.

GrowthBook ships in two deployment shapes, and GDD supports both: a **cloud** account (the hosted GrowthBook service) or a **self-hosted** instance you operate. GDD connects to whichever you point it at; it does not install, bundle, or host GrowthBook (mirrors the self-hosted-or-cloud split in [`connections/slack.md`](slack.md)'s sibling canvas specs).

---

## Setup

**Prerequisites:** read-only access to a GrowthBook project's experiment results — either a GrowthBook **API key** (a read-only / viewer-scoped token, not a full-access token) **or** the GrowthBook MCP if it is installed in your runtime.

**Token (env, never committed):**

```bash
export GROWTHBOOK_API_KEY="<read-only-api-key>"
```

**Optional host (self-hosted only):**

```bash
export GROWTHBOOK_API_HOST="https://growthbook.internal.example.com"
```

`GROWTHBOOK_API_HOST` is the **distinguishing signal** between cloud and self-hosted. Leave it unset for the hosted GrowthBook cloud (GDD targets the default cloud host); set it to your instance origin when self-hosting. GDD records the resolved host so downstream stages know which deployment produced a result.

Use the narrowest scope GrowthBook offers (read-only / viewer). The key is a credential — never commit it (not in source, not in `.env`, not in config), never log it, rotate if exposed. GDD reads it from env only and never requests a write scope.

**Verification:**

```bash
test -n "${GROWTHBOOK_API_KEY}" && echo "growthbook key present" || echo "growthbook key absent"
```

---

## Availability Probe

Probe is **MCP-first**, env-fallback, kill-switch-aware:

1. If `GDD_DISABLE_GROWTHBOOK=1` → short-circuit to `not_configured` (treated as disabled; never probe further).
2. Run `ToolSearch({ query: "growthbook" })`. If a GrowthBook MCP tool resolves → `growthbook: available`.
3. Else check the env key: `test -n "${GROWTHBOOK_API_KEY}"`.
   - Non-empty → `growthbook: available`
   - Empty → `growthbook: not_configured`
4. Source present (MCP or key) but a read errored at fetch time → `growthbook: unavailable`.
5. When the env path is used, classify the deployment from `GROWTHBOOK_API_HOST`: unset → `deployment=cloud`; any other host → `deployment=self-hosted`. (Via MCP only, with no host exported, `deployment=unknown`.)

Write the `growthbook` status to `.design/STATE.md` `<connections>` after probing, using the **three-value schema** plus the deployment marker:

```xml
<connections>
growthbook: not_configured
</connections>
```

When available, record the resolved deployment alongside the status, e.g. `growthbook: available (deployment=self-hosted)` or `growthbook: available (deployment=cloud)`.

| Value | Meaning |
|---|---|
| `available` | GrowthBook MCP resolves OR `GROWTHBOOK_API_KEY` set, AND not disabled |
| `unavailable` | source present but a result read errored |
| `not_configured` | no MCP and no `GROWTHBOOK_API_KEY`, or `GDD_DISABLE_GROWTHBOOK=1` |

| Field | Values | Meaning |
|---|---|---|
| `deployment` | `cloud` / `self-hosted` / `unknown` | Derived from `GROWTHBOOK_API_HOST`; `unknown` when only the MCP path is present and no host is exported |

The kill-switch `GDD_DISABLE_GROWTHBOOK=1` forces `not_configured` regardless of MCP/key presence (mirrors the Phase 30 / 35.1 disable convention). `gsd-health` surfaces the state.

---

## Pipeline Integration

GrowthBook contributes the **experiment-source** capability. The flow is read-only and one-directional (results in, never experiments out):

1. The probe marks `growthbook: available` (and its `deployment`) in `.design/STATE.md`.
2. The experiment-result ingester ([`agents/experiment-result-ingester.md`](../agents/experiment-result-ingester.md)) reads completed A/B results from GrowthBook — each experiment's variant identifiers plus their measured metric outcomes (the conversion/lift figures GrowthBook computed for that experiment).
3. It maps each variant to the matching `design_arms` arm and records the outcome (win / loss / lift) against that arm's posterior, so the next design decision is informed by production evidence rather than priors alone.
4. For each mapped result it emits an `experiment_result` event into the pipeline's event stream for downstream learning and audit.

A variant that does not map to a known `design_arms` arm is recorded as unmatched and skipped — it never invents an arm. The ingester reads results only; it issues no experiment-creation, assignment, or mutation calls against GrowthBook (D-04). It surfaces `deployment` so an operator can tell cloud results from self-hosted ones in the event trail, since the two deployments can carry independent experiment sets.

**Injectable fetch (hermetic tests):** the ingester takes an injectable `fetchImpl` (defaulting to the resolved MCP tool or global `fetch`). Tests pass a stub `fetchImpl` so `npm test` exercises the variant→outcome mapping with no real egress — no live GrowthBook call in CI, and no dependence on either the cloud host or a self-hosted origin. There is **no bundled GrowthBook SDK and no new dependency**; reads go through the MCP tool or the injectable `fetchImpl`.

**Scope — read vs. never:**

| GDD reads (read-only) | GDD never does (D-04) |
|---|---|
| Completed experiment results: variant ids + metric outcomes | Create, start, stop, or archive an experiment |
| Per-variant lift / win-loss figures GrowthBook computed | Assign users, change traffic splits, or edit targeting |
| Experiment / variant identifiers for `design_arms` mapping | Write any flag, feature, or experiment definition back |

Everything GDD touches in GrowthBook is a `GET`-equivalent read. There is no GrowthBook code path in GDD that mutates state, which is what lets a reader/viewer-scoped key suffice and keeps the connection safe to leave attached.

---

## Fallback Behavior

`not_configured` (no MCP, no key) or disabled (`GDD_DISABLE_GROWTHBOOK=1`) → the experiment-source **degrades to a noop**: the ingester is skipped, no `experiment_result` events are emitted, and the `design_arms` posterior simply does not get the outcome update this cycle. Design decisions still ship — they just rely on prior evidence instead of fresh experiment results.

A read failure when a source *is* present (cloud unreachable, self-hosted origin down, or an errored response) → `growthbook: unavailable`; that cycle's ingestion is skipped (no error surfaced to the pipeline) and retried on the next probe. The ingester returns a skipped/empty result and never throws, so outcome learning is best-effort and **never blocks the pipeline** (mirrors the notify degrade-to-noop in [`connections/slack.md`](slack.md)). Always re-probe at stage entry — both the access path and the resolved deployment can change between sessions.

---

Do NOT edit the connection index here — the 38 wiring plan adds the Active-Connections row + the experiment-source matrix column.
