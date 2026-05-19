---
name: gdd-sample
description: "Sample skill used by Phase 28.7 Plan 28.7-09 per-runtime install simulation tests — exercises slash + tool-fence rewrites."
tools: Read, Bash
disable-model-invocation: false
---

# Sample Skill

This skill calls `/gdd-explore` at the start, then routes through
`/gdd-debug` on failure. Legacy `gdd:audit` shapes are normalized.

```bash
Bash(command="echo hi")
Read(path="x.ts")
```
