# Penpot — Connection Specification

This file is the connection specification for **Penpot** within the get-design-done pipeline. Penpot is an open-source, self-hostable design and prototyping platform — an AI-native (Wave 2) alternative to Figma. It is a **canvas-category** tool: GDD reads boards and components, exports tokens, and writes design proposals back. See `connections/connections.md` for the full connection index and capability matrix, and `connections/figma.md` for the sibling canvas-category connection.

GDD connects to **your** Penpot instance. It does **not** install, bundle, or host Penpot — there is no bundled dependency. You bring a running Penpot (self-hosted or cloud) plus an access token.

---

## Setup

### Prerequisites

- **A Penpot instance.** One of two deployment shapes:
  - **Cloud** — the hosted service at [penpot.app](https://penpot.app). Base URL is `https://design.penpot.app`. No infrastructure to run.
  - **Self-hosted** — a Penpot deployment you operate (Docker/Kubernetes), reachable at your own origin, e.g. `https://penpot.internal.example.com`. See [help.penpot.app](https://help.penpot.app) for deployment guidance.
- **An access token.** Generated from your Penpot profile under **Settings → Access tokens**. Tokens are scoped to your account on whichever instance issued them — a cloud token does not authenticate against a self-hosted instance, and vice versa.
- **One access path** — either:
  - the **Penpot REST API / plugin** reached over `PENPOT_BASE_URL` + token (the env path), or
  - a **Penpot MCP server** registered in the session (the MCP path).

### Configuration

The pipeline supports two interchangeable access paths. You only need one; if both are present, the probe resolves precedence (see **Probe Pattern**).

**Env path (REST API / plugin).** Set two environment variables:

```bash
export PENPOT_BASE_URL="https://design.penpot.app"   # cloud
# or, self-hosted:
export PENPOT_BASE_URL="https://penpot.internal.example.com"
export PENPOT_ACCESS_TOKEN="<your-penpot-access-token>"
```

`PENPOT_BASE_URL` is the **distinguishing signal** between cloud and self-hosted. The pipeline records the host so downstream stages know which deployment they are talking to.

**MCP path.** Register a Penpot MCP server in Claude Code settings (`mcpServers.penpot`), passing `PENPOT_BASE_URL` and `PENPOT_ACCESS_TOKEN` through the server's `env`. Restart the session after install.

### Verification

```
ToolSearch({ query: "penpot", max_results: 5 })
```

A non-empty result confirms the MCP path. For the env path, a `200` from `GET $PENPOT_BASE_URL/api/rpc/command/get-profile` (header `Authorization: Token $PENPOT_ACCESS_TOKEN`) confirms the credentials resolve. If the env path is unset and `ToolSearch` is empty, Penpot is `not_configured`.

---

## Probe Pattern

Penpot exposes **two independent access paths**, and the probe checks **both** before resolving. This is the load-bearing distinction for this connection (SC#2): the env path additionally carries the **self-hosted-vs-cloud** signal, which downstream stages need.

```
Step 1 — Env probe (self-hosted vs cloud):
  Read PENPOT_BASE_URL and PENPOT_ACCESS_TOKEN from the environment.
    Both set    → env path present.
                  Classify deployment from the host of PENPOT_BASE_URL:
                    host == design.penpot.app   → deployment=cloud
                    any other host              → deployment=self-hosted
    Either unset → env path absent.

Step 2 — MCP probe:
  ToolSearch({ query: "penpot", max_results: 5 })
    Non-empty → MCP path present (record resolved prefix mcp__<name>__).
    Empty     → MCP path absent.

Step 3 — Resolve which is present:
  env + MCP   → available  (path=mcp, deployment=<cloud|self-hosted>)   # prefer MCP for tool calls; keep deployment from env
  MCP only    → available  (path=mcp, deployment=unknown)              # deployment not derivable without PENPOT_BASE_URL
  env only    → available  (path=api, deployment=<cloud|self-hosted>)
  neither     → not_configured
```

Write the result to `.design/STATE.md` `<connections>` immediately after probing, using the **three-value schema** below:

```xml
<connections>
penpot: available (path=mcp, deployment=self-hosted)
figma: not_configured
</connections>
```

Other valid values: `penpot: available (path=api, deployment=cloud)`, `penpot: available (path=mcp, deployment=unknown)`, `penpot: not_configured`.

| Field | Values | Meaning |
|-------|--------|---------|
| status | `available` / `not_configured` | At least one access path resolved, or none did |
| `path` | `mcp` / `api` | Which access path the stage should use for tool/REST calls |
| `deployment` | `cloud` / `self-hosted` / `unknown` | Derived from `PENPOT_BASE_URL` host; `unknown` when only the MCP path is present and no base URL is exported |

Consumers MUST read `path` to decide whether to call MCP tools (`mcp__<prefix>__*`) or REST endpoints, and SHOULD surface `deployment` when an operation differs by host (e.g. rate limits or shared-library scope on cloud vs self-hosted).

---

## Penpot Tools

Tools are described generically — the concrete tool names depend on the resolved `path` (MCP tool names `mcp__<prefix>__<tool>`, or REST commands under `$PENPOT_BASE_URL/api/...`). All capabilities below exist on both cloud and self-hosted instances.

| Capability | Stage | Purpose |
|------------|-------|---------|
| **List/read boards** | design | Enumerate projects, files, and boards (frames); read the node tree, names, and layout of a selected board |
| **Read components** | design | Resolve components and component instances from the file's component library; read variants and overrides |
| **Export tokens** | scan + discover | Read design tokens (color, spacing, typography) and library assets; Penpot's token format is W3C-style design tokens, so values export cleanly into DESIGN.md |
| **Read prototype/flows** | design (secondary) | Inspect interactions and flows between boards for reference |
| **Write proposals** | design (write) | Create or annotate boards/frames with proposed design changes; attach comments carrying D-XX decisions onto the relevant boards |

Reads are the default. Writes are gated behind the same **proposal → confirm** UX used by the Figma connection (see `connections/figma.md`): the agent builds a numbered operation list and presents it before any write executes. No automatic insertion into the user's Penpot file.

---

## Pipeline Integration

Penpot is a **canvas-category** connection. It feeds the **design** stage like Figma and paper.design — the same slot in the pipeline, a different backing tool.

| Stage | What Penpot provides |
|-------|----------------------|
| scan | **Token augmentation**: export Penpot design tokens to supplement grep-based CSS token extraction. DESIGN.md notes `source: penpot-tokens` |
| discover | **Decisions pre-population**: pre-fill D-XX color/spacing/typography decisions from exported tokens before the interview |
| design | **Board/component reads** for design context; **write proposals** (boards, frames, comments) via the proposal→confirm path when `path` resolves |
| plan | Not used |
| verify | Not used |

When multiple canvas-category connections are `available` (e.g. both `figma` and `penpot`), the design stage uses whichever the active design source points to; it does not merge them. The user's source-of-truth selection decides.

---

## Fallback Behavior

When `penpot` is `not_configured`, stages **degrade to code-only** — Penpot is an enhancement, never a requirement, and a missing connection **never blocks** the pipeline.

**scan stage:**

- Skip Penpot token export.
- Rely on grep-based CSS custom property extraction alone.
- DESIGN.md token section uses `source: CSS custom properties` (not `source: penpot-tokens`).

**discover stage:**

- Skip token pre-population.
- Populate D-XX decisions via interview only (manual elicitation from the user).

**design stage:**

- `penpot: not_configured` → skip the write-proposal offer entirely (no prompt, no output).
- `penpot: available` → offer the opt-in proposal prompt after the design step completes.

Stages do not append a `<blocker>` for a missing Penpot connection. Only if a `must_have` explicitly requires Penpot data (reads or writes) does a stage append a blocker. Always re-probe at stage entry — both the access `path` and the resolved MCP prefix can change between sessions.

Do NOT edit the connection index here — the 37.1 wiring plan adds the Active-Connections row + matrix entry.
