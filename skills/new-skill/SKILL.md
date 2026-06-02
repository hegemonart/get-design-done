---
name: gdd-new-skill
description: "Scaffolds a new Phase-28.5 + Phase-50-compliant skill: gathers a name, a multi-paragraph v3 description, a lifecycle stage, an allowed-tools list, and optional composes_with neighbours, then writes source/skills/<name>/SKILL.md from the pure generator. Use when adding a brand-new gdd skill and you want the frontmatter, length cap, and v3 description form correct from the first commit. Activates for requests involving authoring a skill, scaffolding a command, creating a new SKILL.md, or adding a slash command."
argument-hint: "<skill-name>"
tools: Read, Write, Bash, AskUserQuestion
user-invocable: true
---

# /gdd:new-skill

**Role:** Interactively scaffold a contract-compliant skill. Gather the fields, then write `source/skills/<name>/SKILL.md` from the pure generator at `scripts/lib/manifest/scaffolder.cjs`. This skill writes ONE source file. It does NOT touch `scripts/lib/manifest/skills.json` and does NOT run the build; it prints the exact follow-up commands instead.

Read `reference/skill-authoring-contract.md` first for the length cap, the frontmatter required fields, and the v3 description form.

## Prompt strategy (clack with a fallback)

Mirror the installer pattern in `scripts/install.cjs`: try `@clack/prompts` lazily, and degrade to `AskUserQuestion` (or plain text) when it is absent. Use this probe at the start:

```bash
node -e "try { require.resolve('@clack/prompts'); console.log('clack'); } catch { console.log('fallback'); }"
```

- `clack`: drive `clack.text`, `clack.select`, and `clack.confirm` from a short Node script.
- `fallback`: ask the same questions with `AskUserQuestion` (one prompt per field), or read plain answers.

Either way the answers feed the same record builder. Never block waiting on a TTY in a non-interactive run; fall back to `AskUserQuestion`.

## Step 1 - Gather the fields

1. **name**: the slug from `$ARGUMENTS` if present, else ask. Must match `^[a-z0-9][a-z0-9-._]*$`. Reject `source/skills/<name>/` collisions.
2. **description**: a multi-paragraph v3 form. Sentence one is what the skill does. Sentence two is `Use when <triggers>`. Sentence three is `Activates for requests involving <kw1>, <kw2>, <kw3>.` Keep it 20 to 1024 chars.
3. **lifecycle stage**: pick one of brief / explore / plan / verify / ship / figma / token / report (free text allowed). This seeds the composition suggestions.
4. **tools**: a comma list (for example `Read, Write, Bash`). Empty means inherit-all.
5. **composes_with**: auto-suggest neighbours, then confirm. Compute the suggestion list:

```bash
node -e "
const s = require('./scripts/lib/manifest/scaffolder.cjs');
const m = require('./scripts/lib/manifest/skills.json');
console.log(JSON.stringify(s.suggestComposesWith(process.argv[1], m.skills)));
" "<name>"
```

Present the suggestions; let the user accept, edit, or clear them.

## Step 2 - Length pre-check

Before writing, estimate the body length. If the planned body would exceed about 100 lines, warn the user (the authoring contract warns at 100 and blocks at 250) and suggest extracting domain content into a co-located `source/skills/<name>/<topic>.md` reference. The generated skeleton is small; the warning is for the prose the user will add next.

## Step 3 - Write the file

Build the record and render the file with the pure generator, then write it with the Write tool (not shell redirection):

```bash
node -e "
const s = require('./scripts/lib/manifest/scaffolder.cjs');
const rec = s.buildSkillRecord({
  name: process.env.SK_NAME,
  description: process.env.SK_DESC,
  argumentHint: process.env.SK_HINT || undefined,
  tools: process.env.SK_TOOLS || undefined,
  userInvocable: process.env.SK_UI === 'true',
  composesWith: (process.env.SK_COMPOSES || '').split(',').map(x => x.trim()).filter(Boolean),
});
process.stdout.write(s.renderSkillMd(rec));
"
```

`buildSkillRecord` throws on an invalid name, an out-of-budget description, or a malformed tools list. Surface the thrown message to the user and re-prompt the offending field. Capture stdout and write it verbatim to `source/skills/<name>/SKILL.md` via the Write tool.

## Step 4 - Tell the user the follow-up

The skill stops here by contract. Print the next two commands for the user to run after they add the manifest record:

```
1. Add a record for "<name>" to scripts/lib/manifest/skills.json
   (description, argument_hint, tools, user_invocable; put composes_with in extra_frontmatter).
2. npm run generate:skill-frontmatter && npm run build:skills
```

Note that `npm run generate:skill-frontmatter:check` and the skills-coverage test stay red until the manifest record exists; that is expected and is the maintainer's step.

## Do Not

- Do not edit `scripts/lib/manifest/skills.json`, `package.json`, or any reference doc.
- Do not run `build:skills` or `generate:skill-frontmatter` for the user; print the commands.
- Do not write the SKILL.md with shell redirection; use the Write tool so the content is exact.
- Do not invent a description; require the v3 three-sentence form from the user.

## NEW-SKILL COMPLETE
