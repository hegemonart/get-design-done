# UserTesting — Connection Specification

This file is the connection specification for UserTesting within the hone pipeline. It lives in `connections/` alongside other connection specs (see [`connections/slack.md`](slack.md) for the structural sibling — an API/env-based connection with a three-value probe and degrade-to-noop, and [`connections/launchdarkly.md`](launchdarkly.md) for the Phase-38 read-only source pattern).

---

UserTesting is a **user-research source** for the outcome-learning layer (Phase 38). GDD **reads** completed test reports and study insights from UserTesting and feeds brief-grade findings into the design brief, so design decisions are grounded in what real participants did and said. GDD never schedules, launches, edits, or stops studies — it is strictly **read-only**. Reads degrade to a noop when unconfigured or disabled; the brief simply ships without a prior-research block and the pipeline never blocks.

**CRITICAL (PII guard, D-05): every user-research payload MUST pass through [`scripts/lib/pseudonymize.cjs`](../scripts/lib/pseudonymize.cjs) BEFORE it reaches any agent context.** Participant identities, emails, and faces/voices captured in transcripts are PII. No raw report, transcript, or recording text enters an agent prompt, an event, or a log until it has been pseudonymized. This is mandatory and non-negotiable — see the dedicated PII + Privacy section below.

---

## Setup

**Prerequisites:** read-only access to a UserTesting workspace's completed reports and study insights — either a UserTesting **API key** (a reader/viewer-scoped token, not a writer/admin token) or read-only OAuth, **or** the UserTesting MCP if it is installed in your runtime.

**Token (env, never committed):**

```bash
export USERTESTING_API_KEY="<reader-scoped-api-or-oauth-token>"
```

Use the narrowest scope UserTesting offers (reader/viewer). The key is a credential — never commit it (not in source, not in `.env`, not in config), never log it, rotate if exposed. GDD reads it from env only and never requests a write scope.

**No raw session-replay video storage.** GDD reads **indexed insights** — text findings, tagged highlights, severity/frequency annotations — never the underlying session-replay video. Recordings are never downloaded, never cached, and never stored locally. Only the derived, pseudonymized text crosses into the pipeline.

**Verification:**

```bash
test -n "${USERTESTING_API_KEY}" && echo "usertesting key present" || echo "usertesting key absent"
```

---

## Availability Probe

Probe is **MCP-first**, env-fallback, kill-switch-aware:

1. If `GDD_DISABLE_USERTESTING=1` → short-circuit to `not_configured` (treated as disabled; never probe further).
2. Run `ToolSearch({ query: "usertesting" })`. If a UserTesting MCP tool resolves → `usertesting: available`.
3. Else check the env key: `test -n "${USERTESTING_API_KEY}"`.
   - Non-empty → `usertesting: available`
   - Empty → `usertesting: not_configured`
4. Source present (MCP or key) but a read errored at fetch time → `usertesting: unavailable`.

Write the `usertesting` status to `.design/STATE.md` `<connections>` after probing:

```xml
<connections>
usertesting: not_configured
</connections>
```

| Value | Meaning |
|---|---|
| `available` | UserTesting MCP resolves OR `USERTESTING_API_KEY` set, AND not disabled |
| `unavailable` | source present but a result read errored |
| `not_configured` | no MCP and no `USERTESTING_API_KEY`, or `GDD_DISABLE_USERTESTING=1` |

The kill-switch `GDD_DISABLE_USERTESTING=1` forces `not_configured` regardless of MCP/key presence (mirrors the Phase 30 / 35.1 disable convention). `gsd-health` surfaces the state.

---

## Pipeline Integration

UserTesting contributes the **user-research source** capability. The flow is read-only and one-directional (insights in, never studies out):

1. The probe marks `usertesting: available` in `.design/STATE.md`.
2. The reader pulls completed test reports / study insights from UserTesting (indexed text only — never video).
3. **PII pseudonymization runs FIRST.** Every report payload is passed through [`scripts/lib/pseudonymize.cjs`](../scripts/lib/pseudonymize.cjs) before anything else touches it — participant names, emails, and identity-correlatable fields are scrubbed to placeholders. The raw payload is never forwarded.
4. The pseudonymized payload is handed to [`agents/user-research-synthesizer.md`](../agents/user-research-synthesizer.md), which distills it into **brief-grade insights** — each shaped as `{ finding, frequency, severity }` (the finding text, how many participants hit it, and how impactful it was).
5. Those insights are written into the design brief's `<prior-research>` block, so the brief carries real-participant evidence alongside design direction.

The reader and synthesizer read insights only; they issue no study-creation, scheduling, or mutation calls against UserTesting.

**Injectable fetch (hermetic tests):** the reader takes an injectable `fetchImpl` (defaulting to the resolved MCP tool or global `fetch`). Tests pass a stub `fetchImpl` so `npm test` exercises the report → pseudonymize → synthesize path with no real egress — no live UserTesting call in CI. There is **no bundled UserTesting SDK and no new dependency**; reads go through the MCP tool or the injectable `fetchImpl`.

---

## Fallback Behavior

`not_configured` (no MCP, no key) or disabled (`GDD_DISABLE_USERTESTING=1`) → the user-research source **degrades to a noop**: the reader is skipped, no payload is fetched or pseudonymized, the synthesizer is not invoked, and the brief's `<prior-research>` block is simply omitted. Design decisions still ship — they just proceed without fresh participant evidence this cycle.

A read failure when a source *is* present → `usertesting: unavailable`; that cycle's read is skipped (no error surfaced to the pipeline) and retried on the next probe. The reader returns a skipped/empty result and never throws, so user-research enrichment is best-effort and **never blocks the pipeline** (mirrors the notify degrade-to-noop in [`connections/slack.md`](slack.md)).

---

## PII + Privacy

User-research data is the highest-sensitivity input GDD ingests. Treat every payload as PII until proven otherwise.

- **Pseudonymize before context (mandatory).** No raw UserTesting payload — report body, transcript text, highlight note — enters an agent prompt, the synthesizer, the event stream, or any STATE/brief artifact until it has passed through [`scripts/lib/pseudonymize.cjs`](../scripts/lib/pseudonymize.cjs). Pseudonymization is the first step after the read, before any other handling. There is no bypass path.
- **No PII in logs or events.** Participant identities, emails, and identity-correlatable fields never appear in logs, the `experiment_result`/research event stream, or error output. Only pseudonymized, brief-grade text is ever emitted downstream.
- **Indexed insights, not raw recordings.** GDD reads derived text insights only — never session-replay video, audio, or screen captures of participants' faces/voices. Recordings are never downloaded, cached, or stored; the source of truth stays in UserTesting.
- **Pseudonymization is not anonymization.** Identity correlation is reduced, not eliminated — side-channel signals may still re-identify. The synthesizer keeps only the `{ finding, frequency, severity }` shape it needs and discards the rest, minimizing what is retained.

---

Do NOT edit the connection index here — the 38 wiring plan adds the Active-Connections row + the experiment-source matrix column.
