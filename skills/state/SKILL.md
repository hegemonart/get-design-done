---
name: hone-state
description: "Query, recover, or roll back the Phase 57 SQLite state backbone. Use when you need to inspect the decisions/blockers/plans tables with a raw SELECT, rebuild a corrupt state.sqlite from the markdown STATE.md, or revert to the markdown-only source of truth by removing state.sqlite. Activates for requests involving querying the SQLite state database, recovering from SQLite corruption, or reverting the migration (demigrate)."
argument-hint: "<query \"<sql>\" | recover | demigrate>"
user-invocable: true
tools: Read, Bash, Grep, Glob
---

# /hone:state

The Phase 57 SQLite state backbone is opt-in (`--migrate-state`) and fully reversible.
Markdown `.design/STATE.md` is always the human-editable SoT; SQLite is a faster query
layer derived from it. This skill exposes three subcommands for operating on that layer.

## Subcommands

| Subcommand | What it does |
|---|---|
| `/hone:state query "<sql>"` | Run a read-only SELECT against `.design/state.sqlite`. |
| `/hone:state recover` | Rotate the current sqlite to a `.bak` and rebuild from markdown. |
| `/hone:state demigrate` | Remove `.design/state.sqlite`; markdown becomes the SoT again. |

---

## query

Execute a read-only SELECT against the state database.

The engine opens the file with `readonly:true` so all writes are rejected at the
engine level. A first-token denylist (Set membership, no regex) additionally blocks
DROP, DELETE, UPDATE, INSERT, ALTER, ATTACH, CREATE, PRAGMA, VACUUM, ANALYZE,
REINDEX, and REPLACE before the connection is opened.

```bash
node -e '
  const qs = require("./scripts/lib/state/query-surface.cjs");
  const result = qs.query(process.argv[1], { projectRoot: process.cwd() });
  console.log(JSON.stringify(result, null, 2));
' "<sql>"
```

Outputs `{ rows: [...], backend: "sqlite" }` on success, or
`{ degraded: true, message: "..." }` when SQLite is not active.

Degrades gracefully (no throw) when `BACKEND==='markdown'` or when
`.design/state.sqlite` has not been created yet (run `--migrate-state` first).

---

## recover

Rotate the current (possibly corrupt) `.design/state.sqlite` to `.bak.0`, then
rebuild a fresh database from the markdown `.design/STATE.md` using
`migrate-to-sqlite.cjs` in force mode. Runs `PRAGMA integrity_check` on the
result and reports the outcome.

```bash
node -e '
  const qs = require("./scripts/lib/state/query-surface.cjs");
  const result = qs.recover({ projectRoot: process.cwd() });
  console.log(JSON.stringify(result, null, 2));
'
```

Outputs `{ recovered: true, integrity: true, message: "..." }` on success.

Backup rotation keeps at most 10 files (`.bak.0` through `.bak.9`). The oldest
backup is overwritten when the cap is reached.

---

## demigrate

Remove `.design/state.sqlite` so the markdown `STATE.md` becomes the SoT again.
Idempotent: if the file does not exist, returns a clear no-op message without error.
A backup is taken in `.bak.0` before removal.

```bash
node -e '
  const qs = require("./scripts/lib/state/query-surface.cjs");
  const result = qs.demigrate({ projectRoot: process.cwd() });
  console.log(JSON.stringify(result, null, 2));
'
```

Outputs `{ demigrated: true, message: "..." }` when the file was removed, or
`{ demigrated: false, message: "..." }` when it was already absent (no-op).

To re-enable SQLite after a demigrate, run `--migrate-state` again.

---

## Key design decisions

- **Markdown is always the SoT.** SQLite is opt-in via `--migrate-state` and
  reversible via `demigrate`. The markdown file is never silently overwritten.
- **Read-only queries only.** The `query` subcommand enforces SELECT-only via both
  the engine (`readonly:true`) and a defense-in-depth denylist. No writes
  are possible through this skill.
- **Backup rotation cap.** `rotateBak` shifts `.bak.0..8` up by one index and caps
  at `.bak.9` (10 files total). The oldest backup is overwritten automatically.
- **Graceful degradation.** All subcommands return a clear `{ degraded, message }`
  object (no throw) when `better-sqlite3` is not installed or when
  `GDD_STATE_BACKEND=markdown` is set.

## STATE COMPLETE
