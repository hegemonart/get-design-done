---
name: gdd-instinct
description: "Inspects and manages atomic instinct learning units - small, scoped, confidence-weighted patterns the pipeline accumulates across cycles. Lists the project and global instinct stores, searches them by keyword, and promotes a vetted project instinct to the global store once it has cleared the cross-project gate. Use when the user wants to see what instincts exist, find an instinct by topic, or promote one to global scope. Activates for requests involving instincts, learned patterns, instinct promotion, instinct search, or the instinct store."
argument-hint: "[list | query <keyword> | promote <id>] [--scope project|global] [--domain <d>]"
tools: Read, Bash
user-invocable: true
---

# {{command_prefix}}instinct

**Role:** Front end for the atomic instinct store. An instinct is a single learned pattern with a trigger, a confidence between 0.3 and 0.9, a domain, and a scope. This skill lists, searches, and promotes instincts. It never edits stored units by hand and never invents new ones - the reflector and `{{command_prefix}}extract-learnings` author them.

The store engine ships at `scripts/lib/instinct-store.cjs` (authored elsewhere - this skill only calls it). Unit shape (YAML frontmatter plus a short body) is specified in `reference/instinct-format.md`. The project store lives at `.design/instincts/instincts.json`; the global store at `~/.claude/gdd/global-instincts.json`.

Invoke the engine with `node`, the same way other skills call a `scripts/lib` helper:

```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/lib/instinct-store.cjs" <subcommand> [args]
```

If the engine exposes only a module API rather than a CLI, drive it from a short `node -e` script:

```bash
node -e "const s=require('${CLAUDE_PLUGIN_ROOT}/scripts/lib/instinct-store.cjs'); console.log(JSON.stringify(s.list({scope:process.env.SCOPE})))"
```

## Invocation Modes

| Command | Behavior |
|---|---|
| `{{command_prefix}}instinct list` | Compact table of stored instincts (default mode). |
| `{{command_prefix}}instinct query "<keyword>"` | Search instincts by keyword; show the top matches. |
| `{{command_prefix}}instinct promote <id>` | Promote one project instinct to the global store (gated). |

Flags apply across modes:

- `--scope project|global` selects which store to read. Default is `project`.
- `--domain <d>` filters to one domain (the domain enum is defined in `reference/instinct-format.md`).

## list

Read the requested store and print a compact table. Call `instinct-store.list({ scope, domain, baseDir })`:

```bash
node -e "const s=require('${CLAUDE_PLUGIN_ROOT}/scripts/lib/instinct-store.cjs'); \
  const rows=s.list({ scope: process.env.SCOPE || 'project', domain: process.env.DOMAIN || undefined }); \
  console.log(JSON.stringify(rows));"
```

Render one row per instinct. Keep it scannable:

```
ID        DOMAIN     CONF   CYCLES  TRIGGER
in-7f3a   tokens     0.72   3       palette has no neutral ramp
in-91bc   layout     0.55   2       cards overflow on the 320px breakpoint
```

- `CONF` is the stored confidence (0.3 to 0.9).
- `CYCLES` is `cycles_seen`.
- Truncate `TRIGGER` to keep each line on one row.

If the store is empty, print: `No instincts in the <scope> store yet. Run {{command_prefix}}reflect or {{command_prefix}}extract-learnings to accumulate some.`

## query

Search by keyword and show the closest matches. Call `instinct-store.query(keyword, { scope, baseDir, limit })`. The engine uses an FTS5 index when one is present and falls back to a plain scan otherwise; either path returns the same row shape.

```bash
node -e "const s=require('${CLAUDE_PLUGIN_ROOT}/scripts/lib/instinct-store.cjs'); \
  const hits=s.query(process.env.KW, { scope: process.env.SCOPE || 'project', limit: 10 }); \
  console.log(JSON.stringify(hits));"
```

Print the top matches in the same table shape as `list`, ordered by the engine's relevance ranking. If there are no matches, say so plainly and suggest a broader keyword. Quote multi-word keywords so the shell passes one argument.

## promote

Promote a single project instinct into the global store so it applies across every project. Promotion is **gated**: `instinct-store.promote(id, { baseDir })` only succeeds when the instinct has been seen across at least K cycles (K=2) spanning at least M distinct project ids (M=2). The engine enforces the gate; this skill surfaces the outcome and asks the user to confirm before the write.

Confirm first. Prefer `@clack/prompts`, and fall back to `AskUserQuestion` when it is absent (mirror the probe in `{{command_prefix}}new-skill`):

```bash
node -e "try { require.resolve('@clack/prompts'); console.log('clack'); } catch { console.log('fallback'); }"
```

- `clack`: drive `clack.confirm({ message: 'Promote <id> to the global store?' })` from a short Node script.
- `fallback`: ask the same yes or no question with `AskUserQuestion`.

On a confirmed yes, run the promotion:

```bash
node -e "const s=require('${CLAUDE_PLUGIN_ROOT}/scripts/lib/instinct-store.cjs'); \
  console.log(JSON.stringify(s.promote(process.env.ID, {})));"
```

Branch on the engine result:

- Promotion succeeded: print `Promoted <id> to the global store.` and show the new global row.
- Gate not met: the engine reports how far the instinct is from the K=2 / M=2 bar. Print that plainly, for example `<id> needs 2 cycles across 2 projects; seen 1 cycle in 1 project so far. Not promoted.` Do not retry and do not force the write.
- Unknown id: print `No instinct <id> in the project store.` and suggest `{{command_prefix}}instinct list`.

If the user answers no at the confirm step, print `Promotion cancelled.` and exit without writing.

## Do Not

- Do not edit `.design/instincts/instincts.json` or the global store by hand. All writes go through `scripts/lib/instinct-store.cjs`.
- Do not author new instincts here. The reflector and `{{command_prefix}}extract-learnings` emit units; this skill reads and promotes them.
- Do not bypass the promotion gate. If the K=2 / M=2 bar is not met, report it and stop.
- Do not modify `reference/instinct-format.md` or the store engine.

## INSTINCT COMPLETE
