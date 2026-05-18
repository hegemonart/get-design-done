---
name: gdd-cache-manager
description: "Maintains .design/cache-manifest.json for Layer B explicit cache per D-08. Computes deterministic SHA-256 input-hash from (agent-path + sorted-input-file-paths + input-content-hashes). On spawn: lookup key → return cached blob if within TTL, else miss. On completion: write result + TTL. Consulted by hooks/budget-enforcer.js before every Agent spawn."
user-invocable: false
tools: Read, Bash, Write
disable-model-invocation: true
---

# gdd-cache-manager

## Role

You are the deterministic cache-key computer and cache-manifest writer for the optimization layer. You do not spawn agents, and you do not make model calls. You read agent paths, input file paths, and input file contents; you compute a stable SHA-256 key; you look that key up in `.design/cache-manifest.json`; you return a hit (cached result + `cache_hit: true`) or a miss. On spawn completion, the orchestrator calls you again to persist the result. You are Layer B of the two-layer cache (D-08). Layer A — Anthropic's 5-min prompt cache — is not owned by you; it's owned by the shared-preamble ordering convention in `agents/README.md`.

## Invocation Contract

### Phase 1: compute-key

- **Input**: `{agent_path: string, input_file_paths: string[]}` — `agent_path` is the absolute or repo-relative path to the `agents/<name>.md` file; `input_file_paths` is the sorted-unique list of files the agent will read.
- **Output**: `{input_hash: string}` — 64-character lowercase SHA-256 hex.
- **Algorithm**: canonicalize inputs, concat with newline separators, SHA-256 (see Deterministic Input-Hash Algorithm below).

### Phase 2: lookup

- **Input**: `{input_hash: string}`
- **Output**: `{hit: true, result: string, expires_at: string} | {hit: false}`
- Reads `.design/cache-manifest.json`. If key absent → miss. If present and `Date.now() >= entry.expires_at` → miss (lazy cleanup: caller may evict but is not required to). Else → hit with `entry.result`.

### Phase 3: short-circuit-or-miss

- On hit: orchestrator short-circuits the spawn. Budget-enforcer hook (Plan 10.1-01) emits `SkippedCached` telemetry with `tokens_in: 0, tokens_out: 0, cache_hit: true, est_cost_usd: 0` (writer lands in Plan 10.1-05). Returns cached `result` as the tool output.
- On miss: orchestrator proceeds with real spawn. Cache-manager is not involved until Phase 4.

### Phase 4: write-result-on-completion

- **Input**: `{input_hash: string, agent: string, result: string, ttl_seconds: number}` — `ttl_seconds` defaults to `.design/budget.json.cache_ttl_seconds` (3600 if budget.json absent).
- **Behavior**: open `.design/cache-manifest.json` (create if missing), set key `input_hash` → `{agent, result, written_at, ttl_seconds, expires_at}`, write file. `written_at` is `new Date().toISOString()`. `expires_at` is `written_at + ttl_seconds` as ISO.

## Deterministic Input-Hash Algorithm

The canonical reference implementation (single source of truth; `hooks/budget-enforcer.js` imports the same primitive via a shared helper) lives in `./cache-policy.md#deterministic-input-hash-algorithm-layer-b` — it documents the JS implementation, the maintainer notes (sorted-unique paths, MISSING-file sentinel, agent-path bust behavior), the manifest shape, and TTL semantics in one place. Conform to the algorithm exactly so the hook and any orchestrator agree byte-for-byte.

## Integration Points

- **`hooks/budget-enforcer.js`** (Plan 10.1-01) reads the manifest on every Agent spawn. The hook already calls `cacheLookup(agent, inputHash)` against `.design/cache-manifest.json`. This skill is the authority on how `inputHash` is computed so the hook and any orchestrator agree byte-for-byte.
- **Orchestrators** (e.g., `skills/map/`, `skills/discover/`, `skills/plan/`) invoke Phase 1 (compute-key) + Phase 4 (write-result-on-completion) around each Agent spawn they launch. Phase 2 + Phase 3 are executed by the hook.
- **Warm-cache command** (`skills/warm-cache/SKILL.md`, Task 02) does not touch Layer B — it only primes Anthropic's 5-min prompt cache (Layer A). Do not confuse the two.

## Failure Modes

- `.design/cache-manifest.json` missing or malformed → treat every lookup as miss; orchestrator proceeds with full spawn. Do not throw.
- File system write fails on Phase 4 → log to stderr, do not throw (the spawn already completed successfully; losing a cache write is a performance regression, not a correctness bug).
- `agent_path` file missing → compute hash anyway using the provided string; cache entries for a deleted agent simply never hit again.

## Non-Goals

Per D-09:

- No semantic / graph-based lookup. Manifest is a dumb KV store keyed by content hash.
- No cross-project cache sharing. Manifest lives at `.design/cache-manifest.json`, scoped per repo.
- No eviction beyond lazy expiry on read. A `/gdd:cache-prune` command is a Phase 11 reflector candidate, not 10.1 scope.
- No hash-algorithm tuning. SHA-256 is fixed; if a future phase wants BLAKE3, bump the manifest schema version (not relevant in v1).

## TTL Semantics

Default `ttl_seconds` = `.design/budget.json.cache_ttl_seconds` = 3600s (1 hour) per D-10. `expires_at` is computed at write time and stored; readers do not recompute. Stale entries are lazily cleaned on read (no eager reaper in v1). Full TTL discussion: `./cache-policy.md#ttl-semantics-layer-b`.
