---
name: hone-sample
description: "Sample skill exercising all converter rewrite paths for Phase 28.7 wave-1 (cursor, codex, copilot, antigravity)."
tools: Read, Write, Bash, Edit, Grep
disable-model-invocation: false
---

# Get Design Done — Sample Skill

**Role:** Exercise every conversion path so that converter golden tests can
assert prose vs. code-fence behavior independently.

This skill calls `/hone-explore` first, then routes through `/hone-debug` on
failure. The Bash tool is the primary execution surface — prose references
to "Bash" or "Read" do not get rewritten by the codex converter (they are
documentation, not invocations).

## Steps

1. Read the project's STATE.md.

```bash
Read(path="/.planning/STATE.md")
```

2. Run a shell command to scan for skills.

```bash
Bash(command="ls skills/")
```

3. Apply an edit if needed.

```bash
Edit(file="skills/sample/SKILL.md", old="placeholder", new="real content")
```

4. Search the codebase.

```bash
Grep(pattern="formatGddSlash", path="scripts/")
Glob(pattern="**/*.cjs")
```

5. Fetch an external reference if required.

```bash
WebFetch(url="https://example.com/spec")
WebSearch(query="codex tool surface")
```

## Cross-references

See the [companion](https://github.com/hegemonart/hone/tree/main/skills/debug) for failure-mode recovery. The
`/hone-progress` skill reports state. Legacy colon shapes like `gdd:audit`
are accepted but normalized.

## Notes

The Bash tool and Read tool are mentioned here in prose only; the codex
converter must NOT rewrite them (only the parenthesized invocation form
inside fenced blocks gets rewritten).
