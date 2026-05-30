---
pipeline_state_version: 1.0
stage: brief
cycle: ""
wave: 1
started_at: 2026-04-24T00:00:00Z
last_checkpoint: 2026-04-24T00:00:00Z
---

# Pipeline State — fixture-fresh

<position>
stage: brief
wave: 1
task_progress: 0/0
status: initialized
handoff_source: ""
handoff_path: ""
skipped_stages: ""
</position>
<!-- handoff_source: "claude-design-html" | "claude-design-bundle" | "manual" | "" -->
<!-- handoff_path: path to handoff bundle -->
<!-- skipped_stages: comma-separated bypassed stages -->

<decisions>
<!-- Filled by discover stage. Format: -->
<!-- D-01: [decision text] (locked | tentative) -->
</decisions>

<must_haves>
<!-- Filled by discover stage. Format: -->
<!-- M-01: [observable behavior description] | status: pending -->
</must_haves>

<connections>
figma: not_configured
refero: not_configured
preview: not_configured
storybook: not_configured
chromatic: not_configured
</connections>

<blockers>
<!-- Active blockers preventing stage completion. -->
</blockers>

<parallelism_decision>
<!-- Written by each stage orchestrator after computing parallelism verdict -->
</parallelism_decision>

<todos>
<!-- Mirror of .design/TODO.md counts. -->
</todos>

<timestamps>
started_at: 2026-04-24T00:00:00Z
last_checkpoint: 2026-04-24T00:00:00Z
brief_completed_at: ~
explore_completed_at: ~
plan_completed_at: ~
design_completed_at: ~
verify_completed_at: ~
</timestamps>
