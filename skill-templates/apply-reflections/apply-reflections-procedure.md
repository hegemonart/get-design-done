---
name: apply-reflections-procedure
type: heuristic
version: 1.3.0
phase: 30.5
tags: [apply-reflections, proposal, frontmatter, reference, budget, question, global-skill, incubator, kfm-candidate]
last_updated: 2026-05-21
---

# Apply-Reflections - Per-Type Procedure

Extracted from `skills/apply-reflections/SKILL.md` per Phase 28.5 D-10 (extract-then-link,
never delete content). The orchestrator loop in `apply-reflections` (resolve file → parse →
review loop → summary) stays in the SKILL. The per-proposal-type apply logic below moves
here because it is content-class methodology, not workflow.

## Apply Logic by Proposal Type

After the user chooses `a` (apply) or `e` (edit-then-apply) in the review loop, branch by
the proposal's bracketed type tag.

### [FRONTMATTER]

1. Extract agent name from Change field (e.g., `agents/design-verifier.md`)
2. Read the agent file
3. Find the frontmatter line matching the field being changed
4. Use Edit tool to update the specific line
5. Append `**Applied**: <date>` to the proposal in reflections file

### [REFERENCE]

1. Extract target file path from Change field (e.g., `reference/heuristics.md`)
2. If file exists: append the drafted text using Edit tool
3. If file doesn't exist: create it with a minimal header + the drafted text using Write tool
4. Append `**Applied**: <date>` to proposal in reflections file

### [BUDGET]

1. Read `.design/budget.json`
2. Locate the key path from the Change field (e.g., `design-verifier.per_run_cap_usd`)
3. Update the value
4. Write updated JSON back to `.design/budget.json`
5. Append `**Applied**: <date>` to proposal in reflections file

### [QUESTION]

1. Read `agents/design-discussant.md`
2. Find the question text specified in the Change field
3. If pruning: remove the question lines using Edit tool
4. If rewording: replace the question text using Edit tool
5. Append `**Applied**: <date>` to proposal in reflections file

### [GLOBAL-SKILL]

1. Extract target filename from Change field (e.g., `design-color-conventions.md`)
2. Ensure `~/.claude/gdd/global-skills/` directory exists (create with `mkdir -p` if not)
3. If target file exists: append new content using Edit tool (add a `---` separator first)
4. If target file doesn't exist: create with header + content using Write tool:

   ```markdown
   # <Topic> Conventions (Global)
   *Promoted from project: <project-name>, cycle: <cycle-slug>*

   <content>
   ```

5. Print: "Global skill written to ~/.claude/gdd/global-skills/<name>.md - auto-loads in all future gdd sessions"
6. Append `**Applied**: <date>` to proposal in reflections file

### [INCUBATOR]

Incubator drafts come from `scripts/lib/incubator-author.cjs` (Phase 29-04). They live at
`.design/reflections/incubator/<slug>/` and contain `manifest.json` + `DRAFT.md` + (optional) `ORIGIN.md`.

Use `scripts/lib/apply-reflections/incubator-proposals.cjs` for all actions.

**Discovery + render** (once per cycle):

1. Call `discoverIncubatorDrafts()` → `Array<Draft>`. Skip malformed entries silently (already warned on stderr by the helper).
2. For each draft: call `renderProposal(draft)` and print the returned markdown block. The user sees a header (slug + kind), a diff vs the nearest existing artifact (or "net-new"), an Origin section listing capability-gap signals, and the full draft body.
3. Prompt: `(a) accept   (r) reject   (d) defer   (e) edit   (q) quit`.

**Per-action behavior:**

1. **accept** - call `applyAccept(draft, { registryPath, repoRoot })`.
   - The helper calls `validateScope(draft.target_path)` from `scripts/validate-incubator-scope.cjs` **before** any write. Out-of-scope paths throw and the registry stays untouched. This is the non-bypassable scope guard (D-05).
   - On success: target artifact written, `reference/registry.json` appended with `{ slug, path, added, origin: 'incubator' }`, incubator subdir removed last (T-29.05-04 - partial-failure leaves draft retryable).
   - Print: "Accepted - promoted to <target_path>; registered."
   - Append `**Applied**: <date>` to the proposal block.

2. **reject** - call `applyReject(draft)`. Only the incubator subdir is removed; registry is untouched. Append `**Reviewed: rejected**` to the reflections file.

3. **defer** - no-op. Print "Deferred - draft re-surfaces next run." Append `**Reviewed: deferred**`.

4. **edit** - call `applyEdit(draft)` (uses `$EDITOR` or the `editorCmd` array option). On clean exit, the helper reloads the draft and the caller re-runs `renderProposal` + the prompt. On non-zero exit, the original draft is preserved unchanged.

**Stage-1 gate (D-01 - no auto-flip):**

1. At the start of the cycle, call `checkStage1Gate({ gateSpecPath, statePath, registryPath })`. The call is **read-only** - never mutates state. The returned `{ thresholdMet, summary, optInRecorded }` is informational.
2. If `thresholdMet && !optInRecorded`, surface a one-time prompt:
   ```
   Stage-1 capability-gap authoring threshold met: <summary>
   Enable incubator-draft promotion?  (y/N)
   ```
3. **Only on explicit `y`**, call `recordOptIn({ statePath, confirmedBy })`. The function is idempotent - a second call detects the existing record and returns `{ alreadyRecorded: true }`. Never call it on any other input.

**Why this is gated.** The `[INCUBATOR]` proposal class can write executable surface (agents + skills) into the plugin runtime. Both Phase 29 D-01 (no auto-flip) and D-05 (scope guard) exist because that surface has integration-test and security implications that exceed reflector autonomy. `validateScope` keeps the file landing zone confined to `agents/<slug>.md` or `skills/<slug>/SKILL.md`. The Stage-1 gate keeps the *whether* of opting in to incubator authoring under explicit user control even after the data threshold says we have enough signal.

**Bandit-fairness gate on `accept` (Phase 29 Plan 06 / CONTEXT D-04).**

When the `accept` action promotes an incubator draft, the bandit-router arms for the freshly-promoted agent/skill MUST be bootstrapped with `prior_class: 'promoted_incubator'`. This invokes a conservative `Beta(2, 8)` bootstrap prior (posterior mean 0.2) instead of the optimistic Phase 23.5 informed prior - the bandit-fairness gate IS the staging mechanism (D-04: no separate two-step ratify split). The conservative prior suppresses preferential selection until ~8-10 successful pulls accumulate.

Call shape (whether eagerly invoked on promotion or via first-pull lazy bootstrap):

```javascript
const bandit = require('./scripts/lib/bandit-router.cjs');
// Per arm bootstrapped for the freshly-promoted agent:
bandit.update({
  agent: '<promoted-slug>',
  bin: '<touches-bin>',
  tier: '<chosen-tier>',
  reward: <bernoulli>,
  prior_class: 'promoted_incubator',  // Phase 29 Plan 06 / D-04 — Beta(2,8) staging
});
// Or for the delegate-aware case (Plan 27-07):
bandit.updateWithDelegate({
  agent: '<promoted-slug>',
  bin: '<touches-bin>',
  tier: '<chosen-tier>',
  delegate: '<peer-cli-or-none>',
  reward: <bernoulli>,
  prior_class: 'promoted_incubator',
});
```

Omitting `prior_class` reverts to Phase 23.5 informed-prior bootstrap (non-breaking). The reward math is unchanged - `prior_class` only affects bootstrap.

### [KFM-CANDIDATE]

Known-failure-mode catalogue proposals come from `scripts/lib/reflector-kfm-proposer.cjs` (Phase 30.5-03 D-05). They live at `.design/reflections/incubator/kfm-<slug>/CATALOGUE-ENTRY.md` and contain a single fenced ```yaml block pre-filled with the Phase 30.5 schema-v2 11-field shape (`id` + `pattern` + `diagnosis` + `remedy` + `severity` + `propose_report` + `symptom` + `root_cause` + `fix` + `related_phases` + `first_observed_cycle`). Two of those — `pattern` and `fix` — are `TODO:` placeholders the reflector cannot infer; the user fills them via the **edit** action before accepting.

Two upstream signals share this draft surface (D-06):
- `capability_gap` clusters of size ≥3 with no existing-entry match (Phase 29-03 aggregator + `failure-mode-matcher.match()`).
- `kfm-candidate` events from the Phase 30.5-03 Task 2 authority-watcher whitelist (D-06 - single events bypass the ≥3 gate).

Use `scripts/lib/reflector-kfm-proposer.cjs` for all actions:

**Discovery + render** (once per cycle):

1. Glob `.design/reflections/incubator/kfm-*/CATALOGUE-ENTRY.md` → list pending KFM drafts.
2. For each draft: read the body, show the origin header (source, parent event ids OR article url) + the proposed yaml block.
3. Prompt: `(a) accept   (r) reject   (d) defer   (e) edit   (q) quit`.

**Per-action behavior:**

1. **accept** - call `applyAccept(draftPath, { repoRoot })`.
   - The helper re-stamps the proposed `id` with the next available `KFM-NNN` from the catalogue (avoids collisions when multiple drafts promote in the same run).
   - Appends a `### KFM-NNN — <symptom heading>` section into `reference/known-failure-modes.md` with the yaml block intact.
   - Appends a `reference/registry.json` entry: `{ name: 'known-failure-modes/kfm-NNN', path: 'reference/known-failure-modes.md', type: 'failure-mode', phase: 30.5, origin: 'incubator-kfm', added: '<ISO date>' }`.
   - Removes the incubator subdir LAST (partial-failure leaves the draft retryable).
   - Print: "Accepted - promoted to KFM-NNN in reference/known-failure-modes.md."
   - Append `**Applied**: <date>` to the proposal entry (when surfaced from a reflections file).

2. **reject** - call `applyReject(draftPath)`. Only the incubator subdir is removed; catalogue + registry untouched. Print: "Rejected - draft removed."

3. **defer** - call `applyDefer(draftPath, { deferredUntil })` where `deferredUntil` is an ISO date (default: today + 30d). The helper stamps `deferred_until: <ISO>` into the draft body. Print: "Deferred - draft re-surfaces next run."

4. **edit** - call `applyEdit(draftPath)` which returns the draft path. The caller opens `$EDITOR` on the path; on clean exit, re-discover the draft and re-prompt. Typical edits: replace `pattern: 'TODO: ...'` with a conservative regex, replace `fix: 'TODO: ...'` with a step-by-step user-runnable remedy, set `severity` if `medium` default is wrong.

**Why this is gated.** `reference/known-failure-modes.md` feeds Phase 30's `triage-matcher.cjs` BEFORE the consent prompt - a bad entry could mute legitimate issue reports. The user-review gate is non-negotiable (D-05). The proposer is strictly proposal-only; the canonical catalogue only changes via the accept action.
