---
pipeline_state_version: 1.0
stage: explore
cycle: default
wave: 1
started_at: 2026-04-24T00:00:00Z
last_checkpoint: 2026-04-24T00:00:00Z
---

# Pipeline State — brief-to-explore-fail (wrong parity)

<!--
  Fail case: frontmatter.stage is "explore" but the skill is asking to
  transition brief -> explore. stageParity() detects mismatch and blocks.
-->

<position>
stage: explore
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
</connections>

<blockers>
</blockers>

<parallelism_decision>
</parallelism_decision>

<todos>
</todos>

<timestamps>
started_at: 2026-04-24T00:00:00Z
last_checkpoint: 2026-04-24T00:00:00Z
</timestamps>
