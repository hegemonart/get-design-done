---
name: gdd-peers
description: "Discover peer-CLI capability matrix — which of {codex, gemini, cursor, copilot, qwen} are installed, allowlisted in .design/config.json, and (if Phase 23.5 has data) their cost/quality delta vs local. Single command, no flags. Read by users investigating delegation setup."
argument-hint: ""
tools: Read, Bash
---

# gdd-peers

## Role

You are a deterministic discovery skill. You do not spawn agents and do not delegate to peers. You read `scripts/lib/install/runtimes.cjs`, `scripts/lib/peer-cli/registry.cjs`, `.design/config.json`, and (optionally) `.design/telemetry/posterior.json` (the canonical path declared by `scripts/lib/bandit-router.cjs`'s `DEFAULT_POSTERIOR_PATH`), then emit a single Markdown table summarizing peer-CLI status.

## Invocation Contract

- **Input**: none. The skill takes no arguments.
- **Output**: a Markdown capability-matrix table to stdout. No JSON wrapper. The table is the entire output.

## Procedure

### 1. Load runtime matrix

Read `scripts/lib/install/runtimes.cjs` and extract the 14 runtime entries. The 5 peer-capable entries (`codex`, `gemini`, `cursor`, `copilot`, `qwen`) carry a `peerBinary?` field (added in Plan 27-11). Collect their IDs and binary paths.

### 2. Load capability matrix

Read `scripts/lib/peer-cli/registry.cjs`. The exported `describeCapabilities()` returns the per-peer claimed-roles map. The capability matrix is the source of truth for which roles each peer can take.

Use the canonical declared matrix:

| Peer    | Roles claimed            | Protocol |
|---------|--------------------------|----------|
| codex   | execute                  | ASP      |
| gemini  | research, exploration    | ACP      |
| cursor  | debug, plan              | ACP      |
| copilot | review, research         | ACP      |
| qwen    | write                    | ACP      |

### 3. Detect installation

For each peer, run `which <peerBinary>` (POSIX) or `where <peerBinary>` (Windows). If exit 0 → installed. If exit non-zero → not installed.

### 4. Read allowlist

Read `.design/config.json`. The path is `peer_cli.enabled_peers` — an array of peer-IDs. Default: `[]` (empty, opt-in required). If the file or path is missing, treat as empty.

### 5. (Optional) Read posterior reward-delta

Phase 27.5 (v1.27.5) wired the bandit posterior into production. Once 27.5-02 (budget-enforcer consultation) + 27.5-03 (session-runner outcome recording) have fired across enough spawns, the posterior at `.design/telemetry/posterior.json` (the canonical path declared by `bandit-router.cjs`'s `DEFAULT_POSTERIOR_PATH`) carries per-`(agent, bin, delegate, tier)` arms with measured reward.

For each peer-id in {gemini, codex, cursor, copilot, qwen}:

1. Read `.design/telemetry/posterior.json`. If missing or malformed → render "(no data yet)".
2. Filter the `arms` array into `peerArms` where `delegate === <peer-id>` and `localArms` where `delegate === 'none'` OR `delegate === undefined` (the Phase 23.5 legacy slice is treated as the local-call slice).
3. If `peerArms` is empty OR `localArms` is empty → "(no data yet)".
4. Compute pooled posterior means:
   - `peerMean = sum(arm.alpha across peerArms) / (sum(arm.alpha across peerArms) + sum(arm.beta across peerArms))`
   - `localMean = sum(arm.alpha across localArms) / (sum(arm.alpha across localArms) + sum(arm.beta across localArms))`
5. Compute `delta_pct = (peerMean - localMean) / localMean`.
6. Require minimum sample evidence: `sum(arm.count)` for `peerArms` AND for `localArms` must each be `>= 3`. Else "(no data yet)".
7. Render delta as:
   - `+X% reward` when `delta_pct > 0.01`
   - `-X% reward` when `delta_pct < -0.01`
   - `~equal` when `abs(delta_pct) < 0.01`
   Where X = `Math.round(abs(delta_pct) * 100)`.

The reward signal is the Phase 23.5 two-stage lexicographic (correctness first, cost as tiebreaker — see `scripts/lib/bandit-router.cjs` `computeReward()`). Cost-only deltas live in `scripts/lib/cost-arbitrage.cjs` (Phase 26-06) and are surfaced via the design-reflector.

If the posterior file does not exist (e.g., fresh install with no spawns yet, or `adaptive_mode` is `static`/`hedge`), surface "(no data yet)" for every peer.

### 6. Render the table

Emit the table in this exact shape:

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
> See `skills/peer-cli-customize/SKILL.md` to rewire role→peer mappings per agent.
```

Rules for the third column ("Posterior delta vs local"):
- If `Installed = ✗` → `(not installed)`.
- Else if `Allowlisted = ✗` → `(opt-in disabled)`.
- Else if `.design/telemetry/posterior.json` is missing → `(no data yet)`.
- Else if either peer-side or local-side has fewer than 3 pulls → `(no data yet)`.
- Else compute the reward-delta per Step 5 and render `+X% reward`, `-X% reward`, or `~equal`.

### 7. Done

The table IS the output. No follow-up prose. Users can act on the data:
- See "(opt-in disabled)" → enable in `.design/config.json`.
- See "(not installed)" → install the peer CLI.
- See concrete deltas → trust the bandit's recommendation, or override per-agent via `skills/peer-cli-customize`.

## Cross-references

- `scripts/lib/peer-cli/registry.cjs` (Plan 27-05) — capability matrix data source.
- `scripts/lib/install/runtimes.cjs` (Plan 27-11) — `peerBinary` field per runtime.
- `reference/peer-cli-capabilities.md` (Plan 27-05) — full capability matrix doc.
- `skills/peer-cli-customize/SKILL.md` (Plan 27-10) — rewire role→peer mappings.
- `skills/peer-cli-add/SKILL.md` (Plan 27-10) — add a brand-new peer.
- `.planning/phases/27-peer-cli-delegation/CONTEXT.md` D-10 — decision lineage.

## Record

After execution, append one JSONL line to `.design/skill-records.jsonl`:

```json
{"skill": "gdd-peers", "ts": "<ISO timestamp>", "peers_detected": ["codex", "gemini"], "peers_allowlisted": ["codex"], "had_posterior": false}
```
