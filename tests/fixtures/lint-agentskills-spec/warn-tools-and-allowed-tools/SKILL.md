---
name: warn-tools-and-allowed-tools
description: Valid skill but emits BOTH `tools` and `allowed-tools`. W1 must fire.
tools: Read, Write
allowed-tools: Read Write
---

# Both Tool Forms Present (PASS frontmatter + WARN W1)

Fixture intentionally emits BOTH `tools: Read, Write` and `allowed-tools: Read Write` in
the same frontmatter. Expected lint outcome: WARN row citing W1 ("`tools` and
`allowed-tools` both present; spec marks `allowed-tools` Experimental").
