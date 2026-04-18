# Intel Store Schema

Version: 1.0.0
Path: `.design/intel/` (gitignored — runtime data only)

## Overview

The intel store is a set of flat JSON files (slices) that index the design surface.
Each slice is an independent file. Agents read slices they need; the updater rewrites only changed slices.

Slices are rebuilt by `scripts/build-intel.cjs` (full initial build) and kept current by the
`gdd-intel-updater` agent (incremental updates triggered by file changes).

## Slice Definitions

### files.json

Index of all design-surface files tracked in the project.

```json
{
  "generated": "<ISO-8601 timestamp>",
  "git_hash": "<short SHA of HEAD at build time>",
  "files": [
    {
      "path": "skills/scan/SKILL.md",
      "type": "skill",
      "mtime": "<ISO-8601>",
      "size_bytes": 1240,
      "git_hash": "<short SHA of last commit touching this file>"
    }
  ]
}
```

`type` values: `skill`, `agent`, `reference`, `connection`, `script`, `hook`, `config`, `test`, `other`

---

### exports.json

Named exports from each file (frontmatter `name:` fields, command names, agent names).

```json
{
  "generated": "<ISO-8601>",
  "exports": [
    {
      "file": "skills/scan/SKILL.md",
      "kind": "skill",
      "name": "gdd-scan",
      "command": "/gdd:scan"
    },
    {
      "file": "agents/design-verifier.md",
      "kind": "agent",
      "name": "design-verifier"
    }
  ]
}
```

`kind` values: `skill`, `agent`, `reference`, `other`

---

### symbols.json

Headings, section anchors, and named concepts extracted from markdown files.

```json
{
  "generated": "<ISO-8601>",
  "symbols": [
    {
      "file": "reference/accessibility.md",
      "heading": "## WCAG Contrast Thresholds",
      "level": 2,
      "anchor": "wcag-contrast-thresholds",
      "line": 42
    }
  ]
}
```

---

### tokens.json

Design token references found across skill and agent files (color, spacing, typography, radius).

```json
{
  "generated": "<ISO-8601>",
  "tokens": [
    {
      "file": "skills/style/SKILL.md",
      "token": "--color-primary",
      "category": "color",
      "line": 18,
      "context": "Check `--color-primary` against WCAG AA"
    }
  ]
}
```

`category` values: `color`, `spacing`, `typography`, `radius`, `shadow`, `motion`, `other`

---

### components.json

Component names referenced or defined across design surface files.

```json
{
  "generated": "<ISO-8601>",
  "components": [
    {
      "file": "skills/design/SKILL.md",
      "component": "Button",
      "role": "reference",
      "line": 31
    }
  ]
}
```

`role` values: `definition`, `reference`, `example`

---

### patterns.json

Design patterns classified by concern, extracted from design-pattern-mapper output and reference docs.

```json
{
  "generated": "<ISO-8601>",
  "patterns": [
    {
      "name": "color-system",
      "category": "color-system",
      "source_file": "reference/heuristics.md",
      "description": "Semantic color token usage pattern"
    }
  ]
}
```

`category` values: `color-system`, `spacing-system`, `typography-system`, `component-styling`, `layout`, `interaction`, `other`

---

### dependencies.json

Intra-project @-references and explicit reads-from relationships between files.

```json
{
  "generated": "<ISO-8601>",
  "dependencies": [
    {
      "from": "skills/verify/SKILL.md",
      "to": "reference/accessibility.md",
      "kind": "at-reference",
      "line": 7
    },
    {
      "from": "agents/design-verifier.md",
      "to": "reference/heuristics.md",
      "kind": "reads-from",
      "line": 3
    }
  ]
}
```

`kind` values: `at-reference`, `reads-from`, `skill-calls-agent`, `agent-calls-agent`

---

### decisions.json

Architectural decisions extracted from DESIGN-CONTEXT.md and `.design/DESIGN-DECISIONS.md` (if present).

```json
{
  "generated": "<ISO-8601>",
  "decisions": [
    {
      "id": "D-01",
      "summary": "Use Figma MCP for token extraction — merge not replace grep results",
      "source_file": ".design/DESIGN-CONTEXT.md",
      "line": 12,
      "date": "2026-04-18"
    }
  ]
}
```

---

### debt.json

Design debt items extracted from `.design/DESIGN-DEBT.md`.

```json
{
  "generated": "<ISO-8601>",
  "debt": [
    {
      "id": "DEBT-01",
      "summary": "Spacing token --space-4 used inconsistently across 3 components",
      "severity": "medium",
      "source_file": ".design/DESIGN-DEBT.md",
      "line": 8
    }
  ]
}
```

`severity` values: `high`, `medium`, `low`

---

### graph.json

Cross-reference graph: nodes are files, edges are dependency relationships from dependencies.json.

```json
{
  "generated": "<ISO-8601>",
  "nodes": [
    { "id": "skills/verify/SKILL.md", "type": "skill", "name": "gdd-verify" }
  ],
  "edges": [
    {
      "from": "skills/verify/SKILL.md",
      "to": "reference/accessibility.md",
      "kind": "at-reference"
    }
  ]
}
```

## Incremental Update Rules

1. On each run, compare current file `mtime` and `git_hash` against `files.json` entries.
2. Only re-extract slices for files that changed.
3. Always regenerate `graph.json` after any dependency slice update.
4. `generated` timestamp in each slice reflects the last time that slice was written.

## Usage by Agents

Agents read slices conditionally using the `@.design/intel/<slice>.json (if present)` pattern.
This allows graceful degradation when the intel store has not been built yet.

Example conditional read block in an agent:

```
<required_reading>
@.design/intel/tokens.json (if present)
@.design/intel/components.json (if present)
</required_reading>
```
