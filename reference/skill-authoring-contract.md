---
name: skill-authoring-contract
type: meta-rules
version: 1.0.0
phase: 28.5
tags: [skill, authoring, contract, length-cap, description, frontmatter, progressive-disclosure]
last_updated: 2026-05-18
---

Source: mattpocock/skills (MIT) — adapted with permission. See `../NOTICE` for the full attribution block.

# Skill Authoring Contract

This file codifies the structural discipline that every `skills/<name>/SKILL.md` in this repo
must obey. It exists because a 2026-05-02 audit found skill lengths ranging from 23 to 731
lines, descriptions oscillating between under-spec and over-cap, and no shared rule for when
to extract domain content out of a SKILL.md and into a centralized reference. The contract
pulls every skill into a predictable band so agent context stays small and first-token latency
stays low. Validator: `node scripts/validate-skill-length.cjs --quiet --json`. See
`./context-md-format.md` and `./adr-format.md` for the project-scoped artifact contracts that
ship in the same phase.

## Length cap

Two-tier threshold, enforced by the validator (D-01):

- **Warn at `≥100` lines.** Validator emits a warning. CI does NOT fail. Treat as a forcing
  function: a 110-line skill is fine; a 180-line skill needs a hard look at what can be
  extracted.
- **Block at `≥250` lines.** Validator emits an error. CI FAILS. No exceptions —
  multi-stage orchestrator skills push extraction harder, they do not waive the cap.

When a skill exceeds the cap, use the extract-then-link discipline (D-10) — NEVER delete
content. Move it. Steps:

1. Identify load-bearing workflow + decision-tree content. Keep this in `SKILL.md`.
2. Identify domain content — heuristics, framework matrices, glossaries, extended examples.
   Extract to an existing `reference/<topic>.md` if the topic matches; create a new
   `reference/<topic>.md` if it does not.
3. Replace the extracted content with a single-sentence summary + cross-link.

Concrete callouts at the time of writing: `skills/scan/SKILL.md` (731 lines) is the
worst-offender and is scheduled for Bucket 1 rework in plan `28.5-04`. `skills/help/SKILL.md`
(86 lines) is an in-band example of a well-scoped utility shortcut.

## Description format

Two rules:

- **Length cap is STRICT.** `description ≤ 1024 chars` — no flag, no override. Under 20 chars
  is also blocked as under-specification.
- **Recommended form is LAX by default.** `<what>. Use when <triggers>.` — third person,
  first sentence what the skill does, second sentence the trigger conditions. Validator
  enforces the form regex only under `--strict-description` or `STRICT_DESCRIPTION=1`. Default
  is length-only.

Why lax-by-default (D-02): `obra/superpowers/skills/writing-skills/SKILL.md` documents a
shortcut-effect where an agent reads the description and skips the body — the more
load-bearing the description summary, the more often this happens. Phase 33 ships an A/B
study at `.design/research/description-format-ab.md`; until then the regex stays advisory.

Examples (both 20–1024 chars, both pass the length check):

```text
# Strict-mode-compliant
Renders an OKLCH gamut comparison chart. Use when the user asks to see the visible difference between a target gamut and sRGB.

# Lax-mode-only acceptable
Compares OKLCH gamut coverage against sRGB and prints a visual diff chart.
```

## Frontmatter

Required fields (validator blocks if absent):

- `name` — kebab-case skill identifier; matches `^[a-z0-9][a-z0-9-._]*$`.
- `description` — 20–1024 chars; see `## Description format` above.

Optional fields (recognized by the Claude Code agent loader):

- `argument-hint` — usage hint shown in the slash-command picker.
- `tools` — comma-separated allowed tool list (e.g. `Read, Grep`).
- `disable-model-invocation: true|false` — when `true`, the skill fires ONLY on explicit
  user invocation and the router will not auto-trigger it. Allowed ONLY on the D-09
  whitelist (pure shortcuts like `help`, `stats`, `note`, `health`, `zoom-out`). The
  validator blocks if a non-whitelisted skill sets this field to `true`.
- `user-invocable: true|false` — whether the slash-command picker exposes the skill.

Concrete example:

```yaml
---
name: help
description: "Lists all available get-design-done commands with one-line descriptions. Use when the user asks for help, a command list, or wants to know what is available."
tools: Read
disable-model-invocation: true
---
```

## Progressive disclosure

References-one-level-deep is the rule (D-06):

- **One level deep.** `SKILL.md` may cross-link into a reference. A reference may
  cross-link into another reference. `SKILL.md` does NOT instruct the agent to follow a
  reference's references — load the first level only.
- **When to add `scripts/`.** Per mattpocock's three criteria, add a script only when the
  step is deterministic, repeated across runs, and the failure mode needs explicit error
  handling. Anything ad-hoc or once-off stays inline as agent prose.

### Reference placement classes

Three placement classes by cross-domain consumer count (D-06, refreshed by Phase 28.6 D-04):

- **1-consumer (skill-private procedure refs).** Live in `skills/<owner>/<topic>.md` next
  to the SKILL.md they describe. Cross-link from SKILL.md as `./<topic>.md`. Matches
  mattpocock's per-skill folder pattern. Examples: `skills/scan/scan-procedure.md`,
  `skills/debug/debug-feedback-loops.md`.
- **2-consumer (same-domain pair).** Live in the primary owner's skill folder. Secondary
  consumer cross-links via `../<primary>/<topic>.md`. Examples:
  `skills/cache-manager/cache-policy.md` (skills/warm-cache cross-links in);
  `skills/peer-cli-add/peer-cli-protocol.md` (skills/peer-cli-customize + skills/peers
  cross-link in).
- **Multi-consumer (3+ cross-domain).** Live in `reference/<topic>.md`. Used by 3+ skills
  across different domains. Examples: `reference/typography.md`,
  `reference/palette-catalog.md`, `reference/audit-scoring.md` (each consumed by 15+
  skills).

### Migration policy

When a reference grows from 1-consumer to 3+ cross-domain consumers, migrate from
`skills/<owner>/` to `reference/` and update cross-links accordingly. When a centralized
ref shrinks to 1–2 consumers (or its consumers turn out to be same-domain), migrate the
other direction. Document the migration in the relevant phase's SUMMARY.md.

### Phase 28.6 retrospective

Phase 28.5 D-06 over-generalized by centralizing all extracted refs in `reference/`,
including procedure refs read by exactly one skill. Phase 28.6 corrected this by migrating
20 skill-private procedure refs back into their owning skill folders (D-01) and refreshing
this section to endorse per-skill folders as the canonical placement for 1-consumer
content (D-04). See
`.planning/phases/28.6-skill-reference-co-location/CONTEXT.md` for the full discipline.

Concrete example: a skill that lists 10 framework matrices inline (~150 lines) extracts
the matrices to `reference/<framework>-matrices.md` (if 3+ skills will consume them) or
`skills/<owner>/<framework>-matrices.md` (if only the owning skill reads them), then
replaces the inline content with a one-sentence summary + cross-link. SKILL.md drops to
~80 lines, the matrices stay discoverable, no institutional knowledge is lost.

## Validator usage

```text
node scripts/validate-skill-length.cjs --quiet --json
```

Exit codes: `0` clean, `1` warnings only, `2` blockers present. Flags: `--quiet` suppresses
per-skill output, `--strict-description` adds the form regex check, `--json` emits
machine-readable output. Env: `STRICT_DESCRIPTION=1` and `SKILLS_DIR=<path>` are honored.
