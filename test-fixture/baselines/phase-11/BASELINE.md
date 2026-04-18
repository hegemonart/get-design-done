# Phase 11 Regression Baseline

Locked: 2026-04-18  
Version: v1.0.5

## Files in this baseline

- `sample-agent-metrics.json` — representative agent-metrics.json for reflector testing
- `sample-costs.jsonl` — representative costs.jsonl for budget-analysis testing
- `expected-reflection-proposals.json` — expected proposal count and types for the sample fixtures

## Usage

Phase 12 test suite reads these files to validate reflector output without a live project.
A test passes if the reflector, given sample-agent-metrics.json + sample-costs.jsonl, produces at least:
- 1 `[FRONTMATTER]` proposal (design-verifier duration 3.2× declared)
- 1 `[BUDGET]` proposal (design-verifier cap_hit in all 3 cycles)
