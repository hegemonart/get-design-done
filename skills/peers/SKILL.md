---
name: gdd-peers
description: "Discover peer-CLI capability matrix — which of {codex, gemini, cursor, copilot, qwen} are installed, allowlisted in .design/config.json, and (if Phase 23.5 has data) their cost/quality delta vs local. Single command, no flags. Read by users investigating delegation setup."
argument-hint: ""
tools: Read, Bash
---

# gdd-peers

## Role

You are a deterministic discovery skill. You do not spawn agents and do not delegate to peers. You read `scripts/lib/install/runtimes.cjs`, `scripts/lib/peer-cli/registry.cjs`, `.design/config.json`, and (optionally) `.design/telemetry/posterior.json` (canonical path declared by `bandit-router.cjs`'s `DEFAULT_POSTERIOR_PATH`), then emit a single Markdown table summarizing peer-CLI status. Protocol-level handshake details live in `./reference/peer-cli-protocol.md`.

## Invocation Contract

- **Input**: none. The skill takes no arguments.
- **Output**: a Markdown capability-matrix table to stdout. The table is the entire output.

## Procedure

### 1. Load runtime + capability matrix

Read `scripts/lib/install/runtimes.cjs` (14 entries; 5 carry `peerBinary`) and `scripts/lib/peer-cli/registry.cjs#describeCapabilities()`. The canonical declared matrix:

| Peer    | Roles claimed            | Protocol |
|---------|--------------------------|----------|
| codex   | execute                  | ASP      |
| gemini  | research, exploration    | ACP      |
| cursor  | debug, plan              | ACP      |
| copilot | review, research         | ACP      |
| qwen    | write                    | ACP      |

### 2. Detect installation

For each peer, run `which <peerBinary>` (POSIX) or `where <peerBinary>` (Windows). Exit 0 → installed; non-zero → not installed.

### 3. Read allowlist

Read `.design/config.json#peer_cli.enabled_peers` (array of peer-IDs). Default `[]` (opt-in required). Missing file or path = empty.

### 4. (Optional) Read posterior reward-delta

Once Phase 27.5 has fired across enough spawns, `.design/telemetry/posterior.json` carries per-`(agent, bin, delegate, tier)` arms with measured reward. For each peer-id:

1. Filter `arms` array: `peerArms` where `delegate === <peer-id>`; `localArms` where `delegate === 'none'` OR `delegate === undefined` (Phase 23.5 legacy slice treated as local-call).
2. Require `peerArms` and `localArms` both non-empty. Else `(no data yet)`.
3. Compute pooled means: `mean = sum(alpha) / (sum(alpha) + sum(beta))` over each slice.
4. `delta_pct = (peerMean - localMean) / localMean`.
5. Require `sum(arm.count)` ≥ 3 in each slice. Else `(no data yet)`.
6. Render: `+X% reward` (delta > 0.01), `-X% reward` (delta < -0.01), or `~equal` (`abs(delta) < 0.01`), where `X = round(abs(delta_pct) * 100)`.

Reward is the Phase 23.5 lexicographic (correctness first, cost tiebreaker — see `scripts/lib/bandit-router.cjs` `computeReward()`). Cost-only deltas live in `cost-arbitrage.cjs` (Phase 26-06).

### 5. Render the table

```
## Peer-CLI Capability Matrix

| Peer    | Installed | Allowlisted | Claimed roles            | Posterior delta vs local |
|---------|-----------|-------------|--------------------------|--------------------------|
| codex   | ✓         | ✓           | execute                  | -12% reward              |
| gemini  | ✓         | ✓           | research, exploration    | -8% reward               |
| cursor  | ✗         | ✗           | debug, plan              | (not installed)          |
| copilot | ✓         | ✗           | review, research         | (opt-in disabled)        |
| qwen    | ✓         | ✓           | write                    | (no data yet)            |

> Tip: Enable peers via `.design/config.json#peer_cli.enabled_peers`.
> See `reference/peer-cli-capabilities.md` for the full capability matrix.
> See `skills/peer-cli-customize/SKILL.md` to rewire role->peer mappings per agent.
```

**Third-column rules** (top-down precedence):

- `Installed = ✗` → `(not installed)`.
- `Allowlisted = ✗` → `(opt-in disabled)`.
- Posterior missing → `(no data yet)`.
- < 3 pulls per side → `(no data yet)`.
- Else compute the reward-delta per Step 4.

### 6. Done

The table IS the output. No follow-up prose. Users act on it: `(opt-in disabled)` → enable in `.design/config.json`; `(not installed)` → install the peer CLI; concrete deltas → trust the bandit or override per-agent via `skills/peer-cli-customize`.

## Cross-references

- `./reference/peer-cli-protocol.md` — ACP/ASP handshake + adapter scaffold (procedure ref shared with peer-cli-add/customize).
- `./reference/peer-cli-capabilities.md` (Plan 27-05) — full capability matrix doc.
- `scripts/lib/peer-cli/registry.cjs` (Plan 27-05), `scripts/lib/install/runtimes.cjs` (Plan 27-11), `skills/peer-cli-customize/SKILL.md`, `skills/peer-cli-add/SKILL.md`, `.planning/phases/27-peer-cli-delegation/CONTEXT.md` D-10.

## Record

Append one JSONL line to `.design/skill-records.jsonl`:

```json
{"skill": "gdd-peers", "ts": "<ISO timestamp>", "peers_detected": ["codex"], "peers_allowlisted": ["codex"], "had_posterior": false}
```
