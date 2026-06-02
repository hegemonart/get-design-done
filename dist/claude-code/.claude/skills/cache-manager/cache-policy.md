---
name: cache-policy
type: heuristic
version: 1.0.0
phase: 28.5
tags: [cache, layer-a, layer-b, sha-256, ttl, warm-cache, cache-manager, anthropic-prompt-cache]
last_updated: 2026-05-18
---

# Cache Policy (Layer A + Layer B)

Extracted from `skills/cache-manager/SKILL.md` and `skills/warm-cache/SKILL.md` per Phase 28.5
D-10 (extract-then-link, never delete content). The two skills keep their orchestration
contracts and step-by-step flows; the deeper algorithmic and operational detail moves here
so the SKILLs stay under the 100-line cap.

The two layers (D-08):

- **Layer A** — Anthropic's 5-min prompt cache (owned by `warm-cache`). Keyed on shared-preamble-first prompt prefix. No project-local state.
- **Layer B** — explicit `.design/cache-manifest.json` (owned by `gdd-cache-manager`). Keyed on deterministic SHA-256 of `(agent-path, sorted-input-file-paths, input-content-hashes)`. Per-repo state.

## Deterministic Input-Hash Algorithm (Layer B)

The canonical reference implementation (the single source of truth; `hooks/budget-enforcer.js` imports the same primitive via a shared helper):

```js
// Deterministic cache-key primitive (reference implementation)
// hash = SHA-256(
//   agent_path + "\n" +
//   sorted(input_file_paths).join("\n") + "\n" +
//   sorted(input_file_paths)
//     .map(p => sha256(readFileSync(p, "utf8")))
//     .join("\n")
// )
const crypto = require('crypto');
const fs = require('fs');

function sha256Hex(s) {
  return crypto.createHash('sha256').update(s, 'utf8').digest('hex');
}

function computeInputHash(agentPath, inputFilePaths) {
  const sortedPaths = [...inputFilePaths].sort();
  const contentHashes = sortedPaths.map(p => {
    try { return sha256Hex(fs.readFileSync(p, 'utf8')); }
    catch { return 'MISSING'; }
  });
  const canonical = [
    agentPath,
    sortedPaths.join('\n'),
    contentHashes.join('\n')
  ].join('\n');
  return sha256Hex(canonical);
}
```

Notes for maintainers:

- **Sorted-unique paths** — ordering must be stable; caller is expected to de-duplicate. If the same path appears twice the hash still matches as long as caller pre-dedupes before invoking.
- **Missing file** — the string `MISSING` is used in place of the content hash so a missing dependency doesn't silently collide with an empty file (empty file's SHA-256 is `e3b0c44...`). Missing-file hashes naturally miss on the next read because the real file has a different content hash.
- **Agent-path** — agents changing their own body (role, tools, output contract) invalidate all their cache entries automatically because the agent file's content is not hashed; but the `agent_path` string is concatenated. Upgrading agents between versions naturally busts the cache only when the path changes. Plan 10.1-04 (shared preamble extraction) is expected to slightly adjust agent bodies — consumers should treat the first post-10.1 run as a full cache miss, which is the intended behavior.

## Manifest Shape (Layer B)

See `./config-schema.md` §.design/cache-manifest.json Schema (Phase 10.1) for the authoritative schema. Keyed object, flat SHA-256 hex keys. Example:

```json
{
  "a3f1e...": {
    "agent": "design-verifier",
    "result": "<base64-or-path>",
    "written_at": "2026-04-18T12:00:00Z",
    "ttl_seconds": 3600,
    "expires_at": "2026-04-18T13:00:00Z"
  }
}
```

## TTL Semantics (Layer B)

- Default `ttl_seconds` = `.design/budget.json.cache_ttl_seconds` = 3600s (1 hour) per D-10.
- `expires_at` is computed at write time and stored; readers do not recompute.
- Lazy cleanup: stale entries are not actively deleted on read (overhead for no benefit in normal operation). A separate reaper is optional and out of v1 scope.

## Concrete Warm-Cache Command Examples (Layer A)

Full invocation:

```
$ /gdd:warm-cache

Warming Anthropic prompt cache for 14 agents (5 min TTL)...
[1/14] design-verifier ... ok (0.3s)
[2/14] design-planner ... ok (0.3s)
[3/14] design-integration-checker ... ok (0.3s)
...
[14/14] design-reflector ... ok (0.3s)

## Warm-cache complete
- Agents warmed: 14
- Skipped (no shared preamble import): 3  (agents/README.md not an agent; 2 agents not yet migrated to shared preamble)
- Duration: 4.2s
- Next 5 min: repeated spawns of these agents pay cached_input_per_1m rate
```

Filtered invocation:

```
$ /gdd:warm-cache --agents design-verifier,design-planner

Warming Anthropic prompt cache for 2 agents (filtered from 14)...
[1/2] design-verifier ... ok (0.3s)
[2/2] design-planner ... ok (0.3s)

## Warm-cache complete
- Agents warmed: 2
- Filtered out by --agents: 12
- Duration: 0.7s
```

## Cost Model (Layer A)

- Each no-op Haiku ping: ~50 input tokens (shared preamble + "No-op warm: acknowledge..." system+user) + ~5 output tokens ("ok").
- At Haiku rates (`./model-prices.md`): `(50 / 1e6) * 1.00 + (5 / 1e6) * 5.00 = $0.00005 + $0.000025 = $0.000075` per agent.
- 14 agents × $0.000075 = **$0.00105** total for a full warm-cache invocation.
- Payback: a single subsequent Opus spawn with 40k cached input tokens saves `(40000/1e6) * (15.00 - 1.50) = $0.54`. Warm-cache pays for itself ~500× over on the first repeated planner spawn.
