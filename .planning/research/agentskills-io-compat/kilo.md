---
runtime: kilo
phase: 28.8
plan: A2
created: 2026-05-19
claimed_compat: verified
our_install_kind: commands
our_converter: scripts/lib/install/converters/kilo.cjs
verdict: not-applicable
---

# agentskills.io compat: Kilo

## Wave A claim

Wave A research (`.planning/research/agentskills-io-2026-05-19.md` § Claimed-Compat Verification) records Kilo (`kilocode.ai/docs/skills`) as claiming **full** agentskills.io compat — the docs page cites the spec by name and lists the standard `name` + `description` frontmatter requirements. Wave A assigned status **full (but path mismatch)** — Kilo accepts both `skills/` and `commands/` surfaces from upstream skill providers, but Wave A explicitly flagged that our Phase 28.7 install routes to `commands/`, not `skills/`.

## Our install path (Phase 28.7)

Our converter is `scripts/lib/install/converters/kilo.cjs` (Phase 28.7 Plan 28.7-07). Per `scripts/lib/install/runtime-artifact-layout.cjs` line 405, Kilo is registered via `commandsKind('command', 'gdd-', './converters/kilo.cjs', 'kilo')` — install kind is **`command/<gdd-name>.md`** (singular `command/`, not `skills/`). This is a deliberate Phase 28.7 D-10 decision: Kilo's slash-command UX integration was preferred over its skill-loader surface for our 14-runtime install matrix, providing consistency with OpenCode (same `command/` XDG convention).

The Kilo runtime itself accepts BOTH surfaces — its docs describe a `skills/` loader path and a `command/` slash-command path as two parallel feature sets. We chose the latter; the former remains unimplemented in our installer.

agentskills.io compat is **orthogonal** to our Kilo install path: the spec governs the `skills/` schema, and we do not currently land on that surface for Kilo. Schema-level lint compliance against our `skills/` source tree (the artifact a hypothetical Kilo-skills converter would consume) is informative but not normative for our current Kilo install path.

## Lint invocation

```bash
node scripts/lint-agentskills-spec.cjs skills/
```

> Note: The plan text proposed `--skills skills/`, but the actual lint script CLI (`scripts/lint-agentskills-spec.cjs` line 339) takes a positional `<dir>` argument. Corrected invocation above. Exit code: **0**.

The lint runs against our source `skills/` tree — included here for cross-runtime consistency. A future Kilo `skills/` install variant (out of scope for Phase 28.8) would consume this same source.

### Output

```
STATUS  SKILL                 RULE  DETAIL
------  --------------------  ----  -----------------------------------------------------------
PASS    add-backlog           -     -
PASS    analyze-dependencies  -     -
PASS    apply-reflections     -     -
WARN    audit                 W2    description: 313 chars (>200 advisory cap, Phase 28.5 D-01)
WARN    bandit-status         W2    description: 298 chars (>200 advisory cap, Phase 28.5 D-01)
WARN    benchmark             W2    description: 298 chars (>200 advisory cap, Phase 28.5 D-01)
WARN    brief                 W2    description: 238 chars (>200 advisory cap, Phase 28.5 D-01)
WARN    cache-manager         W2    description: 351 chars (>200 advisory cap, Phase 28.5 D-01)
WARN    check-update          W2    description: 205 chars (>200 advisory cap, Phase 28.5 D-01)
WARN    compare               W2    description: 422 chars (>200 advisory cap, Phase 28.5 D-01)
WARN    complete-cycle        W2    description: 265 chars (>200 advisory cap, Phase 28.5 D-01)
WARN    connections           W2    description: 529 chars (>200 advisory cap, Phase 28.5 D-01)
PASS    continue              -     -
WARN    darkmode              W2    description: 432 chars (>200 advisory cap, Phase 28.5 D-01)
WARN    debug                 W2    description: 214 chars (>200 advisory cap, Phase 28.5 D-01)
WARN    design                W2    description: 293 chars (>200 advisory cap, Phase 28.5 D-01)
WARN    discover              W2    description: 335 chars (>200 advisory cap, Phase 28.5 D-01)
WARN    discuss               W2    description: 297 chars (>200 advisory cap, Phase 28.5 D-01)
PASS    do                    -     -
WARN    explore               W2    description: 310 chars (>200 advisory cap, Phase 28.5 D-01)
PASS    extract-learnings     -     -
PASS    fast                  -     -
WARN    figma-write           W2    description: 425 chars (>200 advisory cap, Phase 28.5 D-01)
PASS    graphify              -     -
PASS    health                -     -
PASS    help                  -     -
PASS    list-assumptions      -     -
PASS    map                   -     -
PASS    new-cycle             -     -
PASS    new-project           -     -
PASS    next                  -     -
PASS    note                  -     -
PASS    optimize              -     -
PASS    pause                 -     -
WARN    peer-cli-add          W2    description: 292 chars (>200 advisory cap, Phase 28.5 D-01)
WARN    peer-cli-customize    W2    description: 256 chars (>200 advisory cap, Phase 28.5 D-01)
WARN    peers                 W2    description: 272 chars (>200 advisory cap, Phase 28.5 D-01)
WARN    plan                  W2    description: 305 chars (>200 advisory cap, Phase 28.5 D-01)
PASS    plant-seed            -     -
PASS    pr-branch             -     -
PASS    progress              -     -
WARN    quality-gate          W2    description: 339 chars (>200 advisory cap, Phase 28.5 D-01)
PASS    quick                 -     -
PASS    reapply-patches       -     -
PASS    recall                -     -
PASS    reflect               -     -
PASS    resume                -     -
PASS    review-backlog        -     -
WARN    router                W2    description: 301 chars (>200 advisory cap, Phase 28.5 D-01)
WARN    scan                  W2    description: 301 chars (>200 advisory cap, Phase 28.5 D-01)
PASS    settings              -     -
PASS    ship                  -     -
WARN    sketch                W2    description: 257 chars (>200 advisory cap, Phase 28.5 D-01)
PASS    sketch-wrap-up        -     -
PASS    skill-manifest        -     -
WARN    spike                 W2    description: 274 chars (>200 advisory cap, Phase 28.5 D-01)
PASS    spike-wrap-up         -     -
PASS    start                 -     -
PASS    stats                 -     -
WARN    style                 W2    description: 413 chars (>200 advisory cap, Phase 28.5 D-01)
WARN    synthesize            W2    description: 256 chars (>200 advisory cap, Phase 28.5 D-01)
PASS    timeline              -     -
PASS    todo                  -     -
WARN    turn-closeout         W2    description: 339 chars (>200 advisory cap, Phase 28.5 D-01)
PASS    undo                  -     -
PASS    update                -     -
WARN    verify                W2    description: 300 chars (>200 advisory cap, Phase 28.5 D-01)
WARN    warm-cache            W2    description: 375 chars (>200 advisory cap, Phase 28.5 D-01)
WARN    watch-authorities     W2    description: 205 chars (>200 advisory cap, Phase 28.5 D-01)
WARN    zoom-out              W2    description: 229 chars (>200 advisory cap, Phase 28.5 D-01)

Lint summary: 70 skills, 38 PASS, 32 WARN, 0 FAIL
```

Exit code: 0.

## Verdict

`compat: not-applicable`

agentskills.io compat governs the `skills/` schema surface. Our Phase 28.7 Kilo install routes to `command/<name>.md`, **not** `skills/<name>/SKILL.md`. The compat axis is therefore **orthogonal** to our install path for Kilo: the spec is satisfied by neither the inputs (which are from a different surface family) nor the outputs (which target a different consumer integration point).

This is **not a gap, defect, or deferred item** — it's a deliberate Phase 28.7 D-10 surface choice. Kilo's slash-command UX was preferred over its skill-loader path for installer-wide consistency with OpenCode.

**Re-verification trigger** (out of scope for Phase 28.8): If a future phase adds a Kilo `skills/` install variant (e.g., `kilo-skills.cjs` registered via `skillsKind`), re-run this A2 check for that variant — at that point the spec axis would become on-axis and the verdict would shift to `confirmed` (assuming source skills still lint clean).

## References

- Wave A research: `.planning/research/agentskills-io-2026-05-19.md` (§ Claimed-Compat Verification — Kilo row)
- Phase 28.7 converter: `scripts/lib/install/converters/kilo.cjs`
- Phase 28.7 layout registration: `scripts/lib/install/runtime-artifact-layout.cjs` (line 405, `commandsKind('command', 'gdd-', './converters/kilo.cjs', 'kilo')`)
- Phase 28.7 D-10 (surface choice rationale): `.planning/phases/28.7-verified-install-for-claimed-runtimes/CONTEXT.md`
- A1 lint script: `scripts/lint-agentskills-spec.cjs`
- Vendor doc: `https://kilocode.ai/docs/skills`
