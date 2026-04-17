# Refero MCP — Connection Specification

This file is the connection specification for Refero within the get-design-done pipeline. It lives in `connections/` alongside other connection specs. See `connections/connections.md` for the full connection index and capability matrix.

---

Refero is the **discover stage's primary visual reference tool**. It retrieves real product screenshots and design references, replacing "imagine how this should look" with "look at how Linear/Stripe/Phantom/Raycast did it."

---

## Setup

**Prerequisites:**

- Refero account with an active subscription (required for search access)
- Refero MCP installed via Refero's MCP setup instructions (vendor-specific — follow Refero's official documentation; do not use a generic Claude Code MCP add command unless Refero documents one)

**Install:**

Install per Refero's MCP setup instructions, then restart the Claude Code session. After restart, the `mcp__refero__*` tools appear in the session.

**Verification:**

```
ToolSearch({ query: "refero", max_results: 10 })
```

Expect non-empty results. If empty, the Refero MCP is not registered — complete the install steps and restart.

**Note on tool names:** Exact tool names may vary between Refero MCP versions. Always verify via ToolSearch before calling any `mcp__refero__*` tool. Do not hardcode tool names in prompts — treat the ToolSearch result as the authoritative list.

---

## Why refero is non-negotiable

Without references, LLMs converge on:
- Inter / Space Grotesk / DM Sans typefaces
- Purple→blue gradients on white backgrounds
- Glassmorphism + rounded rectangles + generic drop shadows
- Card-in-card layouts, sparkline-as-decoration
- Cyan accents on dark backgrounds
- Identical hero-metric templates

With references, you copy the *structure* of best-in-class work and adapt the aesthetic to your brand. This is how pros design.

## When to use refero

**Always at the start of the discover stage.** No exceptions:
- Building any UI → pull references for similar products and layouts
- Writing UX copy → pull references for how the canonical products in that category write the equivalent string
- Designing animations → pull references for the interaction (then pair with `emil-design-eng`)
- Auditing → pull references for "what best-in-class looks like" before calling something bad

## Tools available (after session restart)

The refero MCP exposes tools under `mcp__refero__*` after the next session restart. Check available tools via ToolSearch:

```
ToolSearch({ query: "refero", max_results: 30 })
```

Typical tool set (names may vary — verify via ToolSearch on first use):
- **search** — semantic search across refero's indexed design corpus
- **get** / **fetch** — retrieve a specific reference by ID or URL
- **browse** by category / tag / brand

## Search strategy

Run **at least 2 queries per task**, one structural + one aesthetic:

### Structural queries (what the thing IS)
- "checkout flow mobile"
- "empty state messaging app"
- "admin table dashboard with filters"
- "login screen minimal"
- "onboarding wizard steps"
- "settings page tabs"
- "data visualization KPI card"

### Aesthetic queries (how it should FEEL)
- "editorial dark fintech"
- "brutalist portfolio"
- "retro-futuristic music player"
- "warm terracotta SaaS landing"
- "neutral Swiss design dashboard"
- "Japanese minimalist e-commerce"
- "maximalist magazine web"

### Brand-specific queries (when you have a north star)
- "linear app dashboard" — fast, dense, unimpressed
- "stripe payments docs" — clear, direct, honest
- "phantom wallet crypto" — calm, editorial, confident
- "raycast launcher" — sleek, opinionated
- "vercel dashboard" — black/white precision

## Workflow

```
1. refero search "checkout flow mobile"        # structural
2. refero search "warm editorial consumer app" # aesthetic
3. pick 3-7 that match the brief
4. save URLs + brief notes into the discover reference pack
5. if relevant DESIGN.md exists for one of them:
   → read ~/.claude/libs/awesome-design-md/{brand}/README.md
6. proceed to the plan stage with the pack
```

## Citing references in output

When presenting designs, **always name the references**. Don't say "I designed this." Say "This takes Linear's issue list structure and applies Claude's editorial warmth." This:
- Shows the user the logic so they can push back precisely
- Makes iteration faster (user can say "less Linear, more Notion")
- Prevents claims of originality that don't hold up

## STATE.md Integration

Every stage that probes Refero writes the result to `.design/STATE.md` under the `<connections>` section:

```xml
<connections>
figma: available
refero: not_configured
</connections>
```

**Status values:**

| Value | Meaning |
|-------|---------|
| `available` | ToolSearch returned non-empty results for `refero` |
| `unavailable` | Refero tools are present but a live call errored |
| `not_configured` | ToolSearch returned empty for `refero` — MCP not registered |

**Probe pattern (ToolSearch-only — no tool call needed):**

```
ToolSearch({ query: "refero", max_results: 5 })
  → Empty result     → refero: not_configured
  → Non-empty result → refero: available
```

Rationale: calling a real Refero search as the probe would waste tokens and incur API cost before confirming the connection is even needed. ToolSearch presence is sufficient — if the tools are registered, the connection is available. A live call failure would downgrade to `unavailable`, but this is rare and best handled when an actual search is attempted.

**Which stages probe Refero:** the discover stage (via `agents/design-context-builder.md`). The scan, plan, and verify stages do not use Refero and do not probe it.

---

## Fallback chain

When Refero is `not_configured` or `unavailable`, the discover stage falls back through this three-tier chain:

**Tier 1 — Refero MCP** (`mcp__refero__search` or verified tool name from ToolSearch):
Real product screenshots from Refero's corpus of 125,000+ screens. Best quality, broadest coverage. Use when `refero: available`.

**Tier 2 — awesome-design-md library** (`~/.claude/libs/awesome-design-md/design-md/`):
68 brand archetypes with structured DESIGN.md token files. Pick 1–2 closest matches by brand category. Provides concrete token values (colors, fonts, spacing) you can copy-adapt. Use when Refero is unavailable.

**Tier 3 — WebFetch** (getdesign.md URLs from the awesome-design-md list):
Last resort. Fetch design reference URLs directly. Slower and less reliable than the MCP. Use only when tiers 1 and 2 are both unavailable.

Never proceed without references — that's the whole point of Discover.

## Fallbacks if refero is down / not installed

1. **awesome-design-md library** — `~/.claude/libs/awesome-design-md/design-md/` has 68 real brand archetypes with DESIGN.md pointers. Pick 1–2 closest matches.
2. **Figma MCP** — if the user's project has Figma connected, read existing designs or search their design system.
3. **Last resort: WebFetch** getdesign.md URLs from the awesome-design-md list.

Never proceed without references — that's the whole point of Discover.

## Combining refero with awesome-design-md

```
Refero          → how does best-in-class look right now (images)
awesome-design-md → structured DESIGN.md tokens for 68 brands (text)
```

Use both. Refero for visual direction, awesome-design-md for concrete token values (colors, fonts, spacing) you can copy-adapt.

## Anti-pattern

Do NOT use refero to:
- Collect a huge dump of references and paste them all into the response (noise)
- Justify a direction you've already decided on (confirmation bias; pull first, then decide)
- Skip the plan stage ("the references tell me the brand") — references inform direction, they don't *replace* context gathering with the user.

## If refero's API changes

Keep this file up to date. If tool names or invocation patterns shift, update the examples here and adjust the routing in SKILL.md.
