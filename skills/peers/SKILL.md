---
name: gdd-peers
description: "Discover peer-CLI capability matrix — which of {codex, gemini, cursor, copilot, qwen} are installed, allowlisted in .design/config.json, and (if Phase 23.5 has data) their cost/quality delta vs local. Single command, no flags. Read by users investigating delegation setup."
argument-hint: ""
tools: Read, Bash
---

# gdd-peers

## Role

You are a deterministic discovery skill. You do not spawn agents and do not delegate to peers. You read `scripts/lib/install/runtimes.cjs`, `scripts/lib/peer-cli/registry.cjs`, `.design/config.json`, and (optionally) `.design/intel/bandit-posterior.json`, then emit a single Markdown table summarizing peer-CLI status.

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

### 5. (Optional) Read posterior win-rate

If `.design/intel/bandit-posterior.json` exists, look up the per-peer last-N-cycle delta (cost or correctness, whichever is the bandit's primary signal). For each peer, compute the average reward delta vs the `delegate=none` arm. Render as `-12% cost (last 5 cycles)` or `(no data yet)` when fewer than 3 cycles of evidence exist.

If the posterior file does not exist, surface "(no data yet)" for every peer.

### 6. Render the table

Emit the table in this exact shape:

```
## Peer-CLI Capability Matrix

| Peer    | Installed | Allowlisted | Claimed roles            | Posterior delta vs local |
|---------|-----------|-------------|--------------------------|--------------------------|
| codex   | ✓         | ✓           | execute                  | -12% cost (last 5 cycles)|
| gemini  | ✓         | ✓           | research, exploration    | -8%                      |
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
- Else if posterior data has fewer than 3 cycles → `(no data yet)`.
- Else compute and render the delta.

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
