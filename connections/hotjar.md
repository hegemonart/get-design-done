# Hotjar — Connection Specification

This file is the connection specification for Hotjar within the get-design-done pipeline. It lives in `connections/` alongside other connection specs. See the connection index for the full connection capability matrix (the hotjar row is added at the Phase 38 wiring closeout).

---

Hotjar is a **user-research source** for the discover/plan stages. GDD reads **indexed insights only** — heatmap aggregates, indexed session-insight summaries, and survey results — and feeds findings, as brief-grade prior research, into a phase brief. The connection is strictly **read-only**: GDD never writes to Hotjar, and it **never reads raw session-replay video** (or any per-visitor recording). It pulls only the pre-indexed, aggregate insight surface.

Session data is among the most PII-sensitive inputs the pipeline can touch — a single replay or un-aggregated event can carry names, emails, typed form values, IPs, and on-screen personal data. **CRITICAL (D-05): every Hotjar payload MUST pass through `scripts/lib/pseudonymize.cjs` BEFORE it reaches any agent context.** Pseudonymization is mandatory, not optional, and it is the single chokepoint between Hotjar data and any model prompt. This mirrors the redact-before-egress discipline used for the notification surfaces ([`connections/slack.md`](slack.md)), but inverted: redaction guards *outbound*; here pseudonymization guards *inbound* — research data must be scrubbed before it enters a prompt.

---

## Setup

**Prerequisites:** a Hotjar account with API access, and a **read-only** API token scoped to insight/aggregate endpoints only (no recording-export scope).

**Token (env, never committed):**

```bash
export HOTJAR_API_KEY="<your-read-only-token>"
```

Scope the token to **indexed insights / heatmap aggregates / survey results only** — never grant raw-recording or session-export scope, even if Hotjar offers it. GDD has no code path that downloads recordings, and the token must not be able to either. The key is a credential: never commit it (not in source, not in `.env`, not in config), never log it, and rotate it if exposed. GDD reads it from env only.

**Verification:**

```bash
test -n "${HOTJAR_API_KEY}" && echo "hotjar token present" || echo "hotjar token absent"
```

---

## Availability Probe

Hotjar may be reached either through an MCP (if one is registered) or directly via its HTTP API with the env token. Probe **MCP-first**, then fall back to the env check.

**Step H1 — MCP presence (preferred):**

```
ToolSearch({ query: "hotjar", max_results: 10 })
```

- Non-empty result → an MCP is registered → `hotjar: available`
- Empty result → fall through to Step H2

**Step H2 — token presence:**

```bash
test -n "${HOTJAR_API_KEY}"
```

- Non-empty → `hotjar: available`
- Empty → `hotjar: not_configured`
- Present (MCP or token) but a live insight fetch errored → `hotjar: unavailable`

**Kill-switch:** Hotjar is forced to a noop when `GDD_DISABLE_HOTJAR=1` (env), regardless of MCP/token presence — the probe short-circuits to `not_configured` and no fetch is attempted. `gdd-health` surfaces the state (mirrors the Phase 30 / 35.x kill-switch pattern).

**Write the `hotjar` status to `.design/STATE.md` `<connections>` after probing.** Three-value schema:

| Value | Meaning |
|---|---|
| `available` | MCP registered, OR `HOTJAR_API_KEY` set — and not disabled |
| `unavailable` | MCP/token present but a live insight fetch errored |
| `not_configured` | no MCP and no `HOTJAR_API_KEY` (or `GDD_DISABLE_HOTJAR=1`) |

```xml
<connections>
hotjar: not_configured
</connections>
```

---

## Pipeline Integration

Hotjar feeds the **user-research** lane of discover/plan. The flow is strictly ordered, and the pseudonymize step is non-negotiable and comes **first**:

1. **Fetch (read-only):** pull heatmap aggregates, indexed session-insight summaries, and survey results for the relevant page/flow. Aggregates only — never a raw recording.
2. **Pseudonymize FIRST:** pass every fetched payload through `scripts/lib/pseudonymize.cjs` *before anything else touches it*. The scrubbed `{ payload, replacements }` is the only form allowed downstream. Nothing — no agent, no log, no event — sees the pre-scrub data.
3. **Synthesize:** hand the pseudonymized payload to the `user-research-synthesizer` agent, which distills it into brief-grade insights (top friction points, drop-off zones, survey themes) without re-introducing any identifier.
4. **Inject:** the synthesized, brief-grade insights land in the phase brief's `<prior-research>` block, where the plan stage reads them as prior evidence for design decisions.

Stage flow: `heatmap / insight / survey aggregates → pseudonymize.cjs (FIRST) → user-research-synthesizer → brief-grade insights → brief <prior-research> block`.

Adjacent methodology (sample sizing, heatmap/survey interpretation, over-claim guards) lives in the user-research reference doc and governs how the synthesizer reads these aggregates.

The fetch path POSTs/GETs via an **injectable `fetchImpl`** (defaulting to the global `fetch`), so the test suite drives it with synthetic insight fixtures hermetically — no live Hotjar, no network. There is **no new dependency**: no `@hotjar/*` package, no SDK; just `fetch` + the existing pseudonymize primitive.

---

## Fallback Behavior

Hotjar is an **enhancement, never a hard requirement** (D-03). When `hotjar: not_configured`, `hotjar: unavailable`, or the kill-switch is on, the user-research lane **degrades to a noop**: the `<prior-research>` block is simply built without Hotjar-sourced signals (other research sources, if any, still contribute), and the pipeline continues. Discover/plan never block on Hotjar availability or on a fetch failure.

A failed or skipped fetch returns a benign skipped result and never throws. The synthesizer treats absent Hotjar input as "source: missing" and proceeds — same graceful-degradation contract the other optional connections use.

---

## PII + Privacy

Session-research data is highly PII-sensitive. This section is binding, not advisory.

- **Pseudonymize before context (mandatory, D-05):** every Hotjar payload passes through `scripts/lib/pseudonymize.cjs` **before** it reaches any agent prompt, the synthesizer, or any persisted artifact. There is no bypass path; pseudonymization is the single inbound chokepoint. (Note this is *pseudonymization, not anonymization* — identity correlation is reduced, not eliminated.)
- **Aggregates, not raw sessions:** GDD reads only indexed insights, heatmap aggregates, and survey results. It **never** fetches, stores, or forwards raw session-replay video or per-visitor recordings — there is no code path that can, and the token must not be scoped to allow it.
- **No PII in logs or events:** the pseudonymized payload is what flows downstream; the pre-scrub payload is never written to logs, never emitted in pipeline events, and never persisted. The `HOTJAR_API_KEY` is likewise never logged.
- **Least scope:** prefer the narrowest read-only token Hotjar offers; if recording-export scope cannot be excluded at the token, treat that token as unsafe for this connection.

---

Do NOT edit the connection index here — the Phase 38 wiring plan adds the Active-Connections row + the experiment-source matrix column.
