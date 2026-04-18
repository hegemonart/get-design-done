# Phase 8 — Visual + Design-Side Connections — Baseline Lock

This directory locks the baseline for Phase 8 of the get-design-done plugin.

## Phase 8 Scope

- Preview (Playwright) connection
- Storybook HTTP connection
- Chromatic CLI connection
- Figma Writer agent (proposal→confirm)
- Graphify knowledge graph connection

## Connections Added

| Connection | Spec file | Key capability |
|-----------|-----------|----------------|
| Preview | connections/preview.md | Visual screenshots in verify |
| Storybook | connections/storybook.md | Component inventory + a11y |
| Chromatic | connections/chromatic.md | Visual regression delta |
| Figma Writer | connections/figma.md (as of v1.0.7.1; Phase 13.1 folded the deleted `connections/figma-writer.md` into the unified spec) | Write decisions to Figma |
| Graphify | connections/graphify.md | Knowledge graph pre-search |

## New Commands

- `/gdd:figma-write <mode>` — annotate, tokenize, or mappings modes
- `/gdd:graphify <subcommand>` — build, query, status, diff

## Baseline Status

Phase 8 implementation complete. All Phase 8 requirements marked Complete in `.planning/REQUIREMENTS.md`.

Plugin version: **1.0.2**
