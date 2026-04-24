---
pipeline_state_version: 1.0
stage: scan
cycle: default
wave: 1
started_at: 1970-01-01T00:00:00Z
last_checkpoint: 1970-01-01T00:00:00Z
model_profile: balanced
---

# Pipeline State (cross-harness fixture)

Minimal STATE.md for Plan 21-10 smoke tests. Stage is pinned at `scan` so
any CLI invocation that reads current-stage returns a deterministic value
regardless of which harness fixture env wraps it.

<position>
stage: scan
wave: 1
task_progress: 0/0
status: initialized
handoff_source: ""
handoff_path: ""
skipped_stages: ""
</position>

<decisions>
</decisions>

<must_haves>
</must_haves>

<connections>
figma: not_configured
refero: not_configured
preview: not_configured
storybook: not_configured
chromatic: not_configured
</connections>

<blockers>
</blockers>

<parallelism_decision>
</parallelism_decision>

<todos>
</todos>

<timestamps>
started_at: 1970-01-01T00:00:00Z
last_checkpoint: 1970-01-01T00:00:00Z
</timestamps>
