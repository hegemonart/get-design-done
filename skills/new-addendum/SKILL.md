---
name: hone-new-addendum
description: "Scaffolds a new Phase-54 composable reference addendum for a design-system, framework, or motion library: validates the kind and the slug, defaults composes_into by kind, and writes a 4-section skeleton at reference/{systems|frameworks|motion}/<name>.md from the pure generator. Use when adding stack-specific guidance that an explore mapper should compose at spawn time and you want the frontmatter, the composes_into wiring, and the mandatory sections correct from the first commit. Activates for requests involving authoring a reference addendum, adding stack-specific mapper guidance, scaffolding a systems or frameworks or motion doc, or registering a new design-system."
argument-hint: "<kind> <name>"
tools: Read, Write, Bash, AskUserQuestion
user-invocable: true
---

# /hone:new-addendum

**Role:** Scaffold a contract-compliant stack addendum. Validate the kind and the name, then write `reference/{systems|frameworks|motion}/<name>.md` from the pure generator at `scripts/lib/new-addendum.cjs`. This skill writes ONE reference file. It does NOT touch `reference/registry.json` and does NOT run any build; it prints the exact follow-up steps instead.

An addendum is a registry entry, not a skill. Read `reference/registry.json` for the `type:"stack-addendum"` entry shape and `scripts/lib/mapper-spawn.cjs` for how `composes_into` selects an addendum at spawn time. Read one shipped example first, for instance `reference/systems/tailwind.md`, to match the house style.

## Step 1 - Gather the fields

1. **kind**: the first token of `$ARGUMENTS` if present, else ask. Must be one of `system`, `framework`, or `motion`. This picks the target subdir and the default `composes_into`.
2. **name**: the second token of `$ARGUMENTS` if present, else ask. Must match `^[a-z0-9][a-z0-9-._]*$`. The basename is also the matcher key in `mapper-spawn.cjs`, so it must equal the value `detectStack` reports for this stack (for example `tailwind`, `nextjs`, `framer-motion`). Reject a `reference/{dir}/<name>.md` collision.
3. **composes_into** (optional): accept the kind default, or override with a comma list of mapper names. Defaults: `system` to `token-mapper, component-taxonomy-mapper`; `framework` to `component-taxonomy-mapper, visual-hierarchy-mapper`; `motion` to `motion-mapper`.

Resolve the target path and check for a collision:

```bash
node -e "
const a = require('./scripts/lib/new-addendum.cjs');
console.log(a.targetPathFor(process.argv[1], process.argv[2]));
" "<kind>" "<name>"
```

If that path already exists, stop and tell the user to edit the existing file instead.

## Step 2 - Write the file

Build the record and render the skeleton with the pure generator, then write it with the Write tool (not shell redirection):

```bash
node -e "
const a = require('./scripts/lib/new-addendum.cjs');
const rec = a.buildAddendumRecord({
  kind: process.env.AD_KIND,
  name: process.env.AD_NAME,
  composesInto: process.env.AD_COMPOSES || undefined,
});
process.stdout.write(a.renderAddendumMd(rec));
"
```

`buildAddendumRecord` throws on an invalid kind, an invalid name, or a malformed composes_into list. Surface the thrown message to the user and re-prompt the offending field. Capture stdout and write it verbatim to the path from Step 1 via the Write tool.

## Step 3 - Fill the four sections

The skeleton ships four mandatory sections with TODO placeholders: Conventions, File patterns, Gotchas, Example output. Replace every TODO with terse vendor-checked bullets (keep the file at or under about 50 lines). Rules:

- Lead with the real vendor docs URL in the attribution comment.
- The Example output block uses ONLY the Phase 52 DesignContext schema (node types token / component / variant / state / motion-fragment / screen / layer; edge types uses-token / composes / extends / transitions-to / mirrors).
- Tags must come from `reference/design-context-tag-vocab.md`; drop any tag not in that vocabulary.
- For a motion addendum, reuse the `reference/motion-transition-taxonomy.md` duration classes (instant / quick / standard / slow / narrative) and call out the seconds-vs-ms-vs-no-duration unit trap.
- No em dashes anywhere (the `lint:prose` gate scans `reference/`).

## Step 4 - Tell the user the follow-up

The skill stops here by contract. Print the next steps for the maintainer to run:

```
1. Add a registry entry for "<name>" to reference/registry.json
   (name addendum-<kind>-<name>, path, type "stack-addendum", phase 54, kind, composes_into, description).
2. node -e "require('./scripts/lib/reference-registry.cjs').validateRegistry({cwd:process.cwd()})"
   must report ok:true (the round-trip scan picks up the new subdir file).
3. npm test (the reference-registry + phase-54 suites must stay green).
```

The registry round-trip test stays red until the registry entry exists; that is expected and is the maintainer's step.

## Do Not

- Do not edit `reference/registry.json`, `package.json`, or `scripts/lib/manifest/skills.json`.
- Do not run a build or the registry generator for the user; print the steps.
- Do not write the file with shell redirection; use the Write tool so the content is exact.
- Do not invent vendor facts; the addendum content must be vendor-checked.

## NEW-ADDENDUM COMPLETE
