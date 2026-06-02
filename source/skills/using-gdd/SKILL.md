---
name: using-gdd
description: "Use when starting any GDD session — establishes how to find and apply GDD skills."
disable-model-invocation: true
---
<SUBAGENT-STOP>

# Using GDD

This is the bootstrap discipline contract for every Get Design Done session. Read it
first; it tells you how to find and apply the right GDD skill before you act.

## The 1% rule

**If you think there is even a 1% chance a skill might apply, you ABSOLUTELY MUST invoke the skill.**

In GDD, almost every request maps to a pipeline stage - brief, explore, plan, design,
verify - or to a cross-cutting skill (discuss, audit, style, darkmode). When in doubt,
search for and read the skill's body. The cost of reading a skill is trivial; the cost of
free-handing a stage is rework, scope creep, and a broken pipeline state.

## Red flags - Thought → Reality

When you catch yourself thinking any of the following, STOP and check for a skill.

| Thought | Reality |
| --- | --- |
| This is just a simple design question. | Questions are tasks. Check for a skill. |
| I'll just tweak the CSS directly. | Token changes go through the pipeline - check {{command_prefix}}design. |
| I already know the codebase, skip explore. | Explore probes connections you haven't re-checked this cycle. |
| This change is too small to plan. | Plan-skipped tasks blow scope per cycle telemetry. Run {{command_prefix}}plan. |
| I can write the brief later. | No brief means no shared problem statement - {{command_prefix}}brief comes first. |
| The user clearly wants X, I'll skip discuss. | Ambiguity hides here. {{command_prefix}}discuss surfaces the real constraint. |
| I'll verify by eyeballing it. | Verification is a stage with criteria - run {{command_prefix}}verify, don't guess. |
| It's obviously a dark-mode tweak. | Color-scheme work has its own skill - check {{command_prefix}}darkmode. |
| Let me just compare these two designs quickly. | Comparison is an audit task - {{command_prefix}}compare has the rubric. |
| This is a one-off, no skill needed. | "One-off" is the most common rationalization in the telemetry. Check anyway. |
| I'll refactor the style tokens by hand. | {{command_prefix}}style owns token edits so the pipeline stays consistent. |
| The audit can wait until after I ship. | An un-audited cycle is an unverified cycle - {{command_prefix}}audit before close. |

## Skill priority order

When more than one skill could apply, resolve in this order:

1. **Process** - brief / explore / discuss. Establish the problem and context first.
2. **Implementation** - design / style / darkmode. Only after process is settled.
3. **Audit** - verify / compare / audit. Close the loop before declaring done.

Never run an Implementation skill before the Process skills that gate it have produced
their artifact. Never declare a cycle complete without an Audit skill.

## Instruction priority

When instructions conflict, obey this precedence (highest first):

1. **The user's CLAUDE.md** - project- and user-level directives always win.
2. **GDD skills** - the skill body is the source of truth for how a stage runs.
3. **Defaults** - your own general training and habits come last.

If a GDD skill contradicts the user's CLAUDE.md, the CLAUDE.md wins and you flag the
conflict. If your instinct contradicts a GDD skill, the skill wins.

## GDD pipeline flow

The core flow is **Brief → Explore → Plan → Design → Verify**, with branch points:

- **Brief** captures the problem (`{{command_prefix}}brief`). Branch: a rough idea can sketch or spike
  off the brief before exploration; a changed problem loops back via `--re-brief`.
- **Explore** scans the codebase and connections (`{{command_prefix}}explore`) - even on a familiar
  repo, because connections drift each cycle.
- **Plan** decomposes work into tasks (`{{command_prefix}}plan`). Skipping it is the top cause of scope
  blow-up; small tasks still get a plan.
- **Design** implements (`{{command_prefix}}design`, with `{{command_prefix}}style` and `{{command_prefix}}darkmode` as
  implementation peers). Implementation never runs ahead of an approved plan.
- **Verify** checks against criteria (`{{command_prefix}}verify`), then `{{command_prefix}}audit` / `{{command_prefix}}compare`
  close the loop. On pass the cycle completes; on fail it loops back to the failing stage.

`{{command_prefix}}discuss` runs alongside any stage to resolve ambiguity before it propagates.
