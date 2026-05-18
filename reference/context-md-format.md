---
name: context-md-format
type: meta-rules
version: 1.0.0
phase: 28.5
tags: [context-md, glossary, ubiquitous-language, ddd, project-scoped]
last_updated: 2026-05-18
---

Source: mattpocock/skills (MIT) — adapted with permission. See `../NOTICE` for the full attribution block.

# CONTEXT.md Format

`CONTEXT.md` is a project-scoped ubiquitous-language glossary kept at the repository root.
It captures domain terms the user and the agent have agreed upon so the next session does
not re-litigate naming. `STATE.md` is cycle-scoped and rotates per pipeline run; `CONTEXT.md`
outlives the cycle and compounds across runs. The `discuss` and `brief` skills write to it
inline during interviews (no batching) — see Phase 28.5 plan `28.5-08` for the writer
behavior. See `./adr-format.md` for the heavier project-scoped artifact (decisions that meet
the 3-criteria gate).

## Term entry

Each entry is a `##` heading whose text is the term, followed by a body paragraph that
defines it. The required surface is the heading and the definition; everything else is
optional GDD adaptation.

```markdown
## <Term Name>

<Definition — 1-3 sentences in plain language. Use existing CONTEXT.md vocabulary where
possible (compounding effect — terms defined earlier in the file are reused in later
definitions).>

**First seen:** <cycle-id-or-NN> *(optional, GDD addition for traceability)*
**Aliases:** [<term1>, <term2>] *(optional, GDD addition for term-merging — see §Aliases)*
**Examples:** *(optional)*

- <Concrete usage 1>
- <Concrete usage 2>
```

- **Required fields.** The heading (term name) and the definition paragraph.
- **Optional fields.** `**First seen:**`, `**Aliases:**`, `**Examples:**` — added by
  `discuss` / `brief` skills as ergonomic. `first-seen` ties the term to an originating
  cycle's `STATE.md`; `aliases` enables term-merging; examples concretize usage.

## Lazy creation

`CONTEXT.md` is created on the FIRST term resolution and never batched. The writing skill
just appends — no precondition prompts, no "should we create CONTEXT.md?" question (D-04).

- **Trigger.** A fuzzy phrase becomes a sharpened term (e.g., "thingy" → "materialization
  cascade"), a new noun gets named, or two phrases collapse to one.
- **Location.** Project root: `./CONTEXT.md`. Repos that span multiple bounded contexts use
  `CONTEXT-MAP.md` plus per-area `<area>/CONTEXT.md` — see `## Multi-context`.
- **No batching.** Do NOT wait to gather "enough" terms. Each resolved term lands
  immediately so the file reflects the conversation at every checkpoint.

## Aliases

When two terms collapse to one canonical name, the loser becomes an entry in the winner's
`**Aliases:**` line. The agent never silently drops a term — the alias preserves the prior
vocabulary for grep, for the `decision-injector` hook, and for the user's mental model.

```markdown
## Materialization cascade

The chain of steps that turns a sketch into a real, deployable artifact. Triggered by the
prototype gate; spans sketch → spike → real-thing.

**First seen:** v1.28.5
**Aliases:** [making-things-real, materialize, "real-ification"]
```

- `decision-injector` (extended in plan `28.5-08`) searches `aliases` against task
  descriptions so the canonical term surfaces even when the user types the old phrase.
- Aliases are kebab-case OR quoted; mix freely.

## Multi-context

When the repo spans multiple bounded contexts (a monorepo with `apps/web` and `apps/api`,
say), each context gets its own `<area>/CONTEXT.md` and the top-level `CONTEXT-MAP.md` lists
them. Same entry format inside each file; `CONTEXT-MAP.md` is just an index.

```markdown
# Context Map

## Web App
`apps/web/CONTEXT.md`

## API
`apps/api/CONTEXT.md`
```

`discuss` / `brief` resolve which `CONTEXT.md` to write to by matching the active file
paths in the conversation against the map. When no map exists, the single-file default
(`./CONTEXT.md`) applies.

## Cross-references

- Decisions that outlive the cycle AND meet the 3-criteria gate (hard-to-reverse AND
  surprising-without-context AND real-tradeoff) become ADRs — see `./adr-format.md`.
- Cycle-scoped decisions stay in `STATE.md` — see `./STATE-TEMPLATE.md`.
- Skill structural rules (length cap, frontmatter, progressive disclosure) — see
  `./skill-authoring-contract.md`.
