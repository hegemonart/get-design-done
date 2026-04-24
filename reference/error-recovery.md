# Error recovery

This is the recovery-action protocol for low-level errors inside the GDD pipeline. It sits on top of `scripts/lib/error-classifier.cjs` (Plan 20-14) and references the rate-guard, jittered-backoff, and iteration-budget primitives.

## Recovery protocol

On `status=413` or `context_overflow`, re-emit with compressed context (drop oldest non-system turns, target 50% reduction, retry once).

On `status=429`, consult `scripts/lib/rate-guard.cjs` → `blockUntilReady(provider)` before retry.

On network-transient (5xx, ECONNRESET), use jittered backoff (`scripts/lib/jittered-backoff.cjs`); max 3 retries.

On auth-error, surface to user — do not retry.

## Recovery-action table

The `FailoverReason` enum in `scripts/lib/error-classifier.cjs` has eight values. Each row below is the canonical recovery action for one of those values. The classifier's `suggestedAction` field returns a one-liner drawn from this table; this doc is the authoritative long form.

| FailoverReason      | Retryable | Action                                                                                                                                                     |
| ------------------- | --------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `rate_limited`      | yes       | Call `rate-guard.ingestHeaders(provider, response.headers)` to record the rate-limit signal, then `rate-guard.blockUntilReady(provider)` before retrying. The blocker waits until `resetAt` on disk — synchronized siblings (watch-authorities + update-check) therefore share the backoff boundary. After the block returns, retry with jittered backoff at attempt 0. |
| `context_overflow`  | yes       | Compress context — drop the oldest non-system turns (or the oldest attachments) targeting roughly 50 % token reduction. Retry **once** with the compressed payload. If the retry also raises `context_overflow`, escalate to the user as an unrecoverable block — further compression destroys information. |
| `auth_error`        | no        | Surface the error to the user with actionable text: which credential, which provider, and the renewal path (OAuth re-auth URL, API-key environment variable, etc.). Do not retry automatically — a loop would just multiply the failure. |
| `network_transient` | yes       | Retry with `scripts/lib/jittered-backoff.cjs` — `await sleep(attempt)` inside a bounded loop. Cap at 3 attempts before giving up. When retries exhaust, reclassify as `network_permanent` and surface to the user. |
| `network_permanent` | no        | Surface to user. The endpoint is wrong, DNS is broken, or the resource was removed. A retry without operator action will just re-fail. |
| `tool_not_found`    | no        | Surface to user. Either the tool name drifted (common for MCP servers whose prefixes change across sessions) or the MCP is not registered. Reprobe via the connection's probe sequence before retrying anything. |
| `validation`        | no        | Surface the validation detail to the caller. Do not retry the same input — 4xx is the server saying "your payload is wrong". Fixing the payload is caller work. |
| `unknown`           | no        | Surface the raw error to the user. Do not retry — we can't tell whether it's safe. Add a telemetry row so we can tighten the classifier over time. |

## Integration points

| Caller                    | When to classify                             | What to do with `reason`                                                                                           |
| ------------------------- | -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| `hooks/budget-enforcer.ts` | pre-spawn rate-guard check (Plan 20-14)      | If upstream state already shows `rate_limited`, emit `decision: 'rate-limited'` and short-circuit before any spawn. |
| Figma MCP probe           | live `get_metadata` call errors              | `network_transient` → jittered-backoff retry. `auth_error` → STOP with a reauth note. `rate_limited` → block then retry. |
| Watch-authorities fetcher | per-feed HTTP fetch                          | Same policy as Figma probe; `validation` also possible on ETag stalemate (304). |
| Update-check HTTP curl    | GitHub `releases/latest` fetch               | Silent failure by D-04 of Plan 13.3 — classify but don't surface; log and exit 0. |
| MCP transport             | tool-call errors (gdd-state, figma, 21st-dev)| Map `tool_not_found` to a probe-reissue; map `auth_error` to STOP; retry transient classes via the caller's own loop. |

## Fix-loop iteration interaction

Retries consume iteration budget when paired with the Layer-B cache:

1. On cache hit, `iteration-budget.refund(1)` preserves the iteration that would otherwise have been spent.
2. On each actual retry that does real work (no cache hit), the caller `iteration-budget.consume(1)` before the spawn.
3. When the budget's `remaining === 0`, further retries throw `IterationBudgetExhaustedError` and the caller must surface to user — a retry cycle has become pathological.

This protects the "infinite fix loop" case — a blocker that regenerates after every fix — from burning unbounded context.

## Telemetry

Every classification result that leads to a retry or a surfaced error should append an event to `.design/telemetry/events.jsonl`:

```json
{ "type": "error.classified", "timestamp": "…", "sessionId": "…", "payload": { "reason": "rate_limited", "retryable": true, "caller": "figma-probe" } }
```

The event subtype is defined in `scripts/lib/event-stream/types.ts`. Consumers (`gdd-reflector`, dashboard) aggregate by `reason` to detect classifier drift — if `unknown` spikes, the classifier needs tightening.
