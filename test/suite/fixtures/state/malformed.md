---
pipeline_state_version: 1.0
stage: design
cycle: ""
wave: 1
started_at: 2026-04-24T00:00:00Z
last_checkpoint: 2026-04-24T00:00:00Z
---

# Pipeline State — fixture-malformed

<position>
stage: design
wave: 1
task_progress: 0/0
status: in_progress
handoff_source: ""
handoff_path: ""
skipped_stages: ""
</position>

<decisions>
D-01: A tentative decision (tentative)
</decisions>

<blockers>
[design] [2026-04-24]: this line is fine
this line is not a valid blocker — should trigger ParseError with line number
[design] [2026-04-24]: trailing valid line never reached
</blockers>

<timestamps>
started_at: 2026-04-24T00:00:00Z
last_checkpoint: 2026-04-24T00:00:00Z
</timestamps>
