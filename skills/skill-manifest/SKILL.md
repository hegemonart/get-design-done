---
name: gdd-skill-manifest
description: "Lists all registered GDD skills and agents, with descriptions, from the intel store. Falls back to directory scan if intel store not present."
tools: Bash, Read, Glob
---

# /gdd:skill-manifest

**Role:** Print a manifest of all registered skills (commands) and agents available in this plugin installation.

## Pre-flight check

```bash
ls .design/intel/exports.json 2>/dev/null && echo "ready" || echo "missing"
```

## Mode 1 — Intel store available

Read `.design/intel/exports.json`. Group entries by `kind` (skill vs agent). Print:

```
━━━ Skill Manifest ━━━
Generated from intel store: .design/intel/exports.json

SKILLS (Commands)
─────────────────
/gdd:scan               gdd-scan
/gdd:discover           gdd-discover
/gdd:plan               gdd-plan
/gdd:design             gdd-design
/gdd:verify             gdd-verify
/gdd:style              gdd-style
/gdd:darkmode           gdd-darkmode
/gdd:compare            gdd-compare
... (all skills)

AGENTS
──────
design-advisor          Design advisor agent
design-auditor          Design auditor agent
design-context-builder  Builds DESIGN-CONTEXT.md from codebase scan
... (all agents)

Total: <N> skills, <M> agents
━━━━━━━━━━━━━━━━━━━━━
```

To get the description for each skill/agent: read `exports.json` entry and look up the matching file in `files.json`, then read its frontmatter `description` field from `exports.json` (if stored) or from the file directly.

## Mode 2 — Intel store missing (fallback)

If `.design/intel/exports.json` is not present, fall back to directory scan:

```bash
ls skills/
ls agents/*.md
```

Print a simplified manifest without descriptions:

```
━━━ Skill Manifest (no intel store — run build-intel.cjs for descriptions) ━━━

SKILLS: scan, discover, plan, design, verify, style, darkmode, compare, ...
AGENTS: design-advisor.md, design-auditor.md, ...
━━━━━━━━━━━━━━━━━━━━━
```

## Filter mode

`/gdd:skill-manifest agents` — show agents only
`/gdd:skill-manifest skills` — show skills only
`/gdd:skill-manifest <keyword>` — filter by keyword in name or description

## Required reading (conditional)

@.design/intel/exports.json (if present)

## SKILL-MANIFEST COMPLETE
