# Cursor — Runtime Install Notes

This file documents the get-design-done install path on Cursor and one known limitation.

Cursor is one of the 14 first-class runtimes for `gdd install` (see `reference/runtimes.md` for the full set). It uses the `multi-artifact` install kind: skills land as `~/.cursor/skills/<gdd-name>/SKILL.md` after passing through `scripts/lib/install/converters/cursor.cjs`.

## Install

```
gdd install --runtime cursor          # global → ~/.cursor/skills/
gdd install --runtime cursor --local  # repo-local → .cursor/skills/
```

Each installed skill is name-prefixed with `gdd-` (e.g. `gdd-explore`, `gdd-discover`) so it cannot collide with user-authored Cursor skills.

## Converter behavior

`converters/cursor.cjs#convert` is a pure string→string transform that:

- Normalizes the frontmatter `name:` field to `gdd-<skill>` (no double-prefix).
- Rewrites mixed-shape slash references (`gdd-x`, `/gdd:x`) to a consistent `/gdd-<name>` shape.
- Passes the Claude tool vocabulary through unchanged (Read / Write / Bash / Edit / Grep / Glob — Cursor accepts these).
- Injects a 1-line HTML adapter header recording auto-generation.

The output is byte-stable per source — re-running `gdd install --runtime cursor` is a no-op when nothing has changed.

## Known limitation — sibling .md files are NOT installed

Some skills ship procedure detail in sibling `.md` files next to `SKILL.md`. For example:

```
skills/discover/
├── SKILL.md                      ← installed
└── discover-procedure.md         ← NOT installed (sibling)
```

`SKILL.md` references the sibling via a relative link (e.g. `./discover-procedure.md`). On Cursor, that link resolves to nothing.

This is a systemic limitation of the current `multi-artifact` install pipeline (`scripts/lib/install/runtime-artifact-layout.cjs#skillsKind`), not a Cursor-specific bug. It affects every runtime that uses `skillsKind`: claude global, cursor, codex, copilot, antigravity, windsurf, augment, trae, qwen, codebuddy. Skills with sibling files currently affected:

- `apply-reflections/apply-reflections-procedure.md`
- `cache-manager/cache-policy.md`
- `compare/compare-rubric.md`
- `connections/connections-onboarding.md`
- `darkmode/darkmode-audit-procedure.md`
- `debug/debug-feedback-loops.md`
- `design/design-procedure.md`
- `discover/discover-procedure.md`
- `explore/explore-procedure.md`
- `health/health-mcp-detection.md`
- `health/health-skill-length-report.md`
- `new-cycle/milestone-completeness-rubric.md`
- `peer-cli-add/peer-cli-protocol.md`
- `plan/plan-procedure.md`
- `quality-gate/threat-modeling.md`
- `report-issue/report-issue-procedure.md`
- `router/capability-gap-emitter.md`
- `router/router-pick-emitter.md`
- `router/router-rules.md`
- `scan/scan-procedure.md`
- `start/start-procedure.md`
- `style/style-doc-procedure.md`
- `verify/verify-procedure.md`

### Workarounds until a fix lands

1. **Use the cursor-marketplace distribution channel** — `scripts/lib/install/converters/cursor-marketplace.cjs` copies the entire `skills/` tree byte-for-byte (siblings included). Install through the marketplace plugin rather than per-skill if you need the full procedure detail.
2. **Clone the repo locally** — Cursor can read sibling files directly from the source checkout if you point it at the repo tree.
3. **Inline-grep the source** — for one-off questions, read the source `SKILL.md` directly; siblings are short and self-contained.

### Fix scope (tracked as follow-up beyond batch H6)

Properly enumerating siblings requires extending the StagedArtifact contract to emit multiple files per skill (one SKILL.md + N siblings), updating `computeDestPath` for non-SKILL.md paths inside a skill subdir, the foreign-file detection in `installer.cjs#detectMultiArtifactInstalled`, and the uninstall enumeration in `uninstallMultiArtifact`. See the `KNOWN LIMITATION` block at the top of `scripts/lib/install/converters/cursor.cjs` for the technical detail.
