---
name: phase-42-fixture
description: Synthetic skill exercising every placeholder + a harness-only block + an escape, for the Phase 42 golden baseline.
---

# Phase 42 Fixture Skill

Run {{command_prefix}}audit and {{command_prefix}}verify using {{model}}.
Settings live in {{config_file}}. For help, {{ask_instruction}} about the pipeline.

<!-- harness-only: claude,codex -->
This guidance ships only to the Claude and Codex bundles.
<!-- /harness-only -->

A literal, escaped placeholder stays verbatim: \{{command_prefix}}.
