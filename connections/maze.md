# Maze — Connection Specification

This file is the connection specification for Maze within the hone pipeline. It lives in `connections/` alongside other connection specs (the structural template is [`connections/slack.md`](slack.md)). See `connections/connections.md` for the full connection index and capability matrix (the maze row is added at the Phase 38 wiring closeout).

---

Maze is a **user-research source** for the Outcome-Driven Adaptation layer (Phase 38). It is the usability-testing / prototype-testing counterpart to a notification surface: GDD does not *push* to Maze — it **reads** completed test reports and their aggregate metrics (read-only), then feeds the findings into the brief as prior research. The signal answers "how did real users actually do on this flow?" — misclick rate, time-on-task, completion rate — so the design stage starts from evidence instead of assumption.

**CRITICAL — PII guard (D-05):** every payload read from Maze MUST pass through `scripts/lib/pseudonymize.cjs` **before** it reaches any agent context. Test reports can carry participant-identifying fields (tester names, emails, free-text answers, session URLs). Pseudonymization is the single mandatory gate between Maze and the LLM; there is no path that skips it. This is read-only *plus* identity-scrubbed — the two properties together are the contract.

---

## Setup

**Prerequisites:** a Maze account with at least one completed test (a usability or prototype test that has collected responses), and a Maze **API token** with read access.

**Token (env, never committed):**

```bash
export MAZE_API_KEY="<your-maze-api-token>"
```

`MAZE_API_KEY` is a **read-only** credential — GDD uses it solely to GET indexed insights and aggregate metrics (report summaries, per-task rates). GDD never writes to Maze, never creates or modifies tests, and never pulls **raw session recordings** (video/click-stream) — only the indexed, already-aggregated insights and metrics. Treat the token like a password: never commit it (not in source, not in `.env`, not in config), never log it, rotate it if exposed. GDD reads it from env only.

**Verification:**

```bash
test -n "${MAZE_API_KEY}" && echo "maze token present" || echo "maze token absent"
```

---

## Availability Probe

Maze may be reachable either via an MCP (if one is registered in the host) or via its read-only HTTP API keyed by `MAZE_API_KEY`. Probe **MCP-first**, then fall back to the env check.

**Step M1 — MCP presence (ToolSearch-only, no tool call, no API cost):**

```
ToolSearch({ query: "maze", max_results: 5 })
  → Non-empty result → maze: available
  → Empty result     → proceed to Step M2
```

**Step M2 — API token check:**

```bash
test -n "${MAZE_API_KEY}"
```

- Non-empty AND not disabled → `maze: available`
- Empty → `maze: not_configured`
- Present but a read errored at fetch time → `maze: unavailable`

**Kill-switch:** Maze reads are a noop when `GDD_DISABLE_MAZE=1` (env), regardless of token/MCP presence — the probe resolves to `not_configured`. `gsd-health` surfaces the state (mirrors the Phase 30 / 35.1 health-mirror pattern).

**Write `maze` status to `.design/STATE.md` `<connections>` after probing:**

```xml
<connections>
maze: not_configured
</connections>
```

| Value | Meaning |
|---|---|
| `available` | `maze` MCP registered, OR `MAZE_API_KEY` set — AND not disabled |
| `unavailable` | reachable but a read errored at fetch time |
| `not_configured` | no `maze` MCP and no `MAZE_API_KEY`, or `GDD_DISABLE_MAZE=1` |

---

## What GDD reads

Read-only, indexed surface only — the parity inverse of the slack.md "What GDD sends" table:

| Surface | Read? | Pipeline use |
|---|---|---|
| Report summary (per-test insights) | yes | synthesized into `<prior-research>` |
| Aggregate metrics (misclick rate, time-on-task, completion) | yes | the headline outcome signal for the brief |
| Tester names / emails / free-text answers | only via pseudonymize | identity fields scrubbed to placeholders before any agent sees them |
| Raw session recordings (video / click-stream) | **never** | out of scope — highest-PII surface, not fetched |

## Pipeline Integration

Maze is a **user-research** input to the discover/plan boundary, consumed only when `maze: available`. The flow is strictly one-directional and identity-scrubbed:

```
Maze read (read-only)
  reports + metrics:
    - misclick rate      (wrong first/early taps per task)
    - time-on-task       (median seconds to complete)
    - completion rate    (% of testers who reached the goal)
  →  scripts/lib/pseudonymize.cjs   ← MANDATORY, runs FIRST, before any agent sees the payload
  →  agents/user-research-synthesizer.md
  →  brief-grade insights (ranked, de-duplicated, cited)
  →  the brief's <prior-research> block
```

1. **Read** — fetch indexed report summaries + aggregate metrics for the relevant test(s) via the MCP tool (verify the name via ToolSearch) or the read-only API. Never fetch raw recordings.
2. **Pseudonymize FIRST** — pass the *entire* fetched payload through `scripts/lib/pseudonymize.cjs` (the Phase 30 R1..R7 rule set: git-identity, paths, hostname, repo-origin, env-values, emails, IPs). Names, emails, and identity-correlatable strings in tester free-text become placeholders. **No payload reaches the synthesizer un-pseudonymized — this is the single egress chokepoint, the same discipline `connections/slack.md` applies via `redact.cjs`.**
3. **Synthesize** — [`agents/user-research-synthesizer.md`](../agents/user-research-synthesizer.md) turns the scrubbed metrics + report text into brief-grade insights: which tasks failed, where misclicks cluster, which steps are slow, framed against the method guidance in `reference/user-research.md` (so a low-n test is reported as directional, not as a statistically reliable rate).
4. **Inject** — the synthesized insights land in the brief's `<prior-research>` block, so the design stage opens with observed evidence ("testers misclicked the secondary CTA 41% of the time; completion held at 78%") rather than assumption.

Honest-framing note: pseudonymization reduces identity correlation, it does not eliminate it (writing style and free-text content can still re-identify). Findings are presented as **directional research signal**, never as anonymized fact, and sample size is always carried through from `reference/user-research.md`'s sample-size heuristics.

---

## Fallback Behavior

Maze is an **enhancement, never a gate** (degrade-to-noop, D-03). When `maze: not_configured`, `maze: unavailable`, or `GDD_DISABLE_MAZE=1`:

- The discover/plan boundary proceeds with **no** `<prior-research>` Maze block — the brief simply omits the prior-research signal (or carries other research sources if present).
- The synthesizer is **not** invoked for Maze; nothing is fetched, nothing is pseudonymized, nothing is logged.
- The pipeline **never blocks** on Maze availability — a missing user-research signal is a quality reduction, not an error. The design stage falls back to the assumption-driven path it would have used before any Maze data existed.

A read that errors mid-fetch downgrades to `unavailable` and is treated exactly like `not_configured`: skip, note the absence, continue.

---

## PII + Privacy

- **Pseudonymize before context — non-negotiable.** Every byte read from Maze passes through `scripts/lib/pseudonymize.cjs` before it is placed in any prompt, brief, or agent input. There is no bypass path; the synthesizer only ever receives scrubbed text. This mirrors the data-minimization + pseudonymization ethics in `reference/user-research.md` (names replaced with participant IDs, identifying details removed from quotes before sharing).
- **Read-only — no write-back.** GDD never sends anything to Maze. The token is GET-only; no test, response, or annotation is ever created or modified.
- **No raw recordings.** Only indexed insights and aggregate metrics are read. Session-recording video and raw click-streams are never fetched — they are the highest-risk PII surface and are out of scope by design.
- **No PII in logs or events.** The `maze` connection emits no participant identifiers into logs, the event stream, or `.design/STATE.md`. STATE.md carries only the three-value status token (`available` / `unavailable` / `not_configured`) — never report contents. The pseudonymization replacements log is itself length-truncated so a stray un-scrubbed value cannot leak at full length.

---

Do NOT edit the connection index here — the 38 wiring plan adds the Active-Connections row + the experiment-source matrix column.
