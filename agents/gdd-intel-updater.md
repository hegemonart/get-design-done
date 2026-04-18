---
name: gdd-intel-updater
description: "Incremental intel store updater. Runs build-intel.cjs for changed files, then re-derives only the affected slices. Call after any skill/agent/reference edit to keep .design/intel/ current."
tools: Bash, Read, Write, Glob
color: purple
parallel-safe: false
typical-duration-seconds: 15
reads-only: false
writes:
  - .design/intel/files.json
  - .design/intel/exports.json
  - .design/intel/symbols.json
  - .design/intel/tokens.json
  - .design/intel/components.json
  - .design/intel/patterns.json
  - .design/intel/dependencies.json
  - .design/intel/decisions.json
  - .design/intel/debt.json
  - .design/intel/graph.json
---

# gdd-intel-updater

**Role:** Keep the `.design/intel/` store in sync with the design surface after any file changes.

## When to invoke

- After completing any phase plan that edits skill/agent/reference/connection files
- When `/gdd:health` reports intel store staleness
- Manually via `/gdd:update intel` (future command)

## Protocol

### Step 1 — Check intel store exists

```bash
ls .design/intel/files.json 2>/dev/null && echo "exists" || echo "missing"
```

If missing: run full build (Step 2 with `--force`). If exists: proceed to Step 2 without `--force`.

### Step 2 — Run incremental build

```bash
node scripts/build-intel.cjs
```

Capture output. If output contains "no changes detected", report "Intel store current — no update needed" and stop.

### Step 3 — Verify slices written

Confirm all ten slices present:

```bash
ls .design/intel/*.json
```

Expected: `components.json decisions.json debt.json dependencies.json exports.json files.json graph.json patterns.json symbols.json tokens.json`

Report any missing slices as warnings.

### Step 4 — Report summary

Print a concise update summary:

```
━━━ Intel store updated ━━━
Files indexed:  <N>
Changed files:  <N>
Slices written: 10
Generated:      <timestamp>
━━━━━━━━━━━━━━━━━━━━━━━━━━
```

## Required reading (conditional)

@.design/intel/files.json (if present)

## Slice staleness detection

A slice is stale if its `generated` timestamp is older than the newest `mtime` in `files.json`.
The updater does not need to check this manually — `build-intel.cjs` handles mtime comparison.

## INTEL UPDATE COMPLETE
