# Procedure: reflector pattern-detection capability-gap scan

Run during the reflection pass to detect recurring patterns lacking a dedicated executable owner; emit `capability_gap` events with `source: "reflector_pattern"` (Phase 29 Plan 02) for Plan 29-03 to aggregate.

## Inputs

Three signal sources are scanned. All paths are repo-relative; the scan tolerates absent sources (returns `[]` from that source, no error):

- `.design/intel/*.md` - Phase 11 intel-store slice files. The scan extracts `Touches:` lines, tokenizes the comma-separated value, and clusters slices that share the same canonical `(sortedTouches, agent_type)` signal.
- `.design/telemetry/posterior.json` - Phase 23.5 bandit posterior file written by `scripts/lib/bandit-router.cjs`. The scan reads `arms[]` and flags arms whose `count >= threshold` AND whose `agent` is in `GENERIC_AGENT_FALLBACKS` (`general-purpose`, `default-executor`, `fallback`, `generic`) OR is not in the project's specialized-agent set.
- `.design/gep/events.jsonl` - Phase 22 typed-causal event chain via `scripts/lib/event-chain.cjs`. The scan filters rows to the last `windowDays` (default 30), groups by `(sortedDecisionRefs, agent)`, and flags sequences that recur ≥ threshold times.

## Outputs

For each qualifying cluster:

- One `capability_gap` event appended to `.design/gep/events.jsonl` via `appendChainEvent` from `scripts/lib/event-chain.cjs`.
- The event's `payload` carries exactly the 7 fields documented in CONTEXT D-02: `event_id` (UUIDv4), `parent_event_id` (nullable), `source` (`"reflector_pattern"`), `context_hash` (sha256 of normalized signal), `intent_summary` (≤256 chars), `suggested_kind` (`"agent"` | `"skill"`), `evidence_refs[]` (TrajectoryRef pointers with `sha256:` content hash).
- The orchestrator returns `{findings, emittedEventIds, skippedBelowThreshold}` to the caller (the `design-reflector` agent), which cites the event IDs in its run summary under `## Capability gaps emitted`.

## Algorithm

The orchestrator `runCapabilityGapScan(opts)` in `scripts/lib/reflector/capability-gap-scan.cjs` follows four phases:

1. **Load threshold.** Resolve in priority order: `opts.threshold` → `.design/config.json` field `reflector.capability_gap_threshold` → `DEFAULT_THRESHOLD` (=3). Throws if the resolved value is non-integer or < 1.
2. **Build agent inventory.** Read `agents/*.md` frontmatter `name:` fields; partition into specialized vs generic.
3. **Three scans (parallel-safe in concept; sequential in code for simplicity).** Call `scanIntelTouchesClusters`, `scanPosteriorArms`, `scanTrajectorySlices` and concatenate findings.
4. **Emit.** For each finding, call the injected `opts.emit` spy (tests) or the default emitter (`defaultEmitCapabilityGapEvent`, which calls `appendChainEvent` from `scripts/lib/event-chain.cjs`). Collect returned `event_id`s.

Key entry points (all exported from the module):

- `computeContextHash({touches, agent_type})` - pure deterministic hash (sha256 of normalized JSON; touches are sorted ASCII-asc).
- `scanIntelTouchesClusters({intelDir, existingAgents, threshold, baseDir})`
- `scanPosteriorArms({posteriorPath, specializedAgents, threshold, baseDir})`
- `scanTrajectorySlices({chainPath, windowDays, threshold, specializedAgents, baseDir})`
- `runCapabilityGapScan(opts)` - orchestrator.

The `context_hash` is the join key for Plan 29-03's aggregation: the same signal across runs produces the same hash regardless of touches-list ordering.

## Threshold configuration

The scan honors `reflector.capability_gap_threshold` in `.design/config.json`. Default `N = 3` (must be integer ≥ 1). Override knob documented in `.design/config.example.json`.

To raise the threshold (suppress noise):

```json
{
  "reflector": {
    "capability_gap_threshold": 5
  }
}
```

To dry-run with an injected threshold without writing the config file:

```bash
node -e "console.log(JSON.stringify(require('./scripts/lib/reflector/capability-gap-scan.cjs').runCapabilityGapScan({threshold: 5, emit: () => 'DRY'}), null, 2))"
```

## Hard exclusions (D-08)

MCP-probe failures MUST NOT contribute to any scan. Connection observability is Phase 22's separate surface; mixing those signals into the capability-gap stream would pollute Plan 29-03's clustering.

The scan filters rows matching ANY of the following three shapes (liberal exclusion):

- `outcome === 'connection-error'`
- `agent === 'mcp-probe'`
- `mcp_probe: true`

The exclusion is enforced in `scanTrajectorySlices` via the internal `isMcpProbeRow` predicate (also exported for tests). Tests assert all three exclusion shapes regress separately.

## Evidence-refs contract (D-07)

Each event's `evidence_refs[]` is a list of POINTERS to source slices, never duplicated content. The scan emits items in the schema's `TrajectoryRef` shape:

```typescript
interface TrajectoryRef {
  trajectory_path: string;   // repo-relative path
  byte_start:      number;   // inclusive byte offset
  byte_end:        number;   // exclusive byte offset
  content_hash:    string;   // "sha256:" + 64-hex
}
```

Internally, the scan carries a line-based `{path, lineStart, lineEnd, sha256}` shape on each `Finding.evidence_refs`. The `lineRefToTrajectoryRef` translator converts to the schema shape at emit time. The sha256 algorithm: read lines `[lineStart..lineEnd]` (1-based inclusive), join with `'\n'` (no trailing newline - stable across OSes), sha256 the UTF-8 bytes.

Consumers (Plan 29-03 + audit tooling) re-read the slice and recompute the hash; mismatch = chain mutation; abort + warn.

## CLI dry-run

```bash
node scripts/lib/reflector/capability-gap-scan.cjs --dry-run
```

Runs all three scans against the current working directory and prints findings (and would-be event payloads) without writing to `.design/gep/events.jsonl`. Useful for operator-side inspection of what the design-reflector agent would emit on the next reflection pass.

Without `--dry-run`, the CLI writes events to the chain file and prints a one-line summary: `emitted N capability_gap event(s); skipped M below threshold`.

## Testing

Tests live at `tests/reflector-capability-gap.test.cjs` and run on synthetic in-tmpdir fixtures only (D-11 - no live writes to real `.design/`). Each test passes an injected `emit` spy so no real `appendChainEvent` calls occur. The hash-pin mutation-detection regression is enforced by a dedicated test: re-read the pointed-to slice, recompute the sha256, and assert mismatch after the source file is mutated.

Run the tests directly:

```bash
node --test tests/reflector-capability-gap.test.cjs
```

Run the full suite to verify no regressions in `tests/reflection-proposal.test.cjs` or `tests/reflector-cross-runtime.test.cjs`:

```bash
npm test
```

## See also

- `reference/schemas/events.schema.json` - the `capability_gap` event class shipped by Plan 29-01 (the 7-field shape + `TrajectoryRef` definition).
- `scripts/lib/event-chain.cjs` - `appendChainEvent` (the real emitter API; 29-01 did NOT ship a separate helper file).
- `scripts/lib/bandit-router.cjs` - Phase 23.5 posterior file producer (the source for scan #2).
- `.planning/phases/29-capability-gap-self-authoring/CONTEXT.md` - phase decisions (D-02 7-field shape, D-07 hash-pinning, D-08 MCP carve-out, D-11 tmpdir tests).
