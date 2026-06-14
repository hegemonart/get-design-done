# Lazyweb MCP — Connection Specification

This file is the connection specification for Lazyweb within the hone pipeline. It lives in `connections/` alongside other connection specs. See `connections/connections.md` for the full connection index and capability matrix.

---

Lazyweb is a **free, MCP-native visual-reference library** (250k+ real app screens). In the discover stage it is the **cost-aware default**: because it requires no paid subscription, GDD tries it **first**, before any paid reference source (Mobbin/Refero). Pitched for pricing pages, onboarding flows, "improve this existing screen" comparisons, and UI benchmarking against shipped products.

---

## Setup

**Prerequisites:**

- No account or subscription required — the free tier authorizes read-only UI reference search.
- A Lazyweb MCP bearer token (free) saved locally.

**Install (Claude Code):** *copy-command — never auto-run, because it writes a credential to disk (user-consent step).*

```
# 1. save the free bearer token (chmod 600 — local config only, never commit)
mkdir -p ~/.lazyweb && printf '%s' "<your-token>" > ~/.lazyweb/lazyweb_mcp_token && chmod 600 ~/.lazyweb/lazyweb_mcp_token
# 2. install the plugin
claude plugin marketplace add https://github.com/aboul3ata/lazyweb-skill
claude plugin install lazyweb@lazyweb
```

**Cursor / Codex / generic MCP:** register the Streamable-HTTP MCP endpoint `https://www.lazyweb.com/mcp` with the bearer token per the host's MCP-config format (follow Lazyweb's install docs for the exact block). Restart the session after install.

**Verification:**

```
ToolSearch({ query: "lazyweb", max_results: 10 })
```

Expect `lazyweb_search` + `lazyweb_health`. If empty, the MCP is not registered — complete the install and restart.

---

## When to use

In the **discover** stage, **try Lazyweb first** (it's free). Strong for:

- Pricing pages, plan/billing layouts
- Onboarding + activation flows
- "Improve this existing screen" / redesign comparisons
- UI benchmarking against real, shipped products

## Tools available (verify via ToolSearch on first use)

- **`lazyweb_search` `{ query, limit }`** — semantic search across Lazyweb's indexed app-screen corpus.
- **`lazyweb_health`** — connection/health probe.

Names may vary between versions — treat the ToolSearch result as authoritative; do not hardcode.

## Search strategy

Run **at least 2 queries per task** — one structural, one aesthetic (same discipline as Refero):

- **Structural** (what it IS): "pricing page three tiers", "onboarding checklist", "empty state dashboard", "settings billing".
- **Aesthetic** (how it should FEEL): "warm editorial SaaS", "neutral Swiss dashboard", "dark fintech".

## Workflow

```
1. lazyweb_search "pricing page three tiers"     # structural
2. lazyweb_search "warm editorial consumer app"  # aesthetic
3. pick 3-7 that match the brief; save URLs + notes into the discover reference pack
4. proceed to the plan stage with the pack
```

## Citing references in output

Always name the reference: cite as `L-01: [title] — source: lazyweb — borrow: [what you took]`. Never claim originality; show the user the logic so they can push back precisely.

## STATE.md integration

Every stage that probes Lazyweb writes the result to `.design/STATE.md` under `<connections>`:

```xml
<connections>
lazyweb: available
</connections>
```

| Value | Meaning |
|-------|---------|
| `available` | ToolSearch returned non-empty results for `lazyweb` |
| `unavailable` | Lazyweb tools present but a live call errored |
| `not_configured` | ToolSearch returned empty — MCP not registered |

**Probe pattern (ToolSearch-only — no tool call, no token cost):**

```
ToolSearch({ query: "lazyweb", max_results: 5 })
  → Empty result     → lazyweb: not_configured
  → Non-empty result → lazyweb: available
```

**Which stages probe Lazyweb:** the discover stage only (via `agents/design-context-builder.md`). Scan, plan, design, and verify do not use it.

---

## Fallback chain (cost-aware — try free before paid)

The discover stage resolves reference sources in this order:

1. **Lazyweb (Tier 1 — FREE)** — always tried first. Use when `lazyweb: available`.
2. **Mobbin / Refero (Tier 2 — PAID)** — fall here when Lazyweb is unavailable OR you need their depth; use whichever is bound AND has an active subscription (if both, Mobbin then Refero).
3. **Pinterest (Tier 3)** — headless scrape, occasionally flaky.
4. **awesome-design-md (Tier 4)** — `~/.claude/libs/awesome-design-md/design-md/` structured DESIGN.md tokens.
5. **WebFetch (Tier 5)** — last resort.

Lazyweb never *replaces* the paid corpora — it's the free first attempt; fall through for breadth/flow-depth. Never proceed without references — that's the point of discover.

## Anti-pattern + token handling

- Don't dump a huge set of references into the response (noise) — pick 3–7 matching the brief.
- Don't use it to justify a pre-decided direction (pull first, then decide).
- **Token handling**: the free tier authorizes no-billing UI reference reads ONLY — never purchases, paid spend, private user data, or destructive actions. The bearer token is local-config-only (`~/.lazyweb/lazyweb_mcp_token`); never commit it to git history.

## If Lazyweb's API changes

Keep this file current. If tool names or the endpoint shift, update the examples here and adjust the routing in `skills/discover/SKILL.md` + `agents/design-context-builder.md`.
