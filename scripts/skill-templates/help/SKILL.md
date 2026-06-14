---
name: hone-help
description: "Lists all available get-design-done commands with one-line descriptions"
tools: Read
disable-model-invocation: true
---

# Get Design Done - Help

**Role:** Print a complete, formatted reference of every `{{command_prefix}}` command with a one-line description. The list is built from the skill manifest at runtime so it can never drift from the installed skills.

---

## Procedure

1. **Read the manifest.** Open `scripts/lib/manifest/skills.json`. Its `skills` array is the source of truth: one object per skill, each with a `name` (the command, used as `{{command_prefix}}<name>`) and a `description`. Some records also carry `user_invocable`, `disable_model_invocation`, `composes_with`, `next_skills`, and `registered_in_phase` - use those only to refine grouping, never to drop a skill.

2. **Cover every skill.** The output must include every object in `skills` exactly once. Do not hardcode a command list and do not print a fixed count - the only authority is the manifest you just read. If a skill is in the manifest, it appears in the help; if it is removed from the manifest, it disappears from the help automatically.

3. **One-line each.** For every skill, emit `{{command_prefix}}<name>` followed by a single condensed line drawn from its `description`. Trim each description to its first sentence (cut at the first sentence-ending period) so the table stays scannable. Strip any leading "Stage N of 5" boilerplate into a short `Stage N` tag where it helps. Never invent a description - if a record has only a terse `description`, use it verbatim (condensed).

4. **Group sensibly.** The manifest has no explicit category field, so derive groups from what each skill does and lead with the ones users reach for first. A good order:
   - **Pipeline stages (run in order):** `brief`, `explore`, `plan`, `design`, `verify` - the five-stage spine, in that sequence.
   - **Standalone analysis:** one-shot audits and deltas (for example `style`, `darkmode`, `compare`, `audit`, `start`).
   - **Navigation and status:** `next`, `help`, `progress`, `health`, `stats`, `quick`, `fast`.
   - **Exploration and ideation:** `discuss`, `list-assumptions`, `sketch`, `sketch-wrap-up`, `spike`, `spike-wrap-up`, `map`, `bootstrap-ds`.
   - **Lifecycle and session:** `new-project`, `new-cycle`, `complete-cycle`, `pause`, `resume`, `continue`, `do`, `ship`, `pr-branch`, `undo`.
   - **Everything else:** every remaining skill not yet listed, alphabetically. This catch-all is what guarantees completeness - sweep the manifest for any `name` you have not already printed and place it here.

   Grouping is a presentation aid, not a filter. If you are ever unsure where a skill belongs, fall back to a single alphabetical list of all manifest skills - completeness beats tidy buckets.

5. **Render.** Use this header and shape (a fenced reference block):

```
=== Get Design Done - Command Reference ===

Pipeline stages (run in order):
  brief              <first sentence of brief.description>
  explore            <first sentence of explore.description>
  ...

Standalone analysis:
  ...

(continue for every group, ending with the alphabetical catch-all)
```

   Pad command names to a consistent column so descriptions align. Keep the `{{command_prefix}}` convention: show the bare name in the table (it is already understood to be a `{{command_prefix}}` command), and use the full `{{command_prefix}}<name>` form in any surrounding prose.

## Update notice (safe-window surface)

After the command reference, emit the plugin-update banner if one is present:

```bash
[ -f .design/update-available.md ] && cat .design/update-available.md
```

Written by `hooks/update-check.sh`; suppressed mid-pipeline and when the latest release is dismissed.

## HELP COMPLETE
