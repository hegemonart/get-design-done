# Mobbin MCP — Connection Specification

This file is the connection specification for Mobbin within the get-design-done pipeline. It lives in `connections/` alongside other connection specs. See `connections/connections.md` for the full connection index and capability matrix.

---

Mobbin is a **curated mobile + web product reference library** (600k+ screens, 130k+ user flows from 1,600+ shipped apps) — the de-facto standard for **flow-level** mobile references. In the discover stage it is a **Tier-2 (paid) source**: GDD tries free Lazyweb first, then falls to Mobbin or Refero depending on which the user has an active subscription for. Mobbin's edge is editorial discipline + flow-level metadata + verified-product depth, especially for mobile (iOS/Android).

---

## Setup

**Prerequisites:**

- An active Mobbin subscription (the MCP is included with a paid plan).

**Install (Claude Code):** *auto-run-safe — `claude mcp add` is a stateless MCP registration with zero credential filesystem-write; OAuth is handled by Mobbin in a browser on the first tool call.*

```
claude mcp add mobbin --transport http https://api.mobbin.com/mcp
```

On the first `mobbin` tool call, Mobbin opens a browser sign-in (OAuth) — no token is written to disk by GDD.

**Cursor / Codex / generic MCP:** register the HTTP MCP endpoint `https://api.mobbin.com/mcp` per the host's MCP-config format; sign in via the OAuth prompt on first use. Restart the session after install.

**Verification:**

```
ToolSearch({ query: "mobbin", max_results: 10 })
```

Expect Mobbin search/browse tools. If empty, the MCP is not registered — run the add command and restart.

---

## When to use

In the **discover** stage, fall to Mobbin (after free Lazyweb) when you have a subscription and need:

- **Mobile** UI references (iOS / Android platform conventions)
- **Flow-level** references (multi-screen journeys) vs single screens
- Industry-specific patterns — "how do fintech apps do KYC", "social app notification permission priming"
- Verified, curated, real-product screens

## Tools available (verify via ToolSearch on first use)

Mobbin exposes search / browse tools (apps, screens, flows, collections) under its MCP. Names may vary between versions — treat the ToolSearch result as authoritative; do not hardcode.

## Search strategy

Run structural + aesthetic + **flow-level** queries (Mobbin's differentiator is flows):

- **Structural / flow**: "onboarding fintech", "checkout commerce", "paywall subscription", "empty state messaging".
- **Platform**: "iOS settings", "Android bottom sheet".
- **Industry**: "KYC verification flow", "ride-hailing trip tracking".

## Workflow

```
1. mobbin search "paywall subscription"    # flow/structural
2. mobbin search "calm editorial fintech"  # aesthetic
3. pick 3-5 references (NOT whole flow sets) matching the brief; save into the reference pack
4. proceed to the plan stage with the pack
```

## Citing references in output

Always name the reference: cite as `M-01: [title] — source: mobbin — borrow: [what you took]`. Show the structure you borrowed (e.g., "takes Revolut's KYC step sequencing").

## STATE.md integration

Every stage that probes Mobbin writes the result to `.design/STATE.md` under `<connections>`:

```xml
<connections>
mobbin: available
</connections>
```

| Value | Meaning |
|-------|---------|
| `available` | ToolSearch returned non-empty results for `mobbin` |
| `unavailable` | Mobbin tools present but a live call errored (e.g., not signed in / no subscription) |
| `not_configured` | ToolSearch returned empty — MCP not registered |

**Probe pattern (ToolSearch-only — no tool call, no API cost):**

```
ToolSearch({ query: "mobbin", max_results: 5 })
  → Empty result     → mobbin: not_configured
  → Non-empty result → mobbin: available
```

**Which stages probe Mobbin:** the discover stage only (via `agents/design-context-builder.md`). Scan, plan, design, and verify do not use it.

---

## Fallback chain (cost-aware — try free before paid)

The discover stage resolves reference sources in this order:

1. **Lazyweb (Tier 1 — FREE)** — always tried first.
2. **Mobbin / Refero (Tier 2 — PAID)** — Mobbin and Refero are peers here; use whichever is bound AND has an active subscription. If both are available, **Mobbin** for mobile/flow-level depth, **Refero** for broad screen-level coverage.
3. **Pinterest (Tier 3)** — headless scrape, occasionally flaky.
4. **awesome-design-md (Tier 4)** — structured DESIGN.md tokens.
5. **WebFetch (Tier 5)** — last resort.

Never proceed without references — that's the point of discover.

## Anti-pattern

- **Don't dump entire flow sets** into the response — pick 3–5 references that match the brief.
- Don't use Mobbin for desktop-heavy work where Refero/Lazyweb are stronger (Mobbin's depth is mobile + flows).
- Don't use it to justify a pre-decided direction (pull first, then decide).

## If Mobbin's API changes

Keep this file current. If tool names or the endpoint shift, update the examples here and adjust the routing in `skills/discover/SKILL.md` + `agents/design-context-builder.md`.
