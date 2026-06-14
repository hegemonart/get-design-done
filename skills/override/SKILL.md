---
name: hone-override
description: "Escalation surface for a risk-blocked action or a fact-force gate. Use when the Phase 56 risk gate blocked a writer action (suggested_action=block) and a reviewer has signed off, or when the first-write fact-force gate is holding a file you have legitimately reviewed. Activates for requests involving overriding a blocked edit, approving a high-risk change, or clearing a fact-force hold on a path."
argument-hint: "<finding-id | factforce <path>> [--approver <who>] [--reason <text>]"
user-invocable: true
tools: Read, Write, Bash, Grep, Glob
---

# /hone:override

A risk-blocked action is hard: the Phase 56 risk gate routes `suggested_action=block`
to `override` (see `scripts/lib/risk/route.cjs`), and the fact-force gate holds the
first write to a file until its facts are read. This skill is the audited way past
either hold. It mirrors `/hone:unlock-decision`: a named approver plus a
reason, recorded before anything is let through. Override is never silent.

## Invocation

| Command | Behavior |
|---|---|
| `/hone:override <finding-id> --approver <who> --reason <text>` | Record a `D-XX` `override`-tagged decision in STATE.md `<decisions>` and let the risk-blocked action through. |
| `/hone:override factforce <path> --approver <who> --reason <text>` | Set `checked[path]` in the session fact-force state so the fact-force gate stops holding that path. |

Both modes ask for a rationale: the audit trail is the reason override exists.

## Steps

1. **Parse args.** Mode is `factforce` when the first token is the literal `factforce`
   (the next token is the `<path>`); otherwise the first token is a `<finding-id>`.
   `--approver` is required (a non-empty name). Missing `--approver` prints the usage
   and changes nothing. If `--reason` is absent, ASK for one (AskUserQuestion or a
   prompt) before continuing: an override with no rationale is rejected.

2. **Preview.** Show what will be written and stop for confirmation:
   - finding mode: the decision entry from `overrideDecisionEntry(<id>, {approver, reason})`
     (its `text`, `status: locked`, and `override` tag) plus the action it unblocks.
   - factforce mode: the `<path>` that will gain `checked[path] = true` and the
     session-state file it lands in.

3. **Apply (finding mode).** Record the audited decision via the STATE writer
   `mcp__hone_state__add_decision` (it auto-assigns the next `D-N`). Pass the `text`
   from the pure builder so the `override` tag is embedded and greppable:

   ```bash
   node -e '
     const o = require("./scripts/lib/risk/override.cjs");
     const [id, who, reason] = process.argv.slice(1);
     const entry = o.overrideDecisionEntry(id, { approver: who, reason });
     console.log(JSON.stringify(entry));
   ' "<finding-id>" "<who>" "<reason>"
   ```

   Then call `mcp__hone_state__add_decision` with `{ text: <entry.text>, status: "locked" }`.
   The blocked action is now approved on the audit record; proceed with it.

4. **Apply (factforce mode).** Set `checked[path]` in the session state file at
   `<cwd>/.design/locks/factforce-<session_id>.json` (atomic tmp then rename), using
   the pure helper so the shape matches what the fact-force gate reads:

   ```bash
   node -e '
     const fs = require("fs"); const path = require("path");
     const o = require("./scripts/lib/risk/override.cjs");
     const [file, p] = process.argv.slice(1);
     let state = {}; try { state = JSON.parse(fs.readFileSync(file, "utf8")); } catch {}
     const next = o.setFactForceChecked(state, p);
     fs.mkdirSync(path.dirname(file), { recursive: true });
     const tmp = file + ".tmp";
     fs.writeFileSync(tmp, JSON.stringify(next, null, 2) + "\n");
     fs.renameSync(tmp, file);
     console.log(JSON.stringify(next.checked));
   ' "<cwd>/.design/locks/factforce-<session_id>.json" "<path>"
   ```

   The fact-force gate stops holding `<path>` for the rest of the session.

5. **Report** the recorded approver, the reason, and either the new `D-XX` id (finding
   mode) or the unblocked path (factforce mode).

## Do Not

- Do not skip the rationale: every override is audited.
- Do not override a finding that the risk gate did not actually block.
- Do not edit `scripts/lib/risk/route.cjs` or `compute-risk.cjs`: this skill consumes them.

## OVERRIDE COMPLETE
